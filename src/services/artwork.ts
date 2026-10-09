import {
  ArtworkCandidate,
  CacheStats,
  GameCandidate,
} from '../types/artwork';
import { ArtworkAsset, ArtworkRole, Game } from '../types/models';
import { isTauri } from './api';

// Typed invoke helper
async function callTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<T>(cmd, args);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && 'message' in err) {
        throw err;
      }
      throw {
        code: 'INVOKE_FAILED',
        message: typeof err === 'string' ? err : 'Command invocation failed',
        details: JSON.stringify(err),
      };
    }
  }

  return fallbackArtworkHandler<T>(cmd, args);
}

// In-memory mock state for web/test previews
let mockKeyConfigured = false;
const mockLockedFields: Record<string, string[]> = {};
const mockArtworkStore: Record<string, Record<string, ArtworkAsset>> = {};

function fallbackArtworkHandler<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  switch (cmd) {
    case 'get_steamgriddb_status':
      return Promise.resolve(mockKeyConfigured as unknown as T);

    case 'set_steamgriddb_api_key':
      mockKeyConfigured = true;
      return Promise.resolve(undefined as unknown as T);

    case 'remove_steamgriddb_api_key':
      mockKeyConfigured = false;
      return Promise.resolve(undefined as unknown as T);

    case 'test_steamgriddb_connection':
      return Promise.resolve(true as unknown as T);

    case 'search_metadata':
      return Promise.resolve([
        {
          provider: 'steamgriddb',
          provider_game_id: '123',
          name: (args?.payload as { query: string })?.query || 'Mock Game',
          release_year: 2023,
          match_score: 0.95,
          confidence_tier: 'High',
          steam_app_id: 12345,
          verified: true,
        },
      ] as unknown as T);

    case 'get_artwork_candidates': {
      const role = (args?.payload as { role: ArtworkRole })?.role || 'cover';
      return Promise.resolve([
        {
          provider: 'steamgriddb',
          asset_id: 'mock_asset_1',
          role,
          url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600',
          thumb_url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=300',
          width: 600,
          height: 900,
          mime_type: 'image/jpeg',
          author_name: 'Artist Mock',
          score: 85,
          language: 'en',
        },
      ] as unknown as T);
    }

    case 'apply_artwork_asset': {
      const payload = args?.payload as { game_id: string; candidate: ArtworkCandidate };
      const asset: ArtworkAsset = {
        id: 'mock_art_' + Date.now(),
        game_id: payload.game_id,
        role: payload.candidate.role,
        provider: payload.candidate.provider,
        provider_asset_id: payload.candidate.asset_id,
        source_url: payload.candidate.url,
        cached_path: '/cache/' + payload.candidate.asset_id + '.jpg',
        width: payload.candidate.width,
        height: payload.candidate.height,
        mime_type: payload.candidate.mime_type,
        attribution: payload.candidate.author_name,
        is_selected: true,
      };
      if (!mockArtworkStore[payload.game_id]) {
        mockArtworkStore[payload.game_id] = {};
      }
      mockArtworkStore[payload.game_id][asset.role] = asset;
      return Promise.resolve(asset as unknown as T);
    }

    case 'select_local_artwork': {
      const payload = args?.payload as { game_id: string; role: ArtworkRole; local_path: string };
      const asset: ArtworkAsset = {
        id: 'local_art_' + Date.now(),
        game_id: payload.game_id,
        role: payload.role,
        provider: 'local',
        provider_asset_id: null,
        source_url: null,
        cached_path: payload.local_path,
        width: 600,
        height: 900,
        mime_type: 'image/png',
        attribution: 'Local File',
        is_selected: true,
      };
      if (!mockArtworkStore[payload.game_id]) {
        mockArtworkStore[payload.game_id] = {};
      }
      mockArtworkStore[payload.game_id][asset.role] = asset;
      return Promise.resolve(asset as unknown as T);
    }

    case 'remove_artwork_for_role': {
      const payload = args?.payload as { game_id: string; role: string };
      if (mockArtworkStore[payload.game_id]) {
        delete mockArtworkStore[payload.game_id][payload.role];
      }
      return Promise.resolve(undefined as unknown as T);
    }

    case 'get_game_artwork': {
      const gameId = args?.game_id as string;
      return Promise.resolve((mockArtworkStore[gameId] || {}) as unknown as T);
    }

    case 'get_cache_stats':
      return Promise.resolve({
        file_count: 14,
        total_bytes: 8400000,
        formatted_size: '8.0 MB',
      } as unknown as T);

    case 'clear_artwork_cache':
      return Promise.resolve(14 as unknown as T);

    case 'refresh_game_metadata':
      return Promise.resolve({
        id: (args?.payload as { game_id: string })?.game_id,
        title: 'Refreshed Title',
      } as unknown as T);

    case 'get_locked_fields': {
      const gameId = args?.game_id as string;
      return Promise.resolve((mockLockedFields[gameId] || []) as unknown as T);
    }

    case 'set_locked_fields': {
      const payload = args?.payload as { game_id: string; locked_fields: string[] };
      mockLockedFields[payload.game_id] = payload.locked_fields;
      return Promise.resolve(undefined as unknown as T);
    }

    default:
      return Promise.reject(new Error(`Unhandled mock artwork command: ${cmd}`));
  }
}

export async function getSteamGridDbStatus(): Promise<boolean> {
  return callTauri<boolean>('get_steamgriddb_status');
}

export async function setSteamGridDbApiKey(key: string): Promise<void> {
  return callTauri<void>('set_steamgriddb_api_key', { key });
}

export async function removeSteamGridDbApiKey(): Promise<void> {
  return callTauri<void>('remove_steamgriddb_api_key');
}

export async function testSteamGridDbConnection(key?: string): Promise<boolean> {
  return callTauri<boolean>('test_steamgriddb_connection', { key: key || null });
}

export async function searchMetadata(query: string, year?: number): Promise<GameCandidate[]> {
  return callTauri<GameCandidate[]>('search_metadata', { payload: { query, year } });
}

export async function getArtworkCandidates(
  gameId: string,
  role: ArtworkRole,
  providerGameId?: string,
): Promise<ArtworkCandidate[]> {
  return callTauri<ArtworkCandidate[]>('get_artwork_candidates', {
    payload: {
      game_id: gameId,
      role,
      provider_game_id: providerGameId || null,
    },
  });
}

export async function applyArtworkAsset(
  gameId: string,
  candidate: ArtworkCandidate,
): Promise<ArtworkAsset> {
  return callTauri<ArtworkAsset>('apply_artwork_asset', {
    payload: {
      game_id: gameId,
      candidate,
    },
  });
}

export async function selectLocalArtwork(
  gameId: string,
  role: ArtworkRole,
  localPath: string,
): Promise<ArtworkAsset> {
  return callTauri<ArtworkAsset>('select_local_artwork', {
    payload: {
      game_id: gameId,
      role,
      local_path: localPath,
    },
  });
}

export async function removeArtworkForRole(gameId: string, role: ArtworkRole): Promise<void> {
  return callTauri<void>('remove_artwork_for_role', {
    payload: {
      game_id: gameId,
      role,
    },
  });
}

export async function getGameArtwork(gameId: string): Promise<Record<string, ArtworkAsset>> {
  return callTauri<Record<string, ArtworkAsset>>('get_game_artwork', { game_id: gameId });
}

export async function getCacheStats(): Promise<CacheStats> {
  return callTauri<CacheStats>('get_cache_stats');
}

export async function clearArtworkCache(): Promise<number> {
  return callTauri<number>('clear_artwork_cache');
}

export async function refreshGameMetadata(
  gameId: string,
  autoDownloadArtwork: boolean = false,
): Promise<Game> {
  return callTauri<Game>('refresh_game_metadata', {
    payload: {
      game_id: gameId,
      auto_download_artwork: autoDownloadArtwork,
    },
  });
}

export async function getLockedFields(gameId: string): Promise<string[]> {
  return callTauri<string[]>('get_locked_fields', { game_id: gameId });
}

export async function setLockedFields(gameId: string, lockedFields: string[]): Promise<void> {
  return callTauri<void>('set_locked_fields', {
    payload: {
      game_id: gameId,
      locked_fields: lockedFields,
    },
  });
}
