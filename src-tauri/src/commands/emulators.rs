use std::path::Path;
use tauri::State;
use tracing::info;

use crate::emulators::detection::detect_all_emulators;
use crate::emulators::profiles::{
    compute_validation_status, validate_argument_template, EmulatorProfile,
    EmulatorValidationStatus,
};
use crate::emulators::rom_scanner::{
    scan_rom_directory, RomCandidate, RomScanOptions, RomScanResult,
};
use crate::error::{AppError, AppResult};
use crate::launcher::{validate_and_launch_with_db, LaunchResult};
use crate::AppState;

#[tauri::command]
pub async fn get_emulator_profiles(state: State<'_, AppState>) -> AppResult<Vec<EmulatorProfile>> {
    state.db.list_emulator_profiles()
}

#[tauri::command]
pub async fn save_emulator_profile(
    state: State<'_, AppState>,
    mut profile: EmulatorProfile,
) -> AppResult<EmulatorProfile> {
    // Validate argument template syntax before saving
    if let Err(err) = validate_argument_template(&profile.argument_template) {
        return Err(AppError::Internal(format!(
            "Invalid argument template: {}",
            err
        )));
    }

    profile.validation_status = compute_validation_status(&profile);
    state.db.save_emulator_profile(&profile)?;

    info!(profile_id = %profile.id, name = %profile.name, "Saved emulator profile");
    Ok(profile)
}

#[tauri::command]
pub async fn delete_emulator_profile(state: State<'_, AppState>, id: String) -> AppResult<bool> {
    info!(profile_id = %id, "Deleting custom emulator profile");
    state.db.delete_emulator_profile(&id)?;
    Ok(true)
}

#[tauri::command]
pub async fn detect_emulators(state: State<'_, AppState>) -> AppResult<Vec<EmulatorProfile>> {
    let mut profiles = state.db.list_emulator_profiles()?;
    detect_all_emulators(&mut profiles);

    // Save updated detected paths to database
    for p in &profiles {
        state.db.save_emulator_profile(p)?;
    }

    info!(count = profiles.len(), "Auto-detected emulators updated");
    Ok(profiles)
}

#[tauri::command]
pub async fn validate_emulator_path(
    executable_path: String,
    core_path: Option<String>,
    template: Vec<String>,
) -> AppResult<EmulatorValidationStatus> {
    let dummy_profile = EmulatorProfile {
        id: "validate_test".to_string(),
        name: "Test Validation".to_string(),
        systems: vec![],
        supported_extensions: vec![],
        argument_template: template,
        working_dir_rule: crate::emulators::profiles::WorkingDirRule::EmulatorDir,
        executable_path: Some(executable_path),
        core_path,
        is_builtin: false,
        detection_hints: Default::default(),
        verification_source: None,
        validation_status: EmulatorValidationStatus::ExecutableMissing,
    };

    Ok(compute_validation_status(&dummy_profile))
}

#[tauri::command]
pub async fn scan_rom_folder(
    state: State<'_, AppState>,
    options: RomScanOptions,
) -> AppResult<RomScanResult> {
    let profile = state
        .db
        .get_emulator_profile(&options.profile_id)?
        .ok_or_else(|| {
            AppError::Internal(format!(
                "Emulator profile '{}' not found",
                options.profile_id
            ))
        })?;

    let existing_roms = state.db.get_existing_emulated_rom_paths()?;
    scan_rom_directory(&options, &profile, &existing_roms)
}

#[tauri::command]
pub async fn import_emulated_games(
    state: State<'_, AppState>,
    candidates: Vec<RomCandidate>,
) -> AppResult<usize> {
    info!(
        candidate_count = candidates.len(),
        "Importing emulated ROM candidates into library"
    );
    state.db.import_rom_candidates(&candidates)
}

#[tauri::command]
pub async fn test_launch_emulator(
    state: State<'_, AppState>,
    profile_id: String,
    test_file_path: String,
) -> AppResult<LaunchResult> {
    let p = Path::new(&test_file_path);
    if !p.exists() {
        return Err(AppError::Internal(format!(
            "Test launch file does not exist at '{}'. Please select an existing file.",
            test_file_path
        )));
    }

    let action = crate::db::schema::LaunchAction::EmulatedGame {
        profile_id,
        rom_path: test_file_path,
        arg_overrides: None,
    };

    validate_and_launch_with_db(&action, Some(&state.db))
}
