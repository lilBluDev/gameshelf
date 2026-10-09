import { AppInfo, AppSettings, CommandError, ListGamesQuery, ListGamesResponse, SetSettingPayload } from '../types/api';
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
        db_version: 1,
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
      let games = [...DEV_MOCK_GAMES];
      if (query.filter === 'favorites') {
        games = games.filter((g) => g.is_favorite);
      } else if (query.filter === 'steam') {
        games = games.filter((g) => g.source_kind === 'Steam');
      } else if (query.filter === 'pc') {
        games = games.filter((g) => g.source_kind === 'Standalone' || g.source_kind === 'Shortcut');
      } else if (query.filter === 'emulated') {
        games = games.filter((g) => g.source_kind === 'Emulated');
      }

      if (query.search) {
        const s = query.search.toLowerCase();
        games = games.filter((g) => g.title.toLowerCase().includes(s) || g.developer?.toLowerCase().includes(s));
      }

      return Promise.resolve({
        games,
        total: games.length,
      } as unknown as T);
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
};
