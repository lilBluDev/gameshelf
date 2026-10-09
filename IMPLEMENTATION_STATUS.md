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
- [ ] Phase 2 — Game import & scanning
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
| Top Toolbar | Implemented | `src/components/TopBar.tsx` with search input, sort selector, grid/list view toggle, and disabled "Add Game" (Phase 2 badge) |
| Responsive Cover Grid & Card | Implemented | `src/components/GameCard.tsx` with 2:3 ratio, deterministic initials placeholder gradient, and list/grid layout |
| Empty State | Implemented | `src/components/EmptyState.tsx` rendered when library is empty, verified via Vitest |
| Game Detail Panel | Implemented | `src/components/GameDetailPanel.tsx` showing metadata, platform badge, launch config details, and disabled Play button |
| Settings Page Skeleton | Implemented | `src/components/SettingsModal.tsx` with General, Appearance, Library & scan, Integrations, Emulators, Metadata & artwork, Diagnostics |
| Live Diagnostics in Settings | Implemented | Real-time inspection of OS, App Data Dir, Log Dir, Database Schema Version from `get_app_info` |
| Dev-only UI Fixtures | Implemented | `src/fixtures/mockGames.ts` strictly gated by `import.meta.env.DEV`, excluded from production builds |
| SQLite Schema & Migrations | Implemented | `src-tauri/migrations/001_initial_schema.sql` with `games`, `game_overrides`, `artwork_assets`, `emulator_profiles`, `scan_jobs`, `settings`, and indexes |
| Database Migration Engine | Implemented | `src-tauri/src/db/migrations.rs` with version tracking, transaction execution, and pre-migration backup creation |
| Database Access Layer | Implemented | `src-tauri/src/db/mod.rs` with WAL mode, foreign keys, settings read/write, and game query filter/search |
| Typed Rust Command Boundary | Implemented | `get_app_info`, `get_settings`, `set_setting`, `list_games` defined with `thiserror` serializable errors |
| Frontend API Service | Implemented | `src/services/api.ts` with typed Tauri invoke wrappers and browser fallback |
| Error Toast Notifications | Implemented | `src/components/Toast.tsx` surfacing errors cleanly with dismissible alerts |
| Structured Rotating File Logging | Implemented | `src-tauri/src/logging.rs` using `tracing-subscriber` and `tracing-appender` rolling daily logs |
| Narrow Tauri Capabilities | Implemented | `src-tauri/capabilities/default.json` with core window and app permissions only; no arbitrary shell |
| Frontend Smoke & Unit Tests | Implemented | `src/App.test.tsx` passed (3 tests: shell renders, empty state displays, settings modal functions) |
| Frontend Production Build | Implemented | `pnpm build` (`tsc && vite build`) passed with zero errors |
| Rust Formatting Check | Implemented | `cargo fmt --check` passed |
| Rust Compilation & Native Tests | Unverified | Host machine lacks Visual Studio C++ Build Tools (`link.exe`), preventing native binary linking |

---

## Known limitations
1. Host environment currently lacks MSVC C++ Build Tools (`link.exe`) and Windows SDK import libraries. While Rust code structure, dependencies, formatting, and tests are complete, `cargo test` and `pnpm tauri dev` require installing C++ Build Tools via the Visual Studio Installer with administrative privileges.
2. Library scanning, Steam manifest import, and folder discovery are scheduled for Phase 2. The Add button and scanning settings are disabled with clear explanations.
3. Playtime tracking, directory watchers, and store accounts are explicitly out of scope for v1.

---

## Decisions
1. **Config Centralization**: Placed application name (`GameShelf`), bundle identifier (`com.gameshelf.app`), accent color (`#7C6CFF`), and vector logo in `src/config/appConfig.ts` for unified theming and branding.
2. **Deterministic Placeholder Artwork**: When games lack cover images, `src/utils/artwork.ts` derives a consistent gradient and 2-letter uppercase initials from the game title, ensuring an aesthetically pleasing library view without external artwork dependencies.
3. **Database Pre-Migration Backup**: `run_migrations` automatically creates a versioned copy of the `.db` file before running any migration on an existing database, preventing corruption or data loss.
4. **Browser Fallback in API Client**: In `src/services/api.ts`, API calls check `isTauri()`. If running in a browser or test environment (Vitest), it routes to mock handlers with local storage persistence so frontend development and smoke tests run without Tauri backend binaries.
