CREATE TABLE IF NOT EXISTS play_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    last_seen_at TEXT NOT NULL,
    duration_secs INTEGER NOT NULL DEFAULT 0,
    tracking_method TEXT NOT NULL,
    end_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_play_sessions_game_id ON play_sessions(game_id);
CREATE INDEX IF NOT EXISTS idx_play_sessions_started_at ON play_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_play_sessions_active ON play_sessions(ended_at) WHERE ended_at IS NULL;

ALTER TABLE games ADD COLUMN session_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE games ADD COLUMN last_played_at TEXT;
