use crate::error::AppResult;
use crate::AppState;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub bundle_id: String,
    pub os: String,
    pub data_dir: String,
    pub log_dir: String,
    pub db_version: u32,
}

#[tauri::command]
pub async fn get_app_info(state: State<'_, AppState>) -> AppResult<AppInfo> {
    let db_version = state.db.get_version()?;

    Ok(AppInfo {
        name: "GameShelf".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        bundle_id: "com.gameshelf.app".to_string(),
        os: format!("Windows (Rust MSVC {})", std::env::consts::ARCH),
        data_dir: state.data_dir.to_string_lossy().to_string(),
        log_dir: state.log_dir.to_string_lossy().to_string(),
        db_version,
    })
}

#[tauri::command]
pub async fn get_diagnostic_summary(state: State<'_, AppState>) -> AppResult<String> {
    let db_version = state.db.get_version()?;
    let integrity_ok = state.db.check_integrity().unwrap_or(false);
    let (total_games, installed, missing, favorites) = state.db.get_game_stats()?;
    let emulator_profiles = state.db.list_emulator_profiles()?.len();
    let scan_sources = state.db.list_scan_sources()?.len();
    let cache_stats = state.artwork_cache.get_stats()?;
    let steam_status = crate::integrations::steam::scanner::detect_steam_installation(None);
    let has_steam = steam_status.is_some();
    let tracking_enabled = state
        .db
        .get_setting("playtime_tracking_enabled")
        .unwrap_or(None)
        .map(|v| v == "true" || v == "1")
        .unwrap_or(false);
    let now = chrono::Utc::now().to_rfc3339();

    let summary = format!(
        "### GameShelf Diagnostic Summary\n\
        - **App Version**: {} (build arch: {})\n\
        - **Database Schema**: v{} (integrity check: {})\n\
        - **Library Games**: Total: {} (Installed: {}, Missing: {}, Favorites: {})\n\
        - **Steam Integration**: Detected: {}\n\
        - **Playtime Tracking**: {}\n\
        - **Emulator Profiles**: {} configured\n\
        - **Scan Sources**: {} active folders\n\
        - **Artwork Cache**: {} files ({})\n\
        - **Platform**: Windows ({})\n\
        - **Generated At**: {}\n",
        env!("CARGO_PKG_VERSION"),
        std::env::consts::ARCH,
        db_version,
        if integrity_ok { "PASSED" } else { "FAILED" },
        total_games,
        installed,
        missing,
        favorites,
        if has_steam { "Yes" } else { "No" },
        if tracking_enabled {
            "Enabled"
        } else {
            "Disabled"
        },
        emulator_profiles,
        scan_sources,
        cache_stats.file_count,
        cache_stats.formatted_size,
        std::env::consts::OS,
        now
    );

    Ok(summary)
}

#[tauri::command]
pub async fn open_logs(state: State<'_, AppState>) -> AppResult<()> {
    crate::commands::games::launch_explorer_on_dir(&state.log_dir)?;
    Ok(())
}
