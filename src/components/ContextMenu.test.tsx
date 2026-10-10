import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContextMenu } from './ContextMenu';
import { GameCard } from './GameCard';
import { GameActionEntry } from '../features/library/gameActions';
import { Play, Sliders, Trash2 } from 'lucide-react';
import { Game } from '../types/models';

function createMockGame(): Game {
  return {
    id: 'game-42',
    title: 'Celeste',
    sort_title: 'celeste',
    source_kind: 'Steam',
    status: 'Installed',
    genres: ['Platformer'],
    tags: [],
    user_tags: [],
    launch_action: { type: 'Steam', app_id: 504230 },
    is_favorite: false,
    is_hidden: false,
    created_at: '2026-01-01T00:00:00Z',
  };
}

describe('ContextMenu component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders with role="menu", role="menuitem", and handles item activation', () => {
    const handlePlay = vi.fn();
    const handleClose = vi.fn();

    const entries: GameActionEntry[] = [
      {
        type: 'item',
        action: {
          id: 'play',
          label: 'Play',
          icon: Play,
          enabled: true,
          defaultAction: true,
          execute: handlePlay,
        },
      },
      {
        type: 'separator',
        id: 'sep_1',
      },
      {
        type: 'item',
        action: {
          id: 'remove_from_library',
          label: 'Remove from library…',
          icon: Trash2,
          enabled: true,
          danger: true,
          execute: vi.fn(),
        },
      },
    ];

    render(
      <ContextMenu
        x={100}
        y={150}
        entries={entries}
        onClose={handleClose}
      />
    );

    const menu = screen.getByRole('menu');
    expect(menu).toBeDefined();

    const menuItems = screen.getAllByRole('menuitem');
    expect(menuItems.length).toBe(2);

    const separator = screen.getByRole('separator');
    expect(separator).toBeDefined();

    fireEvent.click(menuItems[0]);
    expect(handlePlay).toHaveBeenCalledTimes(1);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('disabled items cannot be clicked and expose their disabled reason', () => {
    const handleExecute = vi.fn();
    const handleClose = vi.fn();

    const entries: GameActionEntry[] = [
      {
        type: 'item',
        action: {
          id: 'play',
          label: 'Play',
          icon: Play,
          enabled: false,
          disabledReason: 'Game files are missing',
          execute: handleExecute,
        },
      },
    ];

    render(
      <ContextMenu
        x={50}
        y={50}
        entries={entries}
        onClose={handleClose}
      />
    );

    const item = screen.getByRole('menuitem');
    expect(item.getAttribute('aria-disabled')).toBe('true');
    expect(item.getAttribute('title')).toBe('Game files are missing');
    expect(item.getAttribute('aria-description')).toBe('Game files are missing');

    fireEvent.click(item);
    expect(handleExecute).not.toHaveBeenCalled();
    expect(handleClose).not.toHaveBeenCalled();
  });

  it('handles keyboard navigation and closes on Escape returning focus to origin element', () => {
    const originButton = document.createElement('button');
    document.body.appendChild(originButton);
    const focusSpy = vi.spyOn(originButton, 'focus');

    const handleAction = vi.fn();
    const handleClose = vi.fn();

    const entries: GameActionEntry[] = [
      {
        type: 'item',
        action: { id: 'play', label: 'Play', icon: Play, enabled: true, execute: handleAction },
      },
      {
        type: 'item',
        action: { id: 'launch_settings', label: 'Settings', icon: Sliders, enabled: true, execute: handleAction },
      },
    ];

    render(
      <ContextMenu
        x={100}
        y={100}
        entries={entries}
        onClose={handleClose}
        originElement={originButton}
      />
    );

    const menu = screen.getByRole('menu');

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    fireEvent.keyDown(menu, { key: 'Home' });
    fireEvent.keyDown(menu, { key: 'End' });

    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
    expect(focusSpy).toHaveBeenCalledTimes(1);

    document.body.removeChild(originButton);
  });

  it('supports type-ahead search by first character', () => {
    const entries: GameActionEntry[] = [
      {
        type: 'item',
        action: { id: 'play', label: 'Play', icon: Play, enabled: true, execute: vi.fn() },
      },
      {
        type: 'item',
        action: { id: 'edit_details', label: 'Edit details…', icon: Sliders, enabled: true, execute: vi.fn() },
      },
    ];

    render(
      <ContextMenu
        x={100}
        y={100}
        entries={entries}
        onClose={vi.fn()}
      />
    );

    const menu = screen.getByRole('menu');
    fireEvent.keyDown(menu, { key: 'e' });
    const items = screen.getAllByRole('menuitem');
    expect(items[1].className).toContain('ring-1');
  });

  it('flips position when overflowing window edges', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 800 });
    Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 600 });

    const entries: GameActionEntry[] = [
      {
        type: 'item',
        action: { id: 'play', label: 'Play', icon: Play, enabled: true, execute: vi.fn() },
      },
    ];

    render(
      <ContextMenu
        x={790}
        y={590}
        entries={entries}
        onClose={vi.fn()}
      />
    );

    const menu = screen.getByRole('menu');
    expect(menu).toBeDefined();
    const styleLeft = parseInt(menu.style.left, 10);
    const styleTop = parseInt(menu.style.top, 10);
    expect(styleLeft).toBeLessThanOrEqual(792);
    expect(styleTop).toBeLessThanOrEqual(592);
  });
});

describe('GameCard Context Menu Triggers', () => {
  it('opens on contextmenu event, ContextMenu key, and Shift+F10, but not on normal left click', () => {
    const game = createMockGame();
    const onSelect = vi.fn();
    const onContextMenu = vi.fn();

    render(
      <GameCard
        game={game}
        isSelected={false}
        onSelect={onSelect}
        viewMode="grid"
        onContextMenu={onContextMenu}
      />
    );

    const card = screen.getByTestId('game-card');

    fireEvent.click(card);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onContextMenu).not.toHaveBeenCalled();

    fireEvent.contextMenu(card);
    expect(onContextMenu).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(card, { key: 'ContextMenu' });
    expect(onContextMenu).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(card, { key: 'F10', shiftKey: true });
    expect(onContextMenu).toHaveBeenCalledTimes(3);

    fireEvent.keyDown(card, { key: 'F10', shiftKey: false });
    expect(onContextMenu).toHaveBeenCalledTimes(3);
  });
});
