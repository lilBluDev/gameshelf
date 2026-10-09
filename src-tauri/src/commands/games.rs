use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::State;
use tracing::info;
use uuid::Uuid;

use crate::db::schema::{Game, GameOverrides, GameStatus, LaunchAction, SourceKind};
use crate::error::{AppError, AppResult};
use crate::launcher::{validate_and_launch_with_db, LaunchResult};
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
pub async fn launch_game(state: State<'_, AppState>, id: String) -> AppResult<LaunchResult> {
    let game = state
        .db
        .get_game_by_id(&id)?
        .ok_or_else(|| AppError::Internal(format!("Game not found: {}", id)))?;

    match validate_and_launch_with_db(&game.launch_action, Some(&state.db)) {
        Ok(res) => {
            let _ = state.db.update_last_launched(&id);
            let _ = state.db.update_game_status(&id, GameStatus::Installed);
            Ok(res)
        }
        Err(err) => {
            // If the failure was due to missing file, update DB status to Missing
            let err_msg = err.to_string();
            if err_msg.contains("not found") || err_msg.contains("does not exist") {
                let _ = state.db.update_game_status(&id, GameStatus::Missing);
            }
            Err(err)
        }
    }
}

#[tauri::command]
pub async fn open_folder(folder_path: String) -> AppResult<bool> {
    let p = Path::new(&folder_path);
    let target = if p.is_file() {
        p.parent().unwrap_or(p)
    } else {
        p
    };

    if !target.exists() {
        return Err(AppError::Internal(format!(
            "Directory does not exist: {}",
            target.display()
        )));
    }

    info!(folder = ?target, "Opening game directory in Windows Explorer");
    std::process::Command::new("explorer.exe")
        .arg(target)
        .spawn()
        .map_err(|e| AppError::Internal(format!("Failed to open Explorer: {}", e)))?;

    Ok(true)
}
