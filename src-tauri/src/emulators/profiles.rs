use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub enum WorkingDirRule {
    #[default]
    EmulatorDir,
    RomDir,
    Custom(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "status", content = "detail")]
pub enum EmulatorValidationStatus {
    Verified,
    ExecutableMissing,
    NeedsConfiguration(String),
    InvalidTemplate(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct RegistryHint {
    pub hive: String, // "HKCU" or "HKLM"
    pub path: String,
    pub key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct DetectionHints {
    pub known_paths: Vec<String>,
    pub registry_keys: Vec<RegistryHint>,
    pub shortcut_names: Vec<String>,
    pub executable_names: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct EmulatorProfile {
    pub id: String,
    pub name: String,
    pub systems: Vec<String>,
    pub supported_extensions: Vec<String>,
    pub argument_template: Vec<String>,
    pub working_dir_rule: WorkingDirRule,
    pub executable_path: Option<String>,
    pub core_path: Option<String>,
    pub is_builtin: bool,
    pub detection_hints: DetectionHints,
    pub verification_source: Option<String>,
    pub validation_status: EmulatorValidationStatus,
}

/// Computes the validation status of an emulator profile based on real filesystem checks and template syntax.
pub fn compute_validation_status(profile: &EmulatorProfile) -> EmulatorValidationStatus {
    // 1. Check argument template syntax first
    if let Err(err) = validate_argument_template(&profile.argument_template) {
        return EmulatorValidationStatus::InvalidTemplate(err);
    }

    // 2. Check executable path
    let exe = match &profile.executable_path {
        Some(p) if !p.trim().is_empty() => p.trim(),
        _ => return EmulatorValidationStatus::ExecutableMissing,
    };

    let exe_path = Path::new(exe);
    if !exe_path.exists() || !exe_path.is_file() {
        return EmulatorValidationStatus::ExecutableMissing;
    }

    // 3. Check if template or profile requires a core (e.g. RetroArch)
    let has_core_placeholder = profile
        .argument_template
        .iter()
        .any(|arg| arg.contains("{core}"));
    if has_core_placeholder || profile.id == "retroarch" {
        match &profile.core_path {
            Some(core) if !core.trim().is_empty() => {
                let core_path = Path::new(core.trim());
                if !core_path.exists() {
                    return EmulatorValidationStatus::NeedsConfiguration(format!(
                        "Configured core file does not exist at '{}'",
                        core
                    ));
                }
            }
            _ => {
                return EmulatorValidationStatus::NeedsConfiguration(
                    "RetroArch requires a core (.dll) to be specified. Please select a core path in settings."
                        .to_string(),
                );
            }
        }
    }

    EmulatorValidationStatus::Verified
}

/// Validates that argument templates do not contain unknown or empty placeholders.
pub fn validate_argument_template(template: &[String]) -> Result<(), String> {
    for arg in template {
        for (start, ch) in arg.char_indices() {
            if ch == '{' {
                let end = match arg[start..].find('}') {
                    Some(idx) => start + idx,
                    None => return Err(format!("Unclosed placeholder in argument: '{}'", arg)),
                };
                let placeholder = &arg[start + 1..end];
                if placeholder.is_empty() {
                    return Err(format!("Empty placeholder '{{}}' in argument: '{}'", arg));
                }
                match placeholder {
                    "rom" | "game_dir" | "emulator_dir" | "basename" | "core" => {}
                    unknown => {
                        return Err(format!(
                            "Unknown placeholder '{{{}}}' in argument: '{}'. Allowed placeholders: {{rom}}, {{game_dir}}, {{emulator_dir}}, {{basename}}, {{core}}",
                            unknown, arg
                        ));
                    }
                }
            }
        }
    }
    Ok(())
}

/// Expands placeholders into an argument vector for execution.
/// Placeholders are expanded as exact values without word splitting or shell concatenation.
pub fn expand_arguments(
    template: &[String],
    rom_path: &Path,
    emulator_path: &Path,
    core_path: Option<&str>,
) -> Result<Vec<String>, String> {
    validate_argument_template(template)?;

    let rom_str = rom_path
        .to_str()
        .ok_or_else(|| "ROM path contains invalid Unicode".to_string())?;

    let game_dir = rom_path.parent().and_then(|p| p.to_str()).unwrap_or("");

    let emulator_dir = emulator_path
        .parent()
        .and_then(|p| p.to_str())
        .unwrap_or("");

    let basename = rom_path.file_stem().and_then(|s| s.to_str()).unwrap_or("");

    let mut expanded = Vec::with_capacity(template.len());

    for arg in template {
        if arg.contains("{core}") && core_path.unwrap_or("").trim().is_empty() {
            return Err(
                "Argument template contains {core} but no core path was provided.".to_string(),
            );
        }

        let mut val = arg.clone();
        val = val.replace("{rom}", rom_str);
        val = val.replace("{game_dir}", game_dir);
        val = val.replace("{emulator_dir}", emulator_dir);
        val = val.replace("{basename}", basename);
        if let Some(core) = core_path {
            val = val.replace("{core}", core);
        }

        expanded.push(val);
    }

    Ok(expanded)
}

/// Returns the 4 starting built-in profiles verified against official CLI documentation.
pub fn get_builtin_profiles() -> Vec<EmulatorProfile> {
    vec![
        // 1. RetroArch
        EmulatorProfile {
            id: "retroarch".to_string(),
            name: "RetroArch".to_string(),
            systems: vec![
                "Multi-system".to_string(),
                "NES".to_string(),
                "SNES".to_string(),
                "Genesis".to_string(),
                "Game Boy".to_string(),
                "Game Boy Advance".to_string(),
                "PlayStation".to_string(),
            ],
            supported_extensions: vec![
                ".nes".to_string(),
                ".sfc".to_string(),
                ".smc".to_string(),
                ".bin".to_string(),
                ".gen".to_string(),
                ".md".to_string(),
                ".gb".to_string(),
                ".gbc".to_string(),
                ".gba".to_string(),
                ".cue".to_string(),
                ".chd".to_string(),
                ".zip".to_string(),
                ".7z".to_string(),
            ],
            argument_template: vec![
                "-f".to_string(),
                "-L".to_string(),
                "{core}".to_string(),
                "{rom}".to_string(),
            ],
            working_dir_rule: WorkingDirRule::EmulatorDir,
            executable_path: None,
            core_path: None,
            is_builtin: true,
            detection_hints: DetectionHints {
                known_paths: vec![
                    "%APPDATA%\\RetroArch\\retroarch.exe".to_string(),
                    "%PROGRAMFILES%\\RetroArch\\retroarch.exe".to_string(),
                    "%LOCALAPPDATA%\\Programs\\RetroArch\\retroarch.exe".to_string(),
                ],
                registry_keys: vec![],
                shortcut_names: vec!["RetroArch.lnk".to_string()],
                executable_names: vec!["retroarch.exe".to_string()],
            },
            verification_source: Some(
                "Official Libretro Documentation: retroarch.exe -f -L <core_path> <rom_path>"
                    .to_string(),
            ),
            validation_status: EmulatorValidationStatus::ExecutableMissing,
        },
        // 2. Dolphin
        EmulatorProfile {
            id: "dolphin".to_string(),
            name: "Dolphin".to_string(),
            systems: vec!["GameCube".to_string(), "Wii".to_string()],
            supported_extensions: vec![
                ".iso".to_string(),
                ".rvz".to_string(),
                ".gcm".to_string(),
                ".wbfs".to_string(),
                ".ciso".to_string(),
                ".wad".to_string(),
                ".elf".to_string(),
                ".dol".to_string(),
            ],
            argument_template: vec![
                "-b".to_string(),
                "-e".to_string(),
                "{rom}".to_string(),
            ],
            working_dir_rule: WorkingDirRule::EmulatorDir,
            executable_path: None,
            core_path: None,
            is_builtin: true,
            detection_hints: DetectionHints {
                known_paths: vec![
                    "%PROGRAMFILES%\\Dolphin\\Dolphin.exe".to_string(),
                    "%PROGRAMFILES%\\Dolphin-x64\\Dolphin.exe".to_string(),
                    "%LOCALAPPDATA%\\Programs\\Dolphin\\Dolphin.exe".to_string(),
                ],
                registry_keys: vec![],
                shortcut_names: vec!["Dolphin.lnk".to_string()],
                executable_names: vec!["Dolphin.exe".to_string(), "Dolphin-x64.exe".to_string()],
            },
            verification_source: Some(
                "Official Dolphin Wiki Command Line Options: -b (--batch exit with game), -e (--exec load file)"
                    .to_string(),
            ),
            validation_status: EmulatorValidationStatus::ExecutableMissing,
        },
        // 3. PCSX2
        EmulatorProfile {
            id: "pcsx2".to_string(),
            name: "PCSX2".to_string(),
            systems: vec!["PlayStation 2".to_string()],
            supported_extensions: vec![
                ".iso".to_string(),
                ".bin".to_string(),
                ".chd".to_string(),
                ".cso".to_string(),
                ".gz".to_string(),
                ".mdf".to_string(),
            ],
            argument_template: vec![
                "-batch".to_string(),
                "-fullscreen".to_string(),
                "--".to_string(),
                "{rom}".to_string(),
            ],
            working_dir_rule: WorkingDirRule::EmulatorDir,
            executable_path: None,
            core_path: None,
            is_builtin: true,
            detection_hints: DetectionHints {
                known_paths: vec![
                    "%PROGRAMFILES%\\PCSX2\\pcsx2-qtx64.exe".to_string(),
                    "%PROGRAMFILES%\\PCSX2\\pcsx2.exe".to_string(),
                    "%LOCALAPPDATA%\\Programs\\PCSX2\\pcsx2-qtx64.exe".to_string(),
                ],
                registry_keys: vec![],
                shortcut_names: vec!["PCSX2.lnk".to_string()],
                executable_names: vec!["pcsx2-qtx64.exe".to_string(), "pcsx2.exe".to_string()],
            },
            verification_source: Some(
                "Official PCSX2 Qt CLI documentation: pcsx2-qtx64.exe -batch -fullscreen -- <path>"
                    .to_string(),
            ),
            validation_status: EmulatorValidationStatus::ExecutableMissing,
        },
        // 4. DuckStation
        EmulatorProfile {
            id: "duckstation".to_string(),
            name: "DuckStation".to_string(),
            systems: vec!["PlayStation".to_string()],
            supported_extensions: vec![
                ".cue".to_string(),
                ".chd".to_string(),
                ".iso".to_string(),
                ".bin".to_string(),
                ".m3u".to_string(),
                ".pbp".to_string(),
            ],
            argument_template: vec![
                "-batch".to_string(),
                "-fullscreen".to_string(),
                "{rom}".to_string(),
            ],
            working_dir_rule: WorkingDirRule::EmulatorDir,
            executable_path: None,
            core_path: None,
            is_builtin: true,
            detection_hints: DetectionHints {
                known_paths: vec![
                    "%LOCALAPPDATA%\\Programs\\DuckStation\\duckstation-qt-x64-ReleaseLTCG.exe".to_string(),
                    "%PROGRAMFILES%\\DuckStation\\duckstation-qt-x64-ReleaseLTCG.exe".to_string(),
                    "%LOCALAPPDATA%\\DuckStation\\duckstation-qt.exe".to_string(),
                ],
                registry_keys: vec![],
                shortcut_names: vec!["DuckStation.lnk".to_string()],
                executable_names: vec![
                    "duckstation-qt-x64-ReleaseLTCG.exe".to_string(),
                    "duckstation-qt.exe".to_string(),
                    "duckstation.exe".to_string(),
                ],
            },
            verification_source: Some(
                "Official DuckStation CLI documentation: duckstation-qt.exe -batch -fullscreen <path>"
                    .to_string(),
            ),
            validation_status: EmulatorValidationStatus::ExecutableMissing,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use tempfile::tempdir;

    #[test]
    fn test_argument_expansion_with_spaces_unicode_and_quotes() {
        let temp = tempdir().unwrap();
        let rom_path = temp.path().join("Final Fantasy VII (日本語).chd");
        let emu_path = temp.path().join("DuckStation Emulator.exe");
        File::create(&rom_path).unwrap();
        File::create(&emu_path).unwrap();

        let template = vec![
            "-batch".to_string(),
            "--title=\"{basename}\"".to_string(),
            "{rom}".to_string(),
            "{game_dir}".to_string(),
            "{emulator_dir}".to_string(),
        ];

        let expanded = expand_arguments(&template, &rom_path, &emu_path, None).unwrap();
        assert_eq!(expanded[0], "-batch");
        assert_eq!(expanded[1], "--title=\"Final Fantasy VII (日本語)\"");
        assert_eq!(expanded[2], rom_path.to_str().unwrap());
        assert_eq!(expanded[3], temp.path().to_str().unwrap());
        assert_eq!(expanded[4], temp.path().to_str().unwrap());
    }

    #[test]
    fn test_argument_expansion_rejects_unknown_and_empty_placeholders() {
        let temp = tempdir().unwrap();
        let rom_path = temp.path().join("game.iso");
        let emu_path = temp.path().join("emu.exe");

        // Empty placeholder
        let bad_template_empty = vec!["-e".to_string(), "{}".to_string()];
        let err1 = expand_arguments(&bad_template_empty, &rom_path, &emu_path, None).unwrap_err();
        assert!(err1.contains("Empty placeholder"));

        // Unknown placeholder
        let bad_template_unknown = vec!["-x".to_string(), "{unsupported}".to_string()];
        let err2 = expand_arguments(&bad_template_unknown, &rom_path, &emu_path, None).unwrap_err();
        assert!(err2.contains("Unknown placeholder '{unsupported}'"));
    }

    #[test]
    fn test_retroarch_core_requirement() {
        let temp = tempdir().unwrap();
        let rom_path = temp.path().join("mario.nes");
        let emu_path = temp.path().join("retroarch.exe");
        let template = vec!["-L".to_string(), "{core}".to_string(), "{rom}".to_string()];

        // Missing core path errors
        let err = expand_arguments(&template, &rom_path, &emu_path, None).unwrap_err();
        assert!(err.contains("contains {core} but no core path was provided"));

        // With core path succeeds
        let core_file = temp.path().join("mesen_libretro.dll");
        File::create(&core_file).unwrap();
        let expanded =
            expand_arguments(&template, &rom_path, &emu_path, core_file.to_str()).unwrap();
        assert_eq!(expanded[0], "-L");
        assert_eq!(expanded[1], core_file.to_str().unwrap());
        assert_eq!(expanded[2], rom_path.to_str().unwrap());
    }

    #[test]
    fn test_compute_validation_status() {
        let temp = tempdir().unwrap();
        let emu_exe = temp.path().join("Dolphin.exe");

        let mut profile = get_builtin_profiles()
            .into_iter()
            .find(|p| p.id == "dolphin")
            .unwrap();

        // 1. Missing executable
        profile.executable_path = None;
        assert_eq!(
            compute_validation_status(&profile),
            EmulatorValidationStatus::ExecutableMissing
        );

        profile.executable_path = Some(emu_exe.to_str().unwrap().to_string());
        // File doesn't exist yet
        assert_eq!(
            compute_validation_status(&profile),
            EmulatorValidationStatus::ExecutableMissing
        );

        // 2. Created executable => Verified
        File::create(&emu_exe).unwrap();
        assert_eq!(
            compute_validation_status(&profile),
            EmulatorValidationStatus::Verified
        );

        // 3. RetroArch requires core
        let mut ra_profile = get_builtin_profiles()
            .into_iter()
            .find(|p| p.id == "retroarch")
            .unwrap();
        let ra_exe = temp.path().join("retroarch.exe");
        File::create(&ra_exe).unwrap();
        ra_profile.executable_path = Some(ra_exe.to_str().unwrap().to_string());
        ra_profile.core_path = None;

        match compute_validation_status(&ra_profile) {
            EmulatorValidationStatus::NeedsConfiguration(msg) => {
                assert!(msg.contains("RetroArch requires a core"));
            }
            _ => panic!("Expected NeedsConfiguration"),
        }
    }
}
