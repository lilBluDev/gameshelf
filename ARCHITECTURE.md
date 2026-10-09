# GameShelf Architecture

## Overview

GameShelf is architected as a local-first desktop application with a clear typed separation between the React frontend UI and the Rust Tauri backend core.

```
┌────────────────────────────────────────────────────────┐
│                   React 18 + Vite UI                   │
│   (Tailwind CSS, Lucide Icons, App Shell, Components)  │
└───────────────────────────┬────────────────────────────┘
                            │ Typed IPC (tauri invoke)
┌───────────────────────────▼────────────────────────────┐
│                    Tauri 2 Core                        │
│   (Commands, Window Management, Narrow Capabilities)   │
└───────┬───────────────────┬───────────────────┬────────┘
        │                   │                   │
┌───────▼──────┐    ┌───────▼──────┐    ┌───────▼──────┐
│ SQLite DB    │    │ Launch Engine│    │ Integrations │
│ (rusqlite)   │    │  (std::cmd)  │    │ (Steam, FS)  │
└──────────────┘    └──────────────┘    └──────────────┘
```

---

## Directory Structure

```
game-launcher/
├── src/
│   ├── components/             # Reusable accessible UI components
│   │   ├── TitleBar.tsx        # Native-respectful custom title bar with window controls
│   │   ├── Sidebar.tsx         # Navigation sidebar (Library, Favorites, Steam, PC, Emulated)
│   │   ├── TopBar.tsx          # Search, sort, view toggle, and Add Game modal trigger
│   │   ├── GameCard.tsx        # Cover card with 2:3 ratio and list-item view
│   │   ├── GameDetailPanel.tsx # Side panel with Play, Edit metadata, Config, and Steam App ID
│   │   ├── AddGameModal.tsx    # Modal for manual file selection, auto-inspection, duplicate alert
│   │   ├── SettingsModal.tsx   # Preference modal (General, Appearance, Steam Integrations, Diagnostics)
│   │   ├── EmptyState.tsx      # Friendly empty state when 0 games are loaded
│   │   └── Toast.tsx           # Error and status toast notification container
│   ├── config/
│   │   └── appConfig.ts        # Single source of truth for name, bundle ID, accent, logo
│   ├── fixtures/
│   │   └── mockGames.ts        # Dev-only mock games, stripped from production builds
│   ├── services/
│   │   ├── api.ts              # Typed API invoke wrapper with pure browser fallback
│   │   └── steam.test.ts       # Fixture-based tests for VDF parser, library discovery, filtering
│   ├── types/
│   │   ├── api.ts              # TypeScript interfaces for commands, responses, and Steam status
│   │   └── models.ts           # Game, LaunchAction, ArtworkAsset, EmulatorProfile
│   ├── utils/
│   │   └── artwork.ts          # Deterministic gradient and title initials generator
│   ├── App.tsx                 # Root application container and state management
│   ├── index.css               # Tailwind tokens, dark/light themes, reduced-motion rules
│   └── main.tsx                # React DOM mount point
├── src-tauri/
│   ├── capabilities/
│   │   └── default.json        # Narrowly scoped Tauri 2 permissions (no arbitrary shell)
│   ├── migrations/
│   │   ├── 001_initial_schema.sql        # Core tables: games, overrides, artwork, etc.
│   │   └── 002_phase2_manual_library.sql # Added normalized_path, last_launched_at, indexes
│   ├── src/
│   │   ├── commands/           # Typed Tauri IPC command handlers
│   │   │   ├── app.rs          # get_app_info
│   │   │   ├── games.rs        # inspect_file, add_manual_game, launch_game, remove_game, etc.
│   │   │   ├── settings.rs     # get_settings, set_setting
│   │   │   ├── steam.rs        # get_steam_status, rescan_steam, configure_steam_path, etc.
│   │   │   └── mod.rs
│   │   ├── db/                 # SQLite persistence layer
│   │   │   ├── migrations.rs   # Migration runner with automatic DB backup
│   │   │   ├── schema.rs       # Typed models (Game, LaunchAction tagged enum)
│   │   │   └── mod.rs          # Database handle, WAL, upsert_steam_game, mark_missing
│   │   ├── integrations/       # Platform store and emulator integrations
│   │   │   ├── steam/
│   │   │   │   ├── filter.rs   # Non-game filtering rules engine and user override evaluation
│   │   │   │   ├── scanner.rs  # Registry discovery, libraryfolders.vdf & appmanifest scanner
│   │   │   │   ├── vdf.rs      # Pure Rust recursive descent VDF/ACF tokenizer & AST parser
│   │   │   │   └── mod.rs      # High-level coordinator, status query, rescan orchestrator
│   │   │   └── mod.rs
│   │   ├── launcher/           # Process execution engine
│   │   │   └── mod.rs          # validate_and_launch via std::process::Command and protocol URIs
│   │   ├── platform/           # Windows-specific system inspection
│   │   │   ├── mod.rs
│   │   │   └── windows.rs      # Path normalization, PE version info, lnk resolution, URI activation
│   │   ├── error.rs            # AppError (thiserror) with custom frontend serialization
│   │   ├── logging.rs          # Structured rolling daily file logger (tracing)
│   │   ├── lib.rs              # App setup, path resolution, and command registration
│   │   └── main.rs             # Application entrypoint
│   ├── Cargo.toml              # Rust crate dependencies
│   ├── tauri.conf.json         # Tauri 2 window, security, CSP, and build settings
│   └── build.rs                # Tauri build script
└── IMPLEMENTATION_STATUS.md    # Living progress tracking and verification evidence
```

---

## Steam Discovery & Launch Pipeline

### 1. Minimal Zero-Dependency VDF / ACF Parser
Implemented in `src-tauri/src/integrations/steam/vdf.rs`:
- Recursive descent tokenizer and parser with zero regex.
- Handles quoted strings with backslash escapes (`\"`, `\\`), unquoted values, nested sections (`{ ... }`), and line comments (`//`).
- Case-insensitive key lookup (`get_str("name")`, `get_section("AppState")`).

### 2. Multi-Library Scanner
Implemented in `src-tauri/src/integrations/steam/scanner.rs`:
- Automatically locates Steam installation via Windows Registry (`HKCU\Software\Valve\Steam\SteamPath`, `HKLM\SOFTWARE\WOW6432Node\Valve\Steam\InstallPath`) or known default folders.
- Discovers all Steam library folders from `steamapps/libraryfolders.vdf`, supporting both legacy flat and modern nested formats.
- Checks disk presence for both the library folder and the game installation folder (`common/<installdir>`).
- If an entire library folder is disconnected or offline, discovery reports a warning and marks its games as `Missing`, never aborting the scan.

### 3. Non-Game Filtering Engine
Implemented in `src-tauri/src/integrations/steam/filter.rs`:
- Rule-based filter prevents obvious non-games from polluting the library:
  - Common Redistributables (DirectX, VC++, AppID 228980)
  - Proton and Linux Runtimes
  - Software Development Kits (SDKs)
  - Headless Dedicated Game Servers
- Explainable and editable in Settings: users can disable individual rules or explicitly include individual App IDs.

### 4. Idempotent Database Upsert & User Override Isolation
Implemented in `src-tauri/src/db/mod.rs`:
- Deduplicates Steam games by `(SourceKind::Steam, source_id)`.
- Re-scanning updates the base game record (`install_dir`, `status`, `last_scanned_at`, `normalized_path`).
- All user edits (title, notes, user tags, favorite status) are stored in `game_overrides` and dynamically joined via `COALESCE(go.field, g.field)`. Re-scans never overwrite user customizations.
- Games no longer found in any active library are set to `GameStatus::Missing` (never deleted from DB).

### 5. Official Protocol Activation Launch
Implemented in `src-tauri/src/launcher/mod.rs` and `src-tauri/src/platform/windows.rs`:
- Steam games are launched strictly via `steam://rungameid/<appid>` through the Windows protocol activation layer.
- Raw binaries are never directly executed for Steam games.
- Validates that the App ID is a positive integer before launching.
