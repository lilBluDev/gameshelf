import React from 'react';
import { Game } from '../types/models';
import { getDeterministicGradient, getTitleInitials } from '../utils/artwork';
import { X, Play, Heart, AlertCircle } from 'lucide-react';

interface GameDetailPanelProps {
  game: Game | null;
  onClose: () => void;
}

export const GameDetailPanel: React.FC<GameDetailPanelProps> = ({ game, onClose }) => {
  if (!game) return null;

  const gradient = getDeterministicGradient(game.title);
  const initials = getTitleInitials(game.title);

  return (
    <aside className="w-80 bg-surface border-l border-border flex flex-col justify-between h-full flex-shrink-0 overflow-y-auto select-none">
      <div>
        {/* Header / Hero / Cover banner */}
        <div className="relative aspect-[96/31] w-full overflow-hidden flex items-center justify-center border-b border-border" style={{ background: gradient }}>
          <button
            onClick={onClose}
            className="absolute top-2 right-2 bg-bg/80 backdrop-blur text-muted hover:text-white p-1 rounded-control border border-border z-10 transition-colors"
            title="Close Panel"
          >
            <X className="w-4 h-4" />
          </button>

          <span className="text-xl font-black text-white/50 tracking-wider">
            {initials}
          </span>
        </div>

        {/* Content Body */}
        <div className="p-4 space-y-5">
          {/* Main Title & Developer */}
          <div>
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-sm font-bold text-text leading-tight">{game.title}</h2>
              {game.is_favorite && <Heart className="w-4 h-4 fill-danger text-danger flex-shrink-0 mt-0.5" />}
            </div>
            <p className="text-xs text-muted mt-1">{game.developer || 'Unknown Developer'}</p>
          </div>

          {/* Action Button: Launch (Phase 4 disabled) */}
          <div className="space-y-1.5">
            <button
              disabled
              title="Game execution runner arrives in Phase 4"
              className="w-full flex items-center justify-center gap-2 py-2 rounded-control bg-accent/30 text-accent font-semibold text-xs border border-accent/20 cursor-not-allowed opacity-75"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Play</span>
            </button>
            <div className="text-[10px] text-muted text-center flex items-center justify-center gap-1">
              <AlertCircle className="w-3 h-3 text-muted" />
              <span>Runner activation arrives in Phase 4</span>
            </div>
          </div>

          {/* Status & Source details */}
          <div className="bg-surface-2 rounded-card p-3 border border-border space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-muted text-[11px]">Status</span>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                game.status === 'Installed'
                  ? 'bg-success/15 text-success border border-success/30'
                  : 'bg-warning/15 text-warning border border-warning/30'
              }`}>
                {game.status}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-muted text-[11px]">Platform</span>
              <span className="text-text font-medium text-[11px]">{game.source_kind}</span>
            </div>

            {game.release_year && (
              <div className="flex justify-between items-center">
                <span className="text-muted text-[11px]">Release Year</span>
                <span className="text-text text-[11px]">{game.release_year}</span>
              </div>
            )}

            {game.publisher && (
              <div className="flex justify-between items-center">
                <span className="text-muted text-[11px]">Publisher</span>
                <span className="text-text text-[11px] truncate max-w-[140px]">{game.publisher}</span>
              </div>
            )}
          </div>

          {/* Description */}
          {game.description && (
            <div>
              <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-1">
                About
              </div>
              <p className="text-xs text-text/80 leading-relaxed bg-surface-2/40 p-2.5 rounded-control border border-border">
                {game.description}
              </p>
            </div>
          )}

          {/* Genres & Tags */}
          {game.genres && game.genres.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-1.5">
                Genres
              </div>
              <div className="flex flex-wrap gap-1.5">
                {game.genres.map((g) => (
                  <span
                    key={g}
                    className="text-[10px] bg-surface-2 text-text px-2 py-0.5 rounded-full border border-border"
                  >
                    {g}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Launch Action Info (Typed backend representation) */}
          <div>
            <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-1">
              Launch Configuration
            </div>
            <div className="bg-surface-2/60 p-2 rounded-control border border-border font-mono text-[10px] text-muted break-all">
              {game.launch_action.type === 'Executable' && (
                <div>Path: {game.launch_action.path}</div>
              )}
              {game.launch_action.type === 'Steam' && (
                <div>Steam App ID: {game.launch_action.app_id}</div>
              )}
              {game.launch_action.type === 'EmulatedGame' && (
                <div>ROM: {game.launch_action.rom_path}</div>
              )}
              {game.launch_action.type === 'Unavailable' && (
                <div>Unavailable: {game.launch_action.reason}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
