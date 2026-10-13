import React, { useState, useEffect, useRef } from 'react';
import { Game, ArtworkRole } from '../types/models';
import { getDeterministicGradient, getTitleInitials, resolveArtworkSrc } from '../utils/artwork';
import {
  X,
  Play,
  Heart,
  AlertTriangle,
  FolderOpen,
  Edit3,
  Sliders,
  Trash2,
  RotateCcw,
  Loader2,
  Tag,
  Clock,
  Sparkles,
  Palette,
  Image as ImageIcon,
  MoreHorizontal,
  Square,
} from 'lucide-react';
import { api } from '../services/api';
import { refreshGameMetadata } from '../services/artwork';
import { ArtworkPickerModal } from './ArtworkPickerModal';
import { formatPlaytime } from '../utils/playtime';
import { ContextMenu } from './ContextMenu';
import { getGameActions } from '../features/library/gameActions';

interface GameDetailPanelProps {
  game: Game | null;
  onClose: () => void;
  onGameUpdated: (updated: Game) => void;
  onGameRemoved: (id: string) => void;
  onError: (title: string, message: string) => void;
  onSuccess: (title: string, message: string) => void;
  playtimeTrackingEnabled?: boolean;
  isTrackingActive?: boolean;
  onStopTracking?: () => Promise<void>;
  onOpenSettings?: () => void;
}

export const GameDetailPanel: React.FC<GameDetailPanelProps> = ({
  game,
  onClose,
  onGameUpdated,
  onGameRemoved,
  onError,
  onSuccess,
  playtimeTrackingEnabled,
  isTrackingActive,
  onStopTracking,
  onOpenSettings,
}) => {
  const [isLaunching, setIsLaunching] = useState(false);
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [isEditingLaunch, setIsEditingLaunch] = useState(false);
  const [isConfirmingRemove, setIsConfirmingRemove] = useState(false);
  const [isConfirmingResetPlaytime, setIsConfirmingResetPlaytime] = useState(false);
  const [isResettingPlaytime, setIsResettingPlaytime] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

  // Approximate session tracking state (Steam & launchers)
  const [activeSessionStart, setActiveSessionStart] = useState<Date | null>(null);
  const [sessionElapsedSecs, setSessionElapsedSecs] = useState<number>(0);

  // Artwork & Refresh states
  const [isArtworkModalOpen, setIsArtworkModalOpen] = useState(false);
  const [artworkRole, setArtworkRole] = useState<ArtworkRole>('cover');
  const [isRefreshingMetadata, setIsRefreshingMetadata] = useState(false);
  const [heroError, setHeroError] = useState(false);
  const [coverError, setCoverError] = useState(false);

  // Metadata edit state
  const [editTitle, setEditTitle] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [newTagInput, setNewTagInput] = useState('');
  const [userTags, setUserTags] = useState<string[]>([]);

  // Launch action edit / locate state
  const [editExePath, setEditExePath] = useState('');
  const [editArgs, setEditArgs] = useState('');
  const [editWorkingDir, setEditWorkingDir] = useState('');

  useEffect(() => {
    setHeroError(false);
    setCoverError(false);
  }, [game?.id, game?.artwork?.hero?.cached_path, game?.artwork?.cover?.cached_path]);

  useEffect(() => {
    setActiveSessionStart(null);
    setSessionElapsedSecs(0);
  }, [game?.id]);

  useEffect(() => {
    if (!activeSessionStart) {
      setSessionElapsedSecs(0);
      return;
    }
    const interval = setInterval(() => {
      const elapsed = Math.max(0, Math.floor((Date.now() - activeSessionStart.getTime()) / 1000));
      setSessionElapsedSecs(elapsed);
    }, 1000);
    return () => clearInterval(interval);
  }, [activeSessionStart]);

  if (!game) return null;

  const gradient = getDeterministicGradient(game.title);
  const initials = getTitleInitials(game.title);

  const heroAsset = game.artwork?.hero;
  const heroSrc = !heroError ? resolveArtworkSrc(heroAsset) : null;
  const coverAsset = game.artwork?.cover;
  const coverSrc = !coverError ? resolveArtworkSrc(coverAsset) : null;

  // Handle Refresh Metadata & Artwork
  const handleRefreshMetadata = async () => {
    setIsRefreshingMetadata(true);
    try {
      const updated = await refreshGameMetadata(game.id, true);
      onGameUpdated(updated);
      onSuccess('Metadata Refreshed', `Artwork and metadata refreshed for "${game.title}".`);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : String(err);
      onError('Refresh Failed', msg);
    } finally {
      setIsRefreshingMetadata(false);
    }
  };

  const handleArtworkChanged = async (_updatedGameId: string) => {
    try {
      const res = await api.listGames({ filter: 'all' });
      const refreshed = res.games.find((g) => g.id === game.id);
      if (refreshed) {
        onGameUpdated(refreshed);
      }
    } catch {
      // Ignored
    }
  };

  // Handle Launch Execution
  const handleLaunch = async () => {
    if (game.status === 'Missing') {
      setIsEditingLaunch(true);
      return;
    }

    setIsLaunching(true);
    try {
      const res = await api.launchGame(game.id);
      onSuccess('Game Launched', res.message);
      // Refresh game to update last_launched_at
      const updated = {
        ...game,
        last_launched_at: new Date().toISOString(),
        status: 'Installed' as const,
      };
      onGameUpdated(updated);

      if (playtimeTrackingEnabled && game.source_kind === 'Steam') {
        setActiveSessionStart(new Date());
      }
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err);
      onError('Launch Failed', msg);
      if (msg.includes('not found') || msg.includes('does not exist')) {
        onGameUpdated({ ...game, status: 'Missing' });
      }
    } finally {
      setIsLaunching(false);
    }
  };

  // End approximate session (Steam)
  const handleEndSteamSession = async () => {
    if (!activeSessionStart) return;
    const startedAt = activeSessionStart.toISOString();
    const endedAt = new Date().toISOString();
    const duration = sessionElapsedSecs;
    try {
      await api.recordGameSession(game.id, startedAt, endedAt, duration, true);
      const updated: Game = {
        ...game,
        playtime_seconds: (game.playtime_seconds || 0) + duration,
      };
      onGameUpdated(updated);
      setActiveSessionStart(null);
      setSessionElapsedSecs(0);
      onSuccess('Session Recorded', `Approximate playtime of ${formatPlaytime(duration)} recorded.`);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err);
      onError('Session Record Failed', msg);
    }
  };

  // Reset playtime for this game
  const handleResetPlaytime = async () => {
    setIsResettingPlaytime(true);
    try {
      await api.resetGamePlaytime(game.id);
      const updated: Game = {
        ...game,
        playtime_seconds: 0,
      };
      onGameUpdated(updated);
      setIsConfirmingResetPlaytime(false);
      onSuccess('Playtime Reset', `Playtime for "${game.title}" has been reset to 0.`);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err);
      onError('Reset Failed', msg);
    } finally {
      setIsResettingPlaytime(false);
    }
  };

  // Handle Open Folder
  const handleOpenFolder = async () => {
    try {
      await api.openFolder(game.id);
      onSuccess('Folder Opened', 'Revealed game directory in Windows Explorer.');
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err);
      onError('Cannot Open Folder', msg);
    }
  };

  // Handle Favorite Toggle
  const handleToggleFavorite = async () => {
    try {
      const updated = await api.updateGame({
        id: game.id,
        is_favorite: !game.is_favorite,
      });
      onGameUpdated(updated);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err);
      onError('Update Failed', msg);
    }
  };

  // Start editing metadata
  const startEditingMetadata = () => {
    setEditTitle(game.title);
    setEditNotes(game.notes || '');
    setUserTags([...game.user_tags]);
    setIsEditingMetadata(true);
  };

  // Save metadata overrides
  const handleSaveMetadata = async () => {
    try {
      const updated = await api.updateGame({
        id: game.id,
        title: editTitle.trim() || game.title,
        notes: editNotes.trim() || undefined,
        user_tags: userTags,
      });
      onGameUpdated(updated);
      setIsEditingMetadata(false);
      onSuccess('Metadata Saved', 'User overrides updated successfully.');
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err);
      onError('Save Failed', msg);
    }
  };

  // Start editing launch settings or locating missing file
  const startEditingLaunch = () => {
    let currentPath = '';
    let currentArgs = '';
    let currentWd = '';

    if (game.launch_action.type === 'Executable') {
      currentPath = game.launch_action.path;
      currentArgs = game.launch_action.args.join(' ');
      currentWd = game.launch_action.working_dir || '';
    } else if (game.launch_action.type === 'Shortcut') {
      currentPath = game.launch_action.target;
      currentArgs = game.launch_action.args.join(' ');
      currentWd = game.launch_action.working_dir || '';
    } else if (game.launch_action.type === 'EmulatedGame') {
      currentPath = game.launch_action.rom_path;
      currentArgs = (game.launch_action.arg_overrides || []).join(' ');
      currentWd = '';
    }

    setEditExePath(currentPath);
    setEditArgs(currentArgs);
    setEditWorkingDir(currentWd);
    setIsEditingLaunch(true);
  };

  // Save launch action updates
  const handleSaveLaunchSettings = async () => {
    if (!editExePath.trim()) {
      onError('Invalid Path', 'Please specify a target executable path.');
      return;
    }

    try {
      const args = editArgs.trim() ? editArgs.trim().split(/\s+/) : [];
      const updated = await api.updateLaunchSettings({
        id: game.id,
        executable_path: editExePath.trim(),
        args,
        working_dir: editWorkingDir.trim() || undefined,
      });
      onGameUpdated(updated);
      setIsEditingLaunch(false);
      onSuccess('Launch Settings Updated', 'Target executable path and parameters updated.');
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err);
      onError('Update Failed', msg);
    }
  };

  // Confirm removal
  const handleConfirmRemove = async () => {
    try {
      await api.removeGame(game.id);
      onGameRemoved(game.id);
      setIsConfirmingRemove(false);
      onClose();
      onSuccess('Game Removed', `"${game.title}" was removed from your library. Game files on disk were untouched.`);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err);
      onError('Removal Failed', msg);
    }
  };

  const handleToggleMenu = () => {
    if (isMenuOpen) {
      setIsMenuOpen(false);
      return;
    }
    if (moreButtonRef.current) {
      const rect = moreButtonRef.current.getBoundingClientRect();
      setMenuPos({ x: rect.left, y: rect.bottom + 4 });
      setIsMenuOpen(true);
    }
  };

  const handleToggleHide = async () => {
    try {
      const nextHidden = !game.is_hidden;
      const updated = await api.updateGame({ id: game.id, is_hidden: nextHidden });
      onGameUpdated(updated);
      onSuccess(nextHidden ? 'Game Hidden' : 'Game Unhidden', `"${game.title}" status updated`);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err);
      onError('Update Failed', msg);
    }
  };

  const menuEntries = getGameActions({
    game,
    isRunning: isLaunching || Boolean(isTrackingActive) || Boolean(activeSessionStart),
    activeSession: Boolean(isTrackingActive) || Boolean(activeSessionStart),
    onPlay: handleLaunch,
    onStopTracking: onStopTracking ? () => onStopTracking() : handleEndSteamSession,
    onLaunchSettings: startEditingLaunch,
    onToggleFavorite: handleToggleFavorite,
    onToggleHide: handleToggleHide,
    onOpenFolder: handleOpenFolder,
    onChangeArtwork: () => {
      setArtworkRole('cover');
      setIsArtworkModalOpen(true);
    },
    onRefreshMetadata: handleRefreshMetadata,
    onEditDetails: startEditingMetadata,
    onRemoveFromLibrary: () => setIsConfirmingRemove(true),
  });

  return (
    <aside
      aria-label={`${game.title} details`}
      className="w-[360px] bg-surface border-l border-border flex flex-col justify-between h-full flex-shrink-0 overflow-y-auto select-none animate-slide-in-right"
    >
      <div>
        {/* Header / Hero banner */}
        <div
          className="relative aspect-[96/31] w-full overflow-hidden flex items-center justify-center border-b border-border"
          style={{ background: heroSrc ? undefined : gradient }}
        >
          {heroSrc ? (
            <>
              <img
                src={heroSrc}
                alt={`${game.title} Hero`}
                className="absolute inset-0 w-full h-full object-cover"
                onError={() => setHeroError(true)}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/30 to-transparent pointer-events-none" />
            </>
          ) : (
            <span className="text-2xl font-black text-white/40 tracking-wider">
              {initials}
            </span>
          )}

          {/* Top Controls Overlay */}
          <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between z-10">
            <button
              onClick={handleToggleFavorite}
              className={`p-1.5 rounded-control border transition-colors ${
                game.is_favorite
                  ? 'bg-danger/20 border-danger/40 text-danger'
                  : 'bg-surface/90  text-muted hover:text-white'
              }`}
              title={game.is_favorite ? 'Remove Favorite' : 'Mark as Favorite'}
            >
              <Heart className={`w-3.5 h-3.5 ${game.is_favorite ? 'fill-current' : ''}`} />
            </button>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  setArtworkRole('hero');
                  setIsArtworkModalOpen(true);
                }}
                className="p-1.5 rounded-control bg-surface/90 text-muted hover:text-white transition-colors"
                title="Change Hero Banner Artwork"
              >
                <ImageIcon className="w-3.5 h-3.5" />
              </button>

              <button
                ref={moreButtonRef}
                onClick={handleToggleMenu}
                className="p-1.5 rounded-control bg-surface/90 text-muted hover:text-white transition-colors"
                title="More Actions"
                aria-label="More Actions"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={onClose}
                className="p-1.5 rounded-control bg-surface/90 text-muted hover:text-white transition-colors"
                title="Close Panel"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {isMenuOpen && (
          <ContextMenu
            x={menuPos.x}
            y={menuPos.y}
            entries={menuEntries}
            onClose={() => setIsMenuOpen(false)}
            originElement={moreButtonRef.current}
          />
        )}

        {/* Content Body */}
        <div className="p-4 space-y-4">
          {/* Cover & Title Header */}
          <div className="flex gap-3 items-start">
            {/* 2:3 Cover preview with Change button */}
            <div
              className="relative group w-16 aspect-[2/3] rounded-control overflow-hidden shadow flex-shrink-0 flex items-center justify-center font-bold text-white text-xs select-none"
              style={{ background: coverSrc ? undefined : gradient }}
            >
              {coverSrc ? (
                <img
                  src={coverSrc}
                  alt={game.title}
                  className="w-full h-full object-cover"
                  onError={() => setCoverError(true)}
                />
              ) : (
                <span>{initials}</span>
              )}
              <button
                onClick={() => {
                  setArtworkRole('cover');
                  setIsArtworkModalOpen(true);
                }}
                className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-xs text-white font-medium transition-opacity"
                title="Change Cover Artwork"
              >
                <Palette className="w-3.5 h-3.5 mb-0.5" />
                <span>Change</span>
              </button>
            </div>

            {/* Title & Platform header */}
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-bold text-text leading-tight truncate" title={game.title}>
                {game.title}
              </h2>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <span className="text-xs px-2 py-0.5 rounded bg-surface-2 text-muted font-medium">
                  {game.source_kind}
                </span>
                {game.source_id && (
                  <span className="text-xs px-2 py-0.5 rounded bg-surface-2 text-muted font-mono">
                    ID: {game.source_id}
                  </span>
                )}
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    game.status === 'Installed'
                      ? 'bg-success/15 text-success border border-success/30'
                      : 'bg-danger/15 text-danger border border-danger/30'
                  }`}
                >
                  {game.status === 'Installed' ? 'Installed' : 'Missing'}
                </span>
              </div>
              <div className="text-xs text-muted truncate mt-1">
                {game.developer || '—'} {game.release_year ? `• ${game.release_year}` : ''}
              </div>
            </div>
          </div>

          {/* Missing File Alert Banner */}
          {game.status === 'Missing' && (
            <div className="p-3 rounded-card bg-danger/10 border border-danger/30 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-danger">Executable Not Found</div>
                <div className="text-xs text-text/80 mt-0.5">
                  The game file was moved or deleted. Locate the file or update its path.
                </div>
                <button
                  onClick={startEditingLaunch}
                  className="mt-2 flex items-center gap-1 px-2.5 py-1 rounded-control bg-surface border border-danger/40 text-xs font-semibold text-text hover:bg-surface-2 transition-colors"
                >
                  <RotateCcw className="w-3 h-3 text-danger" />
                  <span>Locate File</span>
                </button>
              </div>
            </div>
          )}

          {/* Primary Action Button: Play */}
          <div className="space-y-1.5">
            <button
              onClick={handleLaunch}
              disabled={isLaunching || Boolean(isTrackingActive)}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-control font-semibold text-xs transition-all shadow-md ${
                game.status === 'Missing'
                  ? 'bg-surface-2 border border-muted/20 text-text hover:bg-border'
                  : isTrackingActive
                  ? 'bg-success/80 text-white cursor-default'
                  : 'bg-accent hover:bg-accent-hover text-white'
              }`}
            >
              {isLaunching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Launching...</span>
                </>
              ) : isTrackingActive ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
                  <span>Running</span>
                </>
              ) : game.status === 'Missing' ? (
                <>
                  <RotateCcw className="w-4 h-4 text-danger" />
                  <span>Locate File to Play</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Play</span>
                </>
              )}
            </button>

            {isTrackingActive && onStopTracking && (
              <button
                onClick={onStopTracking}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-control bg-danger/10 hover:bg-danger/20 border border-danger/30 text-xs text-danger transition-colors font-medium"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop tracking session</span>
              </button>
            )}

            <button
              onClick={handleRefreshMetadata}
              disabled={isRefreshingMetadata}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-control bg-surface-2 hover:bg-surface-2/80 border border-border text-xs text-text transition-colors font-medium disabled:opacity-50"
              title="Refresh metadata and artwork from configured provider"
            >
              {isRefreshingMetadata ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                  <span>Refreshing Metadata...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-accent" />
                  <span>Refresh Metadata & Artwork</span>
                </>
              )}
            </button>

            {game.last_launched_at && (
              <div className="text-xs text-muted flex items-center justify-center gap-1 mt-1 font-mono">
                <Clock className="w-3 h-3" />
                <span>Last played: {new Date(game.last_launched_at).toLocaleDateString()}</span>
              </div>
            )}

            {!playtimeTrackingEnabled && (
              <div className="bg-surface-2/40 border border-muted/20 rounded-control p-2 mt-2 flex items-center justify-between text-xs text-muted">
                <span>Playtime tracking is off</span>
                {onOpenSettings && (
                  <button
                    onClick={onOpenSettings}
                    className="text-accent hover:underline font-medium text-xs"
                  >
                    Open Settings
                  </button>
                )}
              </div>
            )}

            {playtimeTrackingEnabled && (
              <div className="bg-surface-2/60 border border-border rounded-control p-2.5 mt-2 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted flex items-center gap-1.5 font-medium">
                    <Clock className="w-3.5 h-3.5 text-accent" />
                    <span>Playtime</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-semibold text-text">
                      {formatPlaytime(game.playtime_seconds || 0)}
                    </span>
                    {game.source_kind === 'Steam' && (
                      <span
                        className="text-xs text-amber-400/90 font-mono"
                        title="Steam launches are activated via protocol and playtime is tracked approximately"
                      >
                        (Approximate)
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-muted pt-1 border-t ">
                  <span>Sessions: <strong className="text-text font-mono">{game.session_count || 0}</strong></span>
                  {game.last_played_at ? (
                    <span>Last: <strong className="text-text font-mono">{new Date(game.last_played_at).toLocaleDateString()}</strong></span>
                  ) : null}
                </div>

                {activeSessionStart && (
                  <div className="bg-accent/10 border border-accent/30 rounded p-2 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-accent font-semibold text-xs flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-accent animate-ping" />
                        Session in progress
                      </span>
                      <span className="font-mono font-bold text-accent">
                        {formatPlaytime(sessionElapsedSecs)}
                      </span>
                    </div>
                    <button
                      onClick={handleEndSteamSession}
                      className="w-full py-1 rounded bg-accent hover:bg-accent-hover text-white text-xs font-semibold transition-colors"
                    >
                      End & Record Session
                    </button>
                  </div>
                )}

                {(game.playtime_seconds || 0) > 0 && !activeSessionStart && !isTrackingActive && (
                  <div className="flex justify-end pt-0.5">
                    <button
                      onClick={() => setIsConfirmingResetPlaytime(true)}
                      className="text-xs text-muted hover:text-danger transition-colors underline decoration-dotted"
                    >
                      Reset Playtime
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Toolbar */}
          <div className="grid grid-cols-4 gap-2">
            <button
              onClick={handleOpenFolder}
              title="Open Game Folder"
              className="flex flex-col items-center justify-center p-2 rounded-control bg-surface-2/60 hover:bg-surface-2 text-muted hover:text-text transition-colors gap-1 text-xs"
            >
              <FolderOpen className="w-4 h-4 text-accent" />
              <span>Folder</span>
            </button>

            <button
              onClick={() => {
                setArtworkRole('cover');
                setIsArtworkModalOpen(true);
              }}
              title="Change Game Artwork"
              className="flex flex-col items-center justify-center p-2 rounded-control bg-surface-2/60 hover:bg-surface-2 text-muted hover:text-text transition-colors gap-1 text-xs"
            >
              <Palette className="w-4 h-4 text-accent" />
              <span>Artwork</span>
            </button>

            <button
              onClick={startEditingMetadata}
              title="Edit Title, Notes & Tags"
              className="flex flex-col items-center justify-center p-2 rounded-control bg-surface-2/60 hover:bg-surface-2 text-muted hover:text-text transition-colors gap-1 text-xs"
            >
              <Edit3 className="w-4 h-4 text-text" />
              <span>Edit</span>
            </button>

            <button
              onClick={startEditingLaunch}
              title="Edit Launch Configuration"
              className="flex flex-col items-center justify-center p-2 rounded-control bg-surface-2/60 hover:bg-surface-2 text-muted hover:text-text transition-colors gap-1 text-xs"
            >
              <Sliders className="w-4 h-4 text-warning" />
              <span>Config</span>
            </button>
          </div>

          {/* Metadata Display / Notes */}
          <div className="space-y-3 pt-2 border-t border-border">
            {/* Notes Section */}
            <div>
              <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">
                Notes
              </div>
              {game.notes ? (
                <p className="text-xs text-text/80 bg-surface-2/30 p-2.5 rounded-control whitespace-pre-wrap leading-relaxed">
                  {game.notes}
                </p>
              ) : (
                <div
                  onClick={startEditingMetadata}
                  className="text-xs text-muted/60 italic bg-surface-2/20 p-2 rounded-control border border-dashed border-border cursor-pointer hover:border-muted transition-colors"
                >
                  Click to add personal notes...
                </div>
              )}
            </div>

            {/* User Tags */}
            <div>
              <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">
                Tags
              </div>
              <div className="flex flex-wrap gap-1.5">
                {game.user_tags.length > 0 ? (
                  game.user_tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs bg-surface-2 text-text px-2 py-0.5 rounded-full flex items-center gap-1"
                    >
                      <Tag className="w-2.5 h-2.5 text-muted" />
                      <span>{tag}</span>
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-muted italic">No tags assigned</span>
                )}
              </div>
            </div>

            {/* Genres & Categories */}
            {game.genres && game.genres.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">
                  Genres
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {game.genres.map((genre) => (
                    <span
                      key={genre}
                      className="text-xs bg-surface-2 text-text px-2 py-0.5 rounded-full"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Metadata Provenance & Matching */}
            {game.provider_attribution && (
              <div>
                <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">
                  Metadata Provenance
                </div>
                <div className="bg-surface-2/40 p-2.5 rounded-control text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Provider:</span>
                    <span className="font-semibold text-text capitalize">{game.provider_attribution}</span>
                  </div>
                  {game.match_confidence !== undefined && game.match_confidence !== null && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-muted">Confidence:</span>
                        <span
                          className={`font-semibold ${
                            game.match_confidence >= 0.85
                              ? 'text-success'
                              : game.match_confidence >= 0.6
                              ? 'text-warning'
                              : 'text-muted'
                          }`}
                        >
                          {game.match_confidence >= 0.85
                            ? 'High'
                            : game.match_confidence >= 0.6
                            ? 'Medium'
                            : 'Low'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted">Score:</span>
                        <span className="font-mono text-muted">{Math.round(game.match_confidence * 100)}%</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Launch Action Info (Security & path review) */}
            <div>
              <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">
                Target Configuration
              </div>
              <div className="bg-surface-2/40 p-2.5 rounded-control font-mono text-xs text-muted space-y-1 break-all">
                {game.launch_action.type === 'Executable' && (
                  <>
                    <div><span className="text-text font-semibold">Executable:</span> {game.launch_action.path}</div>
                    {game.launch_action.working_dir && (
                      <div><span className="text-text font-semibold">Working Dir:</span> {game.launch_action.working_dir}</div>
                    )}
                    {game.launch_action.args.length > 0 && (
                      <div><span className="text-text font-semibold">Args:</span> {game.launch_action.args.join(' ')}</div>
                    )}
                  </>
                )}
                {game.launch_action.type === 'Shortcut' && (
                  <>
                    <div><span className="text-text font-semibold">Shortcut Target:</span> {game.launch_action.target}</div>
                    {game.launch_action.args.length > 0 && (
                      <div><span className="text-text font-semibold">Args:</span> {game.launch_action.args.join(' ')}</div>
                    )}
                  </>
                )}
                {game.launch_action.type === 'Steam' && (
                  <>
                    <div><span className="text-text font-semibold">Source:</span> Steam (Official Client)</div>
                    <div><span className="text-text font-semibold">App ID:</span> {game.launch_action.app_id}</div>
                    <div><span className="text-text font-semibold">Launch URI:</span> steam://rungameid/{game.launch_action.app_id}</div>
                    {game.install_dir && (
                      <div><span className="text-text font-semibold">Install Directory:</span> {game.install_dir}</div>
                    )}
                  </>
                )}
                {game.launch_action.type === 'EmulatedGame' && (
                  <>
                    <div><span className="text-text font-semibold">Source:</span> Emulated Game</div>
                    <div><span className="text-text font-semibold">Profile ID:</span> {game.launch_action.profile_id}</div>
                    <div><span className="text-text font-semibold">ROM File:</span> {game.launch_action.rom_path}</div>
                    {game.launch_action.arg_overrides && game.launch_action.arg_overrides.length > 0 && (
                      <div><span className="text-text font-semibold">Arg Overrides:</span> {game.launch_action.arg_overrides.join(' ')}</div>
                    )}
                  </>
                )}
                {game.launch_action.type === 'Unavailable' && (
                  <div><span className="text-danger font-semibold">Unavailable:</span> {game.launch_action.reason}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer: Remove from Library */}
      <div className="p-3 border-t border-border bg-surface-2/20">
        <button
          onClick={() => setIsConfirmingRemove(true)}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-control text-xs text-danger/80 hover:text-danger hover:bg-danger/10 transition-colors font-medium"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Remove from Library</span>
        </button>
      </div>

      {/* Modal 1: Edit Metadata (Overrides) */}
      {isEditingMetadata && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 animate-fade-in">
          <div className="w-full max-w-md bg-surface border border-border rounded-dialog shadow-2xl p-5 space-y-4 animate-scale-in">
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <h3 className="text-xs font-bold text-text uppercase tracking-wider">Edit Game Details</h3>
              <button onClick={() => setIsEditingMetadata(false)} className="text-muted hover:text-text p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-text">Display Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full bg-surface-2 border border-muted/20 rounded-control px-2.5 py-1.5 text-xs text-text focus:outline-none focus:border-accent"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-text">Notes</label>
                <textarea
                  rows={3}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Personal notes, walkthrough reminders, save backup notes..."
                  className="w-full bg-surface-2 border border-muted/20 rounded-control p-2 text-xs text-text focus:outline-none focus:border-accent"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-text">Tags</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    placeholder="Add tag and press Enter"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (newTagInput.trim() && !userTags.includes(newTagInput.trim())) {
                          setUserTags([...userTags, newTagInput.trim()]);
                          setNewTagInput('');
                        }
                      }
                    }}
                    className="flex-1 bg-surface-2 border border-muted/20 rounded-control px-2.5 py-1 text-xs text-text focus:outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newTagInput.trim() && !userTags.includes(newTagInput.trim())) {
                        setUserTags([...userTags, newTagInput.trim()]);
                        setNewTagInput('');
                      }
                    }}
                    className="px-2.5 py-1 rounded-control bg-surface-2 text-xs text-text hover:bg-border"
                  >
                    Add
                  </button>
                </div>

                <div className="flex flex-wrap gap-1 mt-2">
                  {userTags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs bg-surface-2 px-2 py-0.5 rounded-full flex items-center gap-1 text-text"
                    >
                      <span>{tag}</span>
                      <button
                        type="button"
                        onClick={() => setUserTags(userTags.filter((t) => t !== tag))}
                        className="text-muted hover:text-danger"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setIsEditingMetadata(false)}
                className="px-3 py-1.5 rounded-control text-xs text-muted hover:text-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveMetadata}
                className="px-3.5 py-1.5 rounded-control bg-accent hover:bg-accent-hover text-white text-xs font-semibold"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Edit Launch Settings / Locate File */}
      {isEditingLaunch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 animate-fade-in">
          <div className="w-full max-w-lg bg-surface border border-border rounded-dialog shadow-2xl p-5 space-y-4 animate-scale-in">
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <h3 className="text-xs font-bold text-text uppercase tracking-wider">
                {game.status === 'Missing' ? 'Locate Game Executable' : 'Launch Configuration'}
              </h3>
              <button onClick={() => setIsEditingLaunch(false)} className="text-muted hover:text-text p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-text">Target Executable Path</label>
                <input
                  type="text"
                  value={editExePath}
                  onChange={(e) => setEditExePath(e.target.value)}
                  className="w-full bg-surface-2 border border-muted/20 rounded-control px-2.5 py-1.5 text-xs text-text font-mono focus:outline-none focus:border-accent"
                  placeholder="C:\Path\To\Game.exe"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-text">Working Directory</label>
                <input
                  type="text"
                  value={editWorkingDir}
                  onChange={(e) => setEditWorkingDir(e.target.value)}
                  className="w-full bg-surface-2 border border-muted/20 rounded-control px-2.5 py-1.5 text-xs text-text font-mono focus:outline-none focus:border-accent"
                  placeholder="Defaults to executable directory"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-text">Arguments (space separated)</label>
                <input
                  type="text"
                  value={editArgs}
                  onChange={(e) => setEditArgs(e.target.value)}
                  className="w-full bg-surface-2 border border-muted/20 rounded-control px-2.5 py-1.5 text-xs text-text font-mono focus:outline-none focus:border-accent"
                  placeholder="-novid -fullscreen"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setIsEditingLaunch(false)}
                className="px-3 py-1.5 rounded-control text-xs text-muted hover:text-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveLaunchSettings}
                className="px-3.5 py-1.5 rounded-control bg-accent hover:bg-accent-hover text-white text-xs font-semibold"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Remove from Library Confirmation Dialog */}
      {isConfirmingRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 animate-fade-in">
          <div className="w-full max-w-md bg-surface border border-border rounded-dialog shadow-2xl p-5 space-y-4 animate-scale-in">
            <div className="flex items-center gap-2.5 text-danger border-b border-border pb-2.5">
              <Trash2 className="w-5 h-5 flex-shrink-0" />
              <h3 className="text-sm font-bold text-text">Remove from Library?</h3>
            </div>

            <div className="space-y-2 text-xs leading-relaxed text-text/80">
              <p>
                Are you sure you want to remove <strong>{game.title}</strong> from your GameShelf library?
              </p>
              <div className="p-3 bg-surface-2/50 rounded-control text-muted text-xs leading-relaxed">
                <strong className="text-text block mb-0.5">Files are safe:</strong>
                This only removes the database entry and custom notes from GameShelf. Your game files, installations, and save data on your disk will <strong>NOT</strong> be deleted.
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setIsConfirmingRemove(false)}
                className="px-3.5 py-1.5 rounded-control text-xs text-muted hover:text-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRemove}
                className="px-4 py-1.5 rounded-control bg-danger hover:bg-danger/90 text-white text-xs font-semibold shadow-sm"
              >
                Remove from Library
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Reset Playtime Confirmation Dialog */}
      {isConfirmingResetPlaytime && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 animate-fade-in">
          <div className="w-full max-w-sm bg-surface border border-border rounded-dialog shadow-2xl p-5 space-y-4 animate-scale-in">
            <div className="flex items-center gap-2.5 text-warning border-b border-border pb-2.5">
              <RotateCcw className="w-5 h-5 flex-shrink-0" />
              <h3 className="text-sm font-bold text-text">Reset Playtime?</h3>
            </div>

            <div className="space-y-2 text-xs leading-relaxed text-text/80">
              <p>
                Are you sure you want to reset recorded playtime for <strong>{game.title}</strong> to 0?
              </p>
              <p className="text-muted text-xs">
                This will clear all local session logs for this game. This action cannot be undone.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                disabled={isResettingPlaytime}
                onClick={() => setIsConfirmingResetPlaytime(false)}
                className="px-3.5 py-1.5 rounded-control text-xs text-muted hover:text-text disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isResettingPlaytime}
                onClick={handleResetPlaytime}
                className="px-4 py-1.5 rounded-control bg-danger hover:bg-danger/90 text-white text-xs font-semibold shadow-sm flex items-center gap-1.5 disabled:opacity-50"
              >
                {isResettingPlaytime ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Resetting...</span>
                  </>
                ) : (
                  <span>Reset Playtime</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 5: Artwork Picker Modal */}
      {isArtworkModalOpen && (
        <ArtworkPickerModal
          game={game}
          isOpen={isArtworkModalOpen}
          initialRole={artworkRole}
          onClose={() => setIsArtworkModalOpen(false)}
          onArtworkChanged={handleArtworkChanged}
        />
      )}
    </aside>
  );
};
