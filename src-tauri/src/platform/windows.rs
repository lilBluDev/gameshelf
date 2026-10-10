use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq)]
pub struct InferredGameMetadata {
    pub title: String,
    pub executable_path: String,
    pub working_dir: Option<String>,
    pub args: Vec<String>,
    pub is_shortcut: bool,
}

/// Normalize a filesystem path for case-insensitive Windows comparison
/// Converts backslashes to forward slashes, strips \\?\ verbatim prefixes,
/// trims trailing slashes, and lowercases for identity matching.
pub fn normalize_path<P: AsRef<Path>>(path: P) -> String {
    let p = path.as_ref().to_string_lossy();
    let cleaned = p.trim().trim_start_matches(r"\\?\").replace('\\', "/");
    let trimmed = cleaned.trim_end_matches('/');
    trimmed.to_lowercase()
}

/// Inferred title from executable file name or PE Version Info
pub fn infer_title_from_stem(stem: &str) -> String {
    let clean = stem.replace(['_', '.', '-'], " ");

    let mut words: Vec<&str> = Vec::new();
    let mut in_version = false;

    for w in clean.split_whitespace() {
        let lower = w.to_lowercase();
        let is_version_tag = (lower.starts_with('v')
            && lower.len() > 1
            && lower[1..]
                .chars()
                .next()
                .is_some_and(|c| c.is_ascii_digit()))
            || lower.starts_with("build")
            || lower.starts_with("release");

        let is_platform = matches!(
            lower.as_str(),
            "win64"
                | "win32"
                | "x64"
                | "x86"
                | "windows"
                | "shipping"
                | "standalone"
                | "game"
                | "launcher"
        );

        if is_version_tag {
            in_version = true;
            continue;
        }

        if in_version && w.chars().all(|c| c.is_ascii_digit() || c == '.') {
            continue;
        } else {
            in_version = false;
        }

        if is_platform {
            continue;
        }

        words.push(w);
    }

    if words.is_empty() {
        stem.to_string()
    } else {
        words.join(" ")
    }
}

/// Extract FileDescription or ProductName from Windows PE executable
pub fn extract_pe_title<P: AsRef<Path>>(path: P) -> Option<String> {
    let mut file = File::open(path).ok()?;
    let mut buffer = Vec::new();
    // Read up to 2MB to scan for version string resource table
    file.by_ref()
        .take(2 * 1024 * 1024)
        .read_to_end(&mut buffer)
        .ok()?;

    // Search for UTF-16 "FileDescription" or "ProductName"
    for needle in &["FileDescription\0", "ProductName\0"] {
        let needle_utf16: Vec<u8> = needle
            .encode_utf16()
            .flat_map(|u| u.to_le_bytes())
            .collect();
        if let Some(pos) = buffer
            .windows(needle_utf16.len())
            .position(|w| w == needle_utf16)
        {
            // After needle, skip padding / length header (usually 2-6 bytes)
            let start = pos + needle_utf16.len();
            let mut title_utf16 = Vec::new();
            let mut i = start;
            // Align to 2-byte boundary
            if !i.is_multiple_of(2) {
                i += 1;
            }
            // Read until null terminator (0x00, 0x00)
            while i + 1 < buffer.len() {
                let code_point = u16::from_le_bytes([buffer[i], buffer[i + 1]]);
                if code_point == 0 {
                    if !title_utf16.is_empty() {
                        break;
                    }
                } else if code_point >= 32 {
                    title_utf16.push(code_point);
                }
                i += 2;
                if title_utf16.len() > 100 {
                    break;
                }
            }

            if !title_utf16.is_empty() {
                if let Ok(res) = String::from_utf16(&title_utf16) {
                    let trimmed = res.trim();
                    if !trimmed.is_empty() && trimmed.len() > 1 {
                        return Some(trimmed.to_string());
                    }
                }
            }
        }
    }

    None
}

/// Safe MS-SHLLINK (.lnk) parser
pub fn resolve_shortcut<P: AsRef<Path>>(lnk_path: P) -> Result<InferredGameMetadata, String> {
    let mut file =
        File::open(lnk_path.as_ref()).map_err(|e| format!("Cannot open shortcut: {}", e))?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)
        .map_err(|e| format!("Cannot read shortcut: {}", e))?;

    if bytes.len() < 76 {
        return Err("Shortcut file is too small to be a valid .lnk file".to_string());
    }

    let header_size = u32::from_le_bytes(bytes[0..4].try_into().unwrap());
    if header_size != 76 {
        return Err("Invalid .lnk header size".to_string());
    }

    let flags = u32::from_le_bytes(bytes[20..24].try_into().unwrap());
    let has_id_list = (flags & 0x01) != 0;
    let has_link_info = (flags & 0x02) != 0;
    let has_working_dir = (flags & 0x10) != 0;
    let has_arguments = (flags & 0x20) != 0;
    let is_unicode = (flags & 0x80) != 0;

    let mut cursor = 76usize;

    // Skip LinkTargetIDList if present
    if has_id_list {
        if cursor + 2 > bytes.len() {
            return Err("Unexpected EOF reading ID list size".to_string());
        }
        let id_list_size =
            u16::from_le_bytes(bytes[cursor..cursor + 2].try_into().unwrap()) as usize;
        cursor += 2 + id_list_size;
    }

    let mut target_path: Option<String> = None;

    // Parse LinkInfo if present
    if has_link_info && cursor + 28 <= bytes.len() {
        let link_info_size =
            u32::from_le_bytes(bytes[cursor..cursor + 4].try_into().unwrap()) as usize;
        let header_size =
            u32::from_le_bytes(bytes[cursor + 4..cursor + 8].try_into().unwrap()) as usize;
        let flags = u32::from_le_bytes(bytes[cursor + 8..cursor + 12].try_into().unwrap());
        let local_base_path_offset =
            u32::from_le_bytes(bytes[cursor + 16..cursor + 20].try_into().unwrap()) as usize;

        let has_local_base_path = (flags & 0x01) != 0;

        if has_local_base_path && local_base_path_offset < link_info_size {
            let start = cursor + local_base_path_offset;
            if start < bytes.len() {
                // Null-terminated ANSI string
                let end = bytes[start..]
                    .iter()
                    .position(|&b| b == 0)
                    .map(|p| start + p)
                    .unwrap_or(bytes.len());
                if let Ok(path_str) = String::from_utf8(bytes[start..end].to_vec()) {
                    if !path_str.trim().is_empty() {
                        target_path = Some(path_str.trim().to_string());
                    }
                }
            }
        }

        // Unicode local base path if header is large enough
        if header_size >= 36 && cursor + 32 <= bytes.len() {
            let unicode_offset =
                u32::from_le_bytes(bytes[cursor + 28..cursor + 32].try_into().unwrap()) as usize;
            if unicode_offset < link_info_size {
                let start = cursor + unicode_offset;
                let mut utf16_chars = Vec::new();
                let mut i = start;
                while i + 1 < bytes.len() {
                    let val = u16::from_le_bytes([bytes[i], bytes[i + 1]]);
                    if val == 0 {
                        break;
                    }
                    utf16_chars.push(val);
                    i += 2;
                }
                if let Ok(u_str) = String::from_utf16(&utf16_chars) {
                    if !u_str.trim().is_empty() {
                        target_path = Some(u_str.trim().to_string());
                    }
                }
            }
        }

        cursor += link_info_size;
    }

    let read_string_data = |cursor: &mut usize| -> Option<String> {
        if *cursor + 2 > bytes.len() {
            return None;
        }
        let char_count =
            u16::from_le_bytes(bytes[*cursor..*cursor + 2].try_into().unwrap()) as usize;
        *cursor += 2;
        if is_unicode {
            let byte_count = char_count * 2;
            if *cursor + byte_count > bytes.len() {
                return None;
            }
            let slice = &bytes[*cursor..*cursor + byte_count];
            *cursor += byte_count;
            let u16_chars: Vec<u16> = slice
                .as_chunks::<2>()
                .0
                .iter()
                .map(|&[c0, c1]| u16::from_le_bytes([c0, c1]))
                .collect();
            String::from_utf16(&u16_chars).ok()
        } else if *cursor + char_count > bytes.len() {
            None
        } else {
            let slice = &bytes[*cursor..*cursor + char_count];
            *cursor += char_count;
            String::from_utf8(slice.to_vec()).ok()
        }
    };

    // Name / description string
    if (flags & 0x04) != 0 {
        let _ = read_string_data(&mut cursor);
    }
    // Relative path string
    if (flags & 0x08) != 0 {
        let _ = read_string_data(&mut cursor);
    }
    // Working dir string
    let working_dir = if has_working_dir {
        read_string_data(&mut cursor)
    } else {
        None
    };
    // Arguments string
    let args_str = if has_arguments {
        read_string_data(&mut cursor)
    } else {
        None
    };

    let target = target_path.ok_or_else(|| {
        "Could not automatically resolve target from .lnk shortcut. Please choose target executable.".to_string()
    })?;

    let target_buf = PathBuf::from(&target);
    let title = lnk_path
        .as_ref()
        .file_stem()
        .and_then(|s| s.to_str())
        .map(infer_title_from_stem)
        .unwrap_or_else(|| "Shortcut Game".to_string());

    let final_working_dir =
        working_dir.or_else(|| target_buf.parent().map(|p| p.to_string_lossy().to_string()));

    let args = args_str
        .map(|a| a.split_whitespace().map(|s| s.to_string()).collect())
        .unwrap_or_default();

    Ok(InferredGameMetadata {
        title,
        executable_path: target,
        working_dir: final_working_dir,
        args,
        is_shortcut: true,
    })
}

/// Inspect a file (.exe or .lnk) and infer metadata
pub fn inspect_game_file<P: AsRef<Path>>(file_path: P) -> Result<InferredGameMetadata, String> {
    let path = file_path.as_ref();
    if !path.exists() {
        return Err(format!("File does not exist: {}", path.display()));
    }

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    if ext == "lnk" {
        return resolve_shortcut(path);
    }

    if ext == "exe" {
        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("Game");
        let title = extract_pe_title(path).unwrap_or_else(|| infer_title_from_stem(stem));
        let working_dir = path.parent().map(|p| p.to_string_lossy().to_string());

        return Ok(InferredGameMetadata {
            title,
            executable_path: path.to_string_lossy().to_string(),
            working_dir,
            args: Vec::new(),
            is_shortcut: false,
        });
    }

    Err(format!("Unsupported file extension: .{}", ext))
}

/// Validate positive Steam App ID
pub fn is_valid_steam_app_id(app_id: u32) -> bool {
    app_id > 0
}

/// Construct verified steam://rungameid/<appid> URI
pub fn build_steam_run_uri(app_id: u32) -> Result<String, String> {
    if !is_valid_steam_app_id(app_id) {
        return Err(format!(
            "Invalid Steam App ID {}: must be a positive integer",
            app_id
        ));
    }
    Ok(format!("steam://rungameid/{}", app_id))
}

pub fn parse_steam_run_uri(uri: &str) -> Result<u32, String> {
    let prefix = "steam://rungameid/";
    let suffix = uri.strip_prefix(prefix).ok_or_else(|| {
        format!(
            "Disallowed protocol URI '{}'. Only 'steam://rungameid/' is permitted.",
            uri
        )
    })?;
    if suffix.is_empty() {
        return Err("Steam App ID is empty".to_string());
    }
    if !suffix.chars().all(|c| c.is_ascii_digit()) {
        return Err("Steam App ID must contain only ASCII digits".to_string());
    }
    let app_id: u64 = suffix
        .parse()
        .map_err(|_| "Steam App ID is out of range".to_string())?;
    if app_id == 0 {
        return Err("Steam App ID must be positive and non-zero".to_string());
    }
    if app_id > u32::MAX as u64 {
        return Err("Steam App ID exceeds maximum u32 value".to_string());
    }
    Ok(app_id as u32)
}

pub fn launch_uri(uri: &str) -> crate::error::AppResult<()> {
    parse_steam_run_uri(uri).map_err(crate::error::AppError::InvalidArgument)?;

    #[cfg(target_os = "windows")]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;

        let wide_uri: Vec<u16> = OsStr::new(uri)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let wide_open: Vec<u16> = OsStr::new("open")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        let ret = unsafe {
            windows_sys::Win32::UI::Shell::ShellExecuteW(
                0,
                wide_open.as_ptr(),
                wide_uri.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                1,
            )
        };

        if (ret as isize) <= 32 {
            return Err(crate::error::AppError::Internal(format!(
                "ShellExecuteW failed for URI '{}' with code {}",
                uri, ret as isize
            )));
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        return Err(crate::error::AppError::Internal(
            "Platform URI activation is only supported on Windows host".to_string(),
        ));
    }

    Ok(())
}

pub fn is_autostart_enabled() -> bool {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::HKEY_CURRENT_USER;
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(key) = hkcu.open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Run") {
            key.get_value::<String, _>("GameShelf").is_ok()
        } else {
            false
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

pub fn set_autostart_enabled(enabled: bool) -> crate::error::AppResult<()> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::{HKEY_CURRENT_USER, KEY_SET_VALUE};
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let key = hkcu
            .open_subkey_with_flags(
                r"Software\Microsoft\Windows\CurrentVersion\Run",
                KEY_SET_VALUE,
            )
            .map_err(|e| {
                crate::error::AppError::Internal(format!("Failed to open Run registry key: {}", e))
            })?;

        if enabled {
            let current_exe = std::env::current_exe()?;
            let exe_str = current_exe.to_string_lossy().to_string();
            key.set_value("GameShelf", &format!("\"{}\"", exe_str))
                .map_err(|e| {
                    crate::error::AppError::Internal(format!(
                        "Failed to set autostart in registry: {}",
                        e
                    ))
                })?;
        } else {
            let _ = key.delete_value("GameShelf");
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_path_windows() {
        assert_eq!(
            normalize_path("C:\\Games\\Doom\\Doom.exe"),
            "c:/games/doom/doom.exe"
        );
        assert_eq!(
            normalize_path(r"\\?\C:\Games\Doom\Doom.exe"),
            "c:/games/doom/doom.exe"
        );
        assert_eq!(
            normalize_path("c:/games/doom/doom.exe/"),
            "c:/games/doom/doom.exe"
        );
        assert_eq!(
            normalize_path("  C:/GAMES/Doom/doom.EXE  "),
            "c:/games/doom/doom.exe"
        );
    }

    #[test]
    fn test_infer_title_from_stem() {
        assert_eq!(infer_title_from_stem("Risk_of_Rain_2"), "Risk of Rain 2");
        assert_eq!(infer_title_from_stem("CRUMB_v1_3_5_Win64"), "CRUMB");
        assert_eq!(
            infer_title_from_stem("HollowKnight_Shipping"),
            "HollowKnight"
        );
    }

    #[test]
    fn test_build_steam_run_uri_valid() {
        let uri = build_steam_run_uri(105600).unwrap();
        assert_eq!(uri, "steam://rungameid/105600");
    }

    #[test]
    fn test_build_steam_run_uri_rejects_zero() {
        let res = build_steam_run_uri(0);
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("Invalid Steam App ID 0"));
    }

    #[test]
    fn test_launch_uri_rejects_disallowed_schemes() {
        let res = launch_uri("https://malicious-site.com");
        assert!(res.is_err());
        assert!(res
            .unwrap_err()
            .to_string()
            .contains("Disallowed protocol URI"));

        let res2 = launch_uri("cmd://echo evil");
        assert!(res2.is_err());
    }

    #[test]
    fn test_parse_steam_run_uri_table() {
        let valid_cases = [
            ("steam://rungameid/220", 220u32),
            ("steam://rungameid/1", 1u32),
            ("steam://rungameid/105600", 105600u32),
            ("steam://rungameid/4294967295", 4294967295u32),
        ];

        for (uri, expected) in valid_cases {
            assert_eq!(
                parse_steam_run_uri(uri),
                Ok(expected),
                "Failed for valid URI: {}",
                uri
            );
        }

        let invalid_cases = [
            "",
            "steam://rungameid/",
            "steam://rungameid/0",
            "steam://rungameid/-1",
            "steam://rungameid/-220",
            "steam://rungameid/abc",
            "steam://rungameid/12 34",
            "steam://rungameid/220 ",
            "steam://rungameid/ 220",
            "steam://rungameid/220/extra",
            "steam://rungameid/220/",
            "steam://rungameid/../220",
            "https://steamcommunity.com",
            "http://rungameid/220",
            "steam://otherhost/220",
            "steam://rungameid/١٢٣",
            "steam://rungameid/4294967296",
            "steam://rungameid/999999999999999999999999999999999999",
        ];

        for uri in invalid_cases {
            assert!(
                parse_steam_run_uri(uri).is_err(),
                "Expected error for invalid URI: {}",
                uri
            );
            assert!(
                launch_uri(uri).is_err(),
                "Expected launch_uri error for invalid URI: {}",
                uri
            );
        }
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn test_autostart_registry_toggle() {
        let original = is_autostart_enabled();
        let set_res = set_autostart_enabled(true);
        assert!(set_res.is_ok());
        assert!(is_autostart_enabled());
        let clear_res = set_autostart_enabled(false);
        assert!(clear_res.is_ok());
        assert!(!is_autostart_enabled());
        let _ = set_autostart_enabled(original);
    }
}
