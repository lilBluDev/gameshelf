import React, { useState, useRef } from 'react';
import { X, FolderOpen, AlertCircle, Plus, Check, ExternalLink } from 'lucide-react';
import { api } from '../services/api';
import { Game } from '../types/models';

interface AddGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGameAdded: (game: Game) => void;
  onOpenExisting: (game: Game) => void;
  onError: (title: string, message: string) => void;
}

export const AddGameModal: React.FC<AddGameModalProps> = ({
  isOpen,
  onClose,
  onGameAdded,
  onOpenExisting,
  onError,
}) => {
  const [filePath, setFilePath] = useState('');
  const [title, setTitle] = useState('');
  const [workingDir, setWorkingDir] = useState('');
  const [argsString, setArgsString] = useState('');
  const [isShortcut, setIsShortcut] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [duplicateGame, setDuplicateGame] = useState<Game | null>(null);
  const [allowDuplicate, setAllowDuplicate] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleReset = () => {
    setFilePath('');
    setTitle('');
    setWorkingDir('');
    setArgsString('');
    setIsShortcut(false);
    setDuplicateGame(null);
    setAllowDuplicate(false);
  };

  const handleInspectPath = async (selectedPath: string) => {
    if (!selectedPath.trim()) return;
    setInspecting(true);
    setDuplicateGame(null);
    setAllowDuplicate(false);

    try {
      const res = await api.inspectFile(selectedPath.trim());
      setFilePath(res.executable_path);
      setTitle(res.title);
      setWorkingDir(res.working_dir || '');
      setArgsString(res.args.join(' '));
      setIsShortcut(res.is_shortcut);

      // Check for duplicate path in existing library
      const dupRes = await api.checkDuplicate(res.executable_path);
      if (dupRes.is_duplicate && dupRes.existing_game) {
        setDuplicateGame(dupRes.existing_game);
      }
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err);
      onError('File Inspection Failed', msg);
    } finally {
      setInspecting(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // In WebView2 / Chromium desktop environments, file.path contains the absolute Windows filesystem path
      const path = (file as unknown as { path?: string }).path || file.name;
      handleInspectPath(path);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !filePath.trim()) {
      onError('Missing Information', 'Please provide a game title and valid executable path.');
      return;
    }

    if (duplicateGame && !allowDuplicate) {
      onError('Duplicate Detected', 'This game executable is already in your library. Choose "Open Existing" or allow duplicate.');
      return;
    }

    setSaving(true);
    try {
      const args = argsString.trim() ? argsString.trim().split(/\s+/) : [];
      const newGame = await api.addManualGame({
        title: title.trim(),
        executable_path: filePath.trim(),
        args,
        working_dir: workingDir.trim() || undefined,
        is_shortcut: isShortcut,
      });

      onGameAdded(newGame);
      handleReset();
      onClose();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err);
      onError('Failed to Add Game', msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 select-none animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-surface border border-border rounded-dialog shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="h-12 border-b border-border px-5 flex items-center justify-between bg-surface-2/40 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-bold text-text">Add Game to Library</h3>
          </div>
          <button
            onClick={() => {
              handleReset();
              onClose();
            }}
            className="p-1 rounded-control text-muted hover:text-text hover:bg-surface-2 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body Form */}
        <form onSubmit={handleSave} className="p-6 space-y-5">
          {/* File Picker Section */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text">Executable or Shortcut (.exe, .lnk)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                onBlur={() => filePath && handleInspectPath(filePath)}
                placeholder="C:\Games\Example\game.exe or shortcut.lnk"
                className="flex-1 bg-surface-2/70 border border-border rounded-control px-3 py-1.5 text-xs text-text placeholder-muted focus:outline-none focus:border-accent font-mono"
              />
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileInputChange}
                accept=".exe,.lnk"
                style={{ display: 'none' }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-control bg-surface-2 border border-border text-xs font-medium text-text hover:bg-border transition-colors flex-shrink-0"
              >
                <FolderOpen className="w-3.5 h-3.5 text-muted" />
                <span>Browse</span>
              </button>
            </div>
            <p className="text-[11px] text-muted">
              Select any PC game executable or desktop shortcut. GameShelf infers metadata without altering your files.
            </p>
          </div>

          {/* Duplicate Detection Warning Banner */}
          {duplicateGame && !allowDuplicate && (
            <div className="p-3 rounded-card bg-warning/10 border border-warning/30 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-warning">Game already exists in library</div>
                <div className="text-[11px] text-text/80 mt-0.5">
                  <strong>{duplicateGame.title}</strong> is already registered with this executable path.
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      onOpenExisting(duplicateGame);
                      handleReset();
                      onClose();
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-control bg-surface border border-warning/40 text-xs text-text hover:bg-surface-2 transition-colors font-medium"
                  >
                    <ExternalLink className="w-3 h-3 text-warning" />
                    <span>Open Existing Game</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAllowDuplicate(true)}
                    className="px-2.5 py-1 rounded-control text-xs text-muted hover:text-text transition-colors"
                  >
                    Add Anyway as Separate Entry
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Editable Confirmation Form Fields */}
          <div className="space-y-3.5 pt-2 border-t border-border">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-text">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Game Title"
                required
                className="w-full bg-surface-2/70 border border-border rounded-control px-3 py-1.5 text-xs text-text placeholder-muted focus:outline-none focus:border-accent"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-text">Working Directory (Optional)</label>
              <input
                type="text"
                value={workingDir}
                onChange={(e) => setWorkingDir(e.target.value)}
                placeholder="Defaults to executable parent folder"
                className="w-full bg-surface-2/70 border border-border rounded-control px-3 py-1.5 text-xs text-text placeholder-muted focus:outline-none focus:border-accent font-mono text-[11px]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-text">Launch Arguments (Optional)</label>
              <input
                type="text"
                value={argsString}
                onChange={(e) => setArgsString(e.target.value)}
                placeholder="-fullscreen -novid"
                className="w-full bg-surface-2/70 border border-border rounded-control px-3 py-1.5 text-xs text-text placeholder-muted focus:outline-none focus:border-accent font-mono text-[11px]"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
            <button
              type="button"
              onClick={() => {
                handleReset();
                onClose();
              }}
              className="px-4 py-1.5 rounded-control text-xs text-muted hover:text-text transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={inspecting || saving || !title.trim() || !filePath.trim() || (!!duplicateGame && !allowDuplicate)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-control bg-accent hover:bg-accent-hover text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{saving ? 'Adding...' : 'Add to Library'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
