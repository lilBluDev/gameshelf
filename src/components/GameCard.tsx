import React, { useState, useEffect } from 'react';
import { Game } from '../types/models';
import { getDeterministicGradient, getTitleInitials, resolveArtworkSrc } from '../utils/artwork';
import { Heart, Flame, Monitor, Cpu, Clock, AlertCircle } from 'lucide-react';
import { formatPlaytime } from '../utils/playtime';

export interface GameCardProps {
  game: Game;
  isSelected: boolean;
  onSelect: (game: Game) => void;
  viewMode: 'grid' | 'list';
  playtimeTrackingEnabled?: boolean;
  onContextMenu?: (
    game: Game,
    event: React.MouseEvent | { clientX: number; clientY: number },
    targetElement?: HTMLElement
  ) => void;
}

export const GameCard: React.FC<GameCardProps> = ({
  game,
  isSelected,
  onSelect,
  viewMode,
  playtimeTrackingEnabled,
  onContextMenu,
}) => {
  const [imgError, setImgError] = useState(false);
  const coverAsset = game.artwork?.cover;
  const coverSrc = !imgError ? resolveArtworkSrc(coverAsset) : null;
  const gradient = getDeterministicGradient(game.title);
  const initials = getTitleInitials(game.title);

  useEffect(() => {
    setImgError(false);
  }, [coverAsset?.cached_path, coverAsset?.source_url]);

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu?.(game, e, e.currentTarget);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      onContextMenu?.(
        game,
        { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 },
        e.currentTarget
      );
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(game);
    }
  };

  const getSourceIcon = () => {
    switch (game.source_kind) {
      case 'Steam':
        return <Flame className="w-3 h-3 text-muted" />;
      case 'Standalone':
      case 'Shortcut':
        return <Monitor className="w-3 h-3 text-muted" />;
      case 'Emulated':
        return <Cpu className="w-3 h-3 text-muted" />;
      default:
        return null;
    }
  };

  if (viewMode === 'list') {
    return (
      <div
        data-testid="game-card"
        role="button"
        tabIndex={0}
        onClick={() => onSelect(game)}
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyDown}
        className={`flex items-center justify-between px-3 py-2 rounded-control border transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent ${
          isSelected
            ? 'bg-surface-2 border-accent/80 ring-1 ring-accent/60'
            : 'bg-surface  hover:bg-surface-2/60 hover:border-border'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1 mr-4">
          <div
            className="w-8 h-11 rounded-[4px] overflow-hidden flex-shrink-0 flex items-center justify-center font-medium text-text/80 text-xs bg-surface-2 "
            style={{ background: coverSrc ? undefined : gradient }}
          >
            {coverSrc ? (
              <img
                src={coverSrc}
                alt={game.title}
                className="w-full h-full object-cover"
                onError={() => setImgError(true)}
                loading="lazy"
              />
            ) : (
              <span>{initials}</span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-body font-medium text-text truncate">{game.title}</span>
              {game.is_favorite && <Heart className="w-3 h-3 fill-danger text-danger flex-shrink-0" />}
              {game.status === 'Missing' && (
                <span className="inline-flex items-center gap-1 text-xs text-warning" title="Missing installation directory">
                  <AlertCircle className="w-3 h-3" />
                  <span>Missing</span>
                </span>
              )}
            </div>
            <div className="text-xs text-muted truncate">
              {game.developer || 'Unknown Developer'} {game.release_year ? `• ${game.release_year}` : ''}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-shrink-0">
          {playtimeTrackingEnabled && (game.playtime_seconds ?? 0) > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted font-mono" title={`Playtime: ${formatPlaytime(game.playtime_seconds!)}`}>
              <Clock className="w-3 h-3 text-muted" />
              <span>{formatPlaytime(game.playtime_seconds!)}</span>
            </div>
          )}

          <div className="flex items-center gap-1 text-xs text-muted">
            {getSourceIcon()}
            <span>{game.source_kind}</span>
          </div>

          {game.status === 'Installed' && (
            <span className="text-xs text-muted">
              Installed
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="game-card"
      role="button"
      tabIndex={0}
      onClick={() => onSelect(game)}
      onContextMenu={handleContextMenu}
      onKeyDown={handleKeyDown}
      className={`group relative rounded-card overflow-hidden transition-all cursor-pointer flex flex-col focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent select-none ${
        isSelected
          ? 'ring-1 ring-accent border border-accent bg-surface-2/40'
          : 'border border-muted/20 hover: bg-surface/40 hover:bg-surface'
      }`}
    >
      <div
        className="w-full aspect-[2/3] relative flex items-center justify-center overflow-hidden bg-surface-2"
        style={{ background: coverSrc ? undefined : gradient }}
      >
        {coverSrc ? (
          <img
            src={coverSrc}
            alt={game.title}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center p-3 select-none">
            <span className="text-xl font-semibold tracking-wider text-text/60">
              {initials}
            </span>
          </div>
        )}

        <div className="absolute top-1.5 left-1.5 right-1.5 flex items-center justify-between pointer-events-none">
          {game.status === 'Missing' ? (
            <div className="bg-surface/90 px-1.5 py-0.5 rounded-[4px] text-xs text-warning border border-warning/40 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              <span>Missing</span>
            </div>
          ) : (
            <div className="bg-surface/90 px-1.5 py-0.5 rounded-[4px] text-xs text-muted  flex items-center gap-1">
              {getSourceIcon()}
              <span>{game.source_kind}</span>
            </div>
          )}
          {game.is_favorite && (
            <div className="bg-surface/90 p-1 rounded-[4px] text-danger ">
              <Heart className="w-3 h-3 fill-danger text-danger" />
            </div>
          )}
        </div>
      </div>

      <div className="pt-2 px-2 pb-2 flex flex-col justify-between flex-1 min-w-0">
        <h4 className="text-xs font-medium text-text truncate group-hover:text-accent transition-colors" title={game.title}>
          {game.title}
        </h4>
        <div className="flex items-center justify-between text-xs text-muted mt-0.5">
          <span className="truncate max-w-[120px]">{game.developer || '—'}</span>
          {playtimeTrackingEnabled && (game.playtime_seconds ?? 0) > 0 ? (
            <span className="font-mono text-muted text-xs tabular-nums" title={`Playtime: ${formatPlaytime(game.playtime_seconds!)}`}>
              {formatPlaytime(game.playtime_seconds!)}
            </span>
          ) : (
            <span>{game.release_year || ''}</span>
          )}
        </div>
      </div>
    </div>
  );
};
