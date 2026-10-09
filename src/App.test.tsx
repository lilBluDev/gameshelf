import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from './App';
import * as apiModule from './services/api';

describe('GameShelf Shell & UI Smoke Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementation
    vi.spyOn(apiModule.api, 'getAppInfo').mockResolvedValue({
      name: 'GameShelf',
      version: '0.1.0',
      bundle_id: 'com.gameshelf.app',
      os: 'Windows 11 Test Host',
      data_dir: 'C:/Test/AppData',
      log_dir: 'C:/Test/Logs',
      db_version: 1,
    });

    vi.spyOn(apiModule.api, 'getSettings').mockResolvedValue({
      theme: 'dark',
      default_view_mode: 'grid',
      grid_card_size: 'medium',
      steam_grid_db_configured: false,
      close_to_tray: false,
    });
  });

  it('renders application shell with title bar and sidebar', async () => {
    vi.spyOn(apiModule.api, 'listGames').mockResolvedValue({
      games: [],
      total: 0,
    });

    render(<App />);

    await waitFor(() => {
      // Brand in TitleBar
      expect(screen.getByText(/GameShelf/i)).toBeDefined();
      // Library in Sidebar
      expect(screen.getByText('Library')).toBeDefined();
      expect(screen.getByText('Favorites')).toBeDefined();
      expect(screen.getByText('Recently Played')).toBeDefined();
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
        screen.getByText(/GameShelf stores your games in a fast, local-first SQLite database/i)
      ).toBeDefined();
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

    // Modal header
    expect(screen.getByText('Preferences')).toBeDefined();

    // Verify sections exist
    expect(screen.getByText('General')).toBeDefined();
    expect(screen.getByText('Appearance')).toBeDefined();
    expect(screen.getByText('Library & Scan')).toBeDefined();
    expect(screen.getByText('Integrations')).toBeDefined();
    expect(screen.getByText('Emulators')).toBeDefined();
    expect(screen.getByText('Metadata & Artwork')).toBeDefined();
    expect(screen.getByText('Diagnostics')).toBeDefined();

    // Click diagnostics tab
    fireEvent.click(screen.getByText('Diagnostics'));
    expect(screen.getByText('Host Environment')).toBeDefined();
    expect(screen.getByText('Database Schema Version')).toBeDefined();
    expect(screen.getByText('Privacy Notice')).toBeDefined();
  });
});
