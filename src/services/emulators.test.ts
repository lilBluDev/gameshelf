import { describe, it, expect } from 'vitest';
import { emulatorService } from './emulators';
import { EmulatorProfile } from '../types/models';
import { RomCandidate, RomScanOptions } from '../types/api';

describe('Phase 5 — Emulator Profiles & Emulated Games Service', () => {
  it('retrieves built-in profiles with verified CLI sources', async () => {
    const profiles = await emulatorService.getEmulatorProfiles();
    expect(profiles.length).toBeGreaterThanOrEqual(4);

    const retroarch = profiles.find((p) => p.id === 'retroarch');
    expect(retroarch).toBeDefined();
    expect(retroarch?.name).toBe('RetroArch');
    expect(retroarch?.argument_template).toContain('{core}');
    expect(retroarch?.argument_template).toContain('{rom}');
    expect(retroarch?.verification_source).toContain('libretro.com');

    const dolphin = profiles.find((p) => p.id === 'dolphin');
    expect(dolphin).toBeDefined();
    expect(dolphin?.name).toBe('Dolphin');
    expect(dolphin?.argument_template).toEqual(['-b', '-e', '{rom}']);

    const pcsx2 = profiles.find((p) => p.id === 'pcsx2');
    expect(pcsx2).toBeDefined();
    expect(pcsx2?.name).toBe('PCSX2');
    expect(pcsx2?.argument_template).toEqual(['-batch', '-nogui', '{rom}']);

    const duckstation = profiles.find((p) => p.id === 'duckstation');
    expect(duckstation).toBeDefined();
    expect(duckstation?.name).toBe('DuckStation');
    expect(duckstation?.argument_template).toEqual(['-batch', '{rom}']);
  });

  it('runs emulator detection and reports validation status', async () => {
    const detected = await emulatorService.detectEmulators();
    expect(detected.length).toBeGreaterThanOrEqual(4);
    const retro = detected.find((p) => p.id === 'retroarch');
    expect(retro?.validation_status.status).toBe('Verified');
  });

  it('allows adding, updating, and deleting custom emulator profiles', async () => {
    const customId = `custom-rpcs3-${Date.now()}`;
    const newProfile: EmulatorProfile = {
      id: customId,
      name: 'RPCS3',
      systems: ['Sony PlayStation 3'],
      supported_extensions: ['.pkg', '.iso', '.bin'],
      argument_template: ['--no-gui', '{rom}'],
      working_dir_rule: 'EmulatorDir',
      executable_path: 'C:/Emulators/RPCS3/rpcs3.exe',
      core_path: null,
      is_builtin: false,
      detection_hints: { known_paths: [], registry_keys: [], shortcut_names: [], executable_names: [] },
      verification_source: 'https://rpcs3.net/quickstart',
      validation_status: { status: 'Verified' },
    };

    // Save profile
    const saved = await emulatorService.saveEmulatorProfile(newProfile);
    expect(saved.id).toBe(customId);
    expect(saved.name).toBe('RPCS3');

    const listAfterAdd = await emulatorService.getEmulatorProfiles();
    expect(listAfterAdd.some((p) => p.id === customId)).toBe(true);

    // Delete custom profile
    const deleted = await emulatorService.deleteEmulatorProfile(customId);
    expect(deleted).toBe(true);

    const listAfterDelete = await emulatorService.getEmulatorProfiles();
    expect(listAfterDelete.some((p) => p.id === customId)).toBe(false);
  });

  it('validates executable path and requirement of libretro core when {core} is used', async () => {
    // Missing executable
    const res1 = await emulatorService.validateEmulatorPath('', null, ['{rom}']);
    expect(res1.status).toBe('ExecutableMissing');

    // Requires core but none provided
    const res2 = await emulatorService.validateEmulatorPath('C:/retroarch.exe', null, ['-L', '{core}', '{rom}']);
    expect(res2.status).toBe('NeedsConfiguration');

    // Valid executable and core
    const res3 = await emulatorService.validateEmulatorPath(
      'C:/retroarch.exe',
      'C:/cores/beetle.dll',
      ['-L', '{core}', '{rom}']
    );
    expect(res3.status).toBe('Verified');
  });

  it('scans ROM directory and groups CUE multi-tracks and multi-disc games into single candidates', async () => {
    const options: RomScanOptions = {
      folder_path: 'C:/Emulation/PS1',
      profile_id: 'duckstation',
      system: 'PlayStation',
      extra_extensions: [],
      max_depth: 3,
    };

    const scanResult = await emulatorService.scanRomFolder(options);
    expect(scanResult.candidates.length).toBeGreaterThan(0);
    expect(scanResult.grouped_files_count).toBeGreaterThan(0);

    // Multi-disc game grouped (Final Fantasy VII)
    const ff7 = scanResult.candidates.find((c) => c.title === 'Final Fantasy VII');
    expect(ff7).toBeDefined();
    expect(ff7?.grouped_files.length).toBeGreaterThan(0);
    expect(ff7?.selected).toBe(true);

    // Multi-track game grouped (Crash Bandicoot)
    const crash = scanResult.candidates.find((c) => c.title === 'Crash Bandicoot');
    expect(crash).toBeDefined();
    expect(crash?.grouped_files.length).toBeGreaterThan(0);
  });

  it('imports emulated game candidates into library', async () => {
    const candidates: RomCandidate[] = [
      {
        id: 'cand-snes-1',
        title: 'Chrono Trigger',
        rom_path: 'C:/Games/SNES/Chrono Trigger.sfc',
        system: 'SNES',
        profile_id: 'retroarch',
        file_size_bytes: 4194304,
        grouped_files: [],
        selected: true,
        is_duplicate: false,
      },
    ];

    const imported = await emulatorService.importEmulatedGames(candidates);
    expect(imported).toBe(1);
  });

  it('executes test launch of emulator with sample ROM', async () => {
    const launchRes = await emulatorService.testLaunchEmulator('retroarch', 'C:/Games/SNES/sample.sfc');
    expect(launchRes.success).toBe(true);
    expect(launchRes.pid).toBeDefined();
    expect(launchRes.message).toContain('retroarch');
  });
});
