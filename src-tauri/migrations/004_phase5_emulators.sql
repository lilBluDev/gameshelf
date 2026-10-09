-- Migration 004: Phase 5 - Emulator Profiles and Emulated Games
DROP TABLE IF EXISTS emulator_profiles;

CREATE TABLE emulator_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    systems_json TEXT NOT NULL,
    supported_extensions_json TEXT NOT NULL,
    argument_template_json TEXT NOT NULL,
    working_dir_rule TEXT NOT NULL DEFAULT 'EmulatorDir',
    executable_path TEXT,
    core_path TEXT,
    is_builtin INTEGER NOT NULL DEFAULT 0,
    detection_hints_json TEXT NOT NULL,
    verification_source TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_emulator_profiles_name ON emulator_profiles(name);
