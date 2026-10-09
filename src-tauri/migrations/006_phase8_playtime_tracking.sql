-- Phase 8: Playtime Tracking
-- Adds playtime_seconds column to games table, game_sessions table, and default setting

ALTER TABLE games ADD COLUMN playtime_seconds INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS game_sessions (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    is_approximate BOOLEAN NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_game_sessions_game_id ON game_sessions(game_id);
CREATE INDEX IF NOT EXISTS idx_games_playtime ON games(playtime_seconds DESC);

INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('playtime_tracking_enabled', 'false', datetime('now'));
