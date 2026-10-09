pub mod filter;
pub mod scanner;
pub mod vdf;

use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use self::filter::SteamFilterConfig;
use self::scanner::{SteamLibraryFolder, SteamScanResult};
use crate::db::Database;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SteamStatusResponse {
    pub is_installed: bool,
    pub steam_path: Option<String>,
    pub libraries: Vec<SteamLibraryFolder>,
    pub filter_config: SteamFilterConfig,
    pub last_scanned_at: Option<String>,
    pub total_imported_games: usize,
    pub warnings: Vec<String>,
}

/// Retrieve overall Steam integration status and detected libraries
pub fn get_steam_status(db: &Database) -> AppResult<SteamStatusResponse> {
    let custom_path = db.get_setting("steam_custom_path")?;
    let disabled_libs_json = db
        .get_setting("steam_disabled_libraries")?
        .unwrap_or_else(|| "[]".to_string());
    let disabled_libraries: Vec<String> =
        serde_json::from_str(&disabled_libs_json).unwrap_or_default();

    let filter_config_json = db.get_setting("steam_filter_config")?;
    let filter_config: SteamFilterConfig = match filter_config_json {
        Some(json) => serde_json::from_str(&json).unwrap_or_default(),
        None => SteamFilterConfig::default(),
    };

    let last_scanned_at = db.get_setting("steam_last_scan_at")?;
    let total_imported_games = db.count_games_by_source(&crate::db::schema::SourceKind::Steam)?;

    let detected_path = scanner::detect_steam_installation(custom_path.as_deref());

    let (libraries, warnings) = match &detected_path {
        Some(path) => scanner::discover_library_folders(path, &disabled_libraries),
        None => (
            Vec::new(),
            vec!["Steam installation directory not found".to_string()],
        ),
    };

    Ok(SteamStatusResponse {
        is_installed: detected_path.is_some(),
        steam_path: detected_path.map(|p| p.to_string_lossy().to_string()),
        libraries,
        filter_config,
        last_scanned_at,
        total_imported_games,
        warnings,
    })
}

/// Re-scan Steam libraries, update DB idempotently, and mark vanished games as missing
pub fn rescan_steam_games(db: &Database) -> AppResult<SteamScanResult> {
    let custom_path = db.get_setting("steam_custom_path")?;
    let disabled_libs_json = db
        .get_setting("steam_disabled_libraries")?
        .unwrap_or_else(|| "[]".to_string());
    let disabled_libraries: Vec<String> =
        serde_json::from_str(&disabled_libs_json).unwrap_or_default();

    let filter_config_json = db.get_setting("steam_filter_config")?;
    let filter_config: SteamFilterConfig = match filter_config_json {
        Some(json) => serde_json::from_str(&json).unwrap_or_default(),
        None => SteamFilterConfig::default(),
    };

    let steam_path = match scanner::detect_steam_installation(custom_path.as_deref()) {
        Some(p) => p,
        None => {
            return Err(AppError::Internal(
                "Steam installation not found. Please configure the Steam installation folder in Settings > Integrations.".to_string(),
            ));
        }
    };

    info!(path = %steam_path.display(), "Starting Steam library discovery scan");

    let scan_result = scanner::scan_steam_library(&steam_path, &filter_config, &disabled_libraries);

    let mut active_app_ids = Vec::new();

    // Idempotently upsert imported games
    for game in &scan_result.imported_games {
        if let Some(ref source_id) = game.source_id {
            if let Ok(app_id) = source_id.parse::<u32>() {
                active_app_ids.push(app_id);
            }
        }
        db.upsert_steam_game(game)?;
    }

    // Mark games whose library vanished or are uninstalled as Missing (never deleted)
    let missing_count = db.mark_missing_steam_games(&active_app_ids)?;
    if missing_count > 0 {
        warn!(
            missing_count = missing_count,
            "Marked uninstalled or detached Steam games as Missing"
        );
    }

    let now = chrono::Utc::now().to_rfc3339();
    db.set_setting("steam_last_scan_at", &now)?;

    Ok(scan_result)
}

/// Configure or reset custom Steam installation path
pub fn configure_steam_path(db: &Database, path: Option<&str>) -> AppResult<()> {
    match path {
        Some(p) if !p.trim().is_empty() => {
            let path_buf = std::path::PathBuf::from(p);
            if !path_buf.exists() || !path_buf.is_dir() {
                return Err(AppError::Internal(format!(
                    "Specified path does not exist or is not a directory: '{}'",
                    p
                )));
            }
            db.set_setting("steam_custom_path", p.trim())?;
        }
        _ => {
            db.set_setting("steam_custom_path", "")?;
        }
    }
    Ok(())
}

/// Toggle a Steam library folder on or off and persist choice
pub fn set_steam_library_enabled(
    db: &Database,
    library_path: &str,
    enabled: bool,
) -> AppResult<()> {
    let norm = crate::platform::windows::normalize_path(library_path);
    let disabled_libs_json = db
        .get_setting("steam_disabled_libraries")?
        .unwrap_or_else(|| "[]".to_string());
    let mut disabled_libraries: Vec<String> =
        serde_json::from_str(&disabled_libs_json).unwrap_or_default();

    if enabled {
        disabled_libraries.retain(|d| !d.eq_ignore_ascii_case(&norm));
    } else if !disabled_libraries
        .iter()
        .any(|d| d.eq_ignore_ascii_case(&norm))
    {
        disabled_libraries.push(norm);
    }

    let updated_json = serde_json::to_string(&disabled_libraries)?;
    db.set_setting("steam_disabled_libraries", &updated_json)?;

    Ok(())
}

/// Update a non-game filter rule's enabled status
pub fn update_steam_filter_rule(db: &Database, rule_id: &str, enabled: bool) -> AppResult<()> {
    let filter_config_json = db.get_setting("steam_filter_config")?;
    let mut filter_config: SteamFilterConfig = match filter_config_json {
        Some(json) => serde_json::from_str(&json).unwrap_or_default(),
        None => SteamFilterConfig::default(),
    };

    if let Some(rule) = filter_config.rules.iter_mut().find(|r| r.id == rule_id) {
        rule.enabled = enabled;
    }

    let updated_json = serde_json::to_string(&filter_config)?;
    db.set_setting("steam_filter_config", &updated_json)?;

    Ok(())
}

/// Add an AppID to explicit included overrides (user explicitly imported a skipped app)
pub fn include_skipped_steam_app(db: &Database, app_id: u32) -> AppResult<()> {
    let filter_config_json = db.get_setting("steam_filter_config")?;
    let mut filter_config: SteamFilterConfig = match filter_config_json {
        Some(json) => serde_json::from_str(&json).unwrap_or_default(),
        None => SteamFilterConfig::default(),
    };

    if !filter_config.explicit_included_app_ids.contains(&app_id) {
        filter_config.explicit_included_app_ids.push(app_id);
    }

    let updated_json = serde_json::to_string(&filter_config)?;
    db.set_setting("steam_filter_config", &updated_json)?;

    Ok(())
}
