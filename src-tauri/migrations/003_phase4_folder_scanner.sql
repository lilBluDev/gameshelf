-- 003_phase4_folder_scanner.sql: Folder scan sources and configuration

CREATE TABLE IF NOT EXISTS scan_sources (
    id TEXT PRIMARY KEY NOT NULL,
    path TEXT NOT NULL,
    normalized_path TEXT NOT NULL UNIQUE,
    depth INTEGER NOT NULL DEFAULT 4,
    last_scanned_at TEXT,
    game_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scan_sources_normalized_path ON scan_sources(normalized_path);
