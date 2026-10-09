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
    pub minimize_to_tray: bool,
    pub launch_on_startup: bool,
    pub onboarding_completed: bool,
    pub accent_color: String,
    pub reduced_motion: String,
    pub card_density: String,
    pub playtime_tracking_enabled: bool,
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

    let minimize_to_tray = state
        .db
        .get_setting("minimize_to_tray")?
        .map(|v| v == "true" || v == "1")
        .unwrap_or(false);

    let launch_on_startup = crate::platform::windows::is_autostart_enabled();

    let onboarding_completed = match state.db.get_setting("onboarding_completed")? {
        Some(v) => v == "true" || v == "1",
        None => state.db.get_game_count()? > 0,
    };

    let accent_color = state
        .db
        .get_setting("accent_color")?
        .unwrap_or_else(|| "#7C6CFF".to_string());

    let reduced_motion = state
        .db
        .get_setting("reduced_motion")?
        .unwrap_or_else(|| "system".to_string());

    let card_density = state
        .db
        .get_setting("card_density")?
        .unwrap_or_else(|| "comfortable".to_string());

    let playtime_tracking_enabled = state
        .db
        .get_setting("playtime_tracking_enabled")?
        .map(|v| v == "true" || v == "1")
        .unwrap_or(false);

    Ok(AppSettings {
        theme,
        default_view_mode,
        grid_card_size,
        steam_grid_db_configured,
        close_to_tray,
        minimize_to_tray,
        launch_on_startup,
        onboarding_completed,
        accent_color,
        reduced_motion,
        card_density,
        playtime_tracking_enabled,
    })
}

#[tauri::command]
pub async fn set_setting(
    state: State<'_, AppState>,
    payload: SetSettingPayload,
) -> AppResult<bool> {
    info!(key = %payload.key, value = %payload.value, "Updating application setting");

    if payload.key == "launch_on_startup" {
        let enabled = payload.value == "true" || payload.value == "1";
        let _ = crate::platform::windows::set_autostart_enabled(enabled);
    }

    state.db.set_setting(&payload.key, &payload.value)?;
    Ok(true)
}
