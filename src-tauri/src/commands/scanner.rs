use std::path::PathBuf;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, State};
use tracing::{info, warn};

use crate::error::{AppError, AppResult};
use crate::scanner::{
    default_exclusions, default_skip_rules, is_safe_scan_root, scan_directories, ScanCandidate,
    ScanOptions, ScanProgress, ScanResult, ScanSource,
};
use crate::AppState;

#[tauri::command]
pub async fn start_folder_scan(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    options: ScanOptions,
) -> AppResult<ScanResult> {
    if options.root_paths.is_empty() {
        return Err(AppError::Internal(
            "Please select at least one folder to scan.".to_string(),
        ));
    }

    let mut validated_roots = Vec::new();
    for r in &options.root_paths {
        let path = PathBuf::from(r);
        if let Err(e) = is_safe_scan_root(&path) {
            return Err(AppError::Internal(e));
        }
        validated_roots.push(path);
    }

    // Reset cancellation flag
    state.scan_cancel_flag.store(false, Ordering::SeqCst);
    let cancel_flag = state.scan_cancel_flag.clone();
    let db = state.db.clone();

    // Prepare exclusions and rules
    let mut exclusions = default_exclusions();
    exclusions.extend(options.custom_exclusions);
    let skip_rules = default_skip_rules();
    let max_depth = if options.max_depth == 0 {
        4
    } else {
        options.max_depth
    };

    info!(roots = ?options.root_paths, max_depth = max_depth, "Starting folder scan");

    let result = tokio::task::spawn_blocking(move || {
        scan_directories(
            &validated_roots,
            max_depth,
            &exclusions,
            &skip_rules,
            cancel_flag,
            &db,
            |progress: ScanProgress| {
                let _ = app_handle.emit("folder-scan-progress", &progress);
            },
        )
    })
    .await
    .map_err(|e| AppError::Internal(format!("Scan task failed: {}", e)))?;

    info!(
        candidates = result.candidates.len(),
        folders = result.folders_scanned,
        cancelled = result.is_cancelled,
        "Folder scan completed"
    );

    Ok(result)
}

#[tauri::command]
pub fn cancel_folder_scan(state: State<'_, AppState>) -> AppResult<()> {
    info!("Cancelling active folder scan");
    state.scan_cancel_flag.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub fn get_scan_sources(state: State<'_, AppState>) -> AppResult<Vec<ScanSource>> {
    state.db.list_scan_sources()
}

#[tauri::command]
pub fn add_scan_source(
    state: State<'_, AppState>,
    path: String,
    depth: usize,
) -> AppResult<ScanSource> {
    let p = PathBuf::from(&path);
    if let Err(e) = is_safe_scan_root(&p) {
        return Err(AppError::Internal(e));
    }
    state.db.add_scan_source(&path, depth)
}

#[tauri::command]
pub fn remove_scan_source(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.db.remove_scan_source(&id)
}

#[tauri::command]
pub fn import_scan_candidates(
    state: State<'_, AppState>,
    candidates: Vec<ScanCandidate>,
    source_id: Option<String>,
) -> AppResult<usize> {
    let imported_count = state.db.import_scan_candidates(&candidates)?;
    if let Some(src_id) = source_id {
        let _ = state.db.update_scan_source_stats(&src_id, imported_count);
    }
    info!(count = imported_count, "Imported folder scan candidates");
    Ok(imported_count)
}

#[tauri::command]
pub async fn rescan_source(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    source_id: String,
) -> AppResult<ScanResult> {
    let sources = state.db.list_scan_sources()?;
    let source = sources
        .into_iter()
        .find(|s| s.id == source_id)
        .ok_or_else(|| AppError::Internal(format!("Scan source '{}' not found", source_id)))?;

    let root_path = PathBuf::from(&source.path);
    if let Err(e) = is_safe_scan_root(&root_path) {
        return Err(AppError::Internal(e));
    }

    state.scan_cancel_flag.store(false, Ordering::SeqCst);
    let cancel_flag = state.scan_cancel_flag.clone();
    let db = state.db.clone();
    let source_norm = source.normalized_path.clone();

    let exclusions = default_exclusions();
    let skip_rules = default_skip_rules();
    let max_depth = source.depth;

    let result = tokio::task::spawn_blocking(move || {
        let scan_res = scan_directories(
            &[root_path],
            max_depth,
            &exclusions,
            &skip_rules,
            cancel_flag,
            &db,
            |progress: ScanProgress| {
                let _ = app_handle.emit("folder-scan-progress", &progress);
            },
        );

        if !scan_res.is_cancelled {
            // Check active normalized paths and mark vanished games as missing
            let active_paths: Vec<String> = scan_res
                .candidates
                .iter()
                .filter(|c| !c.is_skipped)
                .map(|c| crate::platform::windows::normalize_path(&c.executable_path))
                .collect();

            if let Ok(missing_count) = db.mark_missing_folder_games(&source_norm, &active_paths) {
                if missing_count > 0 {
                    warn!(
                        missing_count = missing_count,
                        "Marked vanished games as Missing"
                    );
                }
            }
            let _ = db.update_scan_source_stats(&source_id, active_paths.len());
        }

        scan_res
    })
    .await
    .map_err(|e| AppError::Internal(format!("Rescan task failed: {}", e)))?;

    Ok(result)
}
