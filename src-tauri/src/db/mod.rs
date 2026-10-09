pub mod migrations;
pub mod schema;

use chrono::Utc;
use rusqlite::{params, Connection, OpenFlags};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tracing::info;

use crate::error::{AppError, AppResult};
use schema::{Game, GameOverrides, GameStatus, LaunchAction, SourceKind};

#[derive(Clone)]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
    path: PathBuf,
}

impl Database {
    /// Initialize SQLite database at the specified path and apply any pending migrations
    pub fn new<P: AsRef<Path>>(path: P) -> AppResult<Self> {
        let path_buf = path.as_ref().to_path_buf();
        if let Some(parent) = path_buf.parent() {
            std::fs::create_dir_all(parent)?;
        }

        info!(path = ?path_buf, "Opening SQLite database");
        let mut raw_conn = Connection::open_with_flags(
            &path_buf,
            OpenFlags::SQLITE_OPEN_READ_WRITE
                | OpenFlags::SQLITE_OPEN_CREATE
                | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )?;

        // Enable WAL mode and foreign keys for high-performance concurrent local-first reads
        raw_conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;",
        )?;

        // Run migrations with backup support
        migrations::run_migrations(&mut raw_conn, Some(&path_buf))?;

        Ok(Self {
            conn: Arc::new(Mutex::new(raw_conn)),
            path: path_buf,
        })
    }

    /// In-memory database helper for unit and integration testing
    pub fn in_memory() -> AppResult<Self> {
        let mut raw_conn = Connection::open_in_memory()?;
        raw_conn.execute_batch(
            "PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;",
        )?;
        migrations::run_migrations(&mut raw_conn, None)?;
        Ok(Self {
            conn: Arc::new(Mutex::new(raw_conn)),
            path: PathBuf::from(":memory:"),
        })
    }

    /// Read a setting by key
    pub fn get_setting(&self, key: &str) -> AppResult<Option<String>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
        let mut rows = stmt.query(params![key])?;

        if let Some(row) = rows.next()? {
            let val: String = row.get(0)?;
            Ok(Some(val))
        } else {
            Ok(None)
        }
    }

    /// Set a setting by key with timestamp
    pub fn set_setting(&self, key: &str, value: &str) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO settings (key, value, updated_at)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3",
            params![key, value, now],
        )?;
        Ok(())
    }

    /// Add a new game to the library
    pub fn add_game(&self, game: &Game) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        let genres_json = serde_json::to_string(&game.genres)?;
        let tags_json = serde_json::to_string(&game.tags)?;
        let user_tags_json = serde_json::to_string(&game.user_tags)?;
        let launch_action_json = serde_json::to_string(&game.launch_action)?;

        let source_kind_str = match game.source_kind {
            SourceKind::Steam => "Steam",
            SourceKind::Standalone => "Standalone",
            SourceKind::Shortcut => "Shortcut",
            SourceKind::Emulated => "Emulated",
            SourceKind::Manual => "Manual",
        };

        let status_str = match game.status {
            GameStatus::Installed => "Installed",
            GameStatus::Missing => "Missing",
            GameStatus::Unknown => "Unknown",
        };

        conn.execute(
            "INSERT INTO games (
                id, title, sort_title, description, developer, publisher, release_year,
                genres, tags, source_kind, source_id, install_dir, launch_action,
                status, last_scanned_at, is_favorite, is_hidden, notes, user_tags,
                match_confidence, provider_attribution, created_at, updated_at,
                last_launched_at, normalized_path
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7,
                ?8, ?9, ?10, ?11, ?12, ?13,
                ?14, ?15, ?16, ?17, ?18, ?19,
                ?20, ?21, ?22, ?23,
                ?24, ?25
            )",
            params![
                game.id,
                game.title,
                game.sort_title,
                game.description,
                game.developer,
                game.publisher,
                game.release_year,
                genres_json,
                tags_json,
                source_kind_str,
                game.source_id,
                game.install_dir,
                launch_action_json,
                status_str,
                game.last_scanned_at,
                if game.is_favorite { 1 } else { 0 },
                if game.is_hidden { 1 } else { 0 },
                game.notes,
                user_tags_json,
                game.match_confidence,
                game.provider_attribution,
                if game.created_at.is_empty() {
                    now.clone()
                } else {
                    game.created_at.clone()
                },
                now,
                game.last_launched_at,
                game.normalized_path,
            ],
        )?;

        Ok(())
    }

    /// Retrieve a single game by ID, merging user overrides
    pub fn get_game_by_id(&self, id: &str) -> AppResult<Option<Game>> {
        let conn = self.conn.lock().unwrap();
        let sql = "SELECT 
                g.id,
                COALESCE(go.title, g.title) AS title,
                COALESCE(go.sort_title, g.sort_title) AS sort_title,
                COALESCE(go.description, g.description) AS description,
                COALESCE(go.developer, g.developer) AS developer,
                COALESCE(go.publisher, g.publisher) AS publisher,
                COALESCE(go.release_year, g.release_year) AS release_year,
                COALESCE(go.genres, g.genres) AS genres,
                COALESCE(go.tags, g.tags) AS tags,
                g.source_kind,
                g.source_id,
                g.install_dir,
                g.launch_action,
                g.status,
                g.last_scanned_at,
                COALESCE(go.is_favorite, g.is_favorite) AS is_favorite,
                COALESCE(go.is_hidden, g.is_hidden) AS is_hidden,
                COALESCE(go.notes, g.notes) AS notes,
                COALESCE(go.user_tags, g.user_tags) AS user_tags,
                g.match_confidence,
                g.provider_attribution,
                g.last_launched_at,
                g.normalized_path,
                g.created_at
            FROM games g
            LEFT JOIN game_overrides go ON go.game_id = g.id
            WHERE g.id = ?1";

        let mut stmt = conn.prepare(sql)?;
        let mut rows = stmt.query(params![id])?;

        if let Some(row) = rows.next()? {
            let game = Self::map_game_row(row)?;
            Ok(Some(game))
        } else {
            Ok(None)
        }
    }

    /// Find an existing game by normalized path (case-insensitive duplicate check)
    pub fn find_game_by_normalized_path(&self, normalized_path: &str) -> AppResult<Option<Game>> {
        let conn = self.conn.lock().unwrap();
        let sql = "SELECT 
                g.id,
                COALESCE(go.title, g.title) AS title,
                COALESCE(go.sort_title, g.sort_title) AS sort_title,
                COALESCE(go.description, g.description) AS description,
                COALESCE(go.developer, g.developer) AS developer,
                COALESCE(go.publisher, g.publisher) AS publisher,
                COALESCE(go.release_year, g.release_year) AS release_year,
                COALESCE(go.genres, g.genres) AS genres,
                COALESCE(go.tags, g.tags) AS tags,
                g.source_kind,
                g.source_id,
                g.install_dir,
                g.launch_action,
                g.status,
                g.last_scanned_at,
                COALESCE(go.is_favorite, g.is_favorite) AS is_favorite,
                COALESCE(go.is_hidden, g.is_hidden) AS is_hidden,
                COALESCE(go.notes, g.notes) AS notes,
                COALESCE(go.user_tags, g.user_tags) AS user_tags,
                g.match_confidence,
                g.provider_attribution,
                g.last_launched_at,
                g.normalized_path,
                g.created_at
            FROM games g
            LEFT JOIN game_overrides go ON go.game_id = g.id
            WHERE g.normalized_path = ?1";

        let mut stmt = conn.prepare(sql)?;
        let mut rows = stmt.query(params![normalized_path])?;

        if let Some(row) = rows.next()? {
            let game = Self::map_game_row(row)?;
            Ok(Some(game))
        } else {
            Ok(None)
        }
    }

    /// Save user overrides (title, notes, tags, favorite, hidden).
    /// Stored separately so library refreshes never overwrite manual edits.
    pub fn update_game_overrides(&self, overrides: &GameOverrides) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        let genres_json = overrides
            .genres
            .as_ref()
            .map(|g| serde_json::to_string(g).unwrap_or_default());
        let tags_json = overrides
            .tags
            .as_ref()
            .map(|t| serde_json::to_string(t).unwrap_or_default());
        let user_tags_json = overrides
            .user_tags
            .as_ref()
            .map(|u| serde_json::to_string(u).unwrap_or_default());

        conn.execute(
            "INSERT INTO game_overrides (
                game_id, title, sort_title, description, developer, publisher, release_year,
                genres, tags, notes, user_tags, is_favorite, is_hidden, updated_at
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14
            ) ON CONFLICT(game_id) DO UPDATE SET
                title = COALESCE(?2, title),
                sort_title = COALESCE(?3, sort_title),
                description = COALESCE(?4, description),
                developer = COALESCE(?5, developer),
                publisher = COALESCE(?6, publisher),
                release_year = COALESCE(?7, release_year),
                genres = COALESCE(?8, genres),
                tags = COALESCE(?9, tags),
                notes = COALESCE(?10, notes),
                user_tags = COALESCE(?11, user_tags),
                is_favorite = COALESCE(?12, is_favorite),
                is_hidden = COALESCE(?13, is_hidden),
                updated_at = ?14",
            params![
                overrides.game_id,
                overrides.title,
                overrides.sort_title,
                overrides.description,
                overrides.developer,
                overrides.publisher,
                overrides.release_year,
                genres_json,
                tags_json,
                overrides.notes,
                user_tags_json,
                overrides.is_favorite.map(|f| if f { 1 } else { 0 }),
                overrides.is_hidden.map(|h| if h { 1 } else { 0 }),
                now,
            ],
        )?;

        // Update updated_at on the base games record
        conn.execute(
            "UPDATE games SET updated_at = ?1 WHERE id = ?2",
            params![now, overrides.game_id],
        )?;

        Ok(())
    }

    /// Update launch action and normalized path (e.g. Locate File or Edit Launch Settings)
    pub fn update_launch_action(
        &self,
        id: &str,
        action: &LaunchAction,
        normalized_path: Option<&str>,
        status: GameStatus,
    ) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        let action_json = serde_json::to_string(action)?;
        let status_str = match status {
            GameStatus::Installed => "Installed",
            GameStatus::Missing => "Missing",
            GameStatus::Unknown => "Unknown",
        };

        conn.execute(
            "UPDATE games SET 
                launch_action = ?1,
                normalized_path = ?2,
                status = ?3,
                updated_at = ?4
             WHERE id = ?5",
            params![action_json, normalized_path, status_str, now, id],
        )?;

        Ok(())
    }

    /// Record last_launched timestamp
    pub fn update_last_launched(&self, id: &str) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE games SET last_launched_at = ?1, updated_at = ?1 WHERE id = ?2",
            params![now, id],
        )?;
        Ok(())
    }

    /// Update game status (e.g. Installed vs Missing)
    pub fn update_game_status(&self, id: &str, status: GameStatus) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        let status_str = match status {
            GameStatus::Installed => "Installed",
            GameStatus::Missing => "Missing",
            GameStatus::Unknown => "Unknown",
        };
        conn.execute(
            "UPDATE games SET status = ?1, updated_at = ?2 WHERE id = ?3",
            params![status_str, now, id],
        )?;
        Ok(())
    }

    /// Remove a game from the library.
    /// Strictly deletes the database record only; never touches files on disk.
    pub fn remove_game(&self, id: &str) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM games WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// Find a game by its source kind and source ID
    pub fn find_game_by_source(
        &self,
        source_kind: &SourceKind,
        source_id: &str,
    ) -> AppResult<Option<Game>> {
        let conn = self.conn.lock().unwrap();
        let source_kind_str = match source_kind {
            SourceKind::Steam => "Steam",
            SourceKind::Standalone => "Standalone",
            SourceKind::Shortcut => "Shortcut",
            SourceKind::Emulated => "Emulated",
            SourceKind::Manual => "Manual",
        };

        let sql = "SELECT 
                g.id,
                COALESCE(go.title, g.title) AS title,
                COALESCE(go.sort_title, g.sort_title) AS sort_title,
                COALESCE(go.description, g.description) AS description,
                COALESCE(go.developer, g.developer) AS developer,
                COALESCE(go.publisher, g.publisher) AS publisher,
                COALESCE(go.release_year, g.release_year) AS release_year,
                COALESCE(go.genres, g.genres) AS genres,
                COALESCE(go.tags, g.tags) AS tags,
                g.source_kind,
                g.source_id,
                g.install_dir,
                g.launch_action,
                g.status,
                g.last_scanned_at,
                COALESCE(go.is_favorite, g.is_favorite) AS is_favorite,
                COALESCE(go.is_hidden, g.is_hidden) AS is_hidden,
                COALESCE(go.notes, g.notes) AS notes,
                COALESCE(go.user_tags, g.user_tags) AS user_tags,
                g.match_confidence,
                g.provider_attribution,
                g.last_launched_at,
                g.normalized_path,
                g.created_at
            FROM games g
            LEFT JOIN game_overrides go ON go.game_id = g.id
            WHERE g.source_kind = ?1 AND g.source_id = ?2";

        let mut stmt = conn.prepare(sql)?;
        let mut rows = stmt.query(params![source_kind_str, source_id])?;

        if let Some(row) = rows.next()? {
            let game = Self::map_game_row(row)?;
            Ok(Some(game))
        } else {
            Ok(None)
        }
    }

    /// Count games by source kind (e.g. for sidebar counter)
    pub fn count_games_by_source(&self, source_kind: &SourceKind) -> AppResult<usize> {
        let conn = self.conn.lock().unwrap();
        let source_kind_str = match source_kind {
            SourceKind::Steam => "Steam",
            SourceKind::Standalone => "Standalone",
            SourceKind::Shortcut => "Shortcut",
            SourceKind::Emulated => "Emulated",
            SourceKind::Manual => "Manual",
        };

        let mut stmt = conn.prepare("SELECT COUNT(*) FROM games WHERE source_kind = ?1")?;
        let count: i64 = stmt.query_row(params![source_kind_str], |r| r.get(0))?;
        Ok(count as usize)
    }

    /// Idempotently upsert a Steam game:
    /// Updates install_dir, status, launch_action, and last_scanned_at,
    /// but preserves existing user overrides in `game_overrides`.
    pub fn upsert_steam_game(&self, game: &Game) -> AppResult<Game> {
        let source_id = game.source_id.as_deref().unwrap_or("");
        if let Some(existing) = self.find_game_by_source(&SourceKind::Steam, source_id)? {
            let conn = self.conn.lock().unwrap();
            let now = Utc::now().to_rfc3339();
            let launch_action_json = serde_json::to_string(&game.launch_action)?;
            let status_str = match game.status {
                GameStatus::Installed => "Installed",
                GameStatus::Missing => "Missing",
                GameStatus::Unknown => "Unknown",
            };

            conn.execute(
                "UPDATE games SET 
                    title = ?1,
                    sort_title = ?2,
                    install_dir = ?3,
                    launch_action = ?4,
                    status = ?5,
                    last_scanned_at = ?6,
                    normalized_path = ?7,
                    updated_at = ?8
                 WHERE id = ?9",
                params![
                    game.title,
                    game.sort_title,
                    game.install_dir,
                    launch_action_json,
                    status_str,
                    game.last_scanned_at,
                    game.normalized_path,
                    now,
                    existing.id
                ],
            )?;

            drop(conn);
            let updated = self.get_game_by_id(&existing.id)?.unwrap_or(existing);
            Ok(updated)
        } else {
            self.add_game(game)?;
            let added = self.get_game_by_id(&game.id)?.unwrap();
            Ok(added)
        }
    }

    /// Mark Steam games not present in active_app_ids as Missing
    pub fn mark_missing_steam_games(&self, active_app_ids: &[u32]) -> AppResult<usize> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        let mut count = 0;

        let mut stmt = conn.prepare(
            "SELECT id, source_id FROM games WHERE source_kind = 'Steam' AND status = 'Installed'",
        )?;
        let rows = stmt.query_map([], |row| {
            let id: String = row.get(0)?;
            let src_id: Option<String> = row.get(1)?;
            Ok((id, src_id))
        })?;

        let mut to_mark = Vec::new();
        for r in rows {
            let (id, src_id) = r?;
            if let Some(app_id_str) = src_id {
                if let Ok(app_id) = app_id_str.parse::<u32>() {
                    if !active_app_ids.contains(&app_id) {
                        to_mark.push(id);
                    }
                }
            }
        }

        for id in to_mark {
            conn.execute(
                "UPDATE games SET status = 'Missing', updated_at = ?1 WHERE id = ?2",
                params![now, id],
            )?;
            count += 1;
        }

        Ok(count)
    }

    /// Query games from the database with user overrides merged, filtering, search, and sorting
    pub fn list_games(
        &self,
        filter: Option<&str>,
        search: Option<&str>,
        sort_by: Option<&str>,
        sort_order: Option<&str>,
        include_hidden: bool,
    ) -> AppResult<Vec<Game>> {
        let conn = self.conn.lock().unwrap();
        let mut sql = String::from(
            "SELECT 
                g.id,
                COALESCE(go.title, g.title) AS title,
                COALESCE(go.sort_title, g.sort_title) AS sort_title,
                COALESCE(go.description, g.description) AS description,
                COALESCE(go.developer, g.developer) AS developer,
                COALESCE(go.publisher, g.publisher) AS publisher,
                COALESCE(go.release_year, g.release_year) AS release_year,
                COALESCE(go.genres, g.genres) AS genres,
                COALESCE(go.tags, g.tags) AS tags,
                g.source_kind,
                g.source_id,
                g.install_dir,
                g.launch_action,
                g.status,
                g.last_scanned_at,
                COALESCE(go.is_favorite, g.is_favorite) AS is_favorite,
                COALESCE(go.is_hidden, g.is_hidden) AS is_hidden,
                COALESCE(go.notes, g.notes) AS notes,
                COALESCE(go.user_tags, g.user_tags) AS user_tags,
                g.match_confidence,
                g.provider_attribution,
                g.last_launched_at,
                g.normalized_path,
                g.created_at
            FROM games g
            LEFT JOIN game_overrides go ON go.game_id = g.id
            WHERE 1=1",
        );

        if !include_hidden {
            sql.push_str(" AND COALESCE(go.is_hidden, g.is_hidden) = 0");
        }

        if let Some(f) = filter {
            match f {
                "favorites" => sql.push_str(" AND COALESCE(go.is_favorite, g.is_favorite) = 1"),
                "steam" => sql.push_str(" AND g.source_kind = 'Steam'"),
                "pc" => {
                    sql.push_str(" AND (g.source_kind = 'Standalone' OR g.source_kind = 'Shortcut' OR g.source_kind = 'Manual')")
                }
                "emulated" => sql.push_str(" AND g.source_kind = 'Emulated'"),
                _ => {}
            }
        }

        if let Some(s) = search {
            if !s.is_empty() {
                sql.push_str(" AND (COALESCE(go.title, g.title) LIKE '%' || ? || '%' OR COALESCE(go.developer, g.developer) LIKE '%' || ? || '%' OR COALESCE(go.user_tags, g.user_tags) LIKE '%' || ? || '%')");
            }
        }

        // Sorting
        let order = if sort_order == Some("desc") {
            "DESC"
        } else {
            "ASC"
        };
        match sort_by {
            Some("recently_added") => {
                sql.push_str(" ORDER BY g.created_at DESC");
            }
            Some("recently_played") => {
                sql.push_str(" ORDER BY g.last_launched_at DESC NULLS LAST, g.created_at DESC");
            }
            Some("release_year") => {
                sql.push_str(&format!(
                    " ORDER BY COALESCE(go.release_year, g.release_year) {}",
                    order
                ));
            }
            Some("status") => {
                sql.push_str(&format!(" ORDER BY g.status {}", order));
            }
            _ => {
                // Default sort by sort_title
                sql.push_str(&format!(
                    " ORDER BY COALESCE(go.sort_title, g.sort_title) {}",
                    order
                ));
            }
        }

        let mut stmt = conn.prepare(&sql)?;
        let mut rows = if let Some(s) = search {
            if !s.is_empty() {
                stmt.query(params![s, s, s])?
            } else {
                stmt.query([])?
            }
        } else {
            stmt.query([])?
        };

        let mut games = Vec::new();
        while let Some(row) = rows.next()? {
            let mut game = Self::map_game_row(row)?;

            // Live status verification for executable/shortcut files:
            // If action is Executable or Shortcut and path does not exist, mark as Missing
            match &game.launch_action {
                LaunchAction::Executable { path, .. } if !Path::new(path).exists() => {
                    game.status = GameStatus::Missing;
                }
                LaunchAction::Shortcut { target, .. } if !Path::new(target).exists() => {
                    game.status = GameStatus::Missing;
                }
                _ => {}
            }

            games.push(game);
        }

        Ok(games)
    }

    fn map_game_row(row: &rusqlite::Row<'_>) -> AppResult<Game> {
        let genres_raw: String = row.get(7)?;
        let tags_raw: String = row.get(8)?;
        let launch_action_raw: String = row.get(12)?;
        let user_tags_raw: String = row.get(18)?;
        let source_kind_raw: String = row.get(9)?;
        let status_raw: String = row.get(13)?;

        let source_kind = match source_kind_raw.as_str() {
            "Steam" => SourceKind::Steam,
            "Standalone" => SourceKind::Standalone,
            "Shortcut" => SourceKind::Shortcut,
            "Emulated" => SourceKind::Emulated,
            _ => SourceKind::Manual,
        };

        let status = match status_raw.as_str() {
            "Installed" => GameStatus::Installed,
            "Missing" => GameStatus::Missing,
            _ => GameStatus::Unknown,
        };

        let launch_action: LaunchAction = serde_json::from_str(&launch_action_raw)
            .map_err(|e| AppError::Internal(format!("Invalid launch action JSON: {}", e)))?;

        Ok(Game {
            id: row.get(0)?,
            title: row.get(1)?,
            sort_title: row.get(2)?,
            description: row.get(3)?,
            developer: row.get(4)?,
            publisher: row.get(5)?,
            release_year: row.get(6)?,
            genres: serde_json::from_str(&genres_raw).unwrap_or_default(),
            tags: serde_json::from_str(&tags_raw).unwrap_or_default(),
            source_kind,
            source_id: row.get(10)?,
            install_dir: row.get(11)?,
            launch_action,
            status,
            last_scanned_at: row.get(14)?,
            is_favorite: row.get::<_, i32>(15)? == 1,
            is_hidden: row.get::<_, i32>(16)? == 1,
            notes: row.get(17)?,
            user_tags: serde_json::from_str(&user_tags_raw).unwrap_or_default(),
            match_confidence: row.get(19)?,
            provider_attribution: row.get(20)?,
            last_launched_at: row.get(21)?,
            normalized_path: row.get(22)?,
            created_at: row.get(23)?,
        })
    }

    pub fn get_version(&self) -> AppResult<u32> {
        let conn = self.conn.lock().unwrap();
        migrations::get_current_version(&conn)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use tempfile::tempdir;

    fn make_test_game(id: &str, title: &str, path: &str) -> Game {
        Game {
            id: id.to_string(),
            title: title.to_string(),
            sort_title: title.to_lowercase(),
            description: None,
            developer: Some("Indie Dev".to_string()),
            publisher: None,
            release_year: Some(2024),
            genres: vec!["Action".to_string()],
            tags: vec![],
            source_kind: SourceKind::Standalone,
            source_id: None,
            install_dir: None,
            launch_action: LaunchAction::Executable {
                path: path.to_string(),
                args: vec![],
                working_dir: None,
                env: None,
            },
            status: GameStatus::Installed,
            last_scanned_at: None,
            is_favorite: false,
            is_hidden: false,
            notes: None,
            user_tags: vec![],
            match_confidence: None,
            provider_attribution: None,
            last_launched_at: None,
            normalized_path: Some(path.to_lowercase()),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn test_add_and_retrieve_game() {
        let db = Database::in_memory().unwrap();
        let game = make_test_game("game-1", "Hades", "c:/games/hades.exe");

        db.add_game(&game).unwrap();

        let fetched = db
            .get_game_by_id("game-1")
            .unwrap()
            .expect("Game should exist");
        assert_eq!(fetched.title, "Hades");
        assert_eq!(fetched.sort_title, "hades");
        assert_eq!(
            fetched.normalized_path,
            Some("c:/games/hades.exe".to_string())
        );
    }

    #[test]
    fn test_duplicate_detection_by_normalized_path() {
        let db = Database::in_memory().unwrap();
        let game = make_test_game("game-1", "Celeste", "c:/games/celeste.exe");
        db.add_game(&game).unwrap();

        // Exact match
        let found = db
            .find_game_by_normalized_path("c:/games/celeste.exe")
            .unwrap();
        assert!(found.is_some());
        assert_eq!(found.unwrap().id, "game-1");

        // Non-existent
        let not_found = db
            .find_game_by_normalized_path("c:/games/other.exe")
            .unwrap();
        assert!(not_found.is_none());
    }

    #[test]
    fn test_user_override_preservation_across_refresh() {
        let db = Database::in_memory().unwrap();
        let game = make_test_game("game-1", "Original Title", "c:/games/game.exe");
        db.add_game(&game).unwrap();

        // User edits title
        db.update_game_overrides(&GameOverrides {
            game_id: "game-1".to_string(),
            title: Some("My Custom Title".to_string()),
            sort_title: Some("my custom title".to_string()),
            description: None,
            developer: None,
            publisher: None,
            release_year: None,
            genres: None,
            tags: None,
            notes: Some("Awesome game".to_string()),
            user_tags: Some(vec!["Speedrun".to_string()]),
            is_favorite: Some(true),
            is_hidden: None,
            updated_at: "2026-01-02T00:00:00Z".to_string(),
        })
        .unwrap();

        // Check that overridden title is returned
        let updated = db.get_game_by_id("game-1").unwrap().unwrap();
        assert_eq!(updated.title, "My Custom Title");
        assert_eq!(updated.notes, Some("Awesome game".to_string()));
        assert!(updated.is_favorite);

        // Simulate metadata provider refresh: base game title updated in `games` table
        let conn = db.conn.lock().unwrap();
        conn.execute(
            "UPDATE games SET title = 'New Provider Name' WHERE id = 'game-1'",
            [],
        )
        .unwrap();
        drop(conn);

        // Verify that user override STILL wins!
        let after_refresh = db.get_game_by_id("game-1").unwrap().unwrap();
        assert_eq!(after_refresh.title, "My Custom Title");
    }

    #[test]
    fn test_remove_game_leaves_files_untouched() {
        let dir = tempdir().unwrap();
        let game_file = dir.path().join("my_game.exe");
        File::create(&game_file).unwrap();
        assert!(game_file.exists());

        let db = Database::in_memory().unwrap();
        let game = make_test_game("game-1", "Keep File Game", &game_file.to_string_lossy());
        db.add_game(&game).unwrap();

        // Remove from DB
        db.remove_game("game-1").unwrap();
        assert!(db.get_game_by_id("game-1").unwrap().is_none());

        // Assert file STILL exists on disk!
        assert!(
            game_file.exists(),
            "Removing a game from library must NEVER delete game files!"
        );
    }

    #[test]
    fn test_steam_game_idempotent_upsert_and_override_preservation() {
        let db = Database::in_memory().unwrap();
        let steam_game = Game {
            id: "steam-uuid-1".to_string(),
            title: "Terraria".to_string(),
            sort_title: "terraria".to_string(),
            description: None,
            developer: None,
            publisher: None,
            release_year: None,
            genres: vec![],
            tags: vec![],
            source_kind: SourceKind::Steam,
            source_id: Some("105600".to_string()),
            install_dir: Some("C:/Steam/steamapps/common/Terraria".to_string()),
            launch_action: LaunchAction::Steam { app_id: 105600 },
            status: GameStatus::Installed,
            last_scanned_at: Some("2026-01-01T00:00:00Z".to_string()),
            is_favorite: false,
            is_hidden: false,
            notes: None,
            user_tags: vec![],
            match_confidence: Some(1.0),
            provider_attribution: Some("Steam".to_string()),
            last_launched_at: None,
            normalized_path: Some("c:/steam/steamapps/common/terraria".to_string()),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        };

        // First insert
        let inserted = db.upsert_steam_game(&steam_game).unwrap();
        assert_eq!(inserted.title, "Terraria");
        assert_eq!(db.count_games_by_source(&SourceKind::Steam).unwrap(), 1);

        // User edits title
        db.update_game_overrides(&GameOverrides {
            game_id: inserted.id.clone(),
            title: Some("Terraria (Modded)".to_string()),
            sort_title: Some("terraria modded".to_string()),
            description: None,
            developer: None,
            publisher: None,
            release_year: None,
            genres: None,
            tags: None,
            notes: Some("Calamity mod installed".to_string()),
            user_tags: Some(vec!["Sandbox".to_string()]),
            is_favorite: Some(true),
            is_hidden: None,
            updated_at: "2026-01-02T00:00:00Z".to_string(),
        })
        .unwrap();

        // Second scan/import (e.g. game moved to SSD)
        let mut rescanned_game = steam_game.clone();
        rescanned_game.install_dir = Some("D:/FastSSD/steamapps/common/Terraria".to_string());
        rescanned_game.normalized_path = Some("d:/fastssd/steamapps/common/terraria".to_string());
        let updated = db.upsert_steam_game(&rescanned_game).unwrap();

        // Preserves user override title & notes!
        assert_eq!(updated.title, "Terraria (Modded)");
        assert_eq!(updated.notes, Some("Calamity mod installed".to_string()));
        assert!(updated.is_favorite);
        // But updates install_dir
        assert_eq!(
            updated.install_dir,
            Some("D:/FastSSD/steamapps/common/Terraria".to_string())
        );
        // And total games is still 1 (no duplicates!)
        assert_eq!(db.count_games_by_source(&SourceKind::Steam).unwrap(), 1);
    }

    #[test]
    fn test_steam_missing_library_marks_games_missing() {
        let db = Database::in_memory().unwrap();
        let steam_game = Game {
            id: "steam-uuid-2".to_string(),
            title: "War Thunder".to_string(),
            sort_title: "war thunder".to_string(),
            description: None,
            developer: None,
            publisher: None,
            release_year: None,
            genres: vec![],
            tags: vec![],
            source_kind: SourceKind::Steam,
            source_id: Some("236390".to_string()),
            install_dir: Some("E:/External/steamapps/common/War Thunder".to_string()),
            launch_action: LaunchAction::Steam { app_id: 236390 },
            status: GameStatus::Installed,
            last_scanned_at: Some("2026-01-01T00:00:00Z".to_string()),
            is_favorite: false,
            is_hidden: false,
            notes: None,
            user_tags: vec![],
            match_confidence: Some(1.0),
            provider_attribution: Some("Steam".to_string()),
            last_launched_at: None,
            normalized_path: Some("e:/external/steamapps/common/war thunder".to_string()),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        };

        db.upsert_steam_game(&steam_game).unwrap();

        // Suppose external drive E: was unplugged, so active_app_ids has no 236390
        let marked = db.mark_missing_steam_games(&[]).unwrap();
        assert_eq!(marked, 1);

        let game = db.get_game_by_id(&steam_game.id).unwrap().unwrap();
        assert_eq!(game.status, GameStatus::Missing);
    }
}
