import {
  AddManualGamePayload,
  AppInfo,
  AppSettings,
  CommandError,
  DuplicateCheckResponse,
  InspectFileResponse,
  LaunchResult,
  ListGamesQuery,
  ListGamesResponse,
  SetSettingPayload,
  UpdateGamePayload,
  UpdateLaunchSettingsPayload,
  SteamScanResult,
  SteamStatusResponse,
} from '../types/api';
import { Game, GameSession } from '../types/models';
import { DEV_MOCK_GAMES } from '../fixtures/mockGames';

// Detect whether we are running inside the Tauri webview runtime
export const isTauri = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
};

// Typed invoke helper with error handling
async function callTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<T>(cmd, args);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && 'message' in err) {
        throw err as CommandError;
      }
      throw {
        code: 'INVOKE_FAILED',
        message: typeof err === 'string' ? err : 'Unknown error during command execution',
        details: JSON.stringify(err),
      } as CommandError;
    }
  }

  // Graceful browser / test fallback
  return fallbackHandler<T>(cmd, args);
}

// In-memory / localStorage game store for browser preview mode
let previewGames: Game[] = [...DEV_MOCK_GAMES];

// Fallback implementation for pure web development and browser testing
function fallbackHandler<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  switch (cmd) {
    case 'get_app_info':
      return Promise.resolve({
        name: 'GameShelf',
        version: '0.1.0',
        bundle_id: 'com.gameshelf.app',
        os: 'Windows 11 (Browser Preview)',
        data_dir: 'AppData/Local/com.gameshelf.app',
        log_dir: 'AppData/Local/com.gameshelf.app/logs',
        db_version: 2,
      } as unknown as T);

    case 'get_settings': {
      const savedTheme = (localStorage.getItem('gameshelf_theme') as 'dark' | 'light' | 'system') || 'dark';
      const savedView = (localStorage.getItem('gameshelf_view') as 'grid' | 'list') || 'grid';
      const savedSize = (localStorage.getItem('gameshelf_card_size') as 'small' | 'medium' | 'large') || 'medium';
      const savedClose = localStorage.getItem('gameshelf_close_to_tray') === 'true';
      const savedMin = localStorage.getItem('gameshelf_minimize_to_tray') === 'true';
      const savedStartup = localStorage.getItem('gameshelf_launch_on_startup') === 'true';
      const savedOnboarding = localStorage.getItem('gameshelf_onboarding_completed') === 'true';
      const savedAccent = localStorage.getItem('gameshelf_accent_color') || '#7C6CFF';
      const savedMotion = (localStorage.getItem('gameshelf_reduced_motion') as 'system' | 'always' | 'never') || 'system';
      const savedDensity = (localStorage.getItem('gameshelf_card_density') as 'comfortable' | 'compact') || 'comfortable';

      return Promise.resolve({
        theme: savedTheme,
        default_view_mode: savedView,
        grid_card_size: savedSize,
        steam_grid_db_configured: false,
        close_to_tray: savedClose,
        minimize_to_tray: savedMin,
        launch_on_startup: savedStartup,
        onboarding_completed: savedOnboarding,
        accent_color: savedAccent,
        reduced_motion: savedMotion,
        card_density: savedDensity,
        playtime_tracking_enabled: localStorage.getItem('gameshelf_playtime_tracking_enabled') === 'true',
      } as unknown as T);
    }

    case 'set_setting': {
      const payload = args?.payload as SetSettingPayload;
      if (payload) {
        localStorage.setItem(`gameshelf_${payload.key}`, payload.value);
      }
      return Promise.resolve(true as unknown as T);
    }

    case 'get_diagnostic_summary': {
      return Promise.resolve(
        `### GameShelf Diagnostic Summary\n- **App Version**: 0.1.0\n- **Platform**: Windows 11\n- **Database Schema**: v5 (integrity check: PASSED)\n- **Library Games**: Total: ${previewGames.length}\n- **Steam Integration**: Detected: Yes\n` as unknown as T
      );
    }

    case 'open_logs': {
      return Promise.resolve(undefined as unknown as T);
    }

    case 'list_games': {
      const query = (args?.query || {}) as ListGamesQuery;
      let games = [...previewGames];

      if (!query.include_hidden) {
        games = games.filter((g) => !g.is_hidden);
      }

      if (query.filter === 'favorites') {
        games = games.filter((g) => g.is_favorite);
      } else if (query.filter === 'steam') {
        games = games.filter((g) => g.source_kind === 'Steam');
      } else if (query.filter === 'pc') {
        games = games.filter((g) => g.source_kind === 'Standalone' || g.source_kind === 'Shortcut' || g.source_kind === 'Manual');
      } else if (query.filter === 'emulated') {
        games = games.filter((g) => g.source_kind === 'Emulated');
      }

      if (query.search) {
        const s = query.search.toLowerCase();
        games = games.filter(
          (g) =>
            g.title.toLowerCase().includes(s) ||
            g.developer?.toLowerCase().includes(s) ||
            g.user_tags.some((t) => t.toLowerCase().includes(s))
        );
      }

      // Sort
      const desc = query.sort_order === 'desc';
      if (query.sort_by === 'recently_added') {
        games.sort((a, b) => ((b.created_at || '') > (a.created_at || '') ? 1 : -1));
      } else if (query.sort_by === 'recently_played') {
        games.sort((a, b) => ((b.last_launched_at || '') > (a.last_launched_at || '') ? 1 : -1));
      } else if (query.sort_by === 'most_played') {
        games.sort((a, b) => {
          const ptA = a.playtime_seconds || 0;
          const ptB = b.playtime_seconds || 0;
          return desc ? ptA - ptB : ptB - ptA;
        });
      } else if (query.sort_by === 'release_year') {
        games.sort((a, b) => {
          const yA = a.release_year || 0;
          const yB = b.release_year || 0;
          return desc ? yA - yB : yB - yA;
        });
      } else if (query.sort_by === 'status') {
        games.sort((a, b) => (desc ? b.status.localeCompare(a.status) : a.status.localeCompare(b.status)));
      } else {
        games.sort((a, b) => (desc ? b.sort_title.localeCompare(a.sort_title) : a.sort_title.localeCompare(b.sort_title)));
      }

      return Promise.resolve({
        games,
        total: games.length,
      } as unknown as T);
    }

    case 'inspect_file': {
      const filePath = (args?.filePath || '') as string;
      const fileName = filePath.split(/[/\\]/).pop() || 'Game';
      const stem = fileName.replace(/\.[^/.]+$/, '');
      const isLnk = filePath.toLowerCase().endsWith('.lnk');
      const workingDir = filePath.substring(0, Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\')));

      return Promise.resolve({
        title: stem.replace(/[_-]/g, ' '),
        executable_path: filePath,
        working_dir: workingDir || undefined,
        args: [],
        is_shortcut: isLnk,
        exists: true,
        normalized_path: filePath.toLowerCase().replace(/\\/g, '/'),
      } as unknown as T);
    }

    case 'check_duplicate_path': {
      const filePath = (args?.filePath || '') as string;
      const norm = filePath.toLowerCase().replace(/\\/g, '/');
      const existing = previewGames.find((g) => {
        if (g.normalized_path === norm) return true;
        if (g.launch_action.type === 'Executable' && g.launch_action.path.toLowerCase().replace(/\\/g, '/') === norm) return true;
        if (g.launch_action.type === 'Shortcut' && g.launch_action.target.toLowerCase().replace(/\\/g, '/') === norm) return true;
        return false;
      });

      return Promise.resolve({
        is_duplicate: !!existing,
        existing_game: existing || null,
      } as unknown as T);
    }

    case 'add_manual_game': {
      const payload = args?.payload as AddManualGamePayload;
      const norm = payload.executable_path.toLowerCase().replace(/\\/g, '/');
      const newGame: Game = {
        id: Math.random().toString(36).substring(2, 11),
        title: payload.title,
        sort_title: payload.title.toLowerCase(),
        source_kind: payload.is_shortcut ? 'Shortcut' : 'Standalone',
        launch_action: payload.is_shortcut
          ? { type: 'Shortcut', target: payload.executable_path, args: payload.args || [], working_dir: payload.working_dir }
          : { type: 'Executable', path: payload.executable_path, args: payload.args || [], working_dir: payload.working_dir },
        status: 'Installed',
        is_favorite: false,
        is_hidden: false,
        genres: [],
        tags: [],
        user_tags: [],
        normalized_path: norm,
        created_at: new Date().toISOString(),
      };
      previewGames.unshift(newGame);
      return Promise.resolve(newGame as unknown as T);
    }

    case 'update_game': {
      const payload = args?.payload as UpdateGamePayload;
      const index = previewGames.findIndex((g) => g.id === payload.id);
      if (index === -1) {
        return Promise.reject({ code: 'NOT_FOUND', message: 'Game not found' } as CommandError);
      }
      const existing = previewGames[index];
      const updated: Game = {
        ...existing,
        title: payload.title ?? existing.title,
        sort_title: payload.title ? payload.title.toLowerCase() : existing.sort_title,
        notes: payload.notes ?? existing.notes,
        user_tags: payload.user_tags ?? existing.user_tags,
        is_favorite: payload.is_favorite ?? existing.is_favorite,
        is_hidden: payload.is_hidden ?? existing.is_hidden,
      };
      previewGames[index] = updated;
      return Promise.resolve(updated as unknown as T);
    }

    case 'update_launch_settings': {
      const payload = args?.payload as UpdateLaunchSettingsPayload;
      const index = previewGames.findIndex((g) => g.id === payload.id);
      if (index === -1) {
        return Promise.reject({ code: 'NOT_FOUND', message: 'Game not found' } as CommandError);
      }
      const existing = previewGames[index];
      const norm = payload.executable_path.toLowerCase().replace(/\\/g, '/');
      const updated: Game = {
        ...existing,
        normalized_path: norm,
        status: 'Installed',
        launch_action:
          existing.launch_action.type === 'Shortcut'
            ? { type: 'Shortcut', target: payload.executable_path, args: payload.args, working_dir: payload.working_dir }
            : { type: 'Executable', path: payload.executable_path, args: payload.args, working_dir: payload.working_dir },
      };
      previewGames[index] = updated;
      return Promise.resolve(updated as unknown as T);
    }

    case 'remove_game': {
      const id = args?.id as string;
      previewGames = previewGames.filter((g) => g.id !== id);
      return Promise.resolve(true as unknown as T);
    }

    case 'launch_game': {
      const id = args?.id as string;
      const game = previewGames.find((g) => g.id === id);
      if (!game) {
        return Promise.reject({ code: 'NOT_FOUND', message: 'Game not found' } as CommandError);
      }
      if (game.status === 'Missing') {
        return Promise.reject({
          code: 'LAUNCH_FAILED',
          message: `Executable not found at path. Please locate the file.`,
        } as CommandError);
      }
      game.last_launched_at = new Date().toISOString();
      return Promise.resolve({
        success: true,
        pid: 12345,
        message: `Process launched successfully (PID 12345)`,
      } as unknown as T);
    }

    case 'open_folder':
      return Promise.resolve(true as unknown as T);

    case 'get_steam_status': {
      const steamGames = previewGames.filter((g) => g.source_kind === 'Steam');
      const mockStatus: SteamStatusResponse = {
        is_installed: true,
        steam_path: 'C:/Program Files (x86)/Steam',
        libraries: [
          {
            path: 'C:/Program Files (x86)/Steam',
            normalized_path: 'c:/program files (x86)/steam',
            label: 'Default Library',
            is_accessible: true,
            is_enabled: true,
            game_count: steamGames.length,
          },
        ],
        filter_config: {
          rules: [
            {
              id: 'redistributables',
              name: 'Common Redistributables',
              description: 'Filters runtime redistributables (DirectX, VC++)',
              enabled: true,
            },
            {
              id: 'proton_runtime',
              name: 'Proton & Linux Runtimes',
              description: 'Filters Proton compatibility layers',
              enabled: true,
            },
            {
              id: 'sdks',
              name: 'Software Development Kits',
              description: 'Filters development toolkits and engine SDKs',
              enabled: true,
            },
            {
              id: 'dedicated_servers',
              name: 'Dedicated Game Servers',
              description: 'Filters headless dedicated servers',
              enabled: true,
            },
          ],
          explicit_included_app_ids: [],
          explicit_excluded_app_ids: [],
        },
        last_scanned_at: new Date().toISOString(),
        total_imported_games: steamGames.length,
        warnings: [],
      };
      return Promise.resolve(mockStatus as unknown as T);
    }

    case 'rescan_steam': {
      const now = new Date().toISOString();
      const terrariaGame: Game = {
        id: 'steam-105600',
        title: 'Terraria',
        sort_title: 'terraria',
        source_kind: 'Steam',
        source_id: '105600',
        install_dir: 'C:/Program Files (x86)/Steam/steamapps/common/Terraria',
        launch_action: { type: 'Steam', app_id: 105600 },
        status: 'Installed',
        last_scanned_at: now,
        is_favorite: false,
        is_hidden: false,
        genres: ['Action', 'Sandbox'],
        tags: ['2D', 'Adventure', 'Crafting'],
        user_tags: [],
        normalized_path: 'c:/program files (x86)/steam/steamapps/common/terraria',
        created_at: now,
      };

      if (!previewGames.some((g) => g.source_kind === 'Steam' && g.source_id === '105600')) {
        previewGames.unshift(terrariaGame);
      }

      const scanResult: SteamScanResult = {
        steam_path: 'C:/Program Files (x86)/Steam',
        libraries: [
          {
            path: 'C:/Program Files (x86)/Steam',
            normalized_path: 'c:/program files (x86)/steam',
            label: 'Default Library',
            is_accessible: true,
            is_enabled: true,
            game_count: 1,
          },
        ],
        imported_games: [terrariaGame],
        skipped_apps: [
          {
            app_id: 228980,
            name: 'Steamworks Common Redistributables',
            library_path: 'C:/Program Files (x86)/Steam',
            reason: 'Matches rule: Common Redistributables',
          },
        ],
        warnings: [],
      };
      return Promise.resolve(scanResult as unknown as T);
    }

    case 'configure_steam_path':
    case 'set_steam_library_enabled':
    case 'update_steam_filter_rule':
    case 'include_skipped_steam_app':
      return Promise.resolve(undefined as unknown as T);

    case 'record_game_session': {
      const { gameId, durationSeconds, isApproximate, startedAt, endedAt } = (args || {}) as {
        gameId: string;
        startedAt: string;
        endedAt?: string | null;
        durationSeconds: number;
        isApproximate: boolean;
      };
      const game = previewGames.find((g) => g.id === gameId);
      if (game) {
        game.playtime_seconds = (game.playtime_seconds || 0) + durationSeconds;
        game.last_launched_at = startedAt;
      }
      const session: GameSession = {
        id: `session-${Date.now()}`,
        game_id: gameId,
        started_at: startedAt,
        ended_at: endedAt,
        duration_seconds: durationSeconds,
        is_approximate: isApproximate,
      };
      return Promise.resolve(session as unknown as T);
    }

    case 'get_game_sessions': {
      return Promise.resolve([] as unknown as T);
    }

    case 'reset_game_playtime': {
      const { gameId } = (args || {}) as { gameId: string };
      const game = previewGames.find((g) => g.id === gameId);
      if (game) {
        game.playtime_seconds = 0;
      }
      return Promise.resolve(undefined as unknown as T);
    }

    default:
      return Promise.reject({
        code: 'COMMAND_NOT_FOUND',
        message: `Command "${cmd}" is not implemented in browser preview mode.`,
      } as CommandError);
  }
}

export const api = {
  getAppInfo: () => callTauri<AppInfo>('get_app_info'),
  getSettings: () => callTauri<AppSettings>('get_settings'),
  setSetting: (key: string, value: string) => callTauri<boolean>('set_setting', { payload: { key, value } }),
  listGames: (query?: ListGamesQuery) => callTauri<ListGamesResponse>('list_games', { query }),
  inspectFile: (filePath: string) => callTauri<InspectFileResponse>('inspect_file', { filePath }),
  checkDuplicate: (filePath: string) => callTauri<DuplicateCheckResponse>('check_duplicate_path', { filePath }),
  addManualGame: (payload: AddManualGamePayload) => callTauri<Game>('add_manual_game', { payload }),
  updateGame: (payload: UpdateGamePayload) => callTauri<Game>('update_game', { payload }),
  updateLaunchSettings: (payload: UpdateLaunchSettingsPayload) =>
    callTauri<Game>('update_launch_settings', { payload }),
  removeGame: (id: string) => callTauri<boolean>('remove_game', { id }),
  launchGame: (id: string) => callTauri<LaunchResult>('launch_game', { id }),
  recordGameSession: (
    gameId: string,
    startedAt: string,
    endedAt: string | null | undefined,
    durationSeconds: number,
    isApproximate: boolean
  ) =>
    callTauri<GameSession>('record_game_session', {
      gameId,
      startedAt,
      endedAt: endedAt || null,
      durationSeconds,
      isApproximate,
    }),
  getGameSessions: (gameId: string) => callTauri<GameSession[]>('get_game_sessions', { gameId }),
  resetGamePlaytime: (gameId: string) => callTauri<void>('reset_game_playtime', { gameId }),
  openFolder: (gameId: string) => callTauri<boolean>('open_folder', { gameId }),
  getSteamStatus: () => callTauri<SteamStatusResponse>('get_steam_status'),
  rescanSteam: () => callTauri<SteamScanResult>('rescan_steam'),
  configureSteamPath: (path?: string) => callTauri<void>('configure_steam_path', { path: path || null }),
  setSteamLibraryEnabled: (libraryPath: string, enabled: boolean) =>
    callTauri<void>('set_steam_library_enabled', { libraryPath, enabled }),
  updateSteamFilterRule: (ruleId: string, enabled: boolean) =>
    callTauri<void>('update_steam_filter_rule', { ruleId, enabled }),
  includeSkippedSteamApp: (appId: number) => callTauri<void>('include_skipped_steam_app', { appId }),
  getDiagnosticSummary: () => callTauri<string>('get_diagnostic_summary'),
  openLogs: () => callTauri<void>('open_logs'),
};

