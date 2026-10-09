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
│   │   ├── ScanRomsModal.tsx   # ROM discovery, multi-disc/multi-track grouping curation modal
│   │   ├── ArtworkPickerModal.tsx # Artwork selection modal (Cover, Hero, Logo, Icon, live search, locks)
│   │   ├── SettingsModal.tsx   # Preference modal (General, Appearance, Integrations, Emulators, Metadata, Diagnostics)
│   │   ├── EmptyState.tsx      # Friendly empty state when 0 games are loaded
│   │   └── Toast.tsx           # Error and status toast notification container
│   ├── config/
│   │   └── appConfig.ts        # Single source of truth for name, bundle ID, accent, logo
│   ├── fixtures/
│   │   └── mockGames.ts        # Dev-only mock games, stripped from production builds
│   ├── services/
│   │   ├── api.ts              # Typed API invoke wrapper with pure browser fallback
│   │   ├── artwork.ts          # SteamGridDB and artwork cache management service
│   │   ├── artwork.test.ts     # Frontend unit tests for artwork and metadata services
│   │   ├── emulators.ts        # Emulator profiles and ROM scanning service
│   │   ├── emulators.test.ts   # Frontend unit tests for emulator profiles and ROM grouping
│   │   ├── scanner.ts          # Scanner service with progress event listeners and mock fallback
│   │   ├── scanner.test.ts     # Frontend unit tests for scanner service and candidate import
│   │   └── steam.test.ts       # Fixture-based tests for VDF parser, library discovery, filtering
│   ├── types/
│   │   ├── api.ts              # TypeScript interfaces for commands, responses, ROM scanning
│   │   ├── artwork.ts          # Interfaces for candidates, cache stats, provider models
│   │   └── models.ts           # Game, LaunchAction, ArtworkAsset, EmulatorProfile
│   ├── utils/
│   │   └── artwork.ts          # Deterministic gradient, title initials, and asset URL resolver
│   ├── App.tsx                 # Root application container and state management
│   ├── index.css               # Tailwind tokens, dark/light themes, reduced-motion rules
│   └── main.tsx                # React DOM mount point
├── src-tauri/
│   ├── capabilities/
│   │   └── default.json        # Narrowly scoped Tauri 2 permissions (no arbitrary shell)
│   ├── migrations/
│   │   ├── 001_initial_schema.sql        # Core tables: games, overrides, artwork, etc.
│   │   ├── 002_phase2_manual_library.sql # Added normalized_path, last_launched_at, indexes
│   │   ├── 003_phase4_folder_scanner.sql # Added scan_sources table and index
│   │   ├── 004_phase5_emulators.sql      # Full emulator_profiles schema and seed profiles
│   │   └── 005_phase6_metadata_artwork.sql # Added locked_fields to overrides and asset indices
│   ├── src/
│   │   ├── cache/              # Local disk artwork caching & validation
│   │   │   ├── artwork.rs      # Atomic temp download, size/MIME verification, decoder check, stats
│   │   │   └── mod.rs
│   │   ├── commands/           # Typed Tauri IPC command handlers
│   │   │   ├── app.rs          # get_app_info
│   │   │   ├── artwork.rs      # SGDB key, candidates, apply, select local, clear cache, refresh metadata
│   │   │   ├── emulators.rs    # get/save/delete profiles, detect, validate, scan_rom_folder, import
│   │   │   ├── games.rs        # inspect_file, add_manual_game, launch_game, remove_game, etc.
│   │   │   ├── scanner.rs      # start_folder_scan, cancel_folder_scan, import_scan_candidates, scan sources
│   │   │   ├── settings.rs     # get_settings, set_setting
│   │   │   ├── steam.rs        # get_steam_status, rescan_steam, configure_steam_path, etc.
│   │   │   └── mod.rs
│   │   ├── db/                 # SQLite persistence layer
│   │   │   ├── migrations.rs   # Migration runner with automatic DB backup
│   │   │   ├── schema.rs       # Typed models (Game, LaunchAction tagged enum, ArtworkAsset)
│   │   │   └── mod.rs          # Database handle, WAL, artwork CRUD, locked fields, update from provider
│   │   ├── emulators/          # Emulator profiles, bounded detection, and ROM scanning
│   │   │   ├── detection.rs    # Bounded detection (Start Menu shortcuts, PATH, known install folders)
│   │   │   ├── profiles.rs     # Data models, argument templates, and verified built-in profiles
│   │   │   ├── rom_scanner.rs  # Safe BFS ROM discovery, CUE/BIN multi-track claiming, multi-disc pairing
│   │   │   └── mod.rs
│   │   ├── integrations/       # Platform store and emulator integrations
│   │   │   ├── steam/
│   │   │   │   ├── filter.rs   # Non-game filtering rules engine and user override evaluation
│   │   │   │   ├── scanner.rs  # Registry discovery, libraryfolders.vdf & appmanifest scanner
│   │   │   │   ├── vdf.rs      # Pure Rust recursive descent VDF/ACF tokenizer & AST parser
│   │   │   │   └── mod.rs      # High-level coordinator, status query, rescan orchestrator
│   │   │   └── mod.rs
│   │   ├── launcher/           # Process execution engine
│   │   │   └── mod.rs          # validate_and_launch via std::process::Command and protocol URIs
│   │   ├── metadata/           # Provider integration & title matching
│   │   │   ├── matching.rs     # Normalization, numeral canonicalization, sequel collision penalty
│   │   │   ├── provider.rs     # MetadataProvider trait, ArtworkRole, GameCandidate, ArtworkCandidate
│   │   │   ├── steamgriddb.rs  # SteamGridDB API v2 client, 4 req/sec token bucket, 429 retry backoff
│   │   │   └── mod.rs
│   │   ├── platform/           # Windows-specific system inspection
│   │   │   ├── credentials.rs  # Windows Credential Manager storage via keyring crate
│   │   │   ├── windows.rs      # Path normalization, PE version info, lnk resolution, URI activation
│   │   │   └── mod.rs
│   │   ├── scanner/            # Filesystem folder scanner engine
│   │   │   ├── classifier.rs   # Heuristic candidate classification, engine indicators, confidence scoring
│   │   │   ├── rules.rs        # Built-in exclusion lists, skip rules (uninstallers, updaters, crashpad)
│   │   │   ├── sources.rs      # ScanSource data models and parameters
│   │   │   └── mod.rs          # Safe BFS traversal, depth limits, progress callback, cancellation token
│   │   ├── error.rs            # AppError (thiserror) with custom frontend serialization
│   │   ├── logging.rs          # Structured rolling daily file logger (tracing)
│   │   ├── lib.rs              # App setup, path resolution, and command registration
│   │   └── main.rs             # Application entrypoint
│   ├── tests/
│   │   └── test_metadata_and_artwork.rs # Rust integration tests with mock HTTP server
│   ├── Cargo.toml              # Rust crate dependencies
│   ├── tauri.conf.json         # Tauri 2 window, security, asset protocol, CSP, and build settings
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

---

## Emulator Profiles & Emulated Games Pipeline

### 1. Data-Driven Profiles & Official Documentation Sources
Implemented in `src-tauri/src/emulators/profiles.rs`:
- **RetroArch**: Systems (`NES`, `SNES`, `Genesis`, `GBA`, `N64`, `PlayStation`), template `["-L", "{core}", "{rom}"]`, docs: [Libretro CLI docs](https://docs.libretro.com/development/retroarch/command-line-interface/).
- **Dolphin**: Systems (`Nintendo GameCube`, `Nintendo Wii`), template `["-b", "-e", "{rom}"]`, docs: [Dolphin CLI options](https://wiki.dolphin-emu.org/index.php?title=Command_Line_Options).
- **PCSX2**: Systems (`Sony PlayStation 2`), template `["-batch", "-nogui", "{rom}"]`, docs: [PCSX2 CLI usage](https://pcsx2.net/docs/usage/cli/).
- **DuckStation**: Systems (`Sony PlayStation`), template `["-batch", "{rom}"]`, docs: [DuckStation arguments](https://github.com/stenzek/duckstation#command-line-arguments).

### 2. Bounded Auto-Detection
Implemented in `src-tauri/src/emulators/detection.rs`:
- Evaluates known install paths with environment variable expansion (`%APPDATA%`, `%PROGRAMFILES%`, `%LOCALAPPDATA%`).
- Checks user and system Start Menu shortcuts with bounded depth (`depth <= 3`).
- Checks system `PATH` via Windows executable extensions (`.exe`).
- Strictly avoids full-disk traversal.

### 3. Smart ROM Directory Scanner & Grouping Engine
Implemented in `src-tauri/src/emulators/rom_scanner.rs`:
- **Safe Traversal**: Breadth-first traversal with configurable recursion depth limits (default 4).
- **CUE / BIN Multi-Track Grouping**: Parses `.cue` sheet `FILE` definitions, claims all referenced `.bin` tracks, and creates a single candidate entry for the `.cue` file.
- **M3U Playlist Grouping**: Identifies `.m3u` playlists, parses referenced disc files, and yields the playlist as the single candidate.
- **Multi-Disc Auto-Grouping**: Detects disc patterns (`(Disc 1)`, `(Disc 2)`, `(CD 1)`, `_Disc1`) without playlists, groups them under a single clean title, and sets `rom_path` to Disc 1 with linked paths recorded.
- **Title Cleansing**: Automatically strips region tags (`(USA)`, `(Europe)`, `(Japan)`), dump quality markers (`[!]`, `[b1]`, `(Rev 1)`), and disc suffixes.

### 4. Parameterized Process Launch Execution
Implemented in `src-tauri/src/launcher/mod.rs`:
- Emulated games execute via `LaunchAction::EmulatedGame { profile_id, rom_path, arg_overrides }`.
- Placeholders are expanded safely into individual entries of `Vec<String>` (never concatenated into shell strings):
  - `{rom}`: Absolute path to the ROM file.
  - `{game_dir}`: Directory containing the ROM file.
  - `{emulator_dir}`: Directory containing the emulator executable.
  - `{basename}`: Filename stem of the ROM file.
  - `{core}`: Absolute path to the Libretro core (validated and enforced for RetroArch).
- Process execution is verified through an end-to-end integration test (`test_e2e_fake_emulator_launch_and_argument_recording`) using a mock batch script that logs raw argument arrays.

### 5. How to Add a New Emulator Profile
1. **Via UI**:
   - Open **Preferences** (`SettingsModal`) > **Emulators** tab.
   - Click **Add Profile**.
   - Enter name (e.g., `RPCS3`), supported systems (`Sony PlayStation 3`), extensions (`.pkg, .iso`), executable path, and argument template (e.g. `["--no-gui", "{rom}"]`).
   - Click **Save Profile**.
2. **Via Code (Built-in Profile)**:
   - Add a new `EmulatorProfile` entry into `get_builtin_profiles()` in `src-tauri/src/emulators/profiles.rs`.
   - Seed migration `004_phase5_emulators.sql` inserts default profiles into the SQLite `emulator_profiles` table on first run.

---

## Metadata & Artwork Pipeline

### 1. SteamGridDB API v2 Integration & Rate Limiting
Implemented in `src-tauri/src/metadata/steamgriddb.rs`:
- Implements the `MetadataProvider` trait covering game searches, cover grids (600×900, 2:3), hero banners (1920×620, 96:31), transparent PNG logos, and square icons.
- **Token Bucket Rate Limiter**: Configured with a 260ms minimum inter-request interval (guaranteeing <= 4 requests/sec per SteamGridDB API guidelines).
- **Retry Backoff on HTTP 429**: Transparently catches 429 responses, inspects `Retry-After` headers (or computes exponential backoff), and retries up to 3 times before failing gracefully.

### 2. OS-Native Credential Security
Implemented in `src-tauri/src/platform/credentials.rs`:
- API keys are managed through the OS Credential Manager (`keyring` crate) under target `GameShelf` and account `steamgriddb_api_key`.
- Zero credentials stored in plain SQLite files, JSON configuration, or log files.
- Testing key validity checks `/api/v2/games/search/Terraria` without persisting unverified credentials.

### 3. Title Normalization & Matching Engine
Implemented in `src-tauri/src/metadata/matching.rs`:
- **Title Cleansing**: Strips noise and tags such as `[Remastered]`, `(GOTY Edition)`, `Director's Cut`, and release version tokens like `v1.0`.
- **Numeral Unification**: Roman numerals (`I`, `II`, `III`, `IV`, `V`) and Arabic numerals (`1`, `2`, `3`, `4`, `5`) are canonicalized to standard tokens during matching so `Doom II` and `Doom 2` achieve identical 1.0 similarity scores.
- **Sequel Collision Penalty**: Explicitly checks numeric tokens; mismatched sequel numbers (e.g., `Doom` vs `Doom II` or `Final Fantasy VII` vs `Final Fantasy VIII`) receive a heavy score penalty (0.35 ceiling) to prevent incorrect sequel matching.
- **Confidence Tiers**: Categorizes matches into `High` (>= 0.85 score), `Medium` (>= 0.60 score), or `Low` (< 0.60 score).

### 4. Atomic Validated Image Caching
Implemented in `src-tauri/src/cache/artwork.rs`:
- **Safety Caps**: Rejects files exceeding 20MB.
- **MIME & Header Verification**: Validates `Content-Type` against allowed types (`image/jpeg`, `image/png`, `image/webp`).
- **Decoder Structure Check**: Parses the image structure in-memory via the `image` crate (`image::load_from_memory`) before committing to disk, rejecting corrupt or truncated files.
- **Atomic File Writes**: Downloads to `<id>.tmp` first, and performs an atomic rename to the final destination upon successful decoding.
- **Local File Import**: Supports importing custom user image files directly into the cache directory.
- **Disk Management**: Provides cache size accounting and cache cleanup commands.

### 5. Webview Asset Protocol Serving & CSP
Configured in `src-tauri/tauri.conf.json` and `src/utils/artwork.ts`:
- Tauri `assetProtocol` is enabled via `features = ["protocol-asset"]` on the `tauri` dependency.
- Asset scope is strictly restricted to `["$APPDATA/**", "$CACHE/**"]`.
- `convertFileSrc` transforms absolute cached file paths into `http://asset.localhost/...` URLs, serving images through native streaming without IPC memory overhead.
- Fallback to remote source URLs or deterministic gradient initials on image error ensures no broken image icons ever appear in the UI.

### 6. User Choice Protection & Field Locking
Implemented in `src-tauri/migrations/005_phase6_metadata_artwork.sql` and `src-tauri/src/db/mod.rs`:
- `game_overrides.locked_fields`: Stores an array of locked fields (e.g. `["cover", "hero", "title"]`).
- When automatic metadata refreshes run, locked fields are skipped.
- Manual edits and user-picked artwork are permanently preserved across provider rescans.



