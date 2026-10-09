use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::info;

use crate::error::AppResult;
use crate::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct AppSettings {
    pub theme: String,
    pub default_view_mode: String,
    pub grid_card_size: String,
    pub steam_grid_db_configured: bool,
    pub close_to_tray: bool,
}

#[derive(Debug, Deserialize)]
pub struct SetSettingPayload {
    pub key: String,
    pub value: String,
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> AppResult<AppSettings> {
    let theme = state
        .db
        .get_setting("theme")?
        .unwrap_or_else(|| "dark".to_string());
    let default_view_mode = state
        .db
        .get_setting("default_view_mode")?
        .unwrap_or_else(|| "grid".to_string());
    let grid_card_size = state
        .db
        .get_setting("grid_card_size")?
        .unwrap_or_else(|| "medium".to_string());

    let steam_grid_db_configured = state
        .db
        .get_setting("steam_grid_db_configured")?
        .map(|v| v == "true" || v == "1")
        .unwrap_or(false);

    let close_to_tray = state
        .db
        .get_setting("close_to_tray")?
        .map(|v| v == "true" || v == "1")
        .unwrap_or(false);

    Ok(AppSettings {
        theme,
        default_view_mode,
        grid_card_size,
        steam_grid_db_configured,
        close_to_tray,
    })
}

#[tauri::command]
pub async fn set_setting(
    state: State<'_, AppState>,
    payload: SetSettingPayload,
) -> AppResult<bool> {
    info!(key = %payload.key, value = %payload.value, "Updating application setting");
    state.db.set_setting(&payload.key, &payload.value)?;
    Ok(true)
}
