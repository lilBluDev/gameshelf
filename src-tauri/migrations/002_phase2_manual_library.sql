-- 002_phase2_manual_library.sql: Add normalized path and last_launched_at tracking

ALTER TABLE games ADD COLUMN last_launched_at TEXT;
ALTER TABLE games ADD COLUMN normalized_path TEXT;

CREATE INDEX IF NOT EXISTS idx_games_normalized_path ON games(normalized_path);
CREATE INDEX IF NOT EXISTS idx_games_last_launched ON games(last_launched_at);
