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
│ SQLite DB    │    │ Launch Engine│    │ Platform/FS  │
│ (rusqlite)   │    │  (std::cmd)  │    │ (PE, lnk)    │
└──────────────┘    └──────────────┘    └──────────────┘
```

---

## Directory Structure

```
game-launcher/
├── src/
│   ├── components/             # Reusable accessible UI components
│   │   ├── TitleBar.tsx        # Native-respectful custom title bar with window controls
│   │   ├── Sidebar.tsx         # Navigation sidebar (Library, Favorites, Platforms, Settings)
│   │   ├── TopBar.tsx          # Search, sort, view toggle, and Add Game modal trigger
│   │   ├── GameCard.tsx        # Cover card with 2:3 ratio and list-item view
│   │   ├── GameDetailPanel.tsx # Side panel for inspecting game, Play, Edit, and Config
│   │   ├── AddGameModal.tsx    # Modal for file selection, auto-inspection, and adding games
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
│   │   └── default.json        # Narrowly scoped Tauri 2 permissions (no arbitrary shell)
│   ├── migrations/
│   │   ├── 001_initial_schema.sql        # Core tables: games, overrides, artwork, etc.
│   │   └── 002_phase2_manual_library.sql # Added normalized_path, last_launched_at, indexes
│   ├── src/
│   │   ├── commands/           # Typed Tauri IPC command handlers
│   │   │   ├── app.rs          # get_app_info
│   │   │   ├── games.rs        # inspect_file, add_manual_game, launch_game, remove_game, etc.
│   │   │   ├── settings.rs     # get_settings, set_setting
│   │   │   └── mod.rs
│   │   ├── db/                 # SQLite persistence layer
│   │   │   ├── migrations.rs   # Migration runner with automatic DB backup
│   │   │   ├── schema.rs       # Typed models (Game, LaunchAction tagged enum)
│   │   │   └── mod.rs          # Database handle, WAL configuration, query helpers
│   │   ├── launcher/           # Process execution engine
│   │   │   └── mod.rs          # validate_and_launch via std::process::Command with arg vectors
│   │   ├── platform/           # Windows-specific system inspection
│   │   │   ├── mod.rs
│   │   │   └── windows.rs      # Path normalization, PE version info extraction, lnk resolution
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
Queries use `COALESCE(go.field, g.field)` to dynamically resolve the effective presentation data.

### 2. LaunchAction Tagged Enum & Security
Launch actions are never free-form shell strings. They are represented as a tagged enum:
- `Executable { path, args: Vec<String>, working_dir, env }`
- `Steam { app_id }` — launched via `steam://rungameid/<id>`
- `Shortcut { target, args, working_dir }`
- `EmulatedGame { profile_id, rom_path, arg_overrides }`
- `Unavailable { reason }`

**Process Execution Security**:
- Processes are launched exclusively via `std::process::Command::new(binary_path).args(&arg_vector)`.
- Never invoked through `cmd.exe /c` or PowerShell strings.
- Automatically handles spaces and Unicode characters in filenames and directories without escaping vulnerabilities.
- Working directory is validated before execution. If the configured working directory is invalid or missing, it falls back safely to the executable's parent directory.

### 3. Database Migrations & Backup
The migration runner in `src-tauri/src/db/migrations.rs` checks `schema_migrations`. When upgrading an existing database (`version > 0`), it automatically creates a timestamped backup file before applying pending transactions.

---

## Windows Integration & Inspection

### 1. Path Normalization & Duplicate Detection
Paths on Windows are canonicalized by standardizing separators (`/` vs `\`), trimming surrounding quotes, and stripping Windows extended length prefixes (`\\?\`). They are compared case-insensitively using `normalized_path` stored in the database.

### 2. PE File & Shortcut (.lnk) Inspection
- **PE Files**: Inspects Windows PE version resources for `FileDescription` and `ProductName` to extract authentic titles. Falls back to clean stem formatting (stripping release tags, version numbers, and replacing separators).
- **Shortcuts (`.lnk`)**: Uses binary inspection of Shell Link structures to resolve the real target executable, arguments, and working directory without executing shell scripts.
