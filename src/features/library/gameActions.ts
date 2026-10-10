import React from 'react';
import {
  Play,
  Sliders,
  Heart,
  Eye,
  EyeOff,
  FolderOpen,
  Palette,
  Sparkles,
  Edit3,
  Clock,
  Trash2,
} from 'lucide-react';
import { Game } from '../../types/models';

export type GameActionId =
  | 'play'
  | 'launch_settings'
  | 'toggle_favorite'
  | 'toggle_hide'
  | 'open_folder'
  | 'change_artwork'
  | 'refresh_metadata'
  | 'edit_details'
  | 'stop_tracking'
  | 'remove_from_library';

export interface GameActionContext {
  game: Game;
  isRunning?: boolean;
  activeSession?: boolean;
  onPlay?: (game: Game) => void;
  onLaunchSettings?: (game: Game) => void;
  onToggleFavorite?: (game: Game) => void;
  onToggleHide?: (game: Game) => void;
  onOpenFolder?: (game: Game) => void;
  onChangeArtwork?: (game: Game) => void;
  onRefreshMetadata?: (game: Game) => void;
  onEditDetails?: (game: Game) => void;
  onStopTracking?: (game: Game) => void;
  onRemoveFromLibrary?: (game: Game) => void;
}

export interface GameActionItem {
  id: GameActionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  enabled: boolean;
  disabledReason?: string;
  danger?: boolean;
  defaultAction?: boolean;
  execute: () => void | Promise<void>;
}

export type GameActionEntry =
  | { type: 'item'; action: GameActionItem }
  | { type: 'separator'; id: string };

export function getGameActions(context: GameActionContext): GameActionEntry[] {
  const { game, isRunning, activeSession } = context;
  const isMissing = game.status === 'Missing';

  const playEnabled = !isMissing && !isRunning;
  const playDisabledReason = isMissing
    ? 'Game files are missing'
    : isRunning
      ? 'Game is already running'
      : undefined;

  const folderEnabled = !isMissing;
  const folderDisabledReason = isMissing ? 'Install folder not found' : undefined;

  const entries: GameActionEntry[] = [
    {
      type: 'item',
      action: {
        id: 'play',
        label: isRunning ? 'Running' : 'Play',
        icon: Play,
        enabled: playEnabled,
        disabledReason: playDisabledReason,
        defaultAction: true,
        execute: () => {
          if (playEnabled && context.onPlay) {
            context.onPlay(game);
          }
        },
      },
    },
    {
      type: 'item',
      action: {
        id: 'launch_settings',
        label: 'Launch settings…',
        icon: Sliders,
        enabled: true,
        execute: () => {
          if (context.onLaunchSettings) {
            context.onLaunchSettings(game);
          }
        },
      },
    },
    {
      type: 'item',
      action: {
        id: 'toggle_favorite',
        label: game.is_favorite ? 'Unfavorite' : 'Favorite',
        icon: Heart,
        enabled: true,
        execute: () => {
          if (context.onToggleFavorite) {
            context.onToggleFavorite(game);
          }
        },
      },
    },
    {
      type: 'item',
      action: {
        id: 'toggle_hide',
        label: game.is_hidden ? 'Unhide' : 'Hide',
        icon: game.is_hidden ? Eye : EyeOff,
        enabled: true,
        execute: () => {
          if (context.onToggleHide) {
            context.onToggleHide(game);
          }
        },
      },
    },
    {
      type: 'item',
      action: {
        id: 'open_folder',
        label: 'Open install folder',
        icon: FolderOpen,
        enabled: folderEnabled,
        disabledReason: folderDisabledReason,
        execute: () => {
          if (folderEnabled && context.onOpenFolder) {
            context.onOpenFolder(game);
          }
        },
      },
    },
    {
      type: 'separator',
      id: 'sep_1',
    },
    {
      type: 'item',
      action: {
        id: 'change_artwork',
        label: 'Change artwork…',
        icon: Palette,
        enabled: true,
        execute: () => {
          if (context.onChangeArtwork) {
            context.onChangeArtwork(game);
          }
        },
      },
    },
    {
      type: 'item',
      action: {
        id: 'refresh_metadata',
        label: 'Refresh metadata',
        icon: Sparkles,
        enabled: true,
        execute: () => {
          if (context.onRefreshMetadata) {
            context.onRefreshMetadata(game);
          }
        },
      },
    },
    {
      type: 'item',
      action: {
        id: 'edit_details',
        label: 'Edit details…',
        icon: Edit3,
        enabled: true,
        execute: () => {
          if (context.onEditDetails) {
            context.onEditDetails(game);
          }
        },
      },
    },
  ];

  if (activeSession) {
    entries.push({
      type: 'separator',
      id: 'sep_tracking',
    });
    entries.push({
      type: 'item',
      action: {
        id: 'stop_tracking',
        label: 'Stop tracking session',
        icon: Clock,
        enabled: true,
        execute: () => {
          if (context.onStopTracking) {
            context.onStopTracking(game);
          }
        },
      },
    });
  }

  entries.push({
    type: 'separator',
    id: 'sep_2',
  });
  entries.push({
    type: 'item',
    action: {
      id: 'remove_from_library',
      label: 'Remove from library…',
      icon: Trash2,
      enabled: true,
      danger: true,
      execute: () => {
        if (context.onRemoveFromLibrary) {
          context.onRemoveFromLibrary(game);
        }
      },
    },
  });

  return entries;
}
