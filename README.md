# GameShelf

An original, modern, local-first game library and launcher for PC games, Steam titles, and emulated games.

GameShelf focuses on privacy, local-first performance, and elegant artwork presentation. It is **not** a game installer, ROM downloader, or DRM bypass.

---

## Features (Phase 1 — Foundation)

- **Sleek Custom Window Shell**: Native-respectful title bar with draggable areas, minimize, maximize, and close controls.
- **Design Token System**: Accessible dark-by-default palette (`#0E1015` background, `#151821` surface, `#7C6CFF` accent), Inter font, and 150ms ease-out transitions.
- **Reduced Motion Support**: Automatically adheres to OS `prefers-reduced-motion` settings.
- **Deterministic Placeholder Covers**: Generates attractive 2:3 card gradients with initials for games missing artwork.
- **Library Layouts**: Responsive cover grid with configurable card sizes and detailed list view toggle.
- **Game Inspection Panel**: Inspects titles, developers, status, genres, and typed launch actions.
- **Settings Skeleton**: General preferences, Appearance (Dark / Light / System theme modes, view mode, card sizes), Library & Scan, Platform Integrations, Emulators, Metadata & Artwork, and Live Diagnostics.
- **Local SQLite Persistence**: Bundled `rusqlite` database with versioned migrations, WAL mode, foreign keys, and automatic pre-migration backups.
- **Structured File Logging**: `tracing-subscriber` daily rotating log files stored in the local application log directory.
- **Privacy Notice**: 100% local-first. No telemetry, no session tracking, and no cloud dependencies.

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

# Run frontend tests
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

- **Visual Studio C++ Build Tools**: Linking Rust executables requires Visual Studio C++ Build Tools (`link.exe` and Windows SDK) installed with admin rights.
- **Scanner & Importer**: Automated scanning for Steam libraries, ROM folders, and standalone executables arrives in **Phase 2**.
- **Artwork Provider**: SteamGridDB metadata and cover art fetching arrives in **Phase 3**.
- **Game Execution Engine**: Launching games through Steam URIs, executables, and emulator profiles arrives in **Phase 4**.
- **Out of Scope (v1)**: Epic/GOG/EA store adapters, playtime tracking, directory watchers, telemetry, and accounts.
