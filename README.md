# GameShelf

An original, modern, local-first game library and launcher for PC games, Steam titles, and emulated games.

GameShelf focuses on privacy, local-first performance, and elegant artwork presentation. It is **not** a game installer, ROM downloader, or DRM bypass.

---

## Features

### Foundation (Phase 1)
- **Sleek Custom Window Shell**: Native-respectful title bar with draggable areas, minimize, maximize, and close controls.
- **Design Token System**: Accessible dark-by-default palette (`#0E1015` background, `#151821` surface, `#7C6CFF` accent), Inter font, and 150ms ease-out transitions.
- **Reduced Motion Support**: Automatically adheres to OS `prefers-reduced-motion` settings.
- **Deterministic Placeholder Covers**: Generates attractive 2:3 card gradients with initials for games missing artwork.
- **Library Layouts**: Responsive cover grid with configurable card sizes and detailed list view toggle.
- **Settings Skeleton**: General preferences, Appearance (Dark / Light / System theme modes, view mode, card sizes), Library & Scan, Platform Integrations, Emulators, Metadata & Artwork, and Live Diagnostics.
- **Local SQLite Persistence**: Bundled `rusqlite` database with versioned migrations, WAL mode, foreign keys, and automatic pre-migration backups.
- **Structured File Logging**: `tracing-subscriber` daily rotating log files stored in the local application log directory.
- **Privacy Notice**: 100% local-first. No remote telemetry, cloud sync, or external tracking. Process-tree playtime tracking operates strictly on this machine in local SQLite and is completely opt-in.

### Manual Library & Direct Launch (Phase 2)
- **Add Game Workflow**: Seamless flow to add standalone executables (`.exe`) and Windows shortcuts (`.lnk`).
- **Smart Metadata & Title Inference**: Extracts PE file version info from executables, infers clean titles from filenames/stems, and extracts `.lnk` shell targets and arguments.
- **Duplicate Executable Detection**: Case-insensitive path normalization flags already-registered games with an option to "Open existing" or "Add anyway".
- **Direct Process Launch Engine**: Safe launching using `std::process::Command` and argument vectors (no shell execution strings). Handles spaces, Unicode, working directories, and environment variables.
- **Launch Settings Reconfiguration**: In-app modal to reconfigure target executable paths, working directories, launch flags, and arguments.
- **Non-Destructive User Metadata Overrides**: User edits to titles, tags, and notes are stored separately in `game_overrides` so future library refreshes never overwrite manual edits.
- **Explorer Integration**: "Open Folder" button reveals the installed game directory directly in Windows File Explorer.
- **Safe Game Removal**: "Remove from Library" deletes database records only, leaving game files on disk untouched.

### Steam Discovery and Launching (Phase 3)
- **Zero-Dependency Local Steam Discovery**: Detects local Steam via Windows Registry (`HKCU`/`HKLM`), standard system folders, or custom user-configured path without any Web API key or login credentials.
- **Multi-Library Discovery**: Parses `steamapps/libraryfolders.vdf` across all drives, supporting both legacy flat and modern nested formats.
- **Manifest Parser (`.acf`)**: High-performance recursive descent VDF parser correctly handling quoted strings, comments, escaped Windows paths, and case-insensitive keys.
- **Installed Status Verification**: Validates `StateFlags` and checks that the game folder exists before marking as `Installed`. Missing or disconnected libraries mark games as `Missing` without deleting them.
- **Explainable Non-Game Filtering**: Filters Steamworks Common Redistributables, Proton/Linux runtimes, SDKs, and dedicated server tools with editable rule toggles and explicit App ID overrides.
- **Idempotent Refresh**: Re-scanning updates installation status and paths without overwriting user-edited titles, notes, or tags.
- **Official Protocol Launch**: Launches Steam titles strictly via validated `steam://rungameid/<appid>` protocol URIs through the platform layer (never raw binaries).
- **Integrations Settings & Library Toggles**: Settings panel displays Steam status, detected libraries with individual enable/disable checkboxes, filter rule toggles, scan warnings, and a "Rescan Steam Library" trigger.
- **Real-Time Steam Badge Counter**: Sidebar navigation displays live counts of detected Steam games.

### Folder Scanner & Source Management (Phase 4)
- **Safe, Bounded Filesystem Scanner**: Recursively inspects user-selected directories with strict depth limits (default 4, configurable 1–6) and safeguards preventing scanning of drive roots (`C:\`) or Windows system folders.
- **Explainable Binary Classification**: Scores candidate executables (`High`, `Medium`, `Low`) based on PE product names, directory name matching, and game engine signatures (Unity `*_Data`, Unreal `Binaries`, FMOD, SDL2).
- **Built-in Skip Rules**: Automatically detects and skips non-game files (uninstallers, crash reporters, updaters, redistributables, anti-cheat helpers, benchmarks) with human-readable explanations.
- **Cancellable Background Scans**: Real-time progress streaming (`folder-scan-progress` event) reporting folders checked, files examined, and candidate count. Clean cancellation leaves the database untouched.
- **Preview & Curation Modal**: Full curation table before import allowing title editing, bulk select/deselect, confidence badge inspection, and viewing skipped items.
- **Atomic Batch Import**: Selected games are committed in a single SQLite transaction, preserving all user metadata overrides.
- **Managed Scan Folders**: Scan sources tracked in SQLite with one-click rescanning from Settings. Vanished games are marked `Missing` without deleting records or files.

### Emulator Profiles & Emulated Games (Phase 5)
- **Verified Data-Driven Profiles**: Pre-configured profiles for **RetroArch**, **Dolphin**, **PCSX2**, and **DuckStation** verified against official CLI documentation, plus a generic profile editor for user-defined emulators (RPCS3, PPSSPP, Cemu, mGBA, etc.).
- **Bounded Auto-Detection**: Discovers installed emulators via known paths (`%APPDATA%`, `%PROGRAMFILES%`, `%LOCALAPPDATA%`), Start Menu shortcuts (`.lnk`), and system `PATH` with strict depth limits (depth <= 3) and zero full-disk traversal.
- **System-Specific ROM Discovery**: Safe BFS directory scanning for profile-defined extensions (`.iso`, `.bin`, `.cue`, `.chd`, `.sfc`, `.nes`, etc.) with configurable recursion limits.
- **Intelligent Track & Disc Grouping**:
  - Parses `.cue` sheet files to automatically claim accompanying `.bin` audio/data tracks into a single playable candidate, hiding individual track clutter.
  - Groups multi-disc sets (`(Disc 1)`, `(Disc 2)`, `(CD 1)`) and `.m3u` playlists into a single candidate, pointing to Disc 1 or the playlist.
- **Title Cleansing**: Automatically strips region tags `(USA)`, dump tags `[!]`, and disc markers for clean display titles while retaining raw paths.
- **Safe Parameterized Launching**: Launch action `LaunchAction::EmulatedGame { profile_id, rom_path, arg_overrides }` expanding individual placeholders (`{rom}`, `{game_dir}`, `{emulator_dir}`, `{basename}`, `{core}`) directly into `std::process::Command` argument vectors with zero shell string concatenation, preserving spaces and quotes.
- **RetroArch Core Validation**: Enforces valid `core_path` when the `{core}` placeholder is present, preventing silent launch failures.
- **Curation & Management UI**:
  - In-app "Emulators" preferences panel to auto-detect emulators, view status (`Verified`, `ExecutableMissing`, `NeedsConfiguration`), edit templates/paths, run test launches, or delete custom profiles.
  - "Scan & Import ROMs" modal with profile/system selector, candidate table with multi-track and multi-disc grouping badges, inline title editing, and batch import.

### Metadata & Artwork Pipeline (Phase 6)
- **SteamGridDB API v2 Integration**: Client supporting games search, grids (covers), heroes (banners), logos, and icons, with token-bucket rate limiting (4 req/sec) and automatic exponential backoff on HTTP 429.
- **Secure OS Credential Storage**: User-provided API keys are stored in the Windows Credential Manager via the `keyring` crate. Secrets are never hardcoded, written to SQLite, or logged.
- **Title Normalization & Matching Engine**: Cleans edition/version strings (`Remastered`, `GOTY`, `v1.0`), unifies Roman and Arabic numerals (`Doom II` = `Doom 2`), disambiguates sequels, extracts release years, and produces scored matches (`High`, `Medium`, `Low`).
- **Atomic Validated Image Cache**:
  - Enforces a 20MB file cap and allowed MIME types (`image/jpeg`, `image/png`, `image/webp`).
  - Verifies image integrity by decoding image headers via the `image` crate.
  - Downloads to `.tmp` files first, performing an atomic rename to final storage on verification.
  - Disk cache management tools with usage reporting and safe cache clearing.
- **Zero-IPC Asset Protocol Serving**: Uses Tauri's `assetProtocol` (`convertFileSrc`) with narrow scope (`$APPDATA`, `$CACHE`) and tight Content Security Policy. Never sends full image byte payloads across IPC.
- **Field Locking & User Preference Protection**: Migration 5 added `locked_fields` to `game_overrides`. User-selected artwork roles and manual title/note overrides are strictly preserved across automated refreshes.
- **Artwork Picker Modal**: Comprehensive in-app modal with role tabs (`Cover`, `Hero`, `Logo`, `Icon`), live search, candidate gallery, local file picker, field lock toggling, and artwork removal.
- **Settings & Detail Panel Wiring**: Settings modal offers API key testing, save/remove, cache statistics, and privacy notes; `GameDetailPanel` renders hero banners and cover artwork with manual change triggers and one-click metadata refresh.

### Polish, Performance & Hardening (Phase 7)
- **First-Launch Onboarding Wizard**: 4-step wizard guiding new users through Steam detection, PC game folders/ROMs setup, and optional SteamGridDB key configuration. Completely skippable, persisted via SQLite `onboarding_completed`.
- **Windows Startup Registry Management**: Non-elevated Windows Registry integration (`HKCU\Software\Microsoft\Windows\CurrentVersion\Run\GameShelf`) allowing toggleable launch on system login.
- **Database Corruption Resilience**: Validates SQLite integrity (`PRAGMA quick_check;`) on startup. Automatically backs up corrupted databases as `<path>.corrupt.<timestamp>.db` and cleanly reinitializes without silent data destruction.
- **Sanitized Diagnostic Reporting**: Generates markdown diagnostic report omitting all private paths and tokens; "Open Logs Folder" action reveals logs in Windows Explorer.
- **1,000 Games Performance Architecture**:
  - Search input debounced by 150ms in `TopBar.tsx`.
  - Windowed incremental card rendering in `App.tsx` (initial 60 cards, expanding on scroll) guarantees smooth 60fps interaction and near-zero DOM overhead.
  - Benchmark-verified SQLite queries (< 32ms retrieval for 1,000 games, < 6ms search).
- **Settings Completeness**: Supports theme modes, 6 accent color presets, reduced motion override (system / always / never), card density modes, and tray behaviors.
- **Windows Production Installers**: Generates signed-ready MSI (`GameShelf_0.1.0_x64_en-US.msi`, 6.45 MiB) and NSIS setup (`GameShelf_0.1.0_x64-setup.exe`, 4.55 MiB).

### Local Playtime Tracking (Phase 8)
- **Local-Only & Opt-In**: Disabled by default (`playtime_tracking_enabled: false`), easily toggled in Settings General preferences. Zero network requests or telemetry.
- **Per-Launch Strategy**:
  - **Exact Process Tracking**: Background child process waiting (`child.wait()`) for standalone executables and emulator games with automatic `game-playtime-updated` events.
  - **Approximate Session Tracking**: Explicitly labeled `(Approximate)` indicator for protocol-based launchers (Steam `steam://rungameid/<id>`) with in-app active session tracking, live elapsed display, and session recording.
- **Most Played Sorting**: Conditional "Most Played" sort option in TopBar available exclusively when playtime tracking is enabled. Automatically resets to Title sort if tracking is toggled off.
- **Conditional Playtime Badges**: Playtime duration badges on GameCards in list and grid views visible only when tracking is enabled and playtime has been logged.
- **Per-Game Playtime Reset**: Secure reset action with confirmation dialog in `GameDetailPanel` allowing users to clear recorded playtime and session logs per game.

---

## Prerequisites

1. **Node.js**: v20+ (Node v24.19.0 recommended)
2. **pnpm**: v9+ (pnpm v12.10.1 installed)
3. **Rust Toolchain**: Rust stable `x86_64-pc-windows-msvc` (installed via [rustup.rs](https://rustup.rs))
4. **Visual Studio C++ Build Tools**: Visual Studio 2022 Build Tools with the "Desktop development with C++" workload (provides `link.exe` and Windows SDK libraries).
5. **WebView2 Runtime**: Standard on Windows 10/11.

---

## Development & Build Commands

### Frontend Development
```bash
# Install dependencies
pnpm install

# Run frontend test suite (Vitest)
pnpm test

# Run Vite dev server in browser preview mode
pnpm dev

# Build production frontend bundle
pnpm build
```

### Tauri Desktop App
```bash
# Run Tauri desktop app with hot reloading
pnpm tauri dev

# Build standalone production executable and installer
pnpm tauri build
```

### Rust Backend
```bash
cd src-tauri

# Format check
cargo fmt --check

# Format code
cargo fmt

# Check Rust codebase
cargo check

# Run Rust tests
cargo test
```

---

## Current Limitations

- **Out of Scope (v1)**: Other third-party store adapters (Epic, GOG, EA, Ubisoft), directory watchers, telemetry, and online accounts.
- **Drive Root Protection**: Bounded folder scanning excludes raw drive roots (`C:\`) to prevent scanning operating system directories.
- **SteamGridDB Key**: An API key from steamgriddb.com is required for third-party cover search (official Steam CDN covers and deterministic color fallbacks work automatically without a key).
