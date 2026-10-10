import { describe, it, expect, vi } from 'vitest';
import { getGameActions, GameActionContext } from './gameActions';
import { Game } from '../../types/models';

function createMockGame(overrides?: Partial<Game>): Game {
  return {
    id: 'test-game-1',
    title: 'Hollow Knight',
    sort_title: 'hollow knight',
    source_kind: 'Steam',
    source_id: '367520',
    status: 'Installed',
    genres: ['Action', 'Metroidvania'],
    tags: [],
    user_tags: ['Favorites'],
    launch_action: { type: 'Steam', app_id: 367520 },
    is_favorite: false,
    is_hidden: false,
    playtime_seconds: 1200,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('Game Action Registry', () => {
  it('returns items in the required order and matches between detail panel and context menu', () => {
    const game = createMockGame();
    const context: GameActionContext = {
      game,
      isRunning: false,
      activeSession: false,
    };

    const actions = getGameActions(context);
    const itemIds = actions
      .filter((e): e is { type: 'item'; action: any } => e.type === 'item')
      .map((e) => e.action.id);

    expect(itemIds).toEqual([
      'play',
      'launch_settings',
      'toggle_favorite',
      'toggle_hide',
      'open_folder',
      'change_artwork',
      'refresh_metadata',
      'edit_details',
      'remove_from_library',
    ]);

    const detailPanelActions = getGameActions(context);
    expect(detailPanelActions.length).toBe(actions.length);
    for (let i = 0; i < actions.length; i++) {
      expect(actions[i].type).toBe(detailPanelActions[i].type);
    }
  });

  it('includes stop_tracking session only when a playtime session is active', () => {
    const game = createMockGame();
    const actionsInactive = getGameActions({ game, activeSession: false });
    expect(actionsInactive.some((e) => e.type === 'item' && e.action.id === 'stop_tracking')).toBe(false);

    const actionsActive = getGameActions({ game, activeSession: true });
    expect(actionsActive.some((e) => e.type === 'item' && e.action.id === 'stop_tracking')).toBe(true);
  });

  it('disables play and folder opening with reasons when game is missing', () => {
    const missingGame = createMockGame({ status: 'Missing' });
    const actions = getGameActions({ game: missingGame });

    const playAction = actions.find((e) => e.type === 'item' && e.action.id === 'play');
    expect(playAction?.type === 'item' && playAction.action.enabled).toBe(false);
    expect(playAction?.type === 'item' && playAction.action.disabledReason).toBe('Game files are missing');

    const folderAction = actions.find((e) => e.type === 'item' && e.action.id === 'open_folder');
    expect(folderAction?.type === 'item' && folderAction.action.enabled).toBe(false);
    expect(folderAction?.type === 'item' && folderAction.action.disabledReason).toBe('Install folder not found');
  });

  it('disables play when game is already running', () => {
    const game = createMockGame();
    const actions = getGameActions({ game, isRunning: true });

    const playAction = actions.find((e) => e.type === 'item' && e.action.id === 'play');
    expect(playAction?.type === 'item' && playAction.action.enabled).toBe(false);
    expect(playAction?.type === 'item' && playAction.action.disabledReason).toBe('Game is already running');
    expect(playAction?.type === 'item' && playAction.action.label).toBe('Running');
  });

  it('toggles labels for favorite and hide actions dynamically', () => {
    const unfavGame = createMockGame({ is_favorite: false, is_hidden: false });
    const actions1 = getGameActions({ game: unfavGame });
    const fav1 = actions1.find((e) => e.type === 'item' && e.action.id === 'toggle_favorite');
    const hide1 = actions1.find((e) => e.type === 'item' && e.action.id === 'toggle_hide');
    expect(fav1?.type === 'item' && fav1.action.label).toBe('Favorite');
    expect(hide1?.type === 'item' && hide1.action.label).toBe('Hide');

    const favGame = createMockGame({ is_favorite: true, is_hidden: true });
    const actions2 = getGameActions({ game: favGame });
    const fav2 = actions2.find((e) => e.type === 'item' && e.action.id === 'toggle_favorite');
    const hide2 = actions2.find((e) => e.type === 'item' && e.action.id === 'toggle_hide');
    expect(fav2?.type === 'item' && fav2.action.label).toBe('Unfavorite');
    expect(hide2?.type === 'item' && hide2.action.label).toBe('Unhide');
  });

  it('dispatches to handlers and sets danger flag on removal', () => {
    const game = createMockGame();
    const onPlay = vi.fn();
    const onRemove = vi.fn();

    const actions = getGameActions({
      game,
      onPlay,
      onRemoveFromLibrary: onRemove,
    });

    const playAction = actions.find((e) => e.type === 'item' && e.action.id === 'play');
    if (playAction?.type === 'item') {
      playAction.action.execute();
      expect(onPlay).toHaveBeenCalledWith(game);
    }

    const removeAction = actions.find((e) => e.type === 'item' && e.action.id === 'remove_from_library');
    expect(removeAction?.type === 'item' && removeAction.action.danger).toBe(true);
    if (removeAction?.type === 'item') {
      removeAction.action.execute();
      expect(onRemove).toHaveBeenCalledWith(game);
    }
  });
});
