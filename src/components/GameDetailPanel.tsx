import React, { useState } from 'react';
import { Game } from '../types/models';
import { getDeterministicGradient, getTitleInitials } from '../utils/artwork';
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
} from 'lucide-react';
import { api } from '../services/api';

interface GameDetailPanelProps {
  game: Game | null;
  onClose: () => void;
  onGameUpdated: (updated: Game) => void;
  onGameRemoved: (id: string) => void;
  onError: (title: string, message: string) => void;
  onSuccess: (title: string, message: string) => void;
}

export const GameDetailPanel: React.FC<GameDetailPanelProps> = ({
  game,
  onClose,
  onGameUpdated,
  onGameRemoved,
  onError,
  onSuccess,
}) => {
  const [isLaunching, setIsLaunching] = useState(false);
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [isEditingLaunch, setIsEditingLaunch] = useState(false);
  const [isConfirmingRemove, setIsConfirmingRemove] = useState(false);

  // Metadata edit state
  const [editTitle, setEditTitle] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [newTagInput, setNewTagInput] = useState('');
  const [userTags, setUserTags] = useState<string[]>([]);

  // Launch action edit / locate state
  const [editExePath, setEditExePath] = useState('');
  const [editArgs, setEditArgs] = useState('');
  const [editWorkingDir, setEditWorkingDir] = useState('');

  if (!game) return null;

  const gradient = getDeterministicGradient(game.title);
  const initials = getTitleInitials(game.title);

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

  // Handle Open Folder
  const handleOpenFolder = async () => {
    let folder = game.install_dir;
    if (!folder) {
      if (game.launch_action.type === 'Executable') {
        folder = game.launch_action.working_dir || game.launch_action.path;
      } else if (game.launch_action.type === 'Shortcut') {
        folder = game.launch_action.working_dir || game.launch_action.target;
      }
    }

    if (!folder) {
      onError('Folder Unavailable', 'No install directory or file path is associated with this entry.');
      return;
    }

    try {
      await api.openFolder(folder);
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

  return (
    <aside className="w-84 bg-surface border-l border-border flex flex-col justify-between h-full flex-shrink-0 overflow-y-auto select-none">
      <div>
        {/* Header / Hero placeholder banner */}
        <div
          className="relative aspect-[96/31] w-full overflow-hidden flex items-center justify-center border-b border-border"
          style={{ background: gradient }}
        >
          {/* Top Controls Overlay */}
          <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between z-10">
            <button
              onClick={handleToggleFavorite}
              className={`p-1.5 rounded-control backdrop-blur border transition-colors ${
                game.is_favorite
                  ? 'bg-danger/20 border-danger/40 text-danger'
                  : 'bg-bg/70 border-border text-muted hover:text-white'
              }`}
              title={game.is_favorite ? 'Remove Favorite' : 'Mark as Favorite'}
            >
              <Heart className={`w-3.5 h-3.5 ${game.is_favorite ? 'fill-current' : ''}`} />
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-control bg-bg/70 backdrop-blur border border-border text-muted hover:text-white transition-colors"
              title="Close Panel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <span className="text-2xl font-black text-white/40 tracking-wider">
            {initials}
          </span>
        </div>

        {/* Content Body */}
        <div className="p-4 space-y-4">
          {/* Title & Platform header */}
          <div>
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-sm font-bold text-text leading-tight">{game.title}</h2>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] px-2 py-0.5 rounded bg-surface-2 border border-border text-muted font-medium">
                {game.source_kind}
              </span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  game.status === 'Installed'
                    ? 'bg-success/15 text-success border border-success/30'
                    : 'bg-danger/15 text-danger border border-danger/30'
                }`}
              >
                {game.status === 'Installed' ? 'Installed' : 'Missing File'}
              </span>
            </div>
          </div>

          {/* Missing File Alert Banner */}
          {game.status === 'Missing' && (
            <div className="p-3 rounded-card bg-danger/10 border border-danger/30 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-danger">Executable Not Found</div>
                <div className="text-[11px] text-text/80 mt-0.5">
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
          <div className="space-y-1">
            <button
              onClick={handleLaunch}
              disabled={isLaunching}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-control font-semibold text-xs transition-all shadow-md ${
                game.status === 'Missing'
                  ? 'bg-surface-2 border border-border text-text hover:bg-border'
                  : 'bg-accent hover:bg-accent-hover text-white'
              }`}
            >
              {isLaunching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Launching...</span>
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

            {game.last_launched_at && (
              <div className="text-[10px] text-muted flex items-center justify-center gap-1 mt-1 font-mono">
                <Clock className="w-3 h-3" />
                <span>Last played: {new Date(game.last_launched_at).toLocaleDateString()}</span>
              </div>
            )}
          </div>

          {/* Action Toolbar */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={handleOpenFolder}
              title="Open Game Folder"
              className="flex flex-col items-center justify-center p-2 rounded-card bg-surface-2 border border-border hover:border-muted text-muted hover:text-text transition-colors gap-1 text-[11px]"
            >
              <FolderOpen className="w-4 h-4 text-accent" />
              <span>Folder</span>
            </button>

            <button
              onClick={startEditingMetadata}
              title="Edit Title, Notes & Tags"
              className="flex flex-col items-center justify-center p-2 rounded-card bg-surface-2 border border-border hover:border-muted text-muted hover:text-text transition-colors gap-1 text-[11px]"
            >
              <Edit3 className="w-4 h-4 text-text" />
              <span>Edit</span>
            </button>

            <button
              onClick={startEditingLaunch}
              title="Edit Launch Configuration"
              className="flex flex-col items-center justify-center p-2 rounded-card bg-surface-2 border border-border hover:border-muted text-muted hover:text-text transition-colors gap-1 text-[11px]"
            >
              <Sliders className="w-4 h-4 text-warning" />
              <span>Config</span>
            </button>
          </div>

          {/* Metadata Display / Notes */}
          <div className="space-y-3 pt-2 border-t border-border">
            {/* Notes Section */}
            <div>
              <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-1">
                Notes
              </div>
              {game.notes ? (
                <p className="text-xs text-text/80 bg-surface-2/40 p-2.5 rounded-control border border-border whitespace-pre-wrap leading-relaxed">
                  {game.notes}
                </p>
              ) : (
                <div
                  onClick={startEditingMetadata}
                  className="text-[11px] text-muted/60 italic bg-surface-2/20 p-2 rounded-control border border-dashed border-border cursor-pointer hover:border-muted transition-colors"
                >
                  Click to add personal notes...
                </div>
              )}
            </div>

            {/* User Tags */}
            <div>
              <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-1">
                Tags
              </div>
              <div className="flex flex-wrap gap-1.5">
                {game.user_tags.length > 0 ? (
                  game.user_tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] bg-surface-2 text-text px-2 py-0.5 rounded-full border border-border flex items-center gap-1"
                    >
                      <Tag className="w-2.5 h-2.5 text-muted" />
                      <span>{tag}</span>
                    </span>
                  ))
                ) : (
                  <span className="text-[11px] text-muted italic">No tags assigned</span>
                )}
              </div>
            </div>

            {/* Launch Action Info (Security & path review) */}
            <div>
              <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-1">
                Target Configuration
              </div>
              <div className="bg-surface-2/60 p-2.5 rounded-control border border-border font-mono text-[10px] text-muted space-y-1 break-all">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-100">
          <div className="w-full max-w-md bg-surface border border-border rounded-dialog shadow-2xl p-5 space-y-4">
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
                  className="w-full bg-surface-2 border border-border rounded-control px-2.5 py-1.5 text-xs text-text focus:outline-none focus:border-accent"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-text">Notes</label>
                <textarea
                  rows={3}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Personal notes, walkthrough reminders, save backup notes..."
                  className="w-full bg-surface-2 border border-border rounded-control p-2 text-xs text-text focus:outline-none focus:border-accent"
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
                    className="flex-1 bg-surface-2 border border-border rounded-control px-2.5 py-1 text-xs text-text focus:outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newTagInput.trim() && !userTags.includes(newTagInput.trim())) {
                        setUserTags([...userTags, newTagInput.trim()]);
                        setNewTagInput('');
                      }
                    }}
                    className="px-2.5 py-1 rounded-control bg-surface-2 border border-border text-xs text-text hover:bg-border"
                  >
                    Add
                  </button>
                </div>

                <div className="flex flex-wrap gap-1 mt-2">
                  {userTags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] bg-surface-2 border border-border px-2 py-0.5 rounded-full flex items-center gap-1 text-text"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-100">
          <div className="w-full max-w-lg bg-surface border border-border rounded-dialog shadow-2xl p-5 space-y-4">
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
                  className="w-full bg-surface-2 border border-border rounded-control px-2.5 py-1.5 text-xs text-text font-mono focus:outline-none focus:border-accent"
                  placeholder="C:\Path\To\Game.exe"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-text">Working Directory</label>
                <input
                  type="text"
                  value={editWorkingDir}
                  onChange={(e) => setEditWorkingDir(e.target.value)}
                  className="w-full bg-surface-2 border border-border rounded-control px-2.5 py-1.5 text-xs text-text font-mono focus:outline-none focus:border-accent"
                  placeholder="Defaults to executable directory"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-text">Arguments (space separated)</label>
                <input
                  type="text"
                  value={editArgs}
                  onChange={(e) => setEditArgs(e.target.value)}
                  className="w-full bg-surface-2 border border-border rounded-control px-2.5 py-1.5 text-xs text-text font-mono focus:outline-none focus:border-accent"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-100">
          <div className="w-full max-w-md bg-surface border border-border rounded-dialog shadow-2xl p-5 space-y-4">
            <div className="flex items-center gap-2.5 text-danger border-b border-border pb-2.5">
              <Trash2 className="w-5 h-5 flex-shrink-0" />
              <h3 className="text-sm font-bold text-text">Remove from Library?</h3>
            </div>

            <div className="space-y-2 text-xs leading-relaxed text-text/80">
              <p>
                Are you sure you want to remove <strong>{game.title}</strong> from your GameShelf library?
              </p>
              <div className="p-3 bg-surface-2 border border-border rounded-card text-muted text-[11px] leading-relaxed">
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
    </aside>
  );
};
