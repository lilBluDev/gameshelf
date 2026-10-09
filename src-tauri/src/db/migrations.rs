use chrono::Utc;
use rusqlite::{params, Connection};
use std::path::Path;
use tracing::{info, warn};

use crate::error::{AppError, AppResult};

pub struct Migration {
    pub version: u32,
    pub description: &'static str,
    pub sql: &'static str,
}

pub const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        description: "Initial schema with games, overrides, artwork, emulators, and settings",
        sql: include_str!("../../migrations/001_initial_schema.sql"),
    },
    Migration {
        version: 2,
        description: "Add normalized path and last_launched_at tracking",
        sql: include_str!("../../migrations/002_phase2_manual_library.sql"),
    },
    Migration {
        version: 3,
        description: "Add scan_sources table for folder scanner management",
        sql: include_str!("../../migrations/003_phase4_folder_scanner.sql"),
    },
    Migration {
        version: 4,
        description: "Add emulator_profiles table for emulator and ROM management",
        sql: include_str!("../../migrations/004_phase5_emulators.sql"),
    },
];

pub const LATEST_VERSION: u32 = 4;

/// Get the highest applied migration version. Returns 0 if no migrations have been applied.
pub fn get_current_version(conn: &Connection) -> AppResult<u32> {
    // Check if schema_migrations table exists
    let table_exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations')",
        [],
        |row| row.get(0),
    )?;

    if !table_exists {
        return Ok(0);
    }

    let version: Option<u32> = conn
        .query_row("SELECT MAX(version) FROM schema_migrations", [], |row| {
            row.get(0)
        })
        .unwrap_or(None);

    Ok(version.unwrap_or(0))
}

/// Run all pending migrations.
/// If `db_path` is specified and the database already has an applied version,
/// a timestamped/versioned backup is created prior to running any new migrations.
pub fn run_migrations(conn: &mut Connection, db_path: Option<&Path>) -> AppResult<u32> {
    let current_version = get_current_version(conn)?;
    info!(
        current_version = current_version,
        target_version = LATEST_VERSION,
        "Evaluating database migrations"
    );

    if current_version >= LATEST_VERSION {
        info!("Database schema is already at the latest version");
        return Ok(current_version);
    }

    // If an existing DB is being upgraded, back up the database file first
    if current_version > 0 {
        if let Some(path) = db_path {
            if path.exists() {
                let timestamp = Utc::now().format("%Y%m%d%H%M%S");
                let backup_name = format!(
                    "{}.v{}.backup.{}",
                    path.file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("library"),
                    current_version,
                    timestamp
                );
                let backup_path = path.with_file_name(backup_name);
                match std::fs::copy(path, &backup_path) {
                    Ok(_) => {
                        info!(backup_path = ?backup_path, "Database successfully backed up before migration")
                    }
                    Err(e) => {
                        warn!(error = ?e, "Could not create database backup prior to migration")
                    }
                }
            }
        }
    }

    for migration in MIGRATIONS {
        if migration.version > current_version {
            info!(
                version = migration.version,
                description = migration.description,
                "Applying database migration"
            );

            let tx = conn.transaction()?;

            // Execute migration statements
            tx.execute_batch(migration.sql)
                .map_err(|e| AppError::MigrationFailed {
                    version: migration.version,
                    reason: e.to_string(),
                })?;

            // Record applied version
            let now = Utc::now().to_rfc3339();
            tx.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, ?2)",
                params![migration.version, now],
            )?;

            tx.commit()?;
            info!(
                version = migration.version,
                "Migration successfully applied"
            );
        }
    }

    let final_version = get_current_version(conn)?;
    Ok(final_version)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn test_fresh_database_reaches_latest_version() {
        let mut conn = Connection::open_in_memory().unwrap();
        let initial_ver = get_current_version(&conn).unwrap();
        assert_eq!(initial_ver, 0);

        let final_ver = run_migrations(&mut conn, None).unwrap();
        assert_eq!(final_ver, LATEST_VERSION);

        // Verify tables were created
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('games', 'settings', 'artwork_assets')",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 3);
    }

    #[test]
    fn test_rerunning_migration_is_noop() {
        let mut conn = Connection::open_in_memory().unwrap();
        let ver1 = run_migrations(&mut conn, None).unwrap();
        assert_eq!(ver1, LATEST_VERSION);

        let ver2 = run_migrations(&mut conn, None).unwrap();
        assert_eq!(ver2, LATEST_VERSION);
    }

    #[test]
    fn test_older_version_upgrades() {
        let mut conn = Connection::open_in_memory().unwrap();
        // Manually apply version 1 only
        let tx = conn.transaction().unwrap();
        tx.execute_batch(MIGRATIONS[0].sql).unwrap();
        tx.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (1, datetime('now'))",
            [],
        )
        .unwrap();
        tx.commit().unwrap();

        assert_eq!(get_current_version(&conn).unwrap(), 1);

        // Run migrations to upgrade to latest
        let final_ver = run_migrations(&mut conn, None).unwrap();
        assert_eq!(final_ver, LATEST_VERSION);

        // Verify the new columns exist by querying them
        conn.execute(
            "INSERT INTO games (id, title, sort_title, launch_action, source_kind, status, created_at, updated_at, last_launched_at, normalized_path)
             VALUES ('test-id', 'Test Game', 'test game', '{\"type\":\"Unavailable\",\"reason\":\"none\"}', 'Manual', 'Installed', '2026-01-01', '2026-01-01', '2026-01-02', 'c:/test.exe')",
            [],
        )
        .unwrap();

        let path: String = conn
            .query_row(
                "SELECT normalized_path FROM games WHERE id = 'test-id'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(path, "c:/test.exe");
    }
}
