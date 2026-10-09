use std::path::Path;
use std::process::Command;
use tracing::{info, warn};

use crate::db::schema::LaunchAction;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, serde::Serialize)]
pub struct LaunchResult {
    pub success: bool,
    pub pid: Option<u32>,
    pub message: String,
}

/// Validates a launch action and executes the target process with argument vectors.
pub fn validate_and_launch(action: &LaunchAction) -> AppResult<LaunchResult> {
    validate_and_launch_with_db(action, None)
}

/// Validates a launch action and executes the target process with argument vectors and database access for emulator resolution.
pub fn validate_and_launch_with_db(
    action: &LaunchAction,
    db: Option<&crate::db::Database>,
) -> AppResult<LaunchResult> {
    match action {
        LaunchAction::Executable {
            path,
            args,
            working_dir,
            env,
        } => {
            let exe_path = Path::new(path);
            if !exe_path.exists() {
                return Err(AppError::Internal(format!(
                    "Executable not found at path: '{}'. Please locate the file.",
                    path
                )));
            }

            if !exe_path.is_file() {
                return Err(AppError::Internal(format!(
                    "Target path is not a valid file: '{}'",
                    path
                )));
            }

            let mut cmd = Command::new(exe_path);
            cmd.args(args);

            if let Some(wd) = working_dir {
                let wd_path = Path::new(wd);
                if wd_path.exists() && wd_path.is_dir() {
                    cmd.current_dir(wd_path);
                } else {
                    warn!(working_dir = %wd, "Configured working directory does not exist; using executable parent folder");
                    if let Some(parent) = exe_path.parent() {
                        cmd.current_dir(parent);
                    }
                }
            } else if let Some(parent) = exe_path.parent() {
                cmd.current_dir(parent);
            }

            if let Some(env_vars) = env {
                for (k, v) in env_vars {
                    cmd.env(k, v);
                }
            }

            info!(
                executable = %path,
                args = ?args,
                "Launching game executable directly"
            );

            let child = cmd
                .spawn()
                .map_err(|e| AppError::Internal(format!("Failed to spawn executable: {}", e)))?;

            Ok(LaunchResult {
                success: true,
                pid: Some(child.id()),
                message: format!("Successfully launched process (PID {})", child.id()),
            })
        }

        LaunchAction::Shortcut {
            target,
            args,
            working_dir,
        } => {
            let target_path = Path::new(target);
            if !target_path.exists() {
                return Err(AppError::Internal(format!(
                    "Shortcut target does not exist: '{}'. Please locate the file.",
                    target
                )));
            }

            let mut cmd = Command::new(target_path);
            cmd.args(args);

            if let Some(wd) = working_dir {
                let wd_path = Path::new(wd);
                if wd_path.exists() && wd_path.is_dir() {
                    cmd.current_dir(wd_path);
                } else if let Some(parent) = target_path.parent() {
                    cmd.current_dir(parent);
                }
            } else if let Some(parent) = target_path.parent() {
                cmd.current_dir(parent);
            }

            info!(
                target = %target,
                args = ?args,
                "Launching game from resolved shortcut target"
            );

            let child = cmd.spawn().map_err(|e| {
                AppError::Internal(format!("Failed to spawn shortcut target: {}", e))
            })?;

            Ok(LaunchResult {
                success: true,
                pid: Some(child.id()),
                message: format!("Successfully launched process (PID {})", child.id()),
            })
        }

        LaunchAction::Steam { app_id } => {
            if *app_id == 0 {
                return Err(AppError::Internal(
                    "Invalid Steam App ID: must be a positive integer.".to_string(),
                ));
            }

            // Verify Steam installation is found on system
            let steam_dir = crate::integrations::steam::scanner::detect_steam_installation(None);
            if steam_dir.is_none() {
                return Err(AppError::Internal(
                    "Steam installation could not be located on this system. Please check your Steam installation or configure the Steam directory in Settings > Integrations.".to_string(),
                ));
            }

            let uri = crate::platform::windows::build_steam_run_uri(*app_id)
                .map_err(AppError::Internal)?;

            info!(
                app_id = %app_id,
                uri = %uri,
                "Launching Steam game via protocol activation"
            );

            crate::platform::windows::launch_uri(&uri)?;

            Ok(LaunchResult {
                success: true,
                pid: None,
                message: format!("Triggered Steam launch for App ID {}", app_id),
            })
        }

        LaunchAction::EmulatedGame {
            profile_id,
            rom_path,
            arg_overrides,
        } => {
            // 1. Validate ROM file exists
            let rom = Path::new(rom_path);
            if !rom.exists() {
                return Err(AppError::Internal(format!(
                    "ROM file not found at path: '{}'. Please locate the file or reconfigure the game.",
                    rom_path
                )));
            }

            // 2. Fetch emulator profile from database
            let database = db.ok_or_else(|| {
                AppError::Internal(
                    "Database context required to resolve emulator profile.".to_string(),
                )
            })?;

            let profile = database
                .get_emulator_profile(profile_id)?
                .ok_or_else(|| {
                    AppError::Internal(format!(
                        "Emulator profile '{}' not found in database. Please configure an emulator in Settings > Emulators.",
                        profile_id
                    ))
                })?;

            // 3. Validate emulator executable exists
            let emu_exe_str = profile.executable_path.as_deref().unwrap_or("").trim();
            if emu_exe_str.is_empty() {
                return Err(AppError::Internal(format!(
                    "Emulator executable path for '{}' is not configured. Please set an executable path in Settings > Emulators.",
                    profile.name
                )));
            }

            let emu_exe = Path::new(emu_exe_str);
            if !emu_exe.exists() || !emu_exe.is_file() {
                return Err(AppError::Internal(format!(
                    "Emulator executable not found at '{}'. Please locate the executable in Settings > Emulators.",
                    emu_exe_str
                )));
            }

            // 4. RetroArch / Core check: if template contains {core} or profile is RetroArch
            let effective_template = arg_overrides.as_ref().unwrap_or(&profile.argument_template);
            if effective_template.iter().any(|a| a.contains("{core}")) || profile.id == "retroarch"
            {
                match profile.core_path.as_deref() {
                    Some(c) if !c.trim().is_empty() => {
                        let c_path = Path::new(c.trim());
                        if !c_path.exists() {
                            return Err(AppError::Internal(format!(
                                "Configured emulator core not found at '{}'. Please select a valid core in Settings > Emulators.",
                                c
                            )));
                        }
                    }
                    _ => {
                        return Err(AppError::Internal(format!(
                            "Emulator '{}' requires a core path to be configured before launching. Please configure a core in Settings > Emulators.",
                            profile.name
                        )));
                    }
                }
            }

            // 5. Expand arguments as an argument vector (never shell string)
            let expanded_args = crate::emulators::profiles::expand_arguments(
                effective_template,
                rom,
                emu_exe,
                profile.core_path.as_deref(),
            )
            .map_err(AppError::Internal)?;

            let mut cmd = Command::new(emu_exe);
            cmd.args(&expanded_args);

            // 6. Working directory
            match &profile.working_dir_rule {
                crate::emulators::profiles::WorkingDirRule::RomDir => {
                    if let Some(parent) = rom.parent() {
                        cmd.current_dir(parent);
                    }
                }
                crate::emulators::profiles::WorkingDirRule::Custom(dir) => {
                    let d = Path::new(dir);
                    if d.exists() && d.is_dir() {
                        cmd.current_dir(d);
                    } else if let Some(parent) = emu_exe.parent() {
                        cmd.current_dir(parent);
                    }
                }
                crate::emulators::profiles::WorkingDirRule::EmulatorDir => {
                    if let Some(parent) = emu_exe.parent() {
                        cmd.current_dir(parent);
                    }
                }
            }

            info!(
                emulator = %emu_exe.display(),
                args = ?expanded_args,
                rom = %rom_path,
                "Launching emulated game directly via emulator process"
            );

            let child = cmd.spawn().map_err(|e| {
                AppError::Internal(format!(
                    "Failed to spawn emulator '{}': {}",
                    profile.name, e
                ))
            })?;

            Ok(LaunchResult {
                success: true,
                pid: Some(child.id()),
                message: format!(
                    "Successfully launched {} via {} (PID {})",
                    rom.file_name().and_then(|s| s.to_str()).unwrap_or("game"),
                    profile.name,
                    child.id()
                ),
            })
        }

        LaunchAction::Unavailable { reason } => Err(AppError::Internal(format!(
            "Game is unavailable for launch: {}",
            reason
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use tempfile::tempdir;

    #[test]
    fn test_launch_validation_missing_file() {
        let action = LaunchAction::Executable {
            path: "C:/NonExistentPath/Game.exe".to_string(),
            args: vec![],
            working_dir: None,
            env: None,
        };
        let res = validate_and_launch(&action);
        assert!(res.is_err());
        assert!(res
            .unwrap_err()
            .to_string()
            .contains("Executable not found"));
    }

    #[test]
    fn test_launch_validation_unavailable() {
        let action = LaunchAction::Unavailable {
            reason: "Beta expired".to_string(),
        };
        let res = validate_and_launch(&action);
        assert!(res.is_err());
        assert!(res.unwrap_err().to_string().contains("Beta expired"));
    }

    #[test]
    fn test_launch_valid_executable_args() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test_program.exe");
        File::create(&file_path).unwrap();
        assert!(file_path.exists());
    }

    #[test]
    fn test_launch_validation_steam_invalid_app_id() {
        let action = LaunchAction::Steam { app_id: 0 };
        let res = validate_and_launch(&action);
        assert!(res.is_err());
        assert!(res
            .unwrap_err()
            .to_string()
            .contains("Invalid Steam App ID"));
    }

    #[test]
    fn test_emulated_game_launch_validation_errors() {
        let db = crate::db::Database::in_memory().unwrap();
        let temp = tempdir().unwrap();

        // 1. Missing ROM
        let action_missing_rom = LaunchAction::EmulatedGame {
            profile_id: "dolphin".to_string(),
            rom_path: "C:/NonExistentRom/Zelda.iso".to_string(),
            arg_overrides: None,
        };
        let res1 = validate_and_launch_with_db(&action_missing_rom, Some(&db));
        assert!(res1.is_err());
        assert!(res1.unwrap_err().to_string().contains("ROM file not found"));

        // 2. ROM exists, but profile has no executable configured
        let rom_path = temp.path().join("Zelda.iso");
        File::create(&rom_path).unwrap();

        let action_missing_exe = LaunchAction::EmulatedGame {
            profile_id: "dolphin".to_string(),
            rom_path: rom_path.to_str().unwrap().to_string(),
            arg_overrides: None,
        };
        let res2 = validate_and_launch_with_db(&action_missing_exe, Some(&db));
        assert!(res2.is_err());
        assert!(res2.unwrap_err().to_string().contains("not configured"));

        // 3. Executable path points to non-existent file
        let mut profile = db.get_emulator_profile("dolphin").unwrap().unwrap();
        profile.executable_path = Some("C:/NonExistentEmu/Dolphin.exe".to_string());
        db.save_emulator_profile(&profile).unwrap();

        let res3 = validate_and_launch_with_db(&action_missing_exe, Some(&db));
        assert!(res3.is_err());
        assert!(res3
            .unwrap_err()
            .to_string()
            .contains("Emulator executable not found"));
    }

    #[test]
    fn test_e2e_fake_emulator_launch_and_argument_recording() {
        let db = crate::db::Database::in_memory().unwrap();
        let temp = tempdir().unwrap();

        // We use PowerShell / cmd or current test executable as fake emulator
        // Create a cmd script that echoes its arguments into a recording file
        let log_file = temp.path().join("recorded_args.txt");
        let fake_emu_bat = temp.path().join("fake_emulator.cmd");
        let log_str = log_file.to_str().unwrap().replace('\\', "\\\\");

        // Write batch file that records each arg
        let script_content = format!("@echo off\r\necho %* > \"{}\"\r\nexit /b 0\r\n", log_str);
        std::fs::write(&fake_emu_bat, script_content).unwrap();

        // Create a real ROM file
        let rom_file = temp.path().join("Super Smash Bros Melee (USA).iso");
        File::create(&rom_file).unwrap();

        // Configure emulator profile
        let mut dolphin = db.get_emulator_profile("dolphin").unwrap().unwrap();
        dolphin.executable_path = Some(fake_emu_bat.to_str().unwrap().to_string());
        dolphin.argument_template = vec![
            "-b".to_string(),
            "-e".to_string(),
            "{rom}".to_string(),
            "--title={basename}".to_string(),
        ];
        db.save_emulator_profile(&dolphin).unwrap();

        // Launch action
        let action = LaunchAction::EmulatedGame {
            profile_id: "dolphin".to_string(),
            rom_path: rom_file.to_str().unwrap().to_string(),
            arg_overrides: None,
        };

        let result = validate_and_launch_with_db(&action, Some(&db)).unwrap();
        assert!(result.success);
        assert!(result.pid.is_some());

        // Wait briefly for the batch script to finish writing
        std::thread::sleep(std::time::Duration::from_millis(300));

        // Assert recorded argument array
        assert!(
            log_file.exists(),
            "Recorded args file must be created by fake emulator"
        );
        let recorded = std::fs::read_to_string(&log_file).unwrap();
        assert!(recorded.contains("-b -e"));
        assert!(recorded.contains("Super Smash Bros Melee (USA).iso"));
        assert!(recorded.contains("--title=Super Smash Bros Melee (USA)"));
    }
}
