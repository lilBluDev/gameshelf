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
└──────────────┬──────────────────────────┬──────────────┘
               │                          │
┌──────────────▼─────────────┐   ┌────────▼──────────────┐
│     SQLite (rusqlite)      │   │  Local File Logging   │
│  Versioned Migrations, WAL │   │  tracing-subscriber   │
└────────────────────────────┘   └───────────────────────┘
```

---

## Directory Structure

```
game-launcher/
├── src/
│   ├── components/             # Reusable accessible UI components
│   │   ├── TitleBar.tsx        # Native-respectful custom title bar with window controls
│   │   ├── Sidebar.tsx         # Navigation sidebar (Library, Favorites, Platforms, Settings)
│   │   ├── TopBar.tsx          # Search, sort, view toggle, and import trigger
│   │   ├── GameCard.tsx        # Cover card with 2:3 ratio and list-item view
│   │   ├── GameDetailPanel.tsx # Side panel for inspecting game launch actions and metadata
│   │   ├── EmptyState.tsx      # Friendly empty state when 0 games are loaded
│   │   ├── SettingsModal.tsx   # Preference modal (General, Appearance, Diagnostics, etc.)
│   │   └── Toast.tsx           # Error and status toast notification container
│   ├── config/
│   │   └── appConfig.ts        # Single source of truth for name, bundle ID, accent, logo
│   ├── fixtures/
│   │   └── mockGames.ts        # Dev-only mock games, stripped from production builds
│   ├── services/
│   │   └── api.ts              # Typed API invoke wrapper with pure browser fallback
│   ├── types/
│   │   ├── api.ts              # TypeScript interfaces for commands and responses
│   │   └── models.ts           # Game, LaunchAction, ArtworkAsset, EmulatorProfile
│   ├── utils/
│   │   └── artwork.ts          # Deterministic gradient and title initials generator
│   ├── App.tsx                 # Root application container and state management
│   ├── index.css               # Tailwind tokens, dark/light themes, reduced-motion rules
│   └── main.tsx                # React DOM mount point
├── src-tauri/
│   ├── capabilities/
│   │   └── default.json        # Narrowly scoped Tauri 2 permissions (no shell access)
│   ├── migrations/
│   │   └── 001_initial_schema.sql # SQLite schema with games, overrides, artwork, etc.
│   ├── src/
│   │   ├── commands/           # Typed Tauri IPC command handlers
│   │   │   ├── app.rs          # get_app_info
│   │   │   ├── games.rs        # list_games
│   │   │   ├── settings.rs     # get_settings, set_setting
│   │   │   └── mod.rs
│   │   ├── db/                 # SQLite persistence layer
│   │   │   ├── migrations.rs   # Migration runner with automatic DB backup
│   │   │   ├── schema.rs       # Typed models (Game, LaunchAction tagged enum)
│   │   │   └── mod.rs          # Database handle, WAL configuration, query helpers
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

## Data Contracts & Persistence

### 1. Game Model & User Overrides
Games are stored in SQLite with distinct separation between scanned provider data (`games`) and user modifications (`game_overrides`). This ensures that re-scanning libraries never overwrites user customizations (custom titles, tags, notes, or artwork overrides).

### 2. LaunchAction Tagged Enum
Launch actions are never free-form shell strings. They are represented as a tagged enum:
- `Executable { path, args, working_dir, env }`
- `Steam { app_id }` — launched via `steam://rungameid/<id>`
- `Shortcut { target, args, working_dir }`
- `EmulatedGame { profile_id, rom_path, arg_overrides }`
- `Unavailable { reason }`

### 3. Database Migrations & Backup
The migration runner in `src-tauri/src/db/migrations.rs` checks `schema_migrations`. When upgrading an existing database (`version > 0`), it automatically creates a timestamped backup file before applying pending transactions.

---

## How to Add an Emulator or Store Adapter

### Adding a Store Adapter (Planned for Phase 2)
1. Create a scanner submodule in `src-tauri/src/scanner/<store_name>.rs` (e.g. `steam.rs`).
2. Implement a detector function returning `Vec<Game>` with `source_kind: SourceKind::<Store>` and a typed `LaunchAction` (e.g. `LaunchAction::Steam { app_id }`).
3. Store paths are normalized for Windows case-insensitivity while preserving original display casing.
4. Expose the scanner through a typed command registered in `src-tauri/src/lib.rs`.

### Adding an Emulator Profile (Planned for Phase 5)
1. Add a predefined profile to `emulator_profiles` table or seed data with:
   - `systems`: Array of supported console IDs (e.g. `["snes", "sfc"]`).
   - `extensions`: Supported ROM extensions (e.g. `[".sfc", ".smc", ".zip"]`).
   - `argument_template`: Parameterized arguments using typed placeholders (`["{rom}"]`, `["--fullscreen", "{rom}"]`).
2. Implement an executable path validator in `src-tauri/src/launcher/emulator.rs` to verify the emulator binary exists before launching.
