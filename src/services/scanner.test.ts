import { describe, it, expect } from 'vitest';
import { scannerService } from './scanner';
import { ScanCandidate, ScanOptions } from '../types/api';

describe('Phase 4 — Folder Scanner Service & Candidate Management', () => {
  it('lists initial scan sources and allows adding and removing sources', async () => {
    const sources = await scannerService.getScanSources();
    expect(Array.isArray(sources)).toBe(true);
    const initialCount = sources.length;

    // Add new source
    const newSource = await scannerService.addScanSource('E:/Games/Indies', 3);
    expect(newSource.id).toBeDefined();
    expect(newSource.path).toBe('E:/Games/Indies');
    expect(newSource.depth).toBe(3);

    const updatedSources = await scannerService.getScanSources();
    expect(updatedSources.length).toBe(initialCount + 1);
    expect(updatedSources.some((s) => s.path === 'E:/Games/Indies')).toBe(true);

    // Remove source
    await scannerService.removeScanSource(newSource.id);
    const finalSources = await scannerService.getScanSources();
    expect(finalSources.some((s) => s.id === newSource.id)).toBe(false);
  });

  it('performs folder scan in web-preview environment with explainable candidate heuristics', async () => {
    const options: ScanOptions = {
      root_paths: ['C:/Games'],
      max_depth: 4,
      custom_exclusions: [],
      show_skipped: false,
    };

    const result = await scannerService.startFolderScan(options);
    expect(result.is_cancelled).toBe(false);
    expect(result.folders_scanned).toBeGreaterThan(0);
    expect(result.files_examined).toBeGreaterThan(0);
    expect(result.candidates.length).toBeGreaterThan(0);

    // Check candidate details & heuristics
    const hollowKnight = result.candidates.find((c) => c.title === 'Hollow Knight');
    expect(hollowKnight).toBeDefined();
    expect(hollowKnight?.confidence).toBe('High');
    expect(hollowKnight?.reason).toContain('Unity Engine');
    expect(hollowKnight?.is_skipped).toBe(false);
    expect(hollowKnight?.selected).toBe(true);

    // Check skip rules (uninstaller)
    const uninstaller = result.candidates.find((c) => c.is_skipped);
    expect(uninstaller).toBeDefined();
    expect(uninstaller?.confidence).toBe('Low');
    expect(uninstaller?.skip_reason).toContain('Uninstallers');
    expect(uninstaller?.selected).toBe(false);
  });

  it('imports selected candidates and ignores unselected or skipped ones', async () => {
    const candidates: ScanCandidate[] = [
      {
        id: 'c-1',
        title: 'Selected Game 1',
        executable_path: 'C:/Games/Game1/game.exe',
        working_dir: 'C:/Games/Game1',
        args: [],
        confidence: 'High',
        reason: 'Game binary',
        file_size_bytes: 10485760,
        is_skipped: false,
        skip_reason: null,
        selected: true,
        existing_game_id: null,
      },
      {
        id: 'c-2',
        title: 'Deselected Game 2',
        executable_path: 'C:/Games/Game2/game.exe',
        working_dir: 'C:/Games/Game2',
        args: [],
        confidence: 'Medium',
        reason: 'Executable',
        file_size_bytes: 5242880,
        is_skipped: false,
        skip_reason: null,
        selected: false,
        existing_game_id: null,
      },
      {
        id: 'c-3',
        title: 'Uninstaller (Skipped)',
        executable_path: 'C:/Games/Game1/uninstall.exe',
        working_dir: 'C:/Games/Game1',
        args: [],
        confidence: 'Low',
        reason: 'Uninstaller rule',
        file_size_bytes: 102400,
        is_skipped: true,
        skip_reason: 'Uninstaller',
        selected: false,
        existing_game_id: null,
      },
    ];

    const importedCount = await scannerService.importScanCandidates(candidates);
    expect(importedCount).toBe(1);
  });

  it('supports cancellation and leaves mock scan in clean state', async () => {
    await scannerService.cancelFolderScan();
    const sources = await scannerService.getScanSources();
    expect(sources).toBeDefined();
  });
});
