import { isTauri } from './api';
import { EmulatorProfile, EmulatorValidationStatus } from '../types/models';
import { LaunchResult, RomCandidate, RomScanOptions, RomScanResult } from '../types/api';

// Initial mock profiles for development / browser mode
let mockProfiles: EmulatorProfile[] = [
  {
    id: 'retroarch',
    name: 'RetroArch',
    systems: ['NES', 'SNES', 'Genesis', 'GBA', 'N64', 'PlayStation'],
    supported_extensions: ['.nes', '.snes', '.smc', '.sfc', '.md', '.gen', '.gba', '.z64', '.n64', '.cue', '.chd'],
    argument_template: ['-L', '{core}', '{rom}'],
    working_dir_rule: 'EmulatorDir',
    executable_path: 'C:/RetroArch-Win64/retroarch.exe',
    core_path: 'C:/RetroArch-Win64/cores/mesen_libretro.dll',
    is_builtin: true,
    detection_hints: {
      known_paths: [
        '%APPDATA%\\RetroArch\\retroarch.exe',
        '%PROGRAMFILES%\\RetroArch\\retroarch.exe',
      ],
      registry_keys: [],
      shortcut_names: ['RetroArch.lnk'],
      executable_names: ['retroarch.exe'],
    },
    verification_source: 'https://docs.libretro.com/development/retroarch/command-line-interface/',
    validation_status: { status: 'Verified' },
  },
  {
    id: 'dolphin',
    name: 'Dolphin',
    systems: ['Nintendo GameCube', 'Nintendo Wii'],
    supported_extensions: ['.iso', '.gcm', '.rvz', '.wbfs', '.ciso', '.wad'],
    argument_template: ['-b', '-e', '{rom}'],
    working_dir_rule: 'EmulatorDir',
    executable_path: null,
    core_path: null,
    is_builtin: true,
    detection_hints: {
      known_paths: ['%PROGRAMFILES%\\Dolphin\\Dolphin.exe'],
      registry_keys: [],
      shortcut_names: ['Dolphin.lnk'],
      executable_names: ['Dolphin.exe'],
    },
    verification_source: 'https://wiki.dolphin-emu.org/index.php?title=Command_Line_Options',
    validation_status: { status: 'ExecutableMissing' },
  },
  {
    id: 'pcsx2',
    name: 'PCSX2',
    systems: ['Sony PlayStation 2'],
    supported_extensions: ['.iso', '.bin', '.chd', '.cso', '.gz', '.elf'],
    argument_template: ['-batch', '-nogui', '{rom}'],
    working_dir_rule: 'EmulatorDir',
    executable_path: null,
    core_path: null,
    is_builtin: true,
    detection_hints: {
      known_paths: ['%PROGRAMFILES%\\PCSX2\\pcsx2-qtx64.exe'],
      registry_keys: [],
      shortcut_names: ['PCSX2.lnk'],
      executable_names: ['pcsx2-qtx64.exe', 'pcsx2.exe'],
    },
    verification_source: 'https://pcsx2.net/docs/usage/cli/',
    validation_status: { status: 'ExecutableMissing' },
  },
  {
    id: 'duckstation',
    name: 'DuckStation',
    systems: ['Sony PlayStation'],
    supported_extensions: ['.cue', '.chd', '.iso', '.bin', '.m3u', '.pbp'],
    argument_template: ['-batch', '{rom}'],
    working_dir_rule: 'EmulatorDir',
    executable_path: null,
    core_path: null,
    is_builtin: true,
    detection_hints: {
      known_paths: ['%PROGRAMFILES%\\DuckStation\\duckstation-qt-x64-ReleaseLTCG.exe'],
      registry_keys: [],
      shortcut_names: ['DuckStation.lnk'],
      executable_names: ['duckstation-qt-x64-ReleaseLTCG.exe', 'duckstation-nogui-x64-ReleaseLTCG.exe'],
    },
    verification_source: 'https://github.com/stenzek/duckstation#command-line-arguments',
    validation_status: { status: 'ExecutableMissing' },
  },
];

export const emulatorService = {
  getEmulatorProfiles: async (): Promise<EmulatorProfile[]> => {
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<EmulatorProfile[]>('get_emulator_profiles');
    }
    return Promise.resolve([...mockProfiles]);
  },

  saveEmulatorProfile: async (profile: EmulatorProfile): Promise<EmulatorProfile> => {
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<EmulatorProfile>('save_emulator_profile', { profile });
    }

    const idx = mockProfiles.findIndex((p) => p.id === profile.id);
    if (idx >= 0) {
      mockProfiles[idx] = { ...profile };
    } else {
      mockProfiles.push({ ...profile });
    }
    return Promise.resolve({ ...profile });
  },

  deleteEmulatorProfile: async (id: string): Promise<boolean> => {
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<boolean>('delete_emulator_profile', { id });
    }

    mockProfiles = mockProfiles.filter((p) => p.id !== id);
    return Promise.resolve(true);
  },

  detectEmulators: async (): Promise<EmulatorProfile[]> => {
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<EmulatorProfile[]>('detect_emulators');
    }

    // In mock mode, pretend RetroArch is verified and detected
    const retro = mockProfiles.find((p) => p.id === 'retroarch');
    if (retro) {
      retro.executable_path = 'C:/RetroArch-Win64/retroarch.exe';
      retro.validation_status = { status: 'Verified' };
    }
    return Promise.resolve([...mockProfiles]);
  },

  validateEmulatorPath: async (
    executablePath: string,
    corePath?: string | null,
    template: string[] = ['{rom}']
  ): Promise<EmulatorValidationStatus> => {
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<EmulatorValidationStatus>('validate_emulator_path', {
        executablePath,
        corePath: corePath || null,
        template,
      });
    }

    if (!executablePath) {
      return { status: 'ExecutableMissing' };
    }
    if (template.some((t) => t.includes('{core}')) && !corePath) {
      return { status: 'NeedsConfiguration', detail: 'Selected profile argument template requires a Libretro core path' };
    }
    return { status: 'Verified' };
  },

  scanRomFolder: async (options: RomScanOptions): Promise<RomScanResult> => {
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<RomScanResult>('scan_rom_folder', { options });
    }

    // Browser / mock preview
    const mockCandidates: RomCandidate[] = [
      {
        id: 'mock-rom-1',
        title: 'Chrono Trigger',
        rom_path: `${options.folder_path}/Chrono Trigger (USA).sfc`,
        system: options.system || 'SNES',
        profile_id: options.profile_id,
        file_size_bytes: 4194304,
        grouped_files: [],
        selected: true,
        is_duplicate: false,
      },
      {
        id: 'mock-rom-2',
        title: 'Final Fantasy VII',
        rom_path: `${options.folder_path}/Final Fantasy VII (USA) (Disc 1).cue`,
        system: options.system || 'PlayStation',
        profile_id: options.profile_id,
        file_size_bytes: 524288000,
        grouped_files: [
          `${options.folder_path}/Final Fantasy VII (USA) (Disc 1).bin`,
          `${options.folder_path}/Final Fantasy VII (USA) (Disc 2).cue`,
          `${options.folder_path}/Final Fantasy VII (USA) (Disc 2).bin`,
          `${options.folder_path}/Final Fantasy VII (USA) (Disc 3).cue`,
          `${options.folder_path}/Final Fantasy VII (USA) (Disc 3).bin`,
        ],
        selected: true,
        is_duplicate: false,
      },
      {
        id: 'mock-rom-3',
        title: 'Crash Bandicoot',
        rom_path: `${options.folder_path}/Crash Bandicoot (USA).cue`,
        system: options.system || 'PlayStation',
        profile_id: options.profile_id,
        file_size_bytes: 419430400,
        grouped_files: [
          `${options.folder_path}/Crash Bandicoot (USA) (Track 1).bin`,
          `${options.folder_path}/Crash Bandicoot (USA) (Track 2).bin`,
          `${options.folder_path}/Crash Bandicoot (USA) (Track 3).bin`,
        ],
        selected: true,
        is_duplicate: false,
      },
    ];

    return Promise.resolve({
      candidates: mockCandidates,
      total_files_scanned: 10,
      grouped_files_count: 7,
      duplicates_count: 0,
    });
  },

  importEmulatedGames: async (candidates: RomCandidate[]): Promise<number> => {
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<number>('import_emulated_games', { candidates });
    }

    return Promise.resolve(candidates.length);
  },

  testLaunchEmulator: async (profileId: string, testFilePath: string): Promise<LaunchResult> => {
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<LaunchResult>('test_launch_emulator', { profileId, testFilePath });
    }

    return Promise.resolve({
      success: true,
      pid: 4321,
      message: `Test launch simulated for emulator "${profileId}" with ROM "${testFilePath}"`,
    });
  },
};
