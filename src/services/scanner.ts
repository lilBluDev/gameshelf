import { isTauri } from './api';
import {
  ScanCandidate,
  ScanOptions,
  ScanProgress,
  ScanResult,
  ScanSource,
} from '../types/api';

// In-memory mock sources for web preview
let mockScanSources: ScanSource[] = [
  {
    id: 'source-1',
    path: 'D:/Games/PC Games',
    normalized_path: 'd:/games/pc games',
    depth: 4,
    last_scanned_at: new Date(Date.now() - 86400000).toISOString(),
    game_count: 3,
    created_at: new Date(Date.now() - 172800000).toISOString(),
    updated_at: new Date(Date.now() - 86400000).toISOString(),
  },
];

let mockCancelRequested = false;

export const scannerService = {
  startFolderScan: async (options: ScanOptions): Promise<ScanResult> => {
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<ScanResult>('start_folder_scan', { options });
    }

    // Browser Preview mock
    mockCancelRequested = false;

    // Simulate progress
    const mockRoot = options.root_paths[0] || 'C:/Games';
    const mockCandidates: ScanCandidate[] = [
      {
        id: 'mock-cand-1',
        title: 'Hollow Knight',
        executable_path: `${mockRoot}/HollowKnight/hollow_knight.exe`,
        working_dir: `${mockRoot}/HollowKnight`,
        args: [],
        confidence: 'High',
        reason: 'Top-level executable with Unity Engine indicators and PE Product Name',
        file_size_bytes: 48234496,
        is_skipped: false,
        skip_reason: null,
        selected: true,
        existing_game_id: null,
      },
      {
        id: 'mock-cand-2',
        title: 'Dead Cells',
        executable_path: `${mockRoot}/DeadCells/deadcells.exe`,
        working_dir: `${mockRoot}/DeadCells`,
        args: [],
        confidence: 'High',
        reason: 'Top-level game binary matching folder name',
        file_size_bytes: 35123900,
        is_skipped: false,
        skip_reason: null,
        selected: true,
        existing_game_id: null,
      },
      {
        id: 'mock-cand-3',
        title: 'Uninstall Hollow Knight',
        executable_path: `${mockRoot}/HollowKnight/unins000.exe`,
        working_dir: `${mockRoot}/HollowKnight`,
        args: [],
        confidence: 'Low',
        reason: 'Skipped by rule: Uninstallers (unins*.exe)',
        file_size_bytes: 1204850,
        is_skipped: true,
        skip_reason: 'Skipped by rule "Uninstallers" (unins*.exe)',
        selected: false,
        existing_game_id: null,
      },
    ];

    if (mockCancelRequested) {
      return {
        candidates: [],
        folders_scanned: 2,
        files_examined: 5,
        skipped_count: 0,
        errors: [],
        is_cancelled: true,
      };
    }

    return {
      candidates: mockCandidates,
      folders_scanned: 12,
      files_examined: 24,
      skipped_count: 1,
      errors: [],
      is_cancelled: false,
    };
  },

  cancelFolderScan: async (): Promise<void> => {
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<void>('cancel_folder_scan');
    }
    mockCancelRequested = true;
  },

  getScanSources: async (): Promise<ScanSource[]> => {
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<ScanSource[]>('get_scan_sources');
    }
    return [...mockScanSources];
  },

  addScanSource: async (path: string, depth: number): Promise<ScanSource> => {
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<ScanSource>('add_scan_source', { path, depth });
    }
    const newSource: ScanSource = {
      id: Math.random().toString(36).substring(2, 10),
      path,
      normalized_path: path.toLowerCase().replace(/\\/g, '/'),
      depth,
      last_scanned_at: null,
      game_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockScanSources.push(newSource);
    return newSource;
  },

  removeScanSource: async (id: string): Promise<void> => {
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<void>('remove_scan_source', { id });
    }
    mockScanSources = mockScanSources.filter((s) => s.id !== id);
  },

  importScanCandidates: async (
    candidates: ScanCandidate[],
    sourceId?: string
  ): Promise<number> => {
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<number>('import_scan_candidates', {
        candidates,
        sourceId: sourceId || null,
      });
    }

    const selectedCount = candidates.filter((c) => c.selected).length;
    if (sourceId) {
      const src = mockScanSources.find((s) => s.id === sourceId);
      if (src) {
        src.game_count = selectedCount;
        src.last_scanned_at = new Date().toISOString();
      }
    }
    return selectedCount;
  },

  rescanSource: async (sourceId: string): Promise<ScanResult> => {
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<ScanResult>('rescan_source', { sourceId });
    }
    return scannerService.startFolderScan({
      root_paths: ['D:/Games/PC Games'],
      max_depth: 4,
      custom_exclusions: [],
      show_skipped: false,
    });
  },

  listenScanProgress: async (
    callback: (progress: ScanProgress) => void
  ): Promise<() => void> => {
    if (isTauri()) {
      const { listen } = await import('@tauri-apps/api/event');
      const unlisten = await listen<ScanProgress>('folder-scan-progress', (event) => {
        callback(event.payload);
      });
      return unlisten;
    }
    // No-op unlisten in browser preview
    return () => {};
  },
};
