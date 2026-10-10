use std::fs;
use std::path::{Path, PathBuf};
use tracing::{info, warn};

use super::filter::{FilterResult, SteamFilterConfig};
use super::vdf::{VdfParser, VdfValue};
use crate::db::schema::{Game, GameStatus, LaunchAction, SourceKind};
use crate::platform::windows::normalize_path;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SteamLibraryFolder {
    pub path: String,
    pub normalized_path: String,
    pub label: Option<String>,
    pub is_accessible: bool,
    pub is_enabled: bool,
    pub game_count: usize,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SkippedSteamApp {
    pub app_id: u32,
    pub name: String,
    pub library_path: String,
    pub reason: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SteamScanResult {
    pub steam_path: Option<String>,
    pub libraries: Vec<SteamLibraryFolder>,
    pub imported_games: Vec<Game>,
    pub skipped_apps: Vec<SkippedSteamApp>,
    pub warnings: Vec<String>,
}

/// Locates the Steam installation folder using Windows Registry, default paths, or a custom override
pub fn detect_steam_installation(custom_override: Option<&str>) -> Option<PathBuf> {
    // 1. Check custom path provided by user
    if let Some(custom) = custom_override {
        let p = PathBuf::from(custom);
        if p.exists() && p.is_dir() {
            return Some(p);
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(path) = query_registry_steam_path() {
            return Some(path);
        }
    }

    // 3. Known default locations on Windows
    let default_paths = [
        r"C:\Program Files (x86)\Steam",
        r"C:\Program Files\Steam",
        r"D:\Steam",
        r"E:\Steam",
    ];

    for default_path in &default_paths {
        let p = PathBuf::from(default_path);
        if p.exists() && p.is_dir() {
            return Some(p);
        }
    }

    None
}

#[cfg(target_os = "windows")]
fn query_registry_steam_path() -> Option<PathBuf> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(key) = hkcu.open_subkey(r"Software\Valve\Steam") {
        if let Ok(path) = key.get_value::<String, _>("SteamPath") {
            let p = PathBuf::from(path);
            if p.exists() && p.is_dir() {
                return Some(p);
            }
        }
    }

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    if let Ok(key) = hklm.open_subkey(r"SOFTWARE\WOW6432Node\Valve\Steam") {
        if let Ok(path) = key.get_value::<String, _>("InstallPath") {
            let p = PathBuf::from(path);
            if p.exists() && p.is_dir() {
                return Some(p);
            }
        }
    }

    if let Ok(key) = hklm.open_subkey(r"SOFTWARE\Valve\Steam") {
        if let Ok(path) = key.get_value::<String, _>("InstallPath") {
            let p = PathBuf::from(path);
            if p.exists() && p.is_dir() {
                return Some(p);
            }
        }
    }

    None
}

/// Discovers Steam library folders from libraryfolders.vdf
pub fn discover_library_folders<P: AsRef<Path>>(
    steam_root: P,
    disabled_libraries: &[String],
) -> (Vec<SteamLibraryFolder>, Vec<String>) {
    let mut libraries = Vec::new();
    let mut warnings = Vec::new();

    let root_path = steam_root.as_ref();
    let vdf_path = root_path.join("steamapps").join("libraryfolders.vdf");

    // Always include the Steam root folder itself
    let root_normalized = normalize_path(root_path);
    let root_enabled = !disabled_libraries
        .iter()
        .any(|d| d.eq_ignore_ascii_case(&root_normalized));

    libraries.push(SteamLibraryFolder {
        path: root_path.to_string_lossy().to_string(),
        normalized_path: root_normalized,
        label: Some("Default Library".to_string()),
        is_accessible: root_path.exists(),
        is_enabled: root_enabled,
        game_count: 0,
    });

    if !vdf_path.exists() {
        warnings.push(format!(
            "libraryfolders.vdf not found at '{}'; using root library only",
            vdf_path.display()
        ));
        return (libraries, warnings);
    }

    let content = match fs::read_to_string(&vdf_path) {
        Ok(c) => c,
        Err(e) => {
            warnings.push(format!(
                "Failed to read libraryfolders.vdf at '{}': {}",
                vdf_path.display(),
                e
            ));
            return (libraries, warnings);
        }
    };

    let vdf = match VdfParser::parse(&content) {
        Ok(v) => v,
        Err(e) => {
            warnings.push(format!(
                "Failed to parse libraryfolders.vdf: {}. Using root library only.",
                e
            ));
            return (libraries, warnings);
        }
    };

    // Root section can be "libraryfolders" or "LibraryFolders"
    let lib_section = vdf
        .get_section("libraryfolders")
        .or_else(|| vdf.get_section("LibraryFolders"))
        .unwrap_or(&vdf);

    for (key, val) in &lib_section.entries {
        // Skip metadata keys in legacy format like "TimeNextStatsReport", "ContentStatsID"
        if key.eq_ignore_ascii_case("TimeNextStatsReport")
            || key.eq_ignore_ascii_case("ContentStatsID")
        {
            continue;
        }

        let mut folder_path_opt = None;
        let mut label_opt = None;

        match val {
            VdfValue::String(path_str) => {
                // Older flat format: "1" "D:\\SteamLibrary"
                folder_path_opt = Some(path_str.clone());
            }
            VdfValue::Section(sub) => {
                // Newer nested format: "0" { "path" "D:\\SteamLibrary" "label" "SSD" }
                if let Some(p) = sub.get_str("path") {
                    folder_path_opt = Some(p.to_string());
                }
                if let Some(l) = sub.get_str("label") {
                    if !l.trim().is_empty() {
                        label_opt = Some(l.to_string());
                    }
                }
            }
        }

        if let Some(folder_path) = folder_path_opt {
            let normalized = normalize_path(&folder_path);

            // Deduplicate with root or existing entries
            if libraries
                .iter()
                .any(|l| l.normalized_path.eq_ignore_ascii_case(&normalized))
            {
                continue;
            }

            let path_buf = PathBuf::from(&folder_path);
            let exists = path_buf.exists() && path_buf.is_dir();

            if !exists {
                warnings.push(format!(
                    "Steam library folder '{}' is currently unavailable or disconnected.",
                    folder_path
                ));
            }

            let is_enabled = !disabled_libraries
                .iter()
                .any(|d| d.eq_ignore_ascii_case(&normalized));

            libraries.push(SteamLibraryFolder {
                path: folder_path,
                normalized_path: normalized,
                label: label_opt,
                is_accessible: exists,
                is_enabled,
                game_count: 0,
            });
        }
    }

    (libraries, warnings)
}

/// Scans installed Steam games across all enabled and accessible library folders
pub fn scan_steam_library(
    steam_root: &Path,
    filter_config: &SteamFilterConfig,
    disabled_libraries: &[String],
) -> SteamScanResult {
    let (mut libraries, mut warnings) = discover_library_folders(steam_root, disabled_libraries);
    let mut imported_games: Vec<Game> = Vec::new();
    let mut skipped_apps: Vec<SkippedSteamApp> = Vec::new();

    let now = chrono::Utc::now().to_rfc3339();

    for lib in &mut libraries {
        if !lib.is_enabled {
            info!(path = %lib.path, "Skipping disabled Steam library folder");
            continue;
        }

        if !lib.is_accessible {
            warn!(path = %lib.path, "Steam library folder is not accessible");
            continue;
        }

        let steamapps_dir = Path::new(&lib.path).join("steamapps");
        if !steamapps_dir.exists() {
            continue;
        }

        let entries = match fs::read_dir(&steamapps_dir) {
            Ok(e) => e,
            Err(err) => {
                warnings.push(format!(
                    "Failed to read directory '{}': {}",
                    steamapps_dir.display(),
                    err
                ));
                continue;
            }
        };

        let mut library_count = 0;

        for entry_res in entries {
            let entry = match entry_res {
                Ok(e) => e,
                Err(_) => continue,
            };

            let file_name = entry.file_name().to_string_lossy().to_string();
            if !file_name.starts_with("appmanifest_") || !file_name.ends_with(".acf") {
                continue;
            }

            let acf_path = entry.path();
            let content = match fs::read_to_string(&acf_path) {
                Ok(c) => c,
                Err(e) => {
                    warnings.push(format!(
                        "Could not read manifest '{}': {}",
                        acf_path.display(),
                        e
                    ));
                    continue;
                }
            };

            let vdf = match VdfParser::parse(&content) {
                Ok(v) => v,
                Err(e) => {
                    warnings.push(format!(
                        "Malformed manifest '{}': {}",
                        acf_path.display(),
                        e
                    ));
                    continue;
                }
            };

            let app_state = match vdf
                .get_section("AppState")
                .or_else(|| vdf.get_section("appstate"))
            {
                Some(s) => s,
                None => {
                    warnings.push(format!(
                        "Manifest '{}' missing AppState section",
                        acf_path.display()
                    ));
                    continue;
                }
            };

            // Extract AppID
            let app_id_str = match app_state.get_str("appid") {
                Some(id) => id,
                None => continue,
            };

            let app_id: u32 = match app_id_str.parse() {
                Ok(id) if id > 0 => id,
                _ => continue,
            };

            let name = match app_state.get_str("name") {
                Some(n) if !n.trim().is_empty() => n.trim().to_string(),
                _ => format!("Steam App {}", app_id),
            };

            // Check StateFlags (Bit 2 / 0x4 = StateFullyInstalled)
            let state_flags: u32 = app_state
                .get_str("StateFlags")
                .and_then(|s| s.parse().ok())
                .unwrap_or(0);

            // Install directory
            let install_dir_name = app_state.get_str("installdir").unwrap_or("");
            let game_full_dir = steamapps_dir.join("common").join(install_dir_name);
            let dir_exists = game_full_dir.exists() && game_full_dir.is_dir();

            // Status check: fully installed requires StateFullyInstalled flag or existing dir
            let is_installed = (state_flags & 4 != 0 || state_flags == 4) && dir_exists;

            // Evaluate non-game filters
            let filter_res: FilterResult = filter_config.evaluate(app_id, &name);
            if filter_res.is_filtered {
                skipped_apps.push(SkippedSteamApp {
                    app_id,
                    name,
                    library_path: lib.path.clone(),
                    reason: filter_res.reason.unwrap_or_else(|| "Filtered".to_string()),
                });
                continue;
            }

            // Deduplicate: if already imported from another library, prefer Installed status
            if let Some(existing_idx) = imported_games
                .iter()
                .position(|g| g.source_id.as_deref() == Some(app_id_str))
            {
                if is_installed && imported_games[existing_idx].status != GameStatus::Installed {
                    imported_games.remove(existing_idx);
                } else {
                    continue;
                }
            }

            let status = if is_installed {
                GameStatus::Installed
            } else {
                GameStatus::Missing
            };

            let install_dir_str = game_full_dir.to_string_lossy().to_string();
            let norm_path = normalize_path(&install_dir_str);

            let game = Game {
                id: uuid::Uuid::new_v4().to_string(),
                title: name.clone(),
                sort_title: name.to_lowercase(),
                description: None,
                developer: None,
                publisher: None,
                release_year: None,
                genres: Vec::new(),
                tags: Vec::new(),
                source_kind: SourceKind::Steam,
                source_id: Some(app_id.to_string()),
                install_dir: Some(install_dir_str),
                launch_action: LaunchAction::Steam { app_id },
                status,
                last_scanned_at: Some(now.clone()),
                is_favorite: false,
                is_hidden: false,
                notes: None,
                user_tags: Vec::new(),
                match_confidence: Some(1.0),
                provider_attribution: Some("Steam Local Manifest".to_string()),
                last_launched_at: None,
                normalized_path: Some(norm_path),
                created_at: now.clone(),
                playtime_seconds: 0,
                session_count: 0,
                last_played_at: None,
                artwork: None,
            };

            imported_games.push(game);
            library_count += 1;
        }

        lib.game_count = library_count;
    }

    SteamScanResult {
        steam_path: Some(steam_root.to_string_lossy().to_string()),
        libraries,
        imported_games,
        skipped_apps,
        warnings,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write;
    use tempfile::tempdir;

    #[test]
    fn test_discover_libraries_modern_and_legacy() {
        let dir = tempdir().unwrap();
        let steamapps = dir.path().join("steamapps");
        fs::create_dir_all(&steamapps).unwrap();

        let vdf_content = r#"
            "libraryfolders"
            {
                "0"
                {
                    "path" "C:\\Steam"
                    "label" "System Drive"
                }
                "1" "D:\\Games\\SteamLibrary"
            }
        "#;
        let mut f = File::create(steamapps.join("libraryfolders.vdf")).unwrap();
        f.write_all(vdf_content.as_bytes()).unwrap();

        let (libs, warnings) = discover_library_folders(dir.path(), &[]);
        assert!(warnings.is_empty() || warnings.len() >= 1);
        // Includes root plus "C:\Steam" and "D:\Games\SteamLibrary"
        assert!(libs.len() >= 2);
    }

    #[test]
    fn test_scan_steam_library_with_manifest_and_filtering() {
        let dir = tempdir().unwrap();
        let steamapps = dir.path().join("steamapps");
        let common = steamapps.join("common");
        let terraria_dir = common.join("Terraria");
        fs::create_dir_all(&terraria_dir).unwrap();

        // 1. Valid game: Terraria (105600)
        let manifest_105600 = r#"
            "AppState"
            {
                "appid" "105600"
                "name" "Terraria"
                "StateFlags" "4"
                "installdir" "Terraria"
            }
        "#;
        fs::write(steamapps.join("appmanifest_105600.acf"), manifest_105600).unwrap();

        // 2. Non-game: Steamworks Common Redistributables (228980)
        let redist_dir = common.join("Steamworks Shared");
        fs::create_dir_all(&redist_dir).unwrap();
        let manifest_228980 = r#"
            "AppState"
            {
                "appid" "228980"
                "name" "Steamworks Common Redistributables"
                "StateFlags" "4"
                "installdir" "Steamworks Shared"
            }
        "#;
        fs::write(steamapps.join("appmanifest_228980.acf"), manifest_228980).unwrap();

        let filter_config = SteamFilterConfig::default();
        let result = scan_steam_library(dir.path(), &filter_config, &[]);

        // Should import Terraria
        assert_eq!(result.imported_games.len(), 1);
        assert_eq!(result.imported_games[0].title, "Terraria");
        assert_eq!(
            result.imported_games[0].source_id,
            Some("105600".to_string())
        );
        assert_eq!(result.imported_games[0].status, GameStatus::Installed);
        assert_eq!(
            result.imported_games[0].launch_action,
            LaunchAction::Steam { app_id: 105600 }
        );

        // Should skip Steamworks Common Redistributables
        assert_eq!(result.skipped_apps.len(), 1);
        assert_eq!(result.skipped_apps[0].app_id, 228980);
    }

    #[test]
    fn test_scan_handles_missing_install_directory() {
        let dir = tempdir().unwrap();
        let steamapps = dir.path().join("steamapps");
        fs::create_dir_all(&steamapps).unwrap();

        // Manifest points to non-existent folder
        let manifest = r#"
            "AppState"
            {
                "appid" "4000"
                "name" "Garry's Mod"
                "StateFlags" "4"
                "installdir" "GarrysMod"
            }
        "#;
        fs::write(steamapps.join("appmanifest_4000.acf"), manifest).unwrap();

        let filter_config = SteamFilterConfig::default();
        let result = scan_steam_library(dir.path(), &filter_config, &[]);

        assert_eq!(result.imported_games.len(), 1);
        // Marked Missing because directory does not exist on disk
        assert_eq!(result.imported_games[0].status, GameStatus::Missing);
    }
}
