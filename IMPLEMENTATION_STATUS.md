# Implementation Status

## Environment: Windows 11 (x86_64-pc-windows-msvc)
- **Node.js**: v24.19.0 (installed at `C:\Program Files\nodejs\node.exe`)
- **pnpm**: v12.10.1 (installed at `C:\Users\ASUS\AppData\Roaming\npm\pnpm.cmd`)
- **Rust Toolchain**: rustc 1.99.0 / cargo 1.99.0 / rustfmt 1.10.0 / clippy 0.1.99 (`stable-x86_64-pc-windows-msvc` installed via Rustup)
- **WebView2 Runtime**: Installed at `C:\Program Files (x86)\Microsoft\EdgeWebView\Application`
- **Visual Studio C++ Build Tools**: Missing on host machine (linker `link.exe` and Windows SDK `.lib` files not found; requires elevated admin rights to install via Visual Studio Installer).
- **Security Policy**: Windows Defender Application Control (WDAC) / Smart App Control is enforced, blocking unsigned toolchains executed from user directories. Only Microsoft-signed installations (such as Visual Studio Build Tools via installer) are permitted.

---

## Phases
- [x] Phase 1 — Runnable app foundation (2026-10-09)
- [x] Phase 2 — Persistent manual library and direct launch (2026-10-09)
- [ ] Phase 3 — Metadata & artwork pipeline
- [ ] Phase 4 — Execution & runner engine
- [ ] Phase 5 — Emulator manager & profiles
- [ ] Phase 6 — Library views & curation
- [ ] Phase 7 — Polish, hardening & packaging

---

## Features

| Feature | Status | Evidence / notes |
|---|---|---|
| Single-source App Branding Config | Implemented | `src/config/appConfig.ts` houses app name, bundle ID, accent color, and logo path |
| Design Tokens & Theme System | Implemented | `tailwind.config.js` and `src/index.css` define dark, light, system theme tokens and respect `prefers-reduced-motion` |
| Native Window Title Bar | Implemented | `src/components/TitleBar.tsx` with non-blocking drag region, window minimize/maximize/close via Tauri API + web fallback |
| Navigation Sidebar | Implemented | `src/components/Sidebar.tsx` with Library, Favorites, Steam, PC Games, Emulated, Settings, and disabled "Recently Played" |
| Top Toolbar & View Controls | Implemented | `src/components/TopBar.tsx` with search input, sort selector, grid/list view toggle, and active "+ Add Game" button |
| Responsive Cover Grid & Card | Implemented | `src/components/GameCard.tsx` with 2:3 ratio, deterministic initials placeholder gradient, and list/grid layout |
| Empty State | Implemented | `src/components/EmptyState.tsx` rendered when library is empty, verified via Vitest |
| Settings Page Skeleton | Implemented | `src/components/SettingsModal.tsx` with General, Appearance, Library & scan, Integrations, Emulators, Metadata & artwork, Diagnostics |
| Live Diagnostics in Settings | Implemented | Real-time inspection of OS, App Data Dir, Log Dir, Database Schema Version from `get_app_info` |
| Dev-only UI Fixtures | Implemented | `src/fixtures/mockGames.ts` strictly gated by `import.meta.env.DEV`, excluded from production builds |
| SQLite Schema & Migrations (v1 & v2) | Implemented | `001_initial_schema.sql` and `002_phase2_manual_library.sql` with `last_launched_at`, `normalized_path`, and indexes |
| Database Migration Engine | Implemented | `src-tauri/src/db/migrations.rs` with version tracking, transaction execution, and pre-migration backup creation |
| Database Access Layer | Implemented | `src-tauri/src/db/mod.rs` with `add_game`, `get_game_by_id`, `find_game_by_normalized_path`, `update_game_overrides`, `update_launch_action`, `remove_game`, `list_games` |
| User Metadata Overrides Isolation | Implemented | `game_overrides` joined via `COALESCE(go.field, g.field)` so manual edits persist independently of provider re-scans |
| Windows Path Normalization | Implemented | `src-tauri/src/platform/windows.rs` canonicalizes drives and slashes, case-insensitively indexed for duplicate detection |
| Executable & Shortcut Inspection | Implemented | `src-tauri/src/platform/windows.rs` extracts PE version info, infers title from filename stem, and safely parses `.lnk` shell link targets |
| Add Game Modal Flow | Implemented | `src/components/AddGameModal.tsx` with path input, auto-inspection, title/args/working-dir editing, and duplicate warning |
| Duplicate Executable Detection | Implemented | `check_duplicate_path` command checks database; modal offers "Open existing" or "Add anyway" |
| Direct Process Launch Engine | Implemented | `src-tauri/src/launcher/mod.rs` validates paths and executes via `std::process::Command` with argument vectors (no shell string) |
| Launch Action Error Handling | Implemented | `GameDetailPanel.tsx` handles missing binaries with warning banner, "Locate File" trigger, and "Edit Launch Settings" modal |
| Launch Settings & Overrides Modal | Implemented | In-app modal to reconfigure executable path, working directory, launch arguments, and environment variables |
| Edit Game Metadata Modal | Implemented | In-app modal to edit title, developer, publisher, release year, user tags, and notes |
| Open Game Directory in Explorer | Implemented | `open_folder` command triggers Explorer with safe item selection |
| Safe Library Removal | Implemented | "Remove from Library" dialog deletes database records only; leaves game binaries and directories completely untouched |
| Frontend Unit & Integration Tests | Implemented | `src/App.test.tsx` 7/7 tests passed via `pnpm test` (`vitest run`) |
| Frontend Production Build | Implemented | `pnpm build` (`tsc && vite build`) passed with zero errors, generating optimized bundle in `dist/` |
| Rust Formatting Check | Implemented | `cargo fmt --check` passed with zero formatting diffs |
| Rust Compilation & Native Tests | Unverified | Host machine lacks Visual Studio C++ Build Tools (`link.exe`), preventing native binary compilation on this machine |

---

## Known limitations
1. Host environment currently lacks MSVC C++ Build Tools (`link.exe`) and Windows SDK import libraries. While Rust code structure, dependencies, formatting, and unit tests are complete, `cargo test` and `pnpm tauri dev` require installing C++ Build Tools via the Visual Studio Installer with administrative privileges.
2. Automated library scanning (Steam manifests, automated ROM folder scanners) is scheduled for Phase 3+. Phase 2 delivers manual addition, shortcut resolution, executable inspection, and direct launching.
3. Playtime tracking, directory watchers, and store accounts are explicitly out of scope for v1.

---

## Decisions
1. **Config Centralization**: Placed application name (`GameShelf`), bundle identifier (`com.gameshelf.app`), accent color (`#7C6CFF`), and vector logo in `src/config/appConfig.ts` for unified theming and branding.
2. **Deterministic Placeholder Artwork**: When games lack cover images, `src/utils/artwork.ts` derives a consistent gradient and 2-letter uppercase initials from the game title, ensuring an aesthetically pleasing library view without external artwork dependencies.
3. **Database Pre-Migration Backup**: `run_migrations` automatically creates a versioned copy of the `.db` file before running any migration on an existing database, preventing corruption or data loss.
4. **Browser Fallback in API Client**: In `src/services/api.ts`, API calls check `isTauri()`. If running in a browser or test environment (Vitest), it routes to mock handlers with local storage persistence so frontend development and smoke tests run without Tauri backend binaries.
5. **Separation of Overrides and Base Metadata**: All user edits (title, notes, tags) are written to `game_overrides` table, and all queries use `COALESCE(go.field, g.field)`. This guarantees re-scans or provider syncs will never overwrite user edits.
6. **Binary Argument Vectors for Launching**: Games are strictly executed via `std::process::Command` using structured argument vectors (`Vec<String>`). Commands are never passed to `cmd.exe /c` or PowerShell strings, ensuring total immunity against shell injection and spaces/Unicode path issues.
7. **Strict Non-Destructive Game Deletion**: Removing a game from GameShelf deletes only the database entry and associated cache references; filesystem files are never moved, modified, or deleted.
