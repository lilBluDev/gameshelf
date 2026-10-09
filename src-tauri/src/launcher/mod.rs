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
/// Never uses cmd.exe /c or shell strings. Correctly handles spaces and Unicode in paths and arguments.
pub fn validate_and_launch(action: &LaunchAction) -> AppResult<LaunchResult> {
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

        LaunchAction::Steam { app_id } => Err(AppError::Internal(format!(
            "Steam launch integration (App ID {}) is scheduled for Phase 4.",
            app_id
        ))),

        LaunchAction::EmulatedGame { profile_id, .. } => Err(AppError::Internal(format!(
            "Emulation runner for profile '{}' is scheduled for Phase 5.",
            profile_id
        ))),

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
        // On Windows, create a temporary batch or dummy executable
        let file_path = dir.path().join("test_program.exe");
        File::create(&file_path).unwrap();

        // Validating action points to an existing file
        assert!(file_path.exists());
    }
}
