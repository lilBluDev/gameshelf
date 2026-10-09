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
