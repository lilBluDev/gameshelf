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
pub mod tracking;
pub mod tray;

use std::path::PathBuf;
use std::sync::Arc;
#[cfg(not(test))]
use tauri::Manager;
#[cfg(not(test))]
use tracing::info;

use cache::artwork::ArtworkCache;
use db::Database;

pub struct AppState {
    pub db: Database,
    pub data_dir: PathBuf,
    pub log_dir: PathBuf,
    pub scan_cancel_flag: Arc<std::sync::atomic::AtomicBool>,
    pub artwork_cache: Arc<ArtworkCache>,
    pub tray_available: Arc<std::sync::atomic::AtomicBool>,
    pub playtime_manager: Arc<tracking::PlaytimeManager>,
}

#[cfg(not(test))]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
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
            let tray_available = Arc::new(std::sync::atomic::AtomicBool::new(false));

            if let Err(e) = tray::setup_tray(app.handle(), tray_available.clone()) {
                tracing::warn!("Failed to setup system tray: {}", e);
            }

            let _ = db.cleanup_dangling_sessions();
            let playtime_manager = Arc::new(tracking::PlaytimeManager::new(
                Arc::new(db.clone()),
                Some(app.handle().clone()),
            ));

            app.manage(AppState {
                db,
                data_dir,
                log_dir,
                scan_cancel_flag,
                artwork_cache,
                tray_available,
                playtime_manager,
            });

            info!("GameShelf backend setup completed successfully");
            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                let app = window.app_handle();
                let state = app.state::<AppState>();
                let close_to_tray = state
                    .db
                    .get_setting("close_to_tray")
                    .unwrap_or(None)
                    .map(|v| v == "true" || v == "1")
                    .unwrap_or(false);
                let tray_available = state
                    .tray_available
                    .load(std::sync::atomic::Ordering::SeqCst);
                if tray::evaluate_window_action(
                    tray::WindowAction::Close,
                    close_to_tray,
                    false,
                    tray_available,
                ) == tray::TrayDecision::HideToTray
                {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
            tauri::WindowEvent::Resized(_) => {
                if let Ok(true) = window.is_minimized() {
                    let app = window.app_handle();
                    let state = app.state::<AppState>();
                    let minimize_to_tray = state
                        .db
                        .get_setting("minimize_to_tray")
                        .unwrap_or(None)
                        .map(|v| v == "true" || v == "1")
                        .unwrap_or(false);
                    let tray_available = state
                        .tray_available
                        .load(std::sync::atomic::Ordering::SeqCst);
                    if tray::evaluate_window_action(
                        tray::WindowAction::Minimize,
                        false,
                        minimize_to_tray,
                        tray_available,
                    ) == tray::TrayDecision::HideToTray
                    {
                        let _ = window.hide();
                    }
                }
            }
            _ => {}
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
            commands::games::record_game_session,
            commands::games::get_game_sessions,
            commands::games::reset_game_playtime,
            commands::games::stop_tracking_session,
            commands::games::clear_all_playtime,
            commands::games::get_active_sessions,
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
