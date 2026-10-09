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
} from '../types/api';
import { Game } from '../types/models';
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
      return Promise.resolve({
        theme: savedTheme,
        default_view_mode: savedView,
        grid_card_size: savedSize,
        steam_grid_db_configured: false,
        close_to_tray: false,
      } as unknown as T);
    }

    case 'set_setting': {
      const payload = args?.payload as SetSettingPayload;
      if (payload) {
        if (payload.key === 'theme') localStorage.setItem('gameshelf_theme', payload.value);
        if (payload.key === 'default_view_mode') localStorage.setItem('gameshelf_view', payload.value);
        if (payload.key === 'grid_card_size') localStorage.setItem('gameshelf_card_size', payload.value);
      }
      return Promise.resolve(true as unknown as T);
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
  openFolder: (folderPath: string) => callTauri<boolean>('open_folder', { folderPath }),
};
