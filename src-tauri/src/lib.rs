pub mod cache;
pub mod commands;
pub mod db;
pub mod emulators;
pub mod error;
pub mod integrations;
pub mod launcher;
pub mod logging;
pub mod metadata;
pub mod platform;
pub mod scanner;

use std::path::PathBuf;
use std::sync::Arc;
use tauri::Manager;
use tracing::info;

use cache::artwork::ArtworkCache;
use db::Database;

pub struct AppState {
    pub db: Database,
    pub data_dir: PathBuf,
    pub log_dir: PathBuf,
    pub scan_cancel_flag: Arc<std::sync::atomic::AtomicBool>,
    pub artwork_cache: Arc<ArtworkCache>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Resolve app-specific data and log directories
            let data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from("./data"));
            let log_dir = app
                .path()
                .app_log_dir()
                .unwrap_or_else(|_| data_dir.join("logs"));

            std::fs::create_dir_all(&data_dir)?;
            std::fs::create_dir_all(&log_dir)?;

            // Initialize structured rotating file logger
            if let Err(e) = logging::setup_logging(&log_dir) {
                eprintln!("Failed to initialize logging: {}", e);
            }

            info!(
                data_dir = ?data_dir,
                log_dir = ?log_dir,
                "Initializing GameShelf application"
            );

            // Initialize SQLite database and run versioned migrations
            let db_path = data_dir.join("gameshelf.db");
            let db = Database::new(&db_path)?;
            let scan_cancel_flag = Arc::new(std::sync::atomic::AtomicBool::new(false));
            let artwork_cache = Arc::new(ArtworkCache::new(data_dir.join("artwork"))?);

            app.manage(AppState {
                db,
                data_dir,
                log_dir,
                scan_cancel_flag,
                artwork_cache,
            });

            info!("GameShelf backend setup completed successfully");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::get_app_info,
            commands::app::get_diagnostic_summary,
            commands::app::open_logs,
            commands::settings::get_settings,
            commands::settings::set_setting,
            commands::games::list_games,
            commands::games::inspect_file,
            commands::games::check_duplicate_path,
            commands::games::add_manual_game,
            commands::games::update_game,
            commands::games::update_launch_settings,
            commands::games::remove_game,
            commands::games::launch_game,
            commands::games::open_folder,
            commands::steam::get_steam_status,
            commands::steam::rescan_steam,
            commands::steam::configure_steam_path,
            commands::steam::set_steam_library_enabled,
            commands::steam::update_steam_filter_rule,
            commands::steam::include_skipped_steam_app,
            commands::scanner::start_folder_scan,
            commands::scanner::cancel_folder_scan,
            commands::scanner::get_scan_sources,
            commands::scanner::add_scan_source,
            commands::scanner::remove_scan_source,
            commands::scanner::import_scan_candidates,
            commands::scanner::rescan_source,
            commands::emulators::get_emulator_profiles,
            commands::emulators::save_emulator_profile,
            commands::emulators::delete_emulator_profile,
            commands::emulators::detect_emulators,
            commands::emulators::validate_emulator_path,
            commands::emulators::scan_rom_folder,
            commands::emulators::import_emulated_games,
            commands::emulators::test_launch_emulator,
            commands::artwork::get_steamgriddb_status,
            commands::artwork::set_steamgriddb_api_key,
            commands::artwork::remove_steamgriddb_api_key,
            commands::artwork::test_steamgriddb_connection,
            commands::artwork::search_metadata,
            commands::artwork::get_artwork_candidates,
            commands::artwork::apply_artwork_asset,
            commands::artwork::select_local_artwork,
            commands::artwork::remove_artwork_for_role,
            commands::artwork::get_game_artwork,
            commands::artwork::get_cache_stats,
            commands::artwork::clear_artwork_cache,
            commands::artwork::refresh_game_metadata,
            commands::artwork::set_locked_fields,
            commands::artwork::get_locked_fields,
        ])
        .run(tauri::generate_context!())
        .expect("error while running GameShelf application");
}
