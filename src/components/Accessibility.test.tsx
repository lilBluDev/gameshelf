import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from './Sidebar';
import { SettingsModal } from './SettingsModal';
import { AddGameModal } from './AddGameModal';
import { OnboardingModal } from './OnboardingModal';
import { ScanRomsModal } from './ScanRomsModal';
import { DialogShell } from './ui/DialogShell';
import { Button } from './ui/Button';
import { SegmentedControl } from './ui/SegmentedControl';

describe('Accessibility and ARIA Compliance Tests', () => {
  it('Sidebar sets aria-current="page" on the active navigation item and aria-current=false otherwise', () => {
    render(
      <Sidebar
        activeFilter="all"
        onSelectFilter={vi.fn()}
        onOpenSettings={vi.fn()}
      />
    );

    const libraryBtn = screen.getByRole('button', { name: /library/i });
    expect(libraryBtn.getAttribute('aria-current')).toBe('page');

    const favoritesBtn = screen.getByRole('button', { name: /favorites/i });
    expect(favoritesBtn.getAttribute('aria-current')).toBeNull();
  });

  it('DialogShell renders role="dialog", aria-modal="true", and handles Escape key', () => {
    const handleClose = vi.fn();

    render(
      <DialogShell
        isOpen={true}
        onClose={handleClose}
        title="Test Accessible Dialog"
        description="Verifying accessible dialog shell properties"
      >
        <p>Dialog body content</p>
      </DialogShell>
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeDefined();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByText('Test Accessible Dialog')).toBeDefined();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('SettingsModal renders role="dialog" with aria-modal="true" and aria-label', () => {
    const handleClose = vi.fn();
    const mockSettings = {
      theme: 'dark',
      view_mode: 'grid',
      card_size: 'medium',
      group_by: 'none',
      sort_by: 'title',
      sort_direction: 'asc',
      minimize_to_tray: 'false',
      close_to_tray: 'false',
      start_with_system: 'false',
      start_minimized: 'false',
      scan_folders: '[]',
      steam_path: '',
      auto_scan_steam: 'true',
      filter_steam_tools: 'true',
      steam_libraries: '[]',
      steam_filter_rules: '[]',
      skipped_steam_apps: '[]',
      auto_detect_emulators: 'true',
      rom_extensions: '',
      sgdb_api_key_configured: 'false',
      auto_download_artwork: 'true',
      artwork_cache_dir: '',
      onboarding_completed: 'true',
      auto_track_playtime: 'true',
      auto_track_steam: 'true',
      show_play_session_notifications: 'true',
      steam_sync_interval_mins: '60',
      active_session_game_id: '',
      active_session_start_time: '',
      poll_interval_seconds: '2',
    };

    render(
      <SettingsModal
        isOpen={true}
        onClose={handleClose}
        appInfo={null}
        settings={mockSettings as any}
        onUpdateSetting={vi.fn()}
      />
    );

    const dialog = screen.getByRole('dialog', { name: 'Preferences' });
    expect(dialog).toBeDefined();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('AddGameModal renders role="dialog" with aria-modal="true"', () => {
    render(
      <AddGameModal
        isOpen={true}
        onClose={vi.fn()}
        onGameAdded={vi.fn()}
        onOpenExisting={vi.fn()}
        onError={vi.fn()}
      />
    );

    const dialog = screen.getByRole('dialog', { name: 'Add Game to Library' });
    expect(dialog).toBeDefined();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('OnboardingModal renders role="dialog" with aria-modal="true"', () => {
    render(
      <OnboardingModal
        isOpen={true}
        onComplete={vi.fn()}
      />
    );

    const dialog = screen.getByRole('dialog', { name: 'Welcome to GameShelf' });
    expect(dialog).toBeDefined();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('ScanRomsModal renders role="dialog" with aria-modal="true"', () => {
    render(
      <ScanRomsModal
        isOpen={true}
        onClose={vi.fn()}
        onImportComplete={vi.fn()}
      />
    );

    const dialog = screen.getByRole('dialog', { name: 'Scan & Import ROMs' });
    expect(dialog).toBeDefined();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('Button and SegmentedControl include focus-visible outline rings for keyboard navigation', () => {
    render(
      <div>
        <Button variant="primary">Submit Action</Button>
        <SegmentedControl
          value="grid"
          options={[
            { value: 'grid', label: 'Grid' },
            { value: 'list', label: 'List' },
          ]}
          onChange={vi.fn()}
        />
      </div>
    );

    const btn = screen.getByRole('button', { name: 'Submit Action' });
    expect(btn.className).toContain('focus-visible:ring');

    const gridOption = screen.getByRole('radio', { name: 'Grid' });
    expect(gridOption.getAttribute('aria-checked')).toBe('true');
    expect(gridOption.className).toContain('focus-visible:ring');
  });
});
