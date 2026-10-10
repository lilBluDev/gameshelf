use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, State};
use tracing::info;
use uuid::Uuid;

use crate::db::schema::{Game, GameOverrides, GameSession, GameStatus, LaunchAction, SourceKind};
use crate::error::{AppError, AppResult};
use crate::launcher::{validate_and_spawn_with_db, LaunchResult};
use crate::platform::windows::{inspect_game_file, normalize_path, InferredGameMetadata};
use crate::AppState;

#[derive(Debug, Deserialize, Default)]
pub struct ListGamesQuery {
    pub filter: Option<String>,
    pub search: Option<String>,
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
    pub include_hidden: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct ListGamesResponse {
    pub games: Vec<Game>,
    pub total: usize,
}

#[derive(Debug, Deserialize)]
pub struct AddManualGamePayload {
    pub title: String,
    pub executable_path: String,
    pub args: Option<Vec<String>>,
    pub working_dir: Option<String>,
    pub is_shortcut: bool,
}

#[derive(Debug, Deserialize)]
pub struct UpdateGamePayload {
    pub id: String,
    pub title: Option<String>,
    pub notes: Option<String>,
    pub user_tags: Option<Vec<String>>,
    pub is_favorite: Option<bool>,
    pub is_hidden: Option<bool>,
    pub locked_fields: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateLaunchSettingsPayload {
    pub id: String,
    pub executable_path: String,
    pub args: Vec<String>,
    pub working_dir: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct InspectFileResponse {
    pub title: String,
    pub executable_path: String,
    pub working_dir: Option<String>,
    pub args: Vec<String>,
    pub is_shortcut: bool,
    pub exists: bool,
    pub normalized_path: String,
}

#[derive(Debug, Serialize)]
pub struct DuplicateCheckResponse {
    pub is_duplicate: bool,
    pub existing_game: Option<Game>,
}

#[tauri::command]
pub async fn list_games(
    state: State<'_, AppState>,
    query: Option<ListGamesQuery>,
) -> AppResult<ListGamesResponse> {
    let q = query.unwrap_or_default();
    let games = state.db.list_games(
        q.filter.as_deref(),
        q.search.as_deref(),
        q.sort_by.as_deref(),
        q.sort_order.as_deref(),
        q.include_hidden.unwrap_or(false),
    )?;

    let total = games.len();
    Ok(ListGamesResponse { games, total })
}

#[tauri::command]
pub async fn inspect_file(file_path: String) -> AppResult<InspectFileResponse> {
    let p = Path::new(&file_path);
    if !p.exists() {
        return Err(AppError::Internal(format!(
            "File does not exist: {}",
            file_path
        )));
    }

    let meta: InferredGameMetadata = inspect_game_file(p).map_err(AppError::Internal)?;
    let normalized = normalize_path(&meta.executable_path);

    Ok(InspectFileResponse {
        title: meta.title,
        executable_path: meta.executable_path,
        working_dir: meta.working_dir,
        args: meta.args,
        is_shortcut: meta.is_shortcut,
        exists: true,
        normalized_path: normalized,
    })
}

#[tauri::command]
pub async fn check_duplicate_path(
    state: State<'_, AppState>,
    file_path: String,
) -> AppResult<DuplicateCheckResponse> {
    let normalized = normalize_path(&file_path);
    let existing = state.db.find_game_by_normalized_path(&normalized)?;

    Ok(DuplicateCheckResponse {
        is_duplicate: existing.is_some(),
        existing_game: existing,
    })
}

#[tauri::command]
pub async fn add_manual_game(
    state: State<'_, AppState>,
    payload: AddManualGamePayload,
) -> AppResult<Game> {
    let exe_path = Path::new(&payload.executable_path);
    let exists = exe_path.exists();
    let status = if exists {
        GameStatus::Installed
    } else {
        GameStatus::Missing
    };

    let normalized = normalize_path(&payload.executable_path);
    let id = Uuid::new_v4().to_string();
    let title = payload.title.trim().to_string();
    let sort_title = title.to_lowercase();
    let args = payload.args.unwrap_or_default();

    let launch_action = if payload.is_shortcut {
        LaunchAction::Shortcut {
            target: payload.executable_path.clone(),
            args,
            working_dir: payload.working_dir.clone(),
        }
    } else {
        LaunchAction::Executable {
            path: payload.executable_path.clone(),
            args,
            working_dir: payload.working_dir.clone(),
            env: None,
        }
    };

    let source_kind = if payload.is_shortcut {
        SourceKind::Shortcut
    } else {
        SourceKind::Standalone
    };

    let game = Game {
        id: id.clone(),
        title,
        sort_title,
        description: None,
        developer: None,
        publisher: None,
        release_year: None,
        genres: vec![],
        tags: vec![],
        source_kind,
        source_id: None,
        install_dir: payload.working_dir,
        launch_action,
        status,
        last_scanned_at: None,
        is_favorite: false,
        is_hidden: false,
        notes: None,
        user_tags: vec![],
        match_confidence: None,
        provider_attribution: Some("Manual Entry".to_string()),
        last_launched_at: None,
        normalized_path: Some(normalized),
        created_at: chrono::Utc::now().to_rfc3339(),
        playtime_seconds: 0,
        session_count: 0,
        last_played_at: None,
        artwork: None,
    };

    state.db.add_game(&game)?;
    info!(game_id = %id, title = %game.title, "Manual game added successfully");

    Ok(game)
}

#[tauri::command]
pub async fn update_game(
    state: State<'_, AppState>,
    payload: UpdateGamePayload,
) -> AppResult<Game> {
    let existing = state
        .db
        .get_game_by_id(&payload.id)?
        .ok_or_else(|| AppError::Internal(format!("Game not found: {}", payload.id)))?;

    let sort_title = payload.title.as_ref().map(|t| t.to_lowercase());

    let overrides = GameOverrides {
        game_id: payload.id.clone(),
        title: payload.title,
        sort_title,
        description: None,
        developer: None,
        publisher: None,
        release_year: None,
        genres: None,
        tags: None,
        notes: payload.notes,
        user_tags: payload.user_tags,
        is_favorite: payload.is_favorite,
        is_hidden: payload.is_hidden,
        locked_fields: payload.locked_fields,
        updated_at: chrono::Utc::now().to_rfc3339(),
    };

    state.db.update_game_overrides(&overrides)?;

    let updated = state.db.get_game_by_id(&payload.id)?.unwrap_or(existing);

    Ok(updated)
}

#[tauri::command]
pub async fn update_launch_settings(
    state: State<'_, AppState>,
    payload: UpdateLaunchSettingsPayload,
) -> AppResult<Game> {
    let existing = state
        .db
        .get_game_by_id(&payload.id)?
        .ok_or_else(|| AppError::Internal(format!("Game not found: {}", payload.id)))?;

    let p = Path::new(&payload.executable_path);
    let status = if p.exists() {
        GameStatus::Installed
    } else {
        GameStatus::Missing
    };

    let normalized = normalize_path(&payload.executable_path);

    let launch_action = match &existing.launch_action {
        LaunchAction::Shortcut { .. } => LaunchAction::Shortcut {
            target: payload.executable_path.clone(),
            args: payload.args,
            working_dir: payload.working_dir,
        },
        _ => LaunchAction::Executable {
            path: payload.executable_path.clone(),
            args: payload.args,
            working_dir: payload.working_dir,
            env: None,
        },
    };

    state
        .db
        .update_launch_action(&payload.id, &launch_action, Some(&normalized), status)?;

    let updated = state.db.get_game_by_id(&payload.id)?.unwrap_or(existing);

    Ok(updated)
}

#[tauri::command]
pub async fn remove_game(state: State<'_, AppState>, id: String) -> AppResult<bool> {
    info!(game_id = %id, "Removing game from database (leaving all local files intact)");
    state.db.remove_game(&id)?;
    Ok(true)
}

#[tauri::command]
pub async fn launch_game(
    state: State<'_, AppState>,
    _app_handle: AppHandle,
    id: String,
) -> AppResult<LaunchResult> {
    let game = state
        .db
        .get_game_by_id(&id)?
        .ok_or_else(|| AppError::Internal(format!("Game not found: {}", id)))?;

    match validate_and_spawn_with_db(&game.launch_action, Some(&state.db)) {
        Ok((res, maybe_child)) => {
            let _ = state.db.update_last_launched(&id);
            let _ = state.db.update_game_status(&id, GameStatus::Installed);

            if let Some(child) = maybe_child {
                let _ = state
                    .playtime_manager
                    .start_child_session(&game, child)
                    .await;
            } else if let LaunchAction::Steam { app_id } = &game.launch_action {
                let _ = state
                    .playtime_manager
                    .start_steam_session(&game, *app_id)
                    .await;
            }

            Ok(res)
        }
        Err(err) => {
            let err_msg = err.to_string();
            if err_msg.contains("not found") || err_msg.contains("does not exist") {
                let _ = state.db.update_game_status(&id, GameStatus::Missing);
            }
            Err(err)
        }
    }
}

#[tauri::command]
pub async fn stop_tracking_session(state: State<'_, AppState>, game_id: String) -> AppResult<()> {
    state
        .playtime_manager
        .stop_session(&game_id, "stopped_by_user")
        .await
}

#[tauri::command]
pub async fn clear_all_playtime(state: State<'_, AppState>) -> AppResult<()> {
    state.db.clear_all_playtime()
}

#[tauri::command]
pub async fn get_active_sessions(
    state: State<'_, AppState>,
) -> AppResult<Vec<crate::tracking::ActiveSessionInfo>> {
    Ok(state.playtime_manager.get_active_sessions().await)
}

#[tauri::command]
pub async fn record_game_session(
    state: State<'_, AppState>,
    game_id: String,
    started_at: String,
    ended_at: Option<String>,
    duration_seconds: u64,
    is_approximate: bool,
) -> AppResult<GameSession> {
    info!(
        game_id = %game_id,
        duration = %duration_seconds,
        approximate = %is_approximate,
        "Recording game session"
    );
    state.db.record_game_session(
        &game_id,
        &started_at,
        ended_at.as_deref(),
        duration_seconds,
        is_approximate,
    )
}

#[tauri::command]
pub async fn get_game_sessions(
    state: State<'_, AppState>,
    game_id: String,
) -> AppResult<Vec<GameSession>> {
    state.db.get_game_sessions(&game_id)
}

#[tauri::command]
pub async fn reset_game_playtime(state: State<'_, AppState>, game_id: String) -> AppResult<()> {
    info!(game_id = %game_id, "Resetting game playtime and session records");
    state.db.reset_game_playtime(&game_id)
}

pub fn derive_game_folder(game: &Game) -> Option<PathBuf> {
    if let Some(dir) = &game.install_dir {
        if !dir.trim().is_empty() {
            return Some(PathBuf::from(dir));
        }
    }
    match &game.launch_action {
        LaunchAction::Executable { path, .. } => {
            let p = Path::new(path);
            p.parent()
                .filter(|parent| !parent.as_os_str().is_empty())
                .map(PathBuf::from)
        }
        LaunchAction::Shortcut { target, .. } => {
            let p = Path::new(target);
            p.parent()
                .filter(|parent| !parent.as_os_str().is_empty())
                .map(PathBuf::from)
        }
        LaunchAction::EmulatedGame { rom_path, .. } => {
            let p = Path::new(rom_path);
            p.parent()
                .filter(|parent| !parent.as_os_str().is_empty())
                .map(PathBuf::from)
        }
        LaunchAction::Steam { .. } | LaunchAction::Unavailable { .. } => None,
    }
}

pub fn launch_explorer_on_dir(target: &Path) -> AppResult<bool> {
    if !target.exists() {
        return Err(AppError::Internal(format!(
            "Directory does not exist: {}",
            target.display()
        )));
    }

    let explorer_path = std::env::var("SystemRoot")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(r"C:\Windows"))
        .join("explorer.exe");

    let cmd = if explorer_path.exists() {
        explorer_path
    } else {
        PathBuf::from("explorer.exe")
    };

    info!(folder = ?target, explorer = ?cmd, "Opening game directory in Windows Explorer");
    std::process::Command::new(cmd)
        .arg(target)
        .spawn()
        .map_err(|e| AppError::Internal(format!("Failed to open Explorer: {}", e)))?;

    Ok(true)
}

#[tauri::command]
pub async fn open_folder(state: State<'_, AppState>, game_id: String) -> AppResult<bool> {
    let game = state
        .db
        .get_game_by_id(&game_id)?
        .ok_or_else(|| AppError::InvalidArgument(format!("Game not found: {}", game_id)))?;

    let folder = derive_game_folder(&game).ok_or_else(|| {
        AppError::InvalidArgument(format!("No usable folder for game: {}", game_id))
    })?;

    launch_explorer_on_dir(&folder)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_game(install_dir: Option<String>, launch_action: LaunchAction) -> Game {
        Game {
            id: "test-game".to_string(),
            title: "Test Game".to_string(),
            sort_title: "test game".to_string(),
            description: None,
            developer: None,
            publisher: None,
            release_year: None,
            genres: vec![],
            tags: vec![],
            source_kind: SourceKind::Standalone,
            source_id: None,
            install_dir,
            launch_action,
            status: GameStatus::Installed,
            last_scanned_at: Some("2026-01-01T00:00:00Z".to_string()),
            last_launched_at: None,
            is_favorite: false,
            is_hidden: false,
            user_tags: vec![],
            notes: None,
            match_confidence: None,
            provider_attribution: None,
            artwork: None,
            normalized_path: Some("".to_string()),
            created_at: "2026-01-01T00:00:00Z".to_string(),
            playtime_seconds: 0,
            session_count: 0,
            last_played_at: None,
        }
    }

    #[test]
    fn test_derive_game_folder_from_install_dir() {
        let game = make_test_game(
            Some(r"C:\Games\MyGame".to_string()),
            LaunchAction::Unavailable {
                reason: "Unavailable".to_string(),
            },
        );
        let folder = derive_game_folder(&game);
        assert_eq!(folder, Some(PathBuf::from(r"C:\Games\MyGame")));
    }

    #[test]
    fn test_derive_game_folder_from_executable_parent() {
        let game = make_test_game(
            None,
            LaunchAction::Executable {
                path: r"C:\Games\MyGame\bin\game.exe".to_string(),
                args: vec![],
                working_dir: None,
                env: Default::default(),
            },
        );
        let folder = derive_game_folder(&game);
        assert_eq!(folder, Some(PathBuf::from(r"C:\Games\MyGame\bin")));
    }

    #[test]
    fn test_derive_game_folder_from_rom_parent() {
        let game = make_test_game(
            None,
            LaunchAction::EmulatedGame {
                profile_id: "retroarch".to_string(),
                rom_path: r"D:\Roms\snes\game.sfc".to_string(),
                arg_overrides: None,
            },
        );
        let folder = derive_game_folder(&game);
        assert_eq!(folder, Some(PathBuf::from(r"D:\Roms\snes")));
    }

    #[test]
    fn test_derive_game_folder_no_usable_folder() {
        let game = make_test_game(
            None,
            LaunchAction::Unavailable {
                reason: "Not found".to_string(),
            },
        );
        let folder = derive_game_folder(&game);
        assert_eq!(folder, None);
    }
}
