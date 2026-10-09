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
- [x] Phase 4 — Folder scanner & source management (2026-10-09)
- [x] Phase 5 — Emulator Profiles and Emulated Games (2026-10-09)
- [x] Phase 6 — Metadata & artwork pipeline (2026-10-10)
- [ ] Phase 7 — Polish, hardening & packaging

---

## Features

| Feature | Status | Evidence / notes |
|---|---|---|
| Single-source App Branding Config | Implemented | `src/config/appConfig.ts` houses app name, bundle ID, accent color, and logo path |
| Design Tokens & Theme System | Implemented | `tailwind.config.js` and `src/index.css` define dark, light, system theme tokens and respect `prefers-reduced-motion` |
| Native Window Title Bar | Implemented | `src/components/TitleBar.tsx` with non-blocking drag region, window minimize/maximize/close via Tauri API + web fallback |
| Navigation Sidebar with Real Counts | Implemented | `src/components/Sidebar.tsx` with Library, Favorites, Steam Games (real counter badge), PC Games, Emulated, and Settings |
| Top Toolbar & View Controls | Implemented | `src/components/TopBar.tsx` with search input, sort selector, grid/list view toggle, active "+ Add Game", "Scan Folder", and "Scan ROMs" buttons |
| Responsive Cover Grid & Card | Implemented | `src/components/GameCard.tsx` with 2:3 ratio, deterministic initials placeholder gradient, and list/grid layout |
| Empty State | Implemented | `src/components/EmptyState.tsx` rendered when library is empty with "Scan Folder for Games", "Scan for ROMs", and "Add Single Game" actions |
| Settings Page Skeleton | Implemented | `src/components/SettingsModal.tsx` with General, Appearance, Library & scan, Integrations, Emulators, Metadata & artwork, Diagnostics |
| Live Diagnostics in Settings | Implemented | Real-time inspection of OS, App Data Dir, Log Dir, Database Schema Version from `get_app_info` |
| Dev-only UI Fixtures | Implemented | `src/fixtures/mockGames.ts` strictly gated by `import.meta.env.DEV`, excluded from production builds |
| SQLite Schema & Migrations (v1, v2, v3, v4) | Implemented | `001_initial_schema.sql`, `002_phase2_manual_library.sql`, `003_phase4_folder_scanner.sql`, `004_phase5_emulators.sql` with `emulator_profiles` table |
| Database Migration Engine | Implemented | `src-tauri/src/db/migrations.rs` with version tracking, transaction execution, and pre-migration backup creation |
| Database Access Layer | Implemented | `src-tauri/src/db/mod.rs` with manual, Steam, folder scan, and emulator profile CRUD, batch ROM import, and vanished ROM file marking |
| User Metadata Overrides Isolation | Implemented | `game_overrides` joined via `COALESCE(go.field, g.field)` so manual edits persist independently of provider re-scans |
| Windows Path Normalization | Implemented | `src-tauri/src/platform/windows.rs` canonicalizes drives and slashes, case-insensitively indexed for duplicate detection |
| Executable & Shortcut Inspection | Implemented | `src-tauri/src/platform/windows.rs` extracts PE version info, infers title from filename stem, and safely parses `.lnk` shell link targets |
| Add Game Modal Flow | Implemented | `src/components/AddGameModal.tsx` with path input, auto-inspection, title/args/working-dir editing, and duplicate warning |
| Duplicate Executable Detection | Implemented | `check_duplicate_path` command checks database; modal offers "Open existing" or "Add anyway" |
| Direct Process Launch Engine | Implemented | `src-tauri/src/launcher/mod.rs` validates paths and executes via `std::process::Command` with argument vectors (no shell execution strings) |
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
| Safe Bounded Folder Scanner | Implemented | `src-tauri/src/scanner/mod.rs` enforces depth limits (default 4, max 6), blocks drive roots (`C:\`) and Windows system folders |
| Candidate Classifier & Heuristics | Implemented | `src-tauri/src/scanner/classifier.rs` computes confidence (High/Medium/Low) using PE headers, directory matching, and engine signatures |
| Built-in Skip Rules Engine | Implemented | `src-tauri/src/scanner/rules.rs` skips uninstallers, crash reporters, updaters, redistributables, anticheat helpers, and benchmarks |
| Cancellable Background Scan | Implemented | `cancel_folder_scan` Tauri command and `AtomicBool` cancellation token emit live progress via `folder-scan-progress` event |
| Curation & Review Modal | Implemented | `src/components/ScanFolderModal.tsx` with bulk select/deselect, confidence badges, explainable reasons, and inline title editing |
| Atomic Batch Import Transaction | Implemented | `import_scan_candidates` command executes in a single SQLite transaction, preserving user overrides and leaving DB clean on cancellation |
| Managed Scan Roots & Rescan | Implemented | `scan_sources` table tracks directories and depths; rescan detects vanished files and marks them `Missing` without deleting records |
| Data-Driven Emulator Profiles | Implemented | `src-tauri/src/emulators/profiles.rs` with verified profiles for RetroArch, Dolphin, PCSX2, DuckStation, and custom user profiles |
| Bounded Emulator Detection | Implemented | `src-tauri/src/emulators/detection.rs` checks known paths (`%APPDATA%`, `%PROGRAMFILES%`), Start Menu shortcuts, and `PATH` |
| Safe Bounded ROM Scanner | Implemented | `src-tauri/src/emulators/rom_scanner.rs` with BFS queue, depth bounding, and profile extension matching |
| CUE / BIN Multi-Track Grouping | Implemented | Parses `.cue` sheet `FILE` lines, claims `.bin` audio/data tracks, produces single playable candidate |
| M3U Playlist & Multi-Disc Pairing | Implemented | Identifies `.m3u` playlists and groups `(Disc 1)`, `(Disc 2)`, `(CD 1)` sets into single clean candidates |
| ROM Title Cleaning Heuristics | Implemented | `clean_rom_title` strips region tags `(USA)`, dump tags `[!]`, and disc markers for clean display titles |
| Parameterized Emulated Launch Engine | Implemented | `src-tauri/src/launcher/mod.rs` expands `{rom}`, `{game_dir}`, `{emulator_dir}`, `{basename}`, `{core}` as individual argument vector entries (zero shell strings) |
| RetroArch Core Validation & Enforcement | Implemented | Validates presence of `core_path` if `{core}` placeholder is used, failing with clean actionable error |
| End-to-End Fake Emulator Launch Test | Implemented | `launcher::tests::test_e2e_fake_emulator_launch_and_argument_recording` verifies argument vector logging via batch script |
| Emulator Management in Settings | Implemented | `src/components/SettingsModal.tsx` with auto-detect, profile card list, ready/missing/config status badges, profile editor, and test launch modal |
| Scan & Import ROMs Modal | Implemented | `src/components/ScanRomsModal.tsx` with profile selection, system filter, candidate preview table, multi-track badges, and batch import |
| SteamGridDB API v2 Client | Implemented | `src-tauri/src/metadata/steamgriddb.rs` with token-bucket throttle (4 req/sec), 429 retry backoff, endpoint mapping for games, grids, heroes, logos, and icons |
| Secure Credential Storage via OS Keyring | Implemented | `src-tauri/src/platform/credentials.rs` stores API key in Windows Credential Manager via `keyring` crate; no plain secrets in logs or SQLite |
| Title Normalization & Matching Engine | Implemented | `src-tauri/src/metadata/matching.rs` strips edition/version tags, standardizes Roman/Arabic numerals, disambiguates sequels, assigns High/Medium/Low confidence tiers |
| Atomic Validated Artwork Cache | Implemented | `src-tauri/src/cache/artwork.rs` enforces 20MB limit, image/jpeg, png, webp MIME validation, image decoding verification via `image` crate, atomic `.tmp` to final rename |
| Disk Cache Management & Telemetry | Implemented | `get_cache_stats` computes file count and formatted size; `clear_artwork_cache` cleans unselected and cached artwork safely |
| Tauri Asset Protocol Webview Serving | Implemented | `convertFileSrc` served via Tauri `assetProtocol` scoped to AppData and Cache with CSP; image bytes never transmitted over IPC |
| Database Field Locking & User Choice Protection | Implemented | Migration 5 added `locked_fields` to `game_overrides`; user edits and manual artwork selections never overwritten during re-scans |
| ArtworkPickerModal Component | Implemented | `src/components/ArtworkPickerModal.tsx` supports Cover (2:3), Hero, Logo, Icon role tabs, live search, candidate gallery, local file picker, and lock toggles |
| Metadata & Artwork Settings Panel | Implemented | `src/components/SettingsModal.tsx` provides masked API key input, connection testing, save/remove actions, cache usage stats, cache clearing, and privacy notice |
| GameCard & GameDetailPanel Artwork Integration | Implemented | `GameCard.tsx` and `GameDetailPanel.tsx` wire `resolveArtworkSrc` with broken-image fallback to deterministic initials, hero banner display, change artwork modal, and refresh metadata button |
| Frontend Unit & Integration Tests | Implemented | 38/38 tests passing (`src/services/artwork.test.ts`, `src/services/steam.test.ts`, `src/services/scanner.test.ts`, `src/services/emulators.test.ts`, `src/App.test.tsx`) via `vitest run` |
| Frontend Production Build | Implemented | `pnpm build` (`tsc && vite build`) passed with zero errors, generating optimized bundle in `dist/` |
| Rust Formatting Check | Implemented | `cargo fmt --check` passed with zero formatting diffs across all backend files |
| Rust Native Unit & Integration Tests | Implemented | 69/69 tests passing (61 unit tests + 8 integration tests in `tests/test_metadata_and_artwork.rs`) via `cargo test` |
| Rust Clippy Lints | Implemented | `cargo clippy -- -D warnings` passed with 0 warnings |
| Desktop App Packaging (MSI & NSIS) | Implemented | `pnpm tauri build` succeeded, generating `gameshelf.exe`, MSI installer (6.38 MiB), and NSIS installer (4.51 MiB) |

---

## Known limitations
1. Steam Web API ownership import, store login scraping, and non-installed games are strictly out of scope for v1.
2. Playtime tracking, background directory watchers, and store accounts are explicitly out of scope for v1.
3. Windows drive roots (`C:\`, `D:\`) cannot be selected directly as scan roots for system protection; users must specify a game directory.
4. SteamGridDB searches require an API key supplied by the user via Settings (free from steamgriddb.com); games without a key gracefully fallback to deterministic gradient initials and official Steam CDN assets for Steam titles.

---

## Decisions
1. **Zero-Dependency Minimal VDF Parser**: Built an in-tree recursive descent tokenizer and parser in `src-tauri/src/integrations/steam/vdf.rs` handling quoted keys, nested sections, comments (`//`), escaped backslashes/quotes, and case-insensitive queries without external crates.
2. **Dual-Format Library Support**: Parses `libraryfolders.vdf` supporting both legacy flat structure (`"1" "D:\\SteamLibrary"`) and modern nested section structure (`"0" { "path" "..." "apps" { ... } }`).
3. **Registry Discovery via Windows Built-in Tools**: Uses Windows registry query (`HKCU\Software\Valve\Steam\SteamPath`, `HKLM\SOFTWARE\WOW6432Node\Valve\Steam\InstallPath`) to locate Steam without elevated privileges or third-party crates.
4. **Explainable and Editable Filtering**: Non-game redistributables (AppID 228980), Proton runtimes, SDKs, and dedicated servers are filtered via an explainable rule list where users can toggle rules or explicitly include individual App IDs.
5. **Protocol-Only Steam Launching**: Steam titles are strictly launched via validated protocol URIs (`steam://rungameid/<appid>`). Raw executables are never launched directly for Steam-managed titles.
6. **Non-Destructive Library Updates**: Games whose library folder is disconnected are marked `Missing`, never deleted. Re-scanning updates base game fields while strictly preserving all user edits in `game_overrides`.
7. **Safe Folder Scanning Guardrails**: Protects system folders (`Windows`, `Program Files\WindowsApps`, AppData system folders) and bare drive roots from bulk scans. Traversal is bounded by a configurable depth limit (default 4) with relative path exclusion filtering.
8. **Explainable Binary Classification**: Rather than treating every `.exe` equally, GameShelf inspects PE product names, directory name matching, and engine signatures (Unity `*_Data`, Unreal `Binaries`, FMOD, SDL2) to assign explainable `High`, `Medium`, or `Low` confidence ratings.
9. **Atomic Batch Import**: DB writes occur strictly upon user confirmation in `import_scan_candidates`. Mid-scan cancellations leave the database in an untouched, clean state.
10. **OS-Level Credential Protection**: SteamGridDB API keys are stored exclusively in the Windows Credential Manager via the `keyring` crate under service name `GameShelf`. Keys are never written to disk, SQLite, or log outputs.
11. **Roman & Arabic Numeral Sequel Disambiguation**: Number tokens are canonicalized to a unified representation during title normalization so that e.g. "Doom II" and "Doom 2" match identically, while mismatched sequels (e.g. "Doom" vs "Doom II") receive a heavy score penalty to avoid false positive sequel matches.
12. **Asset Protocol Zero-IPC Image Serving**: Cached artwork images are served directly through Tauri's `assetProtocol` (`convertFileSrc`) with paths locked down to `$APPDATA` and `$CACHE` directories. Large image byte payloads are never transmitted across the IPC bridge.
13. **Strict Field Locking**: The `game_overrides.locked_fields` array preserves user-selected artwork roles and metadata overrides. When automatic metadata or artwork refreshes occur, locked fields are unconditionally skipped.
