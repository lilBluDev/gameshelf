pub mod commands;
pub mod db;
pub mod error;
pub mod integrations;
pub mod launcher;
pub mod logging;
pub mod platform;
pub mod scanner;

use std::path::PathBuf;
use tauri::Manager;
use tracing::info;

use db::Database;

pub struct AppState {
    pub db: Database,
    pub data_dir: PathBuf,
    pub log_dir: PathBuf,
    pub scan_cancel_flag: std::sync::Arc<std::sync::atomic::AtomicBool>,
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
            let scan_cancel_flag = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));

            app.manage(AppState {
                db,
                data_dir,
                log_dir,
                scan_cancel_flag,
            });

            info!("GameShelf backend setup completed successfully");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::get_app_info,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running GameShelf application");
}
