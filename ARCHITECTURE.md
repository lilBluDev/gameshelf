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
│   │   ├── ScanFolderModal.tsx # Recursive folder scanner curation modal with live progress & heuristics
│   │   ├── SettingsModal.tsx   # Preference modal (General, Appearance, Steam Integrations, Managed Sources, Diagnostics)
│   │   ├── EmptyState.tsx      # Friendly empty state when 0 games are loaded
│   │   └── Toast.tsx           # Error and status toast notification container
│   ├── config/
│   │   └── appConfig.ts        # Single source of truth for name, bundle ID, accent, logo
│   ├── fixtures/
│   │   └── mockGames.ts        # Dev-only mock games, stripped from production builds
│   ├── services/
│   │   ├── api.ts              # Typed API invoke wrapper with pure browser fallback
│   │   ├── scanner.ts          # Scanner service with progress event listeners and mock fallback
│   │   ├── scanner.test.ts     # Frontend unit tests for scanner service and candidate import
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
│   │   ├── 002_phase2_manual_library.sql # Added normalized_path, last_launched_at, indexes
│   │   └── 003_phase4_folder_scanner.sql # Added scan_sources table and index
│   ├── src/
│   │   ├── commands/           # Typed Tauri IPC command handlers
│   │   │   ├── app.rs          # get_app_info
│   │   │   ├── games.rs        # inspect_file, add_manual_game, launch_game, remove_game, etc.
│   │   │   ├── scanner.rs      # start_folder_scan, cancel_folder_scan, import_scan_candidates, scan sources
│   │   │   ├── settings.rs     # get_settings, set_setting
│   │   │   ├── steam.rs        # get_steam_status, rescan_steam, configure_steam_path, etc.
│   │   │   └── mod.rs
│   │   ├── db/                 # SQLite persistence layer
│   │   │   ├── migrations.rs   # Migration runner with automatic DB backup
│   │   │   ├── schema.rs       # Typed models (Game, LaunchAction tagged enum)
│   │   │   └── mod.rs          # Database handle, WAL, upsert_steam_game, scan_sources, batch import
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
│   │   ├── scanner/            # Filesystem folder scanner engine
│   │   │   ├── classifier.rs   # Heuristic candidate classification, engine indicators, confidence scoring
│   │   │   ├── rules.rs        # Built-in exclusion lists, skip rules (uninstallers, updaters, crashpad)
│   │   │   ├── sources.rs      # ScanSource data models and parameters
│   │   │   └── mod.rs          # Safe BFS traversal, depth limits, progress callback, cancellation token
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

---

## Folder Scanner Pipeline & Classification Architecture

### 1. Safety Guardrails & Traversal Bounding
Implemented in `src-tauri/src/scanner/mod.rs`:
- **Root Validation**: Rejects drive roots (`C:\`, `D:\`), Windows system roots (`C:\Windows`, `System32`), and user system AppData (`AppData\Local\Microsoft`, `WindowsApps`) before initiating any traversal.
- **Bounded Breadth-First Traversal**: Tracks relative folder depths up to a configurable maximum (default 4, maximum 6) to avoid infinite loops or deeply nested node trees.
- **Relative Path Exclusion**: Excludes known junk folders (`$Recycle.Bin`, `node_modules`, `.git`, `Steam\steamapps`, `Crashpad`, `__pycache__`) relative to the scan root.
- **Symlink Cycle Guard**: Avoids re-traversing circular filesystem links.

### 2. Heuristic Binary Classification
Implemented in `src-tauri/src/scanner/classifier.rs`:
- Every discovered `.exe` is evaluated through explainable heuristics:
  - **PE Version Metadata**: Extracts Windows PE product name, file description, and company name.
  - **Directory Name Match**: Calculates similarity between binary stem and parent folder name.
  - **Engine Signatures**: Detects Unity (`*_Data` folder, `UnityPlayer.dll`), Unreal Engine (`Binaries\Win64`, `Engine` folder), Godot, CryEngine, FMOD (`fmod.dll`, `fmodstudio.dll`), and SDL2 (`SDL2.dll`).
  - **Top-Level Depth**: Higher confidence given to binaries located in top-level game directories rather than nested utility subfolders.
  - **File Size Verification**: Excludes zero-byte stubs or binaries smaller than 128 KB from High confidence.
- Computes `ConfidenceLevel`: `High`, `Medium`, or `Low` with human-readable rationale.

### 3. Skip Rules Engine
Implemented in `src-tauri/src/scanner/rules.rs`:
- Standard skip rules with explainable reasons:
  - **Uninstallers**: `unins*.exe`, `uninstall*.exe`
  - **Crash Reporters**: `crashpad*.exe`, `*crash*report*.exe`, `unitycrashhandler*.exe`
  - **Updaters & Launchers**: `*updater*.exe`, `*patcher*.exe`
  - **Redistributables & Installers**: `dxsetup.exe`, `vcredist*.exe`, `dotNetFx*.exe`
  - **Anti-Cheat Helpers**: `easyanticheat*.exe`, `battleye*.exe`
  - **Benchmarks**: `*benchmark*.exe`
- Non-games are tagged `is_skipped = true` and deselected by default, but viewable via "Show Skipped" in the UI.

### 4. Background Cancellation & Progress Events
- Background scan runs asynchronously on `tokio::task::spawn_blocking`.
- Periodically checks an `Arc<AtomicBool>` cancellation token.
- Emits `folder-scan-progress` Tauri event containing current folder, folders checked, files examined, candidates found, and skipped count.
- If cancelled, the scan terminates cleanly without modifying the database.

### 5. Atomic Batch Import & Managed Sources
Implemented in `src-tauri/src/db/mod.rs`:
- Imports all selected candidates inside a single SQLite transaction.
- Preserves existing games and user overrides when re-scanning.
- Tracks roots in `scan_sources` (`id`, `path`, `normalized_path`, `depth`, `game_count`, `last_scanned_at`).
- Rescanning checks existing folder-sourced games; vanished binaries are marked `GameStatus::Missing`, never deleted from the database.

