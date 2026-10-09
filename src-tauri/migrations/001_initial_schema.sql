-- 001_initial_schema.sql: Initial GameShelf SQLite Schema

CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY NOT NULL,
    applied_at TEXT NOT NULL
);

-- Core Games Table
CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    sort_title TEXT NOT NULL,
    description TEXT,
    developer TEXT,
    publisher TEXT,
    release_year INTEGER,
    genres TEXT NOT NULL DEFAULT '[]',
    tags TEXT NOT NULL DEFAULT '[]',
    source_kind TEXT NOT NULL,
    source_id TEXT,
    install_dir TEXT,
    launch_action TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Unknown',
    last_scanned_at TEXT,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    is_hidden INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    user_tags TEXT NOT NULL DEFAULT '[]',
    match_confidence REAL,
    provider_attribution TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- User Overrides (stored separately so library refreshes never overwrite manual edits)
CREATE TABLE IF NOT EXISTS game_overrides (
    game_id TEXT PRIMARY KEY NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    title TEXT,
    sort_title TEXT,
    description TEXT,
    developer TEXT,
    publisher TEXT,
    release_year INTEGER,
    genres TEXT,
    tags TEXT,
    notes TEXT,
    user_tags TEXT,
    is_favorite INTEGER,
    is_hidden INTEGER,
    updated_at TEXT NOT NULL
);

-- Artwork Assets Table
CREATE TABLE IF NOT EXISTS artwork_assets (
    id TEXT PRIMARY KEY NOT NULL,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    provider TEXT NOT NULL,
    provider_asset_id TEXT,
    source_url TEXT,
    cached_path TEXT,
    width INTEGER,
    height INTEGER,
    mime_type TEXT,
    attribution TEXT,
    is_selected INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

-- Emulator Profiles Table
CREATE TABLE IF NOT EXISTS emulator_profiles (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    executable_path TEXT NOT NULL,
    detection_source TEXT NOT NULL,
    systems TEXT NOT NULL DEFAULT '[]',
    extensions TEXT NOT NULL DEFAULT '[]',
    argument_template TEXT NOT NULL DEFAULT '[]',
    working_dir_rule TEXT NOT NULL,
    validation_status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Scan Jobs Table
CREATE TABLE IF NOT EXISTS scan_jobs (
    id TEXT PRIMARY KEY NOT NULL,
    root_path TEXT NOT NULL,
    options TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL,
    candidates_count INTEGER NOT NULL DEFAULT 0,
    imported_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    is_cancellable INTEGER NOT NULL DEFAULT 1,
    errors_summary TEXT,
    started_at TEXT NOT NULL,
    completed_at TEXT
);

-- Application Settings Key-Value Table
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Indexes for fast query lookups and deduplication
CREATE INDEX IF NOT EXISTS idx_games_sort_title ON games(sort_title);
CREATE INDEX IF NOT EXISTS idx_games_source_id ON games(source_kind, source_id);
CREATE INDEX IF NOT EXISTS idx_games_install_dir ON games(install_dir);
CREATE INDEX IF NOT EXISTS idx_games_favorite ON games(is_favorite);
CREATE INDEX IF NOT EXISTS idx_artwork_game_role ON artwork_assets(game_id, role);
