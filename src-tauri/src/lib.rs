pub mod commands;
pub mod db;
pub mod error;
pub mod launcher;
pub mod logging;
pub mod platform;

use std::path::PathBuf;
use tauri::Manager;
use tracing::info;

use db::Database;

pub struct AppState {
    pub db: Database,
    pub data_dir: PathBuf,
    pub log_dir: PathBuf,
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

            app.manage(AppState {
                db,
                data_dir,
                log_dir,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running GameShelf application");
}
