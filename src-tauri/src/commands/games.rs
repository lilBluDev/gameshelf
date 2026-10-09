use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::schema::Game;
use crate::error::AppResult;
use crate::AppState;

#[derive(Debug, Deserialize, Default)]
pub struct ListGamesQuery {
    pub filter: Option<String>,
    pub search: Option<String>,
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ListGamesResponse {
    pub games: Vec<Game>,
    pub total: usize,
}

#[tauri::command]
pub async fn list_games(
    state: State<'_, AppState>,
    query: Option<ListGamesQuery>,
) -> AppResult<ListGamesResponse> {
    let q = query.unwrap_or_default();
    let games = state
        .db
        .list_games(q.filter.as_deref(), q.search.as_deref())?;

    let total = games.len();
    Ok(ListGamesResponse { games, total })
}
