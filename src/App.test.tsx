import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from './App';
import * as apiModule from './services/api';
import { Game } from './types/models';

describe('GameShelf Shell & Phase 2 UI Tests', () => {
  const sampleGame: Game = {
    id: 'game-123',
    title: 'Hollow Knight',
    sort_title: 'hollow knight',
    source_kind: 'Standalone',
    launch_action: {
      type: 'Executable',
      path: 'C:/Games/HollowKnight/hollow_knight.exe',
      args: ['-fullscreen'],
      working_dir: 'C:/Games/HollowKnight',
    },
    status: 'Installed',
    is_favorite: false,
    is_hidden: false,
    genres: ['Metroidvania'],
    tags: [],
    user_tags: ['Challenging'],
    created_at: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(apiModule.api, 'getAppInfo').mockResolvedValue({
      name: 'GameShelf',
      version: '0.1.0',
      bundle_id: 'com.gameshelf.app',
      os: 'Windows 11 Test Host',
      data_dir: 'C:/Test/AppData',
      log_dir: 'C:/Test/Logs',
      db_version: 2,
    });

    vi.spyOn(apiModule.api, 'getSettings').mockResolvedValue({
      theme: 'dark',
      default_view_mode: 'grid',
      grid_card_size: 'medium',
      steam_grid_db_configured: false,
      close_to_tray: false,
      minimize_to_tray: false,
      launch_on_startup: false,
      onboarding_completed: true,
      accent_color: '#7C6CFF',
      reduced_motion: 'system',
      card_density: 'comfortable',
    });
  });

  it('renders application shell with title bar and sidebar', async () => {
    vi.spyOn(apiModule.api, 'listGames').mockResolvedValue({
      games: [],
      total: 0,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText(/GameShelf/i)[0]).toBeDefined();
      expect(screen.getByText('Library')).toBeDefined();
      expect(screen.getByText('Favorites')).toBeDefined();
      expect(screen.getAllByText('Recently Played')[0]).toBeDefined();
    });
  });

  it('displays empty state when library has no games', async () => {
    vi.spyOn(apiModule.api, 'listGames').mockResolvedValue({
      games: [],
      total: 0,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Your shelf is empty')).toBeDefined();
      expect(
        screen.getByText(/GameShelf discovers your installed PC games, Steam titles, and DRM-free directories/i)
      ).toBeDefined();
      expect(screen.getByText('Scan Folder for Games')).toBeDefined();
      expect(screen.getByText('Add Single Game')).toBeDefined();
    });
  });

  it('opens and closes settings modal with all skeleton sections', async () => {
    vi.spyOn(apiModule.api, 'listGames').mockResolvedValue({
      games: [],
      total: 0,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeDefined();
    });

    const settingsBtn = screen.getByText('Settings');
    fireEvent.click(settingsBtn);

    expect(screen.getByText('Preferences')).toBeDefined();
    expect(screen.getByText('General')).toBeDefined();
    expect(screen.getByText('Appearance')).toBeDefined();
    expect(screen.getByText('Library & Scan')).toBeDefined();
    expect(screen.getByText('Diagnostics')).toBeDefined();

    fireEvent.click(screen.getByText('Diagnostics'));
    expect(screen.getByText('Host Environment')).toBeDefined();
    expect(screen.getByText('Database Schema Version')).toBeDefined();
    expect(screen.getByText('Privacy Notice')).toBeDefined();
  });

  it('opens Add Game modal, enters game details, and adds it to the library', async () => {
    vi.spyOn(apiModule.api, 'listGames').mockResolvedValue({
      games: [],
      total: 0,
    });

    vi.spyOn(apiModule.api, 'inspectFile').mockResolvedValue({
      title: 'Hades',
      executable_path: 'C:/Games/Hades/Hades.exe',
      working_dir: 'C:/Games/Hades',
      args: [],
      is_shortcut: false,
      exists: true,
      normalized_path: 'c:/games/hades/hades.exe',
    });

    vi.spyOn(apiModule.api, 'checkDuplicate').mockResolvedValue({
      is_duplicate: false,
      existing_game: null,
    });

    const addedGame: Game = {
      id: 'hades-id',
      title: 'Hades',
      sort_title: 'hades',
      source_kind: 'Standalone',
      launch_action: {
        type: 'Executable',
        path: 'C:/Games/Hades/Hades.exe',
        args: [],
        working_dir: 'C:/Games/Hades',
      },
      status: 'Installed',
      is_favorite: false,
      is_hidden: false,
      genres: [],
      tags: [],
      user_tags: [],
      created_at: '2026-01-01T00:00:00Z',
    };

    vi.spyOn(apiModule.api, 'addManualGame').mockResolvedValue(addedGame);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Add Game')).toBeDefined();
    });

    // Click Add Game button
    fireEvent.click(screen.getByText('Add Game'));

    // Modal opens
    expect(screen.getByText('Add Game to Library')).toBeDefined();

    // Input path
    const pathInput = screen.getByPlaceholderText(/C:\\Games\\Example\\game\.exe/i);
    fireEvent.change(pathInput, { target: { value: 'C:/Games/Hades/Hades.exe' } });
    fireEvent.blur(pathInput);

    await waitFor(() => {
      expect(apiModule.api.inspectFile).toHaveBeenCalledWith('C:/Games/Hades/Hades.exe');
      expect(screen.getByDisplayValue('Hades')).toBeDefined();
    });

    // Submit form
    const submitBtn = screen.getByText('Add to Library');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiModule.api.addManualGame).toHaveBeenCalledWith({
        title: 'Hades',
        executable_path: 'C:/Games/Hades/Hades.exe',
        args: [],
        working_dir: 'C:/Games/Hades',
        is_shortcut: false,
      });
      // Game card appears in library
      expect(screen.getAllByText('Hades')[0]).toBeDefined();
    });
  });

  it('selects a game, opens detail panel, and triggers launch', async () => {
    vi.spyOn(apiModule.api, 'listGames').mockResolvedValue({
      games: [sampleGame],
      total: 1,
    });

    vi.spyOn(apiModule.api, 'launchGame').mockResolvedValue({
      success: true,
      pid: 9999,
      message: 'Successfully launched process (PID 9999)',
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText('Hollow Knight')[0]).toBeDefined();
    });

    // Click game card to open detail panel
    fireEvent.click(screen.getAllByText('Hollow Knight')[0]);

    await waitFor(() => {
      expect(screen.getByText('Target Configuration')).toBeDefined();
      expect(screen.getByText('Play')).toBeDefined();
    });

    // Click Play button
    fireEvent.click(screen.getByText('Play'));

    await waitFor(() => {
      expect(apiModule.api.launchGame).toHaveBeenCalledWith('game-123');
    });
  });

  it('detects duplicate executable path and offers Open Existing', async () => {
    vi.spyOn(apiModule.api, 'listGames').mockResolvedValue({
      games: [sampleGame],
      total: 1,
    });

    vi.spyOn(apiModule.api, 'inspectFile').mockResolvedValue({
      title: 'Hollow Knight Duplicate',
      executable_path: 'C:/Games/HollowKnight/hollow_knight.exe',
      working_dir: 'C:/Games/HollowKnight',
      args: [],
      is_shortcut: false,
      exists: true,
      normalized_path: 'c:/games/hollowknight/hollow_knight.exe',
    });

    vi.spyOn(apiModule.api, 'checkDuplicate').mockResolvedValue({
      is_duplicate: true,
      existing_game: sampleGame,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Add Game')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Add Game'));

    const pathInput = screen.getByPlaceholderText(/C:\\Games\\Example\\game\.exe/i);
    fireEvent.change(pathInput, { target: { value: 'C:/Games/HollowKnight/hollow_knight.exe' } });
    fireEvent.blur(pathInput);

    await waitFor(() => {
      expect(screen.getByText('Game already exists in library')).toBeDefined();
      expect(screen.getByText('Open Existing Game')).toBeDefined();
    });

    // Click Open Existing Game
    fireEvent.click(screen.getByText('Open Existing Game'));

    // Modal should close and the existing game's detail panel opens
    await waitFor(() => {
      expect(screen.queryByText('Add Game to Library')).toBeNull();
      expect(screen.getByText('Target Configuration')).toBeDefined();
    });
  });

  it('removes game from library with file-safety confirmation', async () => {
    vi.spyOn(apiModule.api, 'listGames').mockResolvedValue({
      games: [sampleGame],
      total: 1,
    });

    vi.spyOn(apiModule.api, 'removeGame').mockResolvedValue(true);

    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText('Hollow Knight')[0]).toBeDefined();
    });

    // Open detail panel
    fireEvent.click(screen.getAllByText('Hollow Knight')[0]);

    await waitFor(() => {
      expect(screen.getByText('Remove from Library')).toBeDefined();
    });

    // Click Remove from Library
    fireEvent.click(screen.getByText('Remove from Library'));

    // Confirmation modal appears with file safety note
    expect(screen.getByText('Remove from Library?')).toBeDefined();
    expect(screen.getByText(/Your game files, installations, and save data on your disk will/i)).toBeDefined();

    // Confirm removal
    const confirmButtons = screen.getAllByText('Remove from Library');
    // The second button is the confirm button in the modal
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(apiModule.api.removeGame).toHaveBeenCalledWith('game-123');
      expect(screen.queryByText('Hollow Knight')).toBeNull();
    });
  });

  it('opens Settings Integrations tab, views Steam libraries, and triggers rescan', async () => {
    vi.spyOn(apiModule.api, 'listGames').mockResolvedValue({
      games: [],
      total: 0,
    });

    vi.spyOn(apiModule.api, 'getSteamStatus').mockResolvedValue({
      is_installed: true,
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
      filter_config: {
        rules: [
          {
            id: 'redistributables',
            name: 'Common Redistributables',
            description: '',
            enabled: true,
          },
        ],
        explicit_included_app_ids: [],
        explicit_excluded_app_ids: [],
      },
      last_scanned_at: '2026-01-01T00:00:00Z',
      total_imported_games: 1,
      warnings: [],
    });

    vi.spyOn(apiModule.api, 'rescanSteam').mockResolvedValue({
      steam_path: 'C:/Program Files (x86)/Steam',
      libraries: [],
      imported_games: [
        {
          id: 'steam-105600',
          title: 'Terraria',
          sort_title: 'terraria',
          source_kind: 'Steam',
          source_id: '105600',
          install_dir: 'C:/Steam/steamapps/common/Terraria',
          launch_action: { type: 'Steam', app_id: 105600 },
          status: 'Installed',
          is_favorite: false,
          is_hidden: false,
          genres: [],
          tags: [],
          user_tags: [],
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      skipped_apps: [],
      warnings: [],
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Settings'));

    await waitFor(() => {
      expect(screen.getByText('Integrations')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Integrations'));

    await waitFor(() => {
      expect(screen.getByText('Steam (Installed Games)')).toBeDefined();
      expect(screen.getByText('Supported')).toBeDefined();
      expect(screen.getByText('Rescan Steam Library')).toBeDefined();
    });

    // Trigger rescan
    fireEvent.click(screen.getByText('Rescan Steam Library'));

    await waitFor(() => {
      expect(apiModule.api.rescanSteam).toHaveBeenCalled();
    });
  });

  it('opens Scan Folder modal from TopBar and verifies setup stage controls', async () => {
    vi.spyOn(apiModule.api, 'listGames').mockResolvedValue({
      games: [],
      total: 0,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Scan Folder')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Scan Folder'));

    // Modal opens
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined();
      expect(screen.getByRole('heading', { name: 'Scan Folder for Games' })).toBeDefined();
      expect(screen.getByText(/Choose a local folder to discover game executables/i)).toBeDefined();
      expect(screen.getByPlaceholderText(/e\.g\. D:\\Games or C:\\Games\\PC/i)).toBeDefined();
      expect(screen.getByText(/Safety guarantee:/i)).toBeDefined();
      expect(screen.getByText(/Folder Recursion Depth/i)).toBeDefined();
    });
  });

  it('opens Scan Folder modal from EmptyState button', async () => {
    vi.spyOn(apiModule.api, 'listGames').mockResolvedValue({
      games: [],
      total: 0,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Scan Folder for Games')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Scan Folder for Games'));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined();
      expect(screen.getByRole('heading', { name: 'Scan Folder for Games' })).toBeDefined();
    });
  });

  it('opens Scan ROMs modal from TopBar and verifies setup stage controls', async () => {
    vi.spyOn(apiModule.api, 'listGames').mockResolvedValue({
      games: [],
      total: 0,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Scan ROMs')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Scan ROMs'));

    await waitFor(() => {
      expect(screen.getByText('Scan & Import ROMs')).toBeDefined();
      expect(screen.getByText(/Discover ROMs with automatic multi-disc & multi-track grouping/i)).toBeDefined();
      expect(screen.getByText('Target Emulator Profile')).toBeDefined();
      expect(screen.getByPlaceholderText(/e\.g\. D:\\Emulation\\ROMs\\PS1/i)).toBeDefined();
    });
  });

  it('navigates to Emulators settings tab, displays profiles, and opens profile configuration', async () => {
    vi.spyOn(apiModule.api, 'listGames').mockResolvedValue({
      games: [],
      total: 0,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Settings'));

    await waitFor(() => {
      expect(screen.getByText('Preferences')).toBeDefined();
      expect(screen.getByText('Emulators')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Emulators'));

    await waitFor(() => {
      expect(screen.getByText(/Data-driven emulator CLI profiles, bounded detection/i)).toBeDefined();
      expect(screen.getByText('Auto-Detect')).toBeDefined();
      expect(screen.getByText('Add Profile')).toBeDefined();
      expect(screen.getByText('RetroArch')).toBeDefined();
      expect(screen.getByText('Dolphin')).toBeDefined();
      expect(screen.getByText('PCSX2')).toBeDefined();
      expect(screen.getByText('DuckStation')).toBeDefined();
    });
  });

  it('renders emulated game in GameDetailPanel with profile and ROM details', async () => {
    const emulatedGame: Game = {
      id: 'game-emu-1',
      title: 'Final Fantasy VII',
      sort_title: 'final fantasy vii',
      source_kind: 'Emulated',
      launch_action: {
        type: 'EmulatedGame',
        profile_id: 'duckstation',
        rom_path: 'C:/Emulation/PS1/Final Fantasy VII (USA) (Disc 1).cue',
      },
      status: 'Installed',
      is_favorite: true,
      is_hidden: false,
      genres: ['RPG'],
      tags: [],
      user_tags: ['Classic'],
      created_at: '2026-01-01T00:00:00Z',
    };

    vi.spyOn(apiModule.api, 'listGames').mockResolvedValue({
      games: [emulatedGame],
      total: 1,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText('Final Fantasy VII')[0]).toBeDefined();
    });

    fireEvent.click(screen.getAllByText('Final Fantasy VII')[0]);

    await waitFor(() => {
      expect(screen.getByText('Source:')).toBeDefined();
      expect(screen.getByText('Emulated Game')).toBeDefined();
      expect(screen.getByText('duckstation')).toBeDefined();
      expect(screen.getByText('C:/Emulation/PS1/Final Fantasy VII (USA) (Disc 1).cue')).toBeDefined();
    });
  });
});



