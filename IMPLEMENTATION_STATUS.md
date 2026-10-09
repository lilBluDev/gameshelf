# Implementation Status

## Environment: Windows 11 (x86_64-pc-windows-msvc)
- **Node.js**: v24.19.0 (installed at `C:\Program Files\nodejs\node.exe`)
- **pnpm**: v12.10.1 (installed at `C:\Users\ASUS\AppData\Roaming\npm\pnpm.cmd`)
- **Rust Toolchain**: rustc 1.99.0 / cargo 1.99.0 / rustfmt 1.10.0 / clippy 0.1.99 (`stable-x86_64-pc-windows-msvc` installed via Rustup)
- **WebView2 Runtime**: Installed at `C:\Program Files (x86)\Microsoft\EdgeWebView\Application`
- **Visual Studio C++ Build Tools**: Installed (`link.exe` and Windows SDK libraries detected and verified via MSVC toolchain).
- **Security Policy**: Smart App Control disabled by user, allowing local Cargo build scripts and debug/release compilation to execute smoothly.

---

## Phases
- [x] Phase 1 — Runnable app foundation (2026-10-09)
- [x] Phase 2 — Persistent manual library and direct launch (2026-10-09)
- [x] Phase 3 — Steam discovery and launching (2026-10-09)
- [ ] Phase 4 — Metadata & artwork pipeline
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
| Navigation Sidebar with Real Counts | Implemented | `src/components/Sidebar.tsx` with Library, Favorites, Steam Games (real counter badge), PC Games, Emulated, and Settings |
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
| Pure Rust VDF / ACF Parser | Implemented | `src-tauri/src/integrations/steam/vdf.rs` with recursive descent tokenizer, escape parsing, case-insensitivity, and zero regex |
| Local Steam Platform Discovery | Implemented | `src-tauri/src/integrations/steam/scanner.rs` queries Windows Registry (`HKCU`/`HKLM`), standard paths, and user custom override |
| Steam Library Folder Discovery | Implemented | Parses `steamapps/libraryfolders.vdf` in both legacy flat and modern nested formats; tolerant of disconnected/offline drives |
| Steam App Manifest Scanner | Implemented | Parses `steamapps/appmanifest_<appid>.acf`, checks `StateFlags & 4` and disk directory presence, sets `Installed` or `Missing` |
| Non-Game Filter Rules Engine | Implemented | `src-tauri/src/integrations/steam/filter.rs` filters Common Redistributables, Proton, Linux Runtimes, SDKs, and Dedicated Servers |
| User Explicit Inclusion Overrides | Implemented | User can override filtering per App ID or toggle individual rules in Settings |
| Idempotent Steam Game Import | Implemented | `src-tauri/src/db/mod.rs` `upsert_steam_game` updates install paths and status without touching user title/notes/tags overrides |
| Vanished Library Tolerant Handling | Implemented | Games whose library drive is offline/removed are marked `GameStatus::Missing`, never deleted from the database |
| Steam Protocol Launch Engine | Implemented | `src-tauri/src/platform/windows.rs` validates positive App IDs, builds `steam://rungameid/<id>`, and activates via OS protocol handler |
| Integrations Settings Panel | Implemented | `src/components/SettingsModal.tsx` shows Steam status, detected path, library toggles, rule toggles, warnings, and rescan trigger |
| Frontend Unit & Integration Tests | Implemented | `src/services/steam.test.ts` & `src/App.test.tsx` 13/13 tests passed via `pnpm test` (`vitest run`) |
| Frontend Production Build | Implemented | `pnpm build` (`tsc && vite build`) passed with zero errors, generating optimized bundle in `dist/` |
| Rust Formatting Check | Implemented | `cargo fmt --check` passed with zero formatting diffs across all backend files |
| Rust Compilation & Native Tests | Implemented | `cargo test` 33/33 tests passed, `cargo clippy -- -D warnings` passed with 0 warnings |
| Desktop App Packaging (MSI & NSIS) | Implemented | `pnpm tauri build` passed, generating `gameshelf.exe`, MSI installer (4.47 MiB), and NSIS installer (3.09 MiB) |

---

## Known limitations
1. Steam Web API ownership import, store login scraping, and non-installed games are strictly out of scope for v1.
2. Playtime tracking, directory watchers, and store accounts are explicitly out of scope for v1.

---

## Decisions
1. **Zero-Dependency Minimal VDF Parser**: Built an in-tree recursive descent tokenizer and parser in `src-tauri/src/integrations/steam/vdf.rs` handling quoted keys, nested sections, comments (`//`), escaped backslashes/quotes, and case-insensitive queries without external crates.
2. **Dual-Format Library Support**: Parses `libraryfolders.vdf` supporting both legacy flat structure (`"1" "D:\\SteamLibrary"`) and modern nested section structure (`"0" { "path" "..." "apps" { ... } }`).
3. **Registry Discovery via Windows Built-in Tools**: Uses Windows registry query (`HKCU\Software\Valve\Steam\SteamPath`, `HKLM\SOFTWARE\WOW6432Node\Valve\Steam\InstallPath`) to locate Steam without elevated privileges or third-party crates.
4. **Explainable and Editable Filtering**: Non-game redistributables (AppID 228980), Proton runtimes, SDKs, and dedicated servers are filtered via an explainable rule list where users can toggle rules or explicitly include individual App IDs.
5. **Protocol-Only Steam Launching**: Steam titles are strictly launched via validated protocol URIs (`steam://rungameid/<appid>`). Raw executables are never launched directly for Steam-managed titles.
6. **Non-Destructive Library Updates**: Games whose library folder is disconnected are marked `Missing`, never deleted. Re-scanning updates base game fields while strictly preserving all user edits in `game_overrides`.
