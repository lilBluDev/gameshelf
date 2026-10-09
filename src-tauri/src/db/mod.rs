pub mod migrations;
pub mod schema;

use chrono::Utc;
use rusqlite::{params, Connection, OpenFlags};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tracing::info;

use crate::error::{AppError, AppResult};
use schema::Game;

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

    /// Query games from the database (Phase 1 returns empty list or populated items)
    pub fn list_games(&self, filter: Option<&str>, search: Option<&str>) -> AppResult<Vec<Game>> {
        let conn = self.conn.lock().unwrap();
        let mut sql = String::from("SELECT id, title, sort_title, description, developer, publisher, release_year, genres, tags, source_kind, source_id, install_dir, launch_action, status, last_scanned_at, is_favorite, is_hidden, notes, user_tags, match_confidence, provider_attribution FROM games WHERE is_hidden = 0");

        if let Some(f) = filter {
            match f {
                "favorites" => sql.push_str(" AND is_favorite = 1"),
                "steam" => sql.push_str(" AND source_kind = 'Steam'"),
                "pc" => {
                    sql.push_str(" AND (source_kind = 'Standalone' OR source_kind = 'Shortcut')")
                }
                "emulated" => sql.push_str(" AND source_kind = 'Emulated'"),
                _ => {}
            }
        }

        if let Some(s) = search {
            if !s.is_empty() {
                sql.push_str(" AND (title LIKE '%' || ? || '%' OR developer LIKE '%' || ? || '%')");
            }
        }

        sql.push_str(" ORDER BY sort_title ASC");

        let mut stmt = conn.prepare(&sql)?;
        let mut rows = if let Some(s) = search {
            if !s.is_empty() {
                stmt.query(params![s, s])?
            } else {
                stmt.query([])?
            }
        } else {
            stmt.query([])?
        };

        let mut games = Vec::new();
        while let Some(row) = rows.next()? {
            let genres_raw: String = row.get(7)?;
            let tags_raw: String = row.get(8)?;
            let launch_action_raw: String = row.get(12)?;
            let user_tags_raw: String = row.get(18)?;
            let source_kind_raw: String = row.get(9)?;
            let status_raw: String = row.get(13)?;

            let source_kind = match source_kind_raw.as_str() {
                "Steam" => schema::SourceKind::Steam,
                "Standalone" => schema::SourceKind::Standalone,
                "Shortcut" => schema::SourceKind::Shortcut,
                "Emulated" => schema::SourceKind::Emulated,
                _ => schema::SourceKind::Manual,
            };

            let status = match status_raw.as_str() {
                "Installed" => schema::GameStatus::Installed,
                "Missing" => schema::GameStatus::Missing,
                _ => schema::GameStatus::Unknown,
            };

            let launch_action: schema::LaunchAction = serde_json::from_str(&launch_action_raw)
                .map_err(|e| AppError::Internal(format!("Invalid launch action JSON: {}", e)))?;

            games.push(Game {
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
            });
        }

        Ok(games)
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

    #[test]
    fn test_settings_read_write_round_trip() {
        let db = Database::in_memory().unwrap();

        // Initially absent
        let none_val = db.get_setting("theme").unwrap();
        assert_eq!(none_val, None);

        // Set value
        db.set_setting("theme", "light").unwrap();
        let light_val = db.get_setting("theme").unwrap();
        assert_eq!(light_val, Some("light".to_string()));

        // Overwrite value
        db.set_setting("theme", "dark").unwrap();
        let dark_val = db.get_setting("theme").unwrap();
        assert_eq!(dark_val, Some("dark".to_string()));
    }

    #[test]
    fn test_list_games_empty_initial() {
        let db = Database::in_memory().unwrap();
        let games = db.list_games(None, None).unwrap();
        assert_eq!(games.len(), 0);
    }
}
