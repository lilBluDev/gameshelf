use tauri::State;
use tracing::info;

use crate::db::Database;
use crate::error::AppResult;
use crate::integrations::steam::{self, SteamScanResult, SteamStatusResponse};

#[tauri::command]
pub async fn get_steam_status(db: State<'_, Database>) -> AppResult<SteamStatusResponse> {
    steam::get_steam_status(&db)
}

#[tauri::command]
pub async fn rescan_steam(db: State<'_, Database>) -> AppResult<SteamScanResult> {
    info!("Triggering Steam library rescan");
    steam::rescan_steam_games(&db)
}

#[tauri::command]
pub async fn configure_steam_path(path: Option<String>, db: State<'_, Database>) -> AppResult<()> {
    steam::configure_steam_path(&db, path.as_deref())
}

#[tauri::command]
pub async fn set_steam_library_enabled(
    library_path: String,
    enabled: bool,
    db: State<'_, Database>,
) -> AppResult<()> {
    steam::set_steam_library_enabled(&db, &library_path, enabled)
}

#[tauri::command]
pub async fn update_steam_filter_rule(
    rule_id: String,
    enabled: bool,
    db: State<'_, Database>,
) -> AppResult<()> {
    steam::update_steam_filter_rule(&db, &rule_id, enabled)
}

#[tauri::command]
pub async fn include_skipped_steam_app(app_id: u32, db: State<'_, Database>) -> AppResult<()> {
    steam::include_skipped_steam_app(&db, app_id)
}
