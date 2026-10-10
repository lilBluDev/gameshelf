import React, { useState, useEffect } from 'react';
import { Game } from '../types/models';
import { getDeterministicGradient, getTitleInitials, resolveArtworkSrc } from '../utils/artwork';
import { Heart, Flame, Monitor, Cpu, Clock } from 'lucide-react';
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
        return <Flame className="w-3 h-3 text-[#FF6E40]" />;
      case 'Standalone':
      case 'Shortcut':
        return <Monitor className="w-3 h-3 text-[#64B5F6]" />;
      case 'Emulated':
        return <Cpu className="w-3 h-3 text-[#81C784]" />;
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
        className={`flex items-center justify-between p-3 rounded-card border transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent ${
          isSelected
            ? 'bg-surface-2 border-accent ring-1 ring-accent'
            : 'bg-surface border-border hover:border-muted/50 hover:bg-surface-2/40'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-12 rounded-control overflow-hidden flex-shrink-0 flex items-center justify-center font-bold text-white text-xs shadow"
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

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-text truncate">{game.title}</span>
              {game.is_favorite && <Heart className="w-3 h-3 fill-danger text-danger flex-shrink-0" />}
            </div>
            <div className="text-[11px] text-muted truncate">
              {game.developer || 'Unknown Developer'} {game.release_year ? `• ${game.release_year}` : ''}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {playtimeTrackingEnabled && (game.playtime_seconds ?? 0) > 0 && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-surface-2 border border-border text-[11px] text-muted font-mono" title={`Playtime: ${formatPlaytime(game.playtime_seconds!)}`}>
              <Clock className="w-3 h-3 text-muted" />
              <span>{formatPlaytime(game.playtime_seconds!)}</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface-2 border border-border text-[11px] text-muted">
            {getSourceIcon()}
            <span>{game.source_kind}</span>
          </div>

          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
              game.status === 'Installed'
                ? 'bg-success/15 text-success border border-success/30'
                : 'bg-warning/15 text-warning border border-warning/30'
            }`}
          >
            {game.status}
          </span>
        </div>
      </div>
    );
  }

  // Grid View (2:3 aspect ratio card)
  return (
    <div
      data-testid="game-card"
      role="button"
      tabIndex={0}
      onClick={() => onSelect(game)}
      onContextMenu={handleContextMenu}
      onKeyDown={handleKeyDown}
      className={`group relative rounded-card overflow-hidden border transition-all duration-150 cursor-pointer flex flex-col focus:outline-none focus:ring-2 focus:ring-accent ${
        isSelected
          ? 'border-accent ring-2 ring-accent shadow-lg scale-[1.01]'
          : 'border-border hover:border-muted/60 hover:shadow-md'
      }`}
    >
      {/* 2:3 Aspect ratio container */}
      <div
        className="w-full aspect-[2/3] relative flex items-center justify-center overflow-hidden"
        style={{ background: coverSrc ? undefined : gradient }}
      >
        {coverSrc ? (
          <img
            src={coverSrc}
            alt={game.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          /* Deterministic placeholder with initials */
          <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center select-none">
            <span className="text-3xl font-extrabold tracking-wider text-white/90 drop-shadow-md">
              {initials}
            </span>
            <span className="text-[11px] font-medium text-white/70 line-clamp-2 mt-2 px-2 drop-shadow">
              {game.title}
            </span>
          </div>
        )}

        {/* Top Badges Overlay */}
        <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none">
          <div className="bg-bg/80 backdrop-blur px-1.5 py-0.5 rounded text-[10px] text-text border border-border/80 flex items-center gap-1">
            {getSourceIcon()}
            <span>{game.source_kind}</span>
          </div>
          {game.is_favorite && (
            <div className="bg-bg/80 backdrop-blur p-1 rounded text-danger border border-border/80">
              <Heart className="w-3 h-3 fill-danger text-danger" />
            </div>
          )}
        </div>

        {/* Bottom subtle gradient overlay */}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-bg/95 via-bg/40 to-transparent pointer-events-none" />
      </div>

      {/* Card Info Footer */}
      <div className="p-2.5 bg-surface border-t border-border flex flex-col justify-between flex-1">
        <h4 className="text-xs font-semibold text-text truncate group-hover:text-accent transition-colors" title={game.title}>
          {game.title}
        </h4>
        <div className="flex items-center justify-between text-[11px] text-muted mt-1">
          <span className="truncate max-w-[110px]">{game.developer || '—'}</span>
          {playtimeTrackingEnabled && (game.playtime_seconds ?? 0) > 0 ? (
            <span className="font-mono text-text/80 text-[10px] bg-surface-2 px-1.5 py-0.5 rounded border border-border" title={`Playtime: ${formatPlaytime(game.playtime_seconds!)}`}>
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
