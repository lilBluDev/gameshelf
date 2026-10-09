use std::env;
use std::path::{Path, PathBuf};
use tracing::debug;

use crate::emulators::profiles::{compute_validation_status, DetectionHints, EmulatorProfile};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DetectedEmulator {
    pub profile_id: String,
    pub executable_path: String,
    pub version: Option<String>,
    pub detection_method: String,
}

/// Expands Windows environment variables like `%APPDATA%`, `%PROGRAMFILES%`, `%LOCALAPPDATA%`
pub fn expand_env_path(path_str: &str) -> Option<PathBuf> {
    let mut result = path_str.to_string();

    let env_vars = [
        "APPDATA",
        "LOCALAPPDATA",
        "PROGRAMFILES",
        "ProgramFiles(x86)",
        "USERPROFILE",
        "SystemRoot",
    ];

    for var in &env_vars {
        let pattern = format!("%{}%", var);
        if result.contains(&pattern) {
            if let Ok(val) = env::var(var) {
                result = result.replace(&pattern, &val);
            }
        }
    }

    if result.contains('%') {
        // Unresolved environment variable
        None
    } else {
        Some(PathBuf::from(result))
    }
}

/// Detects an emulator executable using strictly bounded search paths:
/// 1. Known file system paths with environment variable expansion
/// 2. User & System Start Menu shortcuts (.lnk)
/// 3. System PATH environment variable
///
/// Never traverses whole drives or parent directory trees.
pub fn detect_emulator(hints: &DetectionHints) -> Option<DetectedEmulator> {
    // 1. Check known install paths
    for known in &hints.known_paths {
        if let Some(expanded) = expand_env_path(known) {
            if expanded.exists() && expanded.is_file() {
                let version = extract_version(&expanded);
                return Some(DetectedEmulator {
                    profile_id: String::new(),
                    executable_path: expanded.to_string_lossy().to_string(),
                    version,
                    detection_method: format!("Known path: {}", known),
                });
            }
        }
    }

    // 2. Check Start Menu shortcuts
    let start_menu_roots = [
        env::var("APPDATA")
            .map(|a| PathBuf::from(a).join(r"Microsoft\Windows\Start Menu\Programs")),
        env::var("PROGRAMDATA")
            .map(|p| PathBuf::from(p).join(r"Microsoft\Windows\Start Menu\Programs")),
    ];

    for root in start_menu_roots.iter().flatten() {
        if root.exists() && root.is_dir() {
            for shortcut_name in &hints.shortcut_names {
                if let Some(target) = find_shortcut_target(root, shortcut_name) {
                    if target.exists() && target.is_file() {
                        let version = extract_version(&target);
                        return Some(DetectedEmulator {
                            profile_id: String::new(),
                            executable_path: target.to_string_lossy().to_string(),
                            version,
                            detection_method: format!("Start Menu shortcut: {}", shortcut_name),
                        });
                    }
                }
            }
        }
    }

    // 3. Check system PATH
    if let Ok(path_var) = env::var("PATH") {
        for dir in env::split_paths(&path_var) {
            for exe_name in &hints.executable_names {
                let candidate = dir.join(exe_name);
                if candidate.exists() && candidate.is_file() {
                    let version = extract_version(&candidate);
                    return Some(DetectedEmulator {
                        profile_id: String::new(),
                        executable_path: candidate.to_string_lossy().to_string(),
                        version,
                        detection_method: format!("PATH: {}", dir.display()),
                    });
                }
            }
        }
    }

    None
}

/// Recursively looks for a specific shortcut name within bounded Start Menu folders (depth <= 3)
fn find_shortcut_target(dir: &Path, shortcut_name: &str) -> Option<PathBuf> {
    if !dir.is_dir() {
        return None;
    }

    let mut stack = vec![(dir.to_path_buf(), 0)];
    while let Some((current_dir, depth)) = stack.pop() {
        if depth > 3 {
            continue;
        }

        if let Ok(entries) = std::fs::read_dir(&current_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        if name.eq_ignore_ascii_case(shortcut_name) {
                            // Resolve .lnk shortcut target
                            if let Ok(info) = crate::platform::windows::inspect_game_file(&path) {
                                return Some(PathBuf::from(info.executable_path));
                            }
                        }
                    }
                } else if path.is_dir() {
                    stack.push((path, depth + 1));
                }
            }
        }
    }

    None
}

/// Attempts to read the PE version string if available
fn extract_version(exe_path: &Path) -> Option<String> {
    match crate::platform::windows::inspect_game_file(exe_path) {
        Ok(info) => {
            debug!(
                "Extracted PE info for {}: title={}",
                exe_path.display(),
                info.title
            );
            // If PE product name exists, use it as version hint
            Some(info.title)
        }
        Err(_) => None,
    }
}

/// Discovers installed emulators for all profiles and updates their detection state
pub fn detect_all_emulators(profiles: &mut [EmulatorProfile]) {
    for profile in profiles {
        // If not already configured with an existing executable path, run detection
        let needs_detection = match &profile.executable_path {
            Some(p) => !Path::new(p).exists(),
            None => true,
        };

        if needs_detection {
            if let Some(detected) = detect_emulator(&profile.detection_hints) {
                profile.executable_path = Some(detected.executable_path);
            }
        }

        profile.validation_status = compute_validation_status(profile);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use tempfile::tempdir;

    #[test]
    fn test_detection_known_path_and_env_expansion() {
        let temp = tempdir().unwrap();
        let fake_exe = temp.path().join("Dolphin.exe");
        File::create(&fake_exe).unwrap();

        let hints = DetectionHints {
            known_paths: vec![fake_exe.to_str().unwrap().to_string()],
            registry_keys: vec![],
            shortcut_names: vec![],
            executable_names: vec![],
        };

        let detected = detect_emulator(&hints).expect("Should detect emulator via known path");
        assert_eq!(detected.executable_path, fake_exe.to_str().unwrap());
        assert!(detected.detection_method.contains("Known path"));
    }

    #[test]
    fn test_detection_fails_safely_when_missing() {
        let hints = DetectionHints {
            known_paths: vec![r"C:\NonExistentEmulatorPath\DoesNotExist.exe".to_string()],
            registry_keys: vec![],
            shortcut_names: vec!["NonExistent.lnk".to_string()],
            executable_names: vec!["nonexistent_emu_binary_12345.exe".to_string()],
        };

        let detected = detect_emulator(&hints);
        assert!(detected.is_none());
    }
}
