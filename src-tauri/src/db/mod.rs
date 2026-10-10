pub mod migrations;
pub mod schema;

use chrono::Utc;
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tracing::info;

use crate::emulators::profiles::EmulatorProfile;
use crate::emulators::rom_scanner::RomCandidate;
use crate::error::{AppError, AppResult};
use crate::scanner::{ConfidenceLevel, ScanCandidate, ScanSource};
use schema::{
    ArtworkAsset, Game, GameOverrides, GameSession, GameStatus, LaunchAction, SourceKind,
};

#[derive(Clone)]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
    path: PathBuf,
}

impl Database {
    fn conn(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Initialize SQLite database at the specified path and apply any pending migrations.
    /// Resilient: if corruption is detected, backs up the corrupt file and re-initializes.
    pub fn new<P: AsRef<Path>>(path: P) -> AppResult<Self> {
        let path_buf = path.as_ref().to_path_buf();
        if let Some(parent) = path_buf.parent() {
            std::fs::create_dir_all(parent)?;
        }

        info!(path = ?path_buf, "Opening SQLite database");

        match Self::open_and_migrate(&path_buf) {
            Ok(db) => Ok(db),
            Err(err) => {
                let err_str = err.to_string().to_lowercase();
                if err_str.contains("corrupt")
                    || err_str.contains("malformed")
                    || err_str.contains("not a database")
                {
                    tracing::error!(
                        error = ?err,
                        path = ?path_buf,
                        "Corrupted SQLite database detected! Backing up and creating fresh database."
                    );
                    Self::backup_corrupt_db(&path_buf)?;
                    Self::open_and_migrate(&path_buf)
                } else {
                    Err(err)
                }
            }
        }
    }

    fn open_and_migrate(path_buf: &Path) -> AppResult<Self> {
        let mut raw_conn = Connection::open_with_flags(
            path_buf,
            OpenFlags::SQLITE_OPEN_READ_WRITE
                | OpenFlags::SQLITE_OPEN_CREATE
                | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )?;

        raw_conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;",
        )?;

        // Verify quick integrity check
        let check: String = raw_conn.query_row("PRAGMA quick_check;", [], |r| r.get(0))?;
        if check != "ok" {
            return Err(AppError::Database(rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CORRUPT),
                Some(format!("Integrity check failed: {}", check)),
            )));
        }

        // Run migrations with backup support
        migrations::run_migrations(&mut raw_conn, Some(path_buf))?;
        Self::seed_builtin_profiles_conn(&raw_conn)?;

        Ok(Self {
            conn: Arc::new(Mutex::new(raw_conn)),
            path: path_buf.to_path_buf(),
        })
    }

    fn backup_corrupt_db(path: &Path) -> AppResult<PathBuf> {
        let timestamp = Utc::now().timestamp();
        let backup_path = path.with_extension(format!("corrupt.{}.db", timestamp));
        if path.exists() {
            std::fs::rename(path, &backup_path)?;
        }
        let wal_path = path.with_extension("db-wal");
        if wal_path.exists() {
            let _ = std::fs::rename(
                &wal_path,
                path.with_extension(format!("corrupt.{}.db-wal", timestamp)),
            );
        }
        let shm_path = path.with_extension("db-shm");
        if shm_path.exists() {
            let _ = std::fs::rename(
                &shm_path,
                path.with_extension(format!("corrupt.{}.db-shm", timestamp)),
            );
        }
        info!(backup = ?backup_path, "Corrupt database successfully backed up");
        Ok(backup_path)
    }

    /// Run quick integrity check
    pub fn check_integrity(&self) -> AppResult<bool> {
        let conn = self.conn();
        let check: String = conn.query_row("PRAGMA quick_check;", [], |r| r.get(0))?;
        Ok(check == "ok")
    }

    /// Retrieve total count of games
    pub fn get_game_count(&self) -> AppResult<usize> {
        let conn = self.conn();
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM games", [], |r| r.get(0))?;
        Ok(count as usize)
    }

    /// Retrieve game counts tuple: (total, installed, missing, favorites)
    pub fn get_game_stats(&self) -> AppResult<(usize, usize, usize, usize)> {
        let conn = self.conn();
        let total: i64 = conn.query_row("SELECT COUNT(*) FROM games", [], |r| r.get(0))?;
        let installed: i64 = conn.query_row(
            "SELECT COUNT(*) FROM games WHERE status = 'Installed'",
            [],
            |r| r.get(0),
        )?;
        let missing: i64 = conn.query_row(
            "SELECT COUNT(*) FROM games WHERE status = 'Missing'",
            [],
            |r| r.get(0),
        )?;
        let favorites: i64 = conn.query_row(
            "SELECT COUNT(*) FROM games g LEFT JOIN game_overrides go ON go.game_id = g.id WHERE COALESCE(go.is_favorite, g.is_favorite) = 1",
            [],
            |r| r.get(0),
        )?;
        Ok((
            total as usize,
            installed as usize,
            missing as usize,
            favorites as usize,
        ))
    }

    /// In-memory database helper for unit and integration testing
    pub fn in_memory() -> AppResult<Self> {
        let mut raw_conn = Connection::open_in_memory()?;
        raw_conn.execute_batch(
            "PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;",
        )?;
        migrations::run_migrations(&mut raw_conn, None)?;
        Self::seed_builtin_profiles_conn(&raw_conn)?;
        Ok(Self {
            conn: Arc::new(Mutex::new(raw_conn)),
            path: PathBuf::from(":memory:"),
        })
    }

    /// Read a setting by key
    pub fn get_setting(&self, key: &str) -> AppResult<Option<String>> {
        let conn = self.conn();
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
        let conn = self.conn();
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
        let conn = self.conn();
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
                last_launched_at, normalized_path, playtime_seconds
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7,
                ?8, ?9, ?10, ?11, ?12, ?13,
                ?14, ?15, ?16, ?17, ?18, ?19,
                ?20, ?21, ?22, ?23,
                ?24, ?25, ?26
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
                game.playtime_seconds as i64,
            ],
        )?;

        Ok(())
    }

    /// Retrieve a single game by ID, merging user overrides
    pub fn get_game_by_id(&self, id: &str) -> AppResult<Option<Game>> {
        let conn = self.conn();
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
                g.created_at,
                g.playtime_seconds
            FROM games g
            LEFT JOIN game_overrides go ON go.game_id = g.id
            WHERE g.id = ?1";

        let mut stmt = conn.prepare(sql)?;
        let mut rows = stmt.query(params![id])?;

        let game_opt = if let Some(row) = rows.next()? {
            Some(Self::map_game_row(row)?)
        } else {
            None
        };
        drop(rows);
        drop(stmt);
        drop(conn);

        if let Some(mut game) = game_opt {
            let artwork = self.get_selected_artwork(&game.id)?;
            if !artwork.is_empty() {
                game.artwork = Some(artwork);
            }
            Ok(Some(game))
        } else {
            Ok(None)
        }
    }

    /// Find an existing game by normalized path (case-insensitive duplicate check)
    pub fn find_game_by_normalized_path(&self, normalized_path: &str) -> AppResult<Option<Game>> {
        let conn = self.conn();
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
                g.created_at,
                g.playtime_seconds
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

    /// Save user overrides (title, notes, tags, favorite, hidden, locked_fields).
    /// Stored separately so library refreshes never overwrite manual edits.
    pub fn update_game_overrides(&self, overrides: &GameOverrides) -> AppResult<()> {
        let conn = self.conn();
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
        let locked_fields_json = overrides
            .locked_fields
            .as_ref()
            .map(|l| serde_json::to_string(l).unwrap_or_default());

        conn.execute(
            "INSERT INTO game_overrides (
                game_id, title, sort_title, description, developer, publisher, release_year,
                genres, tags, notes, user_tags, is_favorite, is_hidden, locked_fields, updated_at
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15
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
                locked_fields = COALESCE(?14, locked_fields),
                updated_at = ?15",
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
                locked_fields_json,
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
        let conn = self.conn();
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
        let conn = self.conn();
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE games SET last_launched_at = ?1, updated_at = ?1 WHERE id = ?2",
            params![now, id],
        )?;
        Ok(())
    }

    /// Update game status (e.g. Installed vs Missing)
    pub fn update_game_status(&self, id: &str, status: GameStatus) -> AppResult<()> {
        let conn = self.conn();
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
        let conn = self.conn();
        conn.execute("DELETE FROM games WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// Find a game by its source kind and source ID
    pub fn find_game_by_source(
        &self,
        source_kind: &SourceKind,
        source_id: &str,
    ) -> AppResult<Option<Game>> {
        let conn = self.conn();
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
                g.created_at,
                g.playtime_seconds
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
        let conn = self.conn();
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
            let conn = self.conn();
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
        let conn = self.conn();
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

    /// Add or update a folder scan source
    pub fn add_scan_source(&self, path: &str, depth: usize) -> AppResult<ScanSource> {
        let norm = crate::platform::windows::normalize_path(path);
        let conn = self.conn();
        let now = Utc::now().to_rfc3339();

        let existing: Option<String> = conn
            .query_row(
                "SELECT id FROM scan_sources WHERE normalized_path = ?1",
                params![norm],
                |r| r.get(0),
            )
            .optional()?;

        if let Some(id) = existing {
            conn.execute(
                "UPDATE scan_sources SET path = ?1, depth = ?2, updated_at = ?3 WHERE id = ?4",
                params![path, depth as i64, now, id],
            )?;
            return Ok(ScanSource {
                id,
                path: path.to_string(),
                normalized_path: norm,
                depth,
                last_scanned_at: None,
                game_count: 0,
                created_at: now.clone(),
                updated_at: now,
            });
        }

        let id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO scan_sources (id, path, normalized_path, depth, game_count, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 0, ?5, ?5)",
            params![id, path, norm, depth as i64, now],
        )?;

        Ok(ScanSource {
            id,
            path: path.to_string(),
            normalized_path: norm,
            depth,
            last_scanned_at: None,
            game_count: 0,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    /// List all configured folder scan sources
    pub fn list_scan_sources(&self) -> AppResult<Vec<ScanSource>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, path, normalized_path, depth, last_scanned_at, game_count, created_at, updated_at
             FROM scan_sources ORDER BY created_at ASC",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(ScanSource {
                id: row.get(0)?,
                path: row.get(1)?,
                normalized_path: row.get(2)?,
                depth: row.get::<_, i64>(3)? as usize,
                last_scanned_at: row.get(4)?,
                game_count: row.get::<_, i64>(5)? as usize,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?;

        let mut sources = Vec::new();
        for r in rows {
            sources.push(r?);
        }
        Ok(sources)
    }

    /// Remove a scan source record from database (does not delete games or files)
    pub fn remove_scan_source(&self, id: &str) -> AppResult<()> {
        let conn = self.conn();
        conn.execute("DELETE FROM scan_sources WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// Update stats for a scan source after a successful scan
    pub fn update_scan_source_stats(&self, id: &str, game_count: usize) -> AppResult<()> {
        let conn = self.conn();
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE scan_sources SET game_count = ?1, last_scanned_at = ?2, updated_at = ?2 WHERE id = ?3",
            params![game_count as i64, now, id],
        )?;
        Ok(())
    }

    /// Atomically import selected folder scan candidates into library
    pub fn import_scan_candidates(&self, candidates: &[ScanCandidate]) -> AppResult<usize> {
        let mut conn = self.conn();
        let tx = conn.transaction()?;
        let now = Utc::now().to_rfc3339();
        let mut imported_count = 0;

        for candidate in candidates {
            if !candidate.selected {
                continue;
            }

            let norm = crate::platform::windows::normalize_path(&candidate.executable_path);
            let launch_action = LaunchAction::Executable {
                path: candidate.executable_path.clone(),
                args: candidate.args.clone(),
                working_dir: if candidate.working_dir.trim().is_empty() {
                    None
                } else {
                    Some(candidate.working_dir.clone())
                },
                env: None,
            };
            let launch_action_json = serde_json::to_string(&launch_action)?;

            let existing_id: Option<String> = tx
                .query_row(
                    "SELECT id FROM games WHERE normalized_path = ?1",
                    params![norm],
                    |r| r.get(0),
                )
                .optional()?;

            if let Some(id) = existing_id {
                tx.execute(
                    "UPDATE games SET
                        install_dir = ?1,
                        launch_action = ?2,
                        status = 'Installed',
                        last_scanned_at = ?3,
                        match_confidence = ?4,
                        updated_at = ?3
                     WHERE id = ?5",
                    params![
                        candidate.working_dir,
                        launch_action_json,
                        now,
                        match candidate.confidence {
                            ConfidenceLevel::High => 1.0,
                            ConfidenceLevel::Medium => 0.7,
                            ConfidenceLevel::Low => 0.4,
                        },
                        id
                    ],
                )?;
            } else {
                let id = uuid::Uuid::new_v4().to_string();
                let sort_title = candidate.title.to_lowercase();
                let confidence_score = match candidate.confidence {
                    ConfidenceLevel::High => 1.0,
                    ConfidenceLevel::Medium => 0.7,
                    ConfidenceLevel::Low => 0.4,
                };

                tx.execute(
                    "INSERT INTO games (
                        id, title, sort_title, source_kind, install_dir, launch_action,
                        status, last_scanned_at, is_favorite, is_hidden, match_confidence,
                        provider_attribution, created_at, updated_at, normalized_path,
                        genres, tags, user_tags
                    ) VALUES (
                        ?1, ?2, ?3, 'Standalone', ?4, ?5,
                        'Installed', ?6, 0, 0, ?7,
                        'Folder Scanner', ?6, ?6, ?8,
                        '[]', '[]', '[]'
                    )",
                    params![
                        id,
                        candidate.title,
                        sort_title,
                        candidate.working_dir,
                        launch_action_json,
                        now,
                        confidence_score,
                        norm
                    ],
                )?;
            }
            imported_count += 1;
        }

        tx.commit()?;
        Ok(imported_count)
    }

    /// Mark standalone games under source_root as Missing if their normalized path is not active
    pub fn mark_missing_folder_games(
        &self,
        source_root_normalized: &str,
        active_normalized_paths: &[String],
    ) -> AppResult<usize> {
        let conn = self.conn();
        let now = Utc::now().to_rfc3339();
        let mut count = 0;

        let mut stmt = conn.prepare(
            "SELECT id, normalized_path FROM games WHERE source_kind = 'Standalone' AND status = 'Installed'",
        )?;

        let rows = stmt.query_map([], |row| {
            let id: String = row.get(0)?;
            let norm_path: Option<String> = row.get(1)?;
            Ok((id, norm_path))
        })?;

        let mut to_mark = Vec::new();
        let root_prefix = format!("{}/", source_root_normalized.trim_end_matches('/'));

        for r in rows {
            let (id, norm_opt) = r?;
            if let Some(norm) = norm_opt {
                if norm.starts_with(&root_prefix) && !active_normalized_paths.contains(&norm) {
                    to_mark.push(id);
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
        let conn = self.conn();
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
                g.created_at,
                g.playtime_seconds
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
            Some("most_played") => {
                let playtime_order = if sort_order == Some("asc") {
                    "ASC"
                } else {
                    "DESC"
                };
                sql.push_str(&format!(
                    " ORDER BY g.playtime_seconds {}, g.created_at DESC",
                    playtime_order
                ));
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
                LaunchAction::EmulatedGame { rom_path, .. } if !Path::new(rom_path).exists() => {
                    game.status = GameStatus::Missing;
                }
                _ => {}
            }

            games.push(game);
        }

        drop(rows);
        drop(stmt);
        drop(conn);

        let all_artwork = self.get_all_selected_artwork()?;
        for game in &mut games {
            if let Some(art) = all_artwork.get(&game.id) {
                game.artwork = Some(art.clone());
            }
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
            playtime_seconds: row.get::<_, i64>(24).unwrap_or(0).max(0) as u64,
            artwork: None,
        })
    }

    pub fn seed_builtin_profiles_conn(conn: &Connection) -> AppResult<()> {
        let builtins = crate::emulators::profiles::get_builtin_profiles();
        let now = Utc::now().to_rfc3339();

        for p in builtins {
            let systems_json = serde_json::to_string(&p.systems)?;
            let exts_json = serde_json::to_string(&p.supported_extensions)?;
            let template_json = serde_json::to_string(&p.argument_template)?;
            let working_dir_rule = match p.working_dir_rule {
                crate::emulators::profiles::WorkingDirRule::EmulatorDir => {
                    "EmulatorDir".to_string()
                }
                crate::emulators::profiles::WorkingDirRule::RomDir => "RomDir".to_string(),
                crate::emulators::profiles::WorkingDirRule::Custom(ref s) => {
                    format!("Custom:{}", s)
                }
            };
            let hints_json = serde_json::to_string(&p.detection_hints)?;

            conn.execute(
                "INSERT INTO emulator_profiles (
                    id, name, systems_json, supported_extensions_json, argument_template_json,
                    working_dir_rule, executable_path, core_path, is_builtin, detection_hints_json,
                    verification_source, created_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, ?9, ?10, ?11, ?11)
                ON CONFLICT(id) DO NOTHING",
                params![
                    p.id,
                    p.name,
                    systems_json,
                    exts_json,
                    template_json,
                    working_dir_rule,
                    p.executable_path,
                    p.core_path,
                    hints_json,
                    p.verification_source,
                    now,
                ],
            )?;
        }

        Ok(())
    }

    /// List all emulator profiles (built-in and user-added)
    pub fn list_emulator_profiles(&self) -> AppResult<Vec<EmulatorProfile>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, name, systems_json, supported_extensions_json, argument_template_json,
                    working_dir_rule, executable_path, core_path, is_builtin, detection_hints_json,
                    verification_source
             FROM emulator_profiles ORDER BY is_builtin DESC, name ASC",
        )?;

        let rows = stmt.query_map([], Self::map_emulator_profile_row)?;
        let mut list = Vec::new();
        for r in rows {
            let mut profile = r?;
            profile.validation_status =
                crate::emulators::profiles::compute_validation_status(&profile);
            list.push(profile);
        }
        Ok(list)
    }

    /// Retrieve a single emulator profile by ID
    pub fn get_emulator_profile(&self, id: &str) -> AppResult<Option<EmulatorProfile>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, name, systems_json, supported_extensions_json, argument_template_json,
                    working_dir_rule, executable_path, core_path, is_builtin, detection_hints_json,
                    verification_source
             FROM emulator_profiles WHERE id = ?1",
        )?;

        let mut rows = stmt.query_map(params![id], Self::map_emulator_profile_row)?;
        if let Some(r) = rows.next() {
            let mut profile = r?;
            profile.validation_status =
                crate::emulators::profiles::compute_validation_status(&profile);
            Ok(Some(profile))
        } else {
            Ok(None)
        }
    }

    /// Save (upsert) an emulator profile
    pub fn save_emulator_profile(&self, profile: &EmulatorProfile) -> AppResult<()> {
        let conn = self.conn();
        let now = Utc::now().to_rfc3339();
        let systems_json = serde_json::to_string(&profile.systems)?;
        let exts_json = serde_json::to_string(&profile.supported_extensions)?;
        let template_json = serde_json::to_string(&profile.argument_template)?;
        let working_dir_rule = match profile.working_dir_rule {
            crate::emulators::profiles::WorkingDirRule::EmulatorDir => "EmulatorDir".to_string(),
            crate::emulators::profiles::WorkingDirRule::RomDir => "RomDir".to_string(),
            crate::emulators::profiles::WorkingDirRule::Custom(ref s) => format!("Custom:{}", s),
        };
        let hints_json = serde_json::to_string(&profile.detection_hints)?;

        conn.execute(
            "INSERT INTO emulator_profiles (
                id, name, systems_json, supported_extensions_json, argument_template_json,
                working_dir_rule, executable_path, core_path, is_builtin, detection_hints_json,
                verification_source, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)
            ON CONFLICT(id) DO UPDATE SET
                name = ?2,
                systems_json = ?3,
                supported_extensions_json = ?4,
                argument_template_json = ?5,
                working_dir_rule = ?6,
                executable_path = ?7,
                core_path = ?8,
                detection_hints_json = ?10,
                verification_source = ?11,
                updated_at = ?12",
            params![
                profile.id,
                profile.name,
                systems_json,
                exts_json,
                template_json,
                working_dir_rule,
                profile.executable_path,
                profile.core_path,
                if profile.is_builtin { 1 } else { 0 },
                hints_json,
                profile.verification_source,
                now,
            ],
        )?;

        Ok(())
    }

    /// Delete a custom emulator profile (built-ins cannot be deleted)
    pub fn delete_emulator_profile(&self, id: &str) -> AppResult<()> {
        let conn = self.conn();
        conn.execute(
            "DELETE FROM emulator_profiles WHERE id = ?1 AND is_builtin = 0",
            params![id],
        )?;
        Ok(())
    }

    fn map_emulator_profile_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<EmulatorProfile> {
        let id: String = row.get(0)?;
        let name: String = row.get(1)?;
        let systems_raw: String = row.get(2)?;
        let exts_raw: String = row.get(3)?;
        let template_raw: String = row.get(4)?;
        let rule_raw: String = row.get(5)?;
        let executable_path: Option<String> = row.get(6)?;
        let core_path: Option<String> = row.get(7)?;
        let is_builtin: bool = row.get::<_, i32>(8)? == 1;
        let hints_raw: String = row.get(9)?;
        let verification_source: Option<String> = row.get(10)?;

        let systems = serde_json::from_str(&systems_raw).unwrap_or_default();
        let supported_extensions = serde_json::from_str(&exts_raw).unwrap_or_default();
        let argument_template = serde_json::from_str(&template_raw).unwrap_or_default();
        let working_dir_rule = if rule_raw == "RomDir" {
            crate::emulators::profiles::WorkingDirRule::RomDir
        } else if let Some(cust) = rule_raw.strip_prefix("Custom:") {
            crate::emulators::profiles::WorkingDirRule::Custom(cust.to_string())
        } else {
            crate::emulators::profiles::WorkingDirRule::EmulatorDir
        };
        let detection_hints = serde_json::from_str(&hints_raw).unwrap_or_default();

        Ok(EmulatorProfile {
            id,
            name,
            systems,
            supported_extensions,
            argument_template,
            working_dir_rule,
            executable_path,
            core_path,
            is_builtin,
            detection_hints,
            verification_source,
            validation_status:
                crate::emulators::profiles::EmulatorValidationStatus::ExecutableMissing,
        })
    }

    /// Returns a set of normalized ROM paths for all currently tracked Emulated games
    pub fn get_existing_emulated_rom_paths(&self) -> AppResult<HashSet<String>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT normalized_path FROM games WHERE source_kind = 'Emulated' AND normalized_path IS NOT NULL",
        )?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        let mut set = HashSet::new();
        for r in rows {
            set.insert(r?);
        }
        Ok(set)
    }

    /// Atomically imports a batch of selected ROM candidates as Emulated games
    pub fn import_rom_candidates(&self, candidates: &[RomCandidate]) -> AppResult<usize> {
        let mut conn = self.conn();
        let tx = conn.transaction()?;
        let now = Utc::now().to_rfc3339();
        let mut imported_count = 0;

        for cand in candidates {
            if !cand.selected {
                continue;
            }

            let norm = crate::platform::windows::normalize_path(&cand.rom_path);
            let launch_action = LaunchAction::EmulatedGame {
                profile_id: cand.profile_id.clone(),
                rom_path: cand.rom_path.clone(),
                arg_overrides: None,
            };
            let launch_action_json = serde_json::to_string(&launch_action)?;
            let parent_dir = Path::new(&cand.rom_path)
                .parent()
                .map(|p| p.to_string_lossy().to_string());

            let existing_id: Option<String> = tx
                .query_row(
                    "SELECT id FROM games WHERE source_kind = 'Emulated' AND normalized_path = ?1",
                    params![norm],
                    |r| r.get(0),
                )
                .optional()?;

            if let Some(id) = existing_id {
                tx.execute(
                    "UPDATE games SET install_dir = ?1, launch_action = ?2, status = 'Installed', last_scanned_at = ?3, updated_at = ?3 WHERE id = ?4",
                    params![parent_dir, launch_action_json, now, id],
                )?;
            } else {
                let id = uuid::Uuid::new_v4().to_string();
                let sort_title = cand.title.to_lowercase();
                let tags_json = serde_json::to_string(&vec![cand.system.clone()])?;

                tx.execute(
                    "INSERT INTO games (
                        id, title, sort_title, source_kind, source_id, install_dir, launch_action,
                        status, last_scanned_at, is_favorite, is_hidden, match_confidence,
                        provider_attribution, created_at, updated_at, normalized_path,
                        genres, tags, user_tags
                    ) VALUES (
                        ?1, ?2, ?3, 'Emulated', ?4, ?5, ?6,
                        'Installed', ?7, 0, 0, 1.0,
                        'ROM Scanner', ?7, ?7, ?8,
                        '[]', ?9, '[]'
                    )",
                    params![
                        id,
                        cand.title,
                        sort_title,
                        cand.profile_id,
                        parent_dir,
                        launch_action_json,
                        now,
                        norm,
                        tags_json,
                    ],
                )?;
            }
            imported_count += 1;
        }

        tx.commit()?;
        Ok(imported_count)
    }

    /// Save an artwork asset (insert or update)
    pub fn save_artwork_asset(&self, asset: &ArtworkAsset) -> AppResult<()> {
        let conn = self.conn();
        conn.execute(
            "INSERT INTO artwork_assets (
                id, game_id, role, provider, provider_asset_id, source_url,
                cached_path, width, height, mime_type, attribution, is_selected, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
            ON CONFLICT(id) DO UPDATE SET
                cached_path = COALESCE(?7, cached_path),
                width = COALESCE(?8, width),
                height = COALESCE(?9, height),
                mime_type = COALESCE(?10, mime_type),
                is_selected = ?12",
            params![
                asset.id,
                asset.game_id,
                asset.role,
                asset.provider,
                asset.provider_asset_id,
                asset.source_url,
                asset.cached_path,
                asset.width,
                asset.height,
                asset.mime_type,
                asset.attribution,
                if asset.is_selected { 1 } else { 0 },
                asset.created_at,
            ],
        )?;
        Ok(())
    }

    /// Retrieve all artwork assets associated with a game
    pub fn get_artwork_assets(&self, game_id: &str) -> AppResult<Vec<ArtworkAsset>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, game_id, role, provider, provider_asset_id, source_url,
                    cached_path, width, height, mime_type, attribution, is_selected, created_at
             FROM artwork_assets
             WHERE game_id = ?1
             ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map(params![game_id], Self::map_artwork_row)?;
        let mut assets = Vec::new();
        for r in rows {
            assets.push(r?);
        }
        Ok(assets)
    }

    /// Retrieve the currently selected artwork assets for a game mapped by role
    pub fn get_selected_artwork(&self, game_id: &str) -> AppResult<HashMap<String, ArtworkAsset>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, game_id, role, provider, provider_asset_id, source_url,
                    cached_path, width, height, mime_type, attribution, is_selected, created_at
             FROM artwork_assets
             WHERE game_id = ?1 AND is_selected = 1",
        )?;
        let rows = stmt.query_map(params![game_id], Self::map_artwork_row)?;
        let mut map = HashMap::new();
        for r in rows {
            let asset = r?;
            map.insert(asset.role.clone(), asset);
        }
        Ok(map)
    }

    /// Retrieve all selected artwork across the entire library in one query
    pub fn get_all_selected_artwork(
        &self,
    ) -> AppResult<HashMap<String, HashMap<String, ArtworkAsset>>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, game_id, role, provider, provider_asset_id, source_url,
                    cached_path, width, height, mime_type, attribution, is_selected, created_at
             FROM artwork_assets
             WHERE is_selected = 1",
        )?;
        let rows = stmt.query_map([], Self::map_artwork_row)?;
        let mut result: HashMap<String, HashMap<String, ArtworkAsset>> = HashMap::new();
        for r in rows {
            let asset = r?;
            result
                .entry(asset.game_id.clone())
                .or_default()
                .insert(asset.role.clone(), asset);
        }
        Ok(result)
    }

    /// Select a specific artwork asset for a game (unselects others for the same role)
    pub fn select_artwork_asset(&self, game_id: &str, asset_id: &str) -> AppResult<()> {
        let conn = self.conn();
        let role: Option<String> = conn
            .query_row(
                "SELECT role FROM artwork_assets WHERE id = ?1 AND game_id = ?2",
                params![asset_id, game_id],
                |row| row.get(0),
            )
            .optional()?;

        if let Some(r) = role {
            conn.execute(
                "UPDATE artwork_assets SET is_selected = 0 WHERE game_id = ?1 AND role = ?2",
                params![game_id, r],
            )?;
            conn.execute(
                "UPDATE artwork_assets SET is_selected = 1 WHERE id = ?1",
                params![asset_id],
            )?;
        }
        Ok(())
    }

    /// Unselect artwork for a specific game and role
    pub fn remove_selected_artwork(&self, game_id: &str, role: &str) -> AppResult<()> {
        let conn = self.conn();
        conn.execute(
            "UPDATE artwork_assets SET is_selected = 0 WHERE game_id = ?1 AND role = ?2",
            params![game_id, role],
        )?;
        Ok(())
    }

    /// Get locked fields for a game
    pub fn get_locked_fields(&self, game_id: &str) -> AppResult<HashSet<String>> {
        let conn = self.conn();
        let raw: Option<String> = conn
            .query_row(
                "SELECT locked_fields FROM game_overrides WHERE game_id = ?1",
                params![game_id],
                |row| row.get(0),
            )
            .optional()?
            .flatten();

        if let Some(json) = raw {
            let fields: Vec<String> = serde_json::from_str(&json).unwrap_or_default();
            Ok(fields.into_iter().collect())
        } else {
            Ok(HashSet::new())
        }
    }

    /// Set locked fields for a game
    pub fn set_locked_fields(&self, game_id: &str, fields: &[String]) -> AppResult<()> {
        let conn = self.conn();
        let json = serde_json::to_string(fields).unwrap_or_else(|_| "[]".to_string());
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO game_overrides (game_id, locked_fields, updated_at)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(game_id) DO UPDATE SET locked_fields = ?2, updated_at = ?3",
            params![game_id, json, now],
        )?;
        Ok(())
    }

    /// Update metadata from provider without overwriting locked fields or user overrides
    #[allow(clippy::too_many_arguments)]
    pub fn update_game_metadata_from_provider(
        &self,
        game_id: &str,
        description: Option<&str>,
        developer: Option<&str>,
        publisher: Option<&str>,
        release_year: Option<i32>,
        genres: Option<&[String]>,
        tags: Option<&[String]>,
        match_confidence: Option<f64>,
        provider_attribution: Option<&str>,
    ) -> AppResult<()> {
        let locked = self.get_locked_fields(game_id)?;
        let conn = self.conn();
        let now = Utc::now().to_rfc3339();

        let (cur_desc, cur_dev, cur_pub, cur_year, cur_genres, cur_tags): (
            Option<String>,
            Option<String>,
            Option<String>,
            Option<i32>,
            String,
            String,
        ) = conn.query_row(
            "SELECT description, developer, publisher, release_year, genres, tags FROM games WHERE id = ?1",
            params![game_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
        )?;

        let final_desc = if locked.contains("description") {
            cur_desc
        } else {
            description.map(|s| s.to_string()).or(cur_desc)
        };
        let final_dev = if locked.contains("developer") {
            cur_dev
        } else {
            developer.map(|s| s.to_string()).or(cur_dev)
        };
        let final_pub = if locked.contains("publisher") {
            cur_pub
        } else {
            publisher.map(|s| s.to_string()).or(cur_pub)
        };
        let final_year = if locked.contains("release_year") {
            cur_year
        } else {
            release_year.or(cur_year)
        };
        let final_genres = if locked.contains("genres") {
            cur_genres
        } else {
            genres
                .map(|g| serde_json::to_string(g).unwrap_or_default())
                .unwrap_or(cur_genres)
        };
        let final_tags = if locked.contains("tags") {
            cur_tags
        } else {
            tags.map(|t| serde_json::to_string(t).unwrap_or_default())
                .unwrap_or(cur_tags)
        };

        conn.execute(
            "UPDATE games SET
                description = ?1,
                developer = ?2,
                publisher = ?3,
                release_year = ?4,
                genres = ?5,
                tags = ?6,
                match_confidence = COALESCE(?7, match_confidence),
                provider_attribution = COALESCE(?8, provider_attribution),
                updated_at = ?9
             WHERE id = ?10",
            params![
                final_desc,
                final_dev,
                final_pub,
                final_year,
                final_genres,
                final_tags,
                match_confidence,
                provider_attribution,
                now,
                game_id,
            ],
        )?;

        Ok(())
    }

    fn map_artwork_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ArtworkAsset> {
        Ok(ArtworkAsset {
            id: row.get(0)?,
            game_id: row.get(1)?,
            role: row.get(2)?,
            provider: row.get(3)?,
            provider_asset_id: row.get(4)?,
            source_url: row.get(5)?,
            cached_path: row.get(6)?,
            width: row.get(7)?,
            height: row.get(8)?,
            mime_type: row.get(9)?,
            attribution: row.get(10)?,
            is_selected: row.get::<_, i32>(11)? == 1,
            created_at: row.get(12)?,
        })
    }

    pub fn get_version(&self) -> AppResult<u32> {
        let conn = self.conn();
        migrations::get_current_version(&conn)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Record a game session and update total playtime on the game.
    pub fn record_game_session(
        &self,
        game_id: &str,
        started_at: &str,
        ended_at: Option<&str>,
        duration_seconds: u64,
        is_approximate: bool,
    ) -> AppResult<GameSession> {
        let conn = self.conn();
        let session_id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO game_sessions (id, game_id, started_at, ended_at, duration_seconds, is_approximate)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                session_id,
                game_id,
                started_at,
                ended_at,
                duration_seconds as i64,
                if is_approximate { 1 } else { 0 },
            ],
        )?;

        conn.execute(
            "UPDATE games
             SET playtime_seconds = playtime_seconds + ?1,
                 last_launched_at = COALESCE(?2, last_launched_at),
                 updated_at = ?3
             WHERE id = ?4",
            params![duration_seconds as i64, started_at, now, game_id,],
        )?;

        Ok(GameSession {
            id: session_id,
            game_id: game_id.to_string(),
            started_at: started_at.to_string(),
            ended_at: ended_at.map(|s| s.to_string()),
            duration_seconds,
            is_approximate,
        })
    }

    /// Retrieve all recorded sessions for a specific game, sorted most recent first.
    pub fn get_game_sessions(&self, game_id: &str) -> AppResult<Vec<GameSession>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, game_id, started_at, ended_at, duration_seconds, is_approximate
             FROM game_sessions
             WHERE game_id = ?1
             ORDER BY started_at DESC",
        )?;

        let rows = stmt.query_map(params![game_id], |row| {
            let id: String = row.get(0)?;
            let gid: String = row.get(1)?;
            let started_at: String = row.get(2)?;
            let ended_at: Option<String> = row.get(3)?;
            let duration_seconds: i64 = row.get(4)?;
            let is_approximate: i32 = row.get(5)?;

            Ok(GameSession {
                id,
                game_id: gid,
                started_at,
                ended_at,
                duration_seconds: duration_seconds.max(0) as u64,
                is_approximate: is_approximate == 1,
            })
        })?;

        let mut sessions = Vec::new();
        for s in rows {
            sessions.push(s?);
        }
        Ok(sessions)
    }

    /// Reset playtime for a specific game to 0 and remove its recorded sessions.
    pub fn reset_game_playtime(&self, game_id: &str) -> AppResult<()> {
        let conn = self.conn();
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "DELETE FROM game_sessions WHERE game_id = ?1",
            params![game_id],
        )?;
        conn.execute(
            "UPDATE games SET playtime_seconds = 0, updated_at = ?1 WHERE id = ?2",
            params![now, game_id],
        )?;

        Ok(())
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
            playtime_seconds: 0,
            artwork: None,
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
            locked_fields: None,
            updated_at: "2026-01-02T00:00:00Z".to_string(),
        })
        .unwrap();

        // Check that overridden title is returned
        let updated = db.get_game_by_id("game-1").unwrap().unwrap();
        assert_eq!(updated.title, "My Custom Title");
        assert_eq!(updated.notes, Some("Awesome game".to_string()));
        assert!(updated.is_favorite);

        // Simulate metadata provider refresh: base game title updated in `games` table
        let conn = db.conn();
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
            playtime_seconds: 0,
            artwork: None,
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
            locked_fields: None,
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
            playtime_seconds: 0,
            artwork: None,
        };

        db.upsert_steam_game(&steam_game).unwrap();

        // Suppose external drive E: was unplugged, so active_app_ids has no 236390
        let marked = db.mark_missing_steam_games(&[]).unwrap();
        assert_eq!(marked, 1);

        let game = db.get_game_by_id(&steam_game.id).unwrap().unwrap();
        assert_eq!(game.status, GameStatus::Missing);
    }

    #[test]
    fn test_database_corruption_recovery_and_backup() {
        let temp_dir = tempfile::tempdir().unwrap();
        let db_path = temp_dir.path().join("test_corrupt.db");

        // 1. Create a corrupt non-sqlite file
        std::fs::write(
            &db_path,
            b"CORRUPT DATA NOT A SQLITE DATABASE GARBAGE BYTES",
        )
        .unwrap();

        // 2. Open via Database::new
        let db = Database::new(&db_path).expect("Database::new should recover from corrupt file");

        // 3. Verify integrity of the recovered database
        assert!(db.check_integrity().unwrap());

        // 4. Verify that a backup file was created
        let entries: Vec<_> = std::fs::read_dir(temp_dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
            .collect();

        assert!(
            entries
                .iter()
                .any(|name| name.contains("corrupt") && name.ends_with(".db")),
            "Expected a .corrupt.<ts>.db backup file to exist, found: {:?}",
            entries
        );
    }

    #[test]
    fn test_database_check_integrity_and_stats() {
        let db = Database::in_memory().unwrap();
        assert!(db.check_integrity().unwrap());

        let (total, installed, missing, favorites) = db.get_game_stats().unwrap();
        assert_eq!(total, 0);
        assert_eq!(installed, 0);
        assert_eq!(missing, 0);
        assert_eq!(favorites, 0);
    }

    #[test]
    fn test_playtime_recording_and_reset() {
        let db = Database::in_memory().unwrap();
        let game = make_test_game("pt-game-1", "Celeste", "c:/games/celeste.exe");
        db.add_game(&game).unwrap();

        // Initially 0 playtime
        let initial = db.get_game_by_id("pt-game-1").unwrap().unwrap();
        assert_eq!(initial.playtime_seconds, 0);

        // Record a 30-minute session (1800 seconds)
        let session1 = db
            .record_game_session(
                "pt-game-1",
                "2026-10-10T10:00:00Z",
                Some("2026-10-10T10:30:00Z"),
                1800,
                false,
            )
            .unwrap();
        assert_eq!(session1.duration_seconds, 1800);
        assert!(!session1.is_approximate);

        // Check updated game
        let after_s1 = db.get_game_by_id("pt-game-1").unwrap().unwrap();
        assert_eq!(after_s1.playtime_seconds, 1800);
        assert_eq!(
            after_s1.last_launched_at,
            Some("2026-10-10T10:00:00Z".to_string())
        );

        // Record a second approximate session (600 seconds)
        let session2 = db
            .record_game_session(
                "pt-game-1",
                "2026-10-10T12:00:00Z",
                Some("2026-10-10T12:10:00Z"),
                600,
                true,
            )
            .unwrap();
        assert!(session2.is_approximate);

        let after_s2 = db.get_game_by_id("pt-game-1").unwrap().unwrap();
        assert_eq!(after_s2.playtime_seconds, 2400);

        // Check sessions retrieval
        let sessions = db.get_game_sessions("pt-game-1").unwrap();
        assert_eq!(sessions.len(), 2);
        assert_eq!(sessions[0].started_at, "2026-10-10T12:00:00Z");
        assert_eq!(sessions[1].started_at, "2026-10-10T10:00:00Z");

        // Reset playtime
        db.reset_game_playtime("pt-game-1").unwrap();
        let after_reset = db.get_game_by_id("pt-game-1").unwrap().unwrap();
        assert_eq!(after_reset.playtime_seconds, 0);

        let sessions_after_reset = db.get_game_sessions("pt-game-1").unwrap();
        assert_eq!(sessions_after_reset.len(), 0);
    }

    #[test]
    fn test_list_games_most_played_sort() {
        let db = Database::in_memory().unwrap();
        let mut g1 = make_test_game("g1", "Game Low Playtime", "c:/g1.exe");
        g1.playtime_seconds = 100;
        let mut g2 = make_test_game("g2", "Game High Playtime", "c:/g2.exe");
        g2.playtime_seconds = 5000;
        let mut g3 = make_test_game("g3", "Game Zero Playtime", "c:/g3.exe");
        g3.playtime_seconds = 0;

        db.add_game(&g1).unwrap();
        db.add_game(&g2).unwrap();
        db.add_game(&g3).unwrap();

        // Sort by most_played (default descending)
        let games_desc = db
            .list_games(None, None, Some("most_played"), None, false)
            .unwrap();
        assert_eq!(games_desc[0].id, "g2");
        assert_eq!(games_desc[1].id, "g1");
        assert_eq!(games_desc[2].id, "g3");
    }

    #[test]
    fn test_transaction_rollback_and_mutex_poison_recovery_on_panic() {
        let db = Database::in_memory().unwrap();
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let mut conn = db.conn();
            let tx = conn.transaction().unwrap();
            tx.execute(
                "INSERT INTO settings (key, value) VALUES ('test_key', 'panic_value')",
                [],
            )
            .unwrap();
            panic!("Simulated panic inside transaction");
        }));

        let retrieved = db.get_setting("test_key").unwrap();
        assert_eq!(retrieved, None);

        let set_res = db.set_setting("test_key", "recovered_value");
        assert!(set_res.is_ok());
        assert_eq!(
            db.get_setting("test_key").unwrap(),
            Some("recovered_value".to_string())
        );
    }
}
