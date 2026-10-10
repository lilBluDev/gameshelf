use tauri::State;
use tracing::info;

use crate::error::AppResult;
use crate::integrations::steam::{self, SteamScanResult, SteamStatusResponse};
use crate::AppState;

#[tauri::command]
pub async fn get_steam_status(state: State<'_, AppState>) -> AppResult<SteamStatusResponse> {
    steam::get_steam_status(&state.db)
}

#[tauri::command]
pub async fn rescan_steam(state: State<'_, AppState>) -> AppResult<SteamScanResult> {
    info!("Triggering Steam library rescan");
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || steam::rescan_steam_games(&db))
        .await
        .map_err(|e| crate::error::AppError::Internal(format!("Steam rescan task failed: {}", e)))?
}

#[tauri::command]
pub async fn configure_steam_path(
    path: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<()> {
    steam::configure_steam_path(&state.db, path.as_deref())
}

#[tauri::command]
pub async fn set_steam_library_enabled(
    library_path: String,
    enabled: bool,
    state: State<'_, AppState>,
) -> AppResult<()> {
    steam::set_steam_library_enabled(&state.db, &library_path, enabled)
}

#[tauri::command]
pub async fn update_steam_filter_rule(
    rule_id: String,
    enabled: bool,
    state: State<'_, AppState>,
) -> AppResult<()> {
    steam::update_steam_filter_rule(&state.db, &rule_id, enabled)
}

#[tauri::command]
pub async fn include_skipped_steam_app(app_id: u32, state: State<'_, AppState>) -> AppResult<()> {
    steam::include_skipped_steam_app(&state.db, app_id)
}
