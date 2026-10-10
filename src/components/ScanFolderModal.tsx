import React, { useState, useEffect } from 'react';
import {
  FolderSearch,
  X,
  Play,
  RotateCw,
  Check,
  AlertCircle,
  HelpCircle,
  Edit2,
  ChevronDown,
  ChevronUp,
  FolderCheck,
} from 'lucide-react';
import { ScanCandidate, ScanProgress, ScanResult } from '../types/api';
import { scannerService } from '../services/scanner';

interface ScanFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
  initialPath?: string;
}

type ScanStage = 'setup' | 'scanning' | 'preview' | 'complete';

export const ScanFolderModal: React.FC<ScanFolderModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
  initialPath = '',
}) => {
  const [stage, setStage] = useState<ScanStage>('setup');
  const [folderPath, setFolderPath] = useState<string>(initialPath);
  const [maxDepth, setMaxDepth] = useState<number>(4);
  const [showSkipped, setShowSkipped] = useState<boolean>(false);
  const [saveAsSource, setSaveAsSource] = useState<boolean>(true);

  // Scan state
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [candidates, setCandidates] = useState<ScanCandidate[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [expandedDetailsId, setExpandedDetailsId] = useState<string | null>(null);

  // Status & errors
  const [error, setError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (initialPath) {
      setFolderPath(initialPath);
    }
  }, [initialPath]);

  // Listen to background progress events
  useEffect(() => {
    if (!isOpen) return;

    let unlisten: (() => void) | undefined;
    scannerService.listenScanProgress((p) => {
      setProgress(p);
    }).then((un) => {
      unlisten = un;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStartScan = async () => {
    if (!folderPath.trim()) {
      setError('Please provide a folder path to scan.');
      return;
    }

    setError(null);
    setStage('scanning');
    setProgress(null);

    try {
      const result = await scannerService.startFolderScan({
        root_paths: [folderPath.trim()],
        max_depth: maxDepth,
        custom_exclusions: [],
        show_skipped: showSkipped,
      });

      setScanResult(result);
      setCandidates(result.candidates);
      setStage('preview');
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? (err as { message: string }).message
          : 'Failed to scan folder. Please ensure the path exists and is accessible.';
      setError(message);
      setStage('setup');
    }
  };

  const handleCancelScan = async () => {
    try {
      await scannerService.cancelFolderScan();
    } catch (err) {
      console.error('Failed to request scan cancellation:', err);
    }
  };

  const toggleSelectCandidate = (id: string) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c))
    );
  };

  const selectAll = (select: boolean) => {
    setCandidates((prev) =>
      prev.map((c) => {
        // If selecting all, don't auto-select skipped items unless showSkipped is on
        if (select && c.is_skipped && !showSkipped) {
          return c;
        }
        return { ...c, selected: select };
      })
    );
  };

  const startEditCandidate = (candidate: ScanCandidate) => {
    setEditingId(candidate.id);
    setEditTitle(candidate.title);
  };

  const saveEditCandidate = (id: string) => {
    if (editTitle.trim()) {
      setCandidates((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: editTitle.trim() } : c))
      );
    }
    setEditingId(null);
  };

  const handleImport = async () => {
    const selected = candidates.filter((c) => c.selected);
    if (selected.length === 0) {
      setError('No games selected for import.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      let sourceId: string | undefined;
      if (saveAsSource && folderPath.trim()) {
        try {
          const source = await scannerService.addScanSource(folderPath.trim(), maxDepth);
          sourceId = source.id;
        } catch (e) {
          console.warn('Could not save managed scan source:', e);
        }
      }

      const count = await scannerService.importScanCandidates(selected, sourceId);
      setImportedCount(count);
      setStage('complete');
      onImportComplete();
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? (err as { message: string }).message
          : 'Failed to import selected games.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredCandidates = candidates.filter((c) => (showSkipped ? true : !c.is_skipped));
  const selectedCount = candidates.filter((c) => c.selected).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scan-modal-title"
    >
      <div className="relative flex flex-col w-full max-w-3xl max-h-[90vh] bg-surface border border-border rounded-dialog shadow-2xl overflow-hidden animate-scale-in">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-2/60">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-control bg-accent/10 border border-accent/20 text-accent">
              <FolderSearch className="w-5 h-5" />
            </div>
            <div>
              <h2 id="scan-modal-title" className="text-base font-semibold text-text">
                Scan Folder for Games
              </h2>
              <p className="text-xs text-muted">
                {stage === 'setup' && 'Choose a local folder to discover game executables'}
                {stage === 'scanning' && 'Traversing folder tree and classifying binaries...'}
                {stage === 'preview' && 'Review discovered games and select items to import'}
                {stage === 'complete' && 'Import completed successfully'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-control text-muted hover:text-text hover:bg-surface-2 transition-colors"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="flex items-start gap-3 p-3 text-sm text-danger bg-danger/10 border border-danger/20 rounded-control">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="flex-1">{error}</div>
            </div>
          )}

          {/* STAGE 1: Setup & Input */}
          {stage === 'setup' && (
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted uppercase tracking-wider">
                  Games Folder Path <span className="text-danger">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={folderPath}
                    onChange={(e) => setFolderPath(e.target.value)}
                    placeholder="e.g. D:\Games or C:\Games\PC"
                    className="flex-1 px-3 py-2 bg-surface-2 border border-border rounded-control text-sm text-text placeholder-muted focus:outline-none focus:border-accent"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-muted">
                  Specify the top-level directory where your standalone or DRM-free games are stored.
                </p>
              </div>

              {/* Bounded Recursion Depth */}
              <div className="p-4 bg-surface-2/40 border border-border/80 rounded-control space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-text">Folder Recursion Depth</div>
                    <div className="text-xs text-muted">
                      Limits subfolder traversal to prevent scanning excessive depths.
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-accent bg-accent/10 px-2 py-0.5 rounded border border-accent/20">
                      {maxDepth} levels
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min="1"
                  max="6"
                  value={maxDepth}
                  onChange={(e) => setMaxDepth(parseInt(e.target.value, 10))}
                  className="w-full accent-accent cursor-pointer"
                />
                <div className="flex justify-between text-xs text-muted">
                  <span>1 (Shallow)</span>
                  <span>4 (Standard default)</span>
                  <span>6 (Deep subfolders)</span>
                </div>
              </div>

              {/* Safe Scan Guard Notice */}
              <div className="flex items-start gap-3 p-3.5 bg-surface-2/20 border border-border rounded-control text-xs text-muted">
                <HelpCircle className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                <p>
                  <strong>Safety guarantee:</strong> GameShelf never scans entire disk drives (e.g.{' '}
                  <code>C:\</code>) or Windows system folders directly. Excluded folders like{' '}
                  <code>$Recycle.Bin</code>, <code>node_modules</code>, and <code>.git</code> are
                  automatically skipped.
                </p>
              </div>
            </div>
          )}

          {/* STAGE 2: Scanning in Progress */}
          {stage === 'scanning' && (
            <div className="py-8 space-y-6 text-center">
              <div className="inline-flex p-4 rounded-full bg-accent/10 border border-accent/20 text-accent animate-pulse">
                <RotateCw className="w-8 h-8 animate-spin" />
              </div>

              <div>
                <h3 className="text-base font-semibold text-text">Scanning Directory Tree</h3>
                <p className="text-xs text-muted mt-1 max-w-md mx-auto truncate font-mono">
                  {progress?.current_directory || 'Initializing scan...'}
                </p>
              </div>

              {/* Progress metrics grid */}
              <div className="grid grid-cols-4 gap-3 max-w-xl mx-auto text-left">
                <div className="p-3 bg-surface-2 border border-border rounded-control">
                  <div className="text-xs text-muted uppercase">Folders</div>
                  <div className="text-lg font-bold text-text">
                    {progress?.folders_scanned || 0}
                  </div>
                </div>
                <div className="p-3 bg-surface-2 border border-border rounded-control">
                  <div className="text-xs text-muted uppercase">Files Checked</div>
                  <div className="text-lg font-bold text-text">
                    {progress?.files_examined || 0}
                  </div>
                </div>
                <div className="p-3 bg-surface-2 border border-border rounded-control">
                  <div className="text-xs text-muted uppercase">Candidates</div>
                  <div className="text-lg font-bold text-accent">
                    {progress?.candidates_found || 0}
                  </div>
                </div>
                <div className="p-3 bg-surface-2 border border-border rounded-control">
                  <div className="text-xs text-muted uppercase">Skipped</div>
                  <div className="text-lg font-bold text-muted">
                    {progress?.skipped_count || 0}
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleCancelScan}
                  className="px-4 py-2 text-xs font-semibold text-danger border border-danger/30 hover:bg-danger/10 rounded-control transition-colors"
                >
                  Cancel Scan
                </button>
              </div>
            </div>
          )}

          {/* STAGE 3: Preview Table & Curation */}
          {stage === 'preview' && (
            <div className="space-y-4">
              {scanResult?.is_cancelled && (
                <div className="p-3 bg-warning/10 border border-warning/20 rounded-control text-xs text-warning flex items-center justify-between">
                  <span>Scan was cancelled early. Showing candidates discovered prior to cancellation.</span>
                  <button
                    onClick={() => setStage('setup')}
                    className="underline hover:text-text ml-2 font-medium"
                  >
                    Restart
                  </button>
                </div>
              )}

              {/* Controls bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border text-xs">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => selectAll(true)}
                    className="px-2.5 py-1 bg-surface-2 border border-border hover:bg-surface-2/80 rounded text-text transition-colors"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => selectAll(false)}
                    className="px-2.5 py-1 bg-surface-2 border border-border hover:bg-surface-2/80 rounded text-text transition-colors"
                  >
                    Deselect All
                  </button>
                  <span className="text-muted ml-2">
                    {selectedCount} of {filteredCandidates.length} selected
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-muted hover:text-text cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showSkipped}
                      onChange={(e) => setShowSkipped(e.target.checked)}
                      className="rounded border-border accent-accent"
                    />
                    <span>Show Skipped Utilities ({scanResult?.skipped_count || 0})</span>
                  </label>
                </div>
              </div>

              {/* Candidates list */}
              {filteredCandidates.length === 0 ? (
                <div className="py-12 text-center text-muted">
                  <FolderSearch className="w-10 h-10 mx-auto text-muted/40 mb-3" />
                  <p className="text-sm">No game executables found in this directory.</p>
                  <p className="text-xs mt-1">
                    Try increasing the recursion depth or verify the folder contents.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  {filteredCandidates.map((candidate) => {
                    const isExpanded = expandedDetailsId === candidate.id;
                    const isEditing = editingId === candidate.id;

                    return (
                      <div
                        key={candidate.id}
                        className={`p-3 rounded-control border transition-all ${
                          candidate.selected
                            ? 'bg-surface-2/80 border-accent/30'
                            : 'bg-surface-2/30 border-border opacity-70'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={candidate.selected}
                            onChange={() => toggleSelectCandidate(candidate.id)}
                            className="mt-1 w-4 h-4 rounded border-border accent-accent cursor-pointer"
                          />

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {isEditing ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value)}
                                    className="px-2 py-0.5 bg-surface border border-accent rounded text-sm text-text"
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') saveEditCandidate(candidate.id);
                                      if (e.key === 'Escape') setEditingId(null);
                                    }}
                                  />
                                  <button
                                    onClick={() => saveEditCandidate(candidate.id)}
                                    className="px-2 py-0.5 bg-accent text-white text-xs rounded"
                                  >
                                    Save
                                  </button>
                                </div>
                              ) : (
                                <span className="font-medium text-sm text-text flex items-center gap-1.5">
                                  {candidate.title}
                                  <button
                                    onClick={() => startEditCandidate(candidate)}
                                    className="text-muted hover:text-accent p-0.5"
                                    title="Edit title"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                </span>
                              )}

                              {/* Confidence badge */}
                              <span
                                className={`text-xs uppercase font-bold px-1.5 py-0.5 rounded border ${
                                  candidate.confidence === 'High'
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                    : candidate.confidence === 'Medium'
                                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                    : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                }`}
                              >
                                {candidate.confidence} Confidence
                              </span>

                              {/* Existing in Library badge */}
                              {candidate.existing_game_id && (
                                <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-surface border border-border text-muted">
                                  Already in Library (Will Update)
                                </span>
                              )}

                              {candidate.is_skipped && (
                                <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-danger/10 text-danger border border-danger/20">
                                  Skipped Utility
                                </span>
                              )}
                            </div>

                            {/* Path and Explainable Reason */}
                            <div className="text-xs text-muted font-mono truncate mt-0.5">
                              {candidate.executable_path}
                            </div>
                            <div className="text-xs text-muted/90 mt-1 flex items-center gap-1">
                              <span className="text-muted">Reason:</span> {candidate.reason}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setExpandedDetailsId(isExpanded ? null : candidate.id)
                            }
                            className="p-1 text-muted hover:text-text rounded"
                            title="Toggle launch settings preview"
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                        </div>

                        {/* Collapsible Details */}
                        {isExpanded && (
                          <div className="mt-3 pt-3 border-t border-border/60 text-xs space-y-2 text-muted pl-7">
                            <div>
                              <span className="font-semibold text-text">Working Directory:</span>{' '}
                              <span className="font-mono">{candidate.working_dir}</span>
                            </div>
                            <div>
                              <span className="font-semibold text-text">Binary Size:</span>{' '}
                              {(candidate.file_size_bytes / (1024 * 1024)).toFixed(1)} MB
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Save as Source Checkbox */}
              <div className="pt-2">
                <label className="flex items-center gap-2 text-xs text-muted hover:text-text cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={saveAsSource}
                    onChange={(e) => setSaveAsSource(e.target.checked)}
                    className="rounded border-border accent-accent"
                  />
                  <span>
                    Save this folder as a permanent managed source in Settings for quick one-click
                    rescans
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* STAGE 4: Complete */}
          {stage === 'complete' && (
            <div className="py-8 space-y-4 text-center">
              <div className="inline-flex p-3 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <FolderCheck className="w-10 h-10" />
              </div>
              <h3 className="text-lg font-semibold text-text">Scan Import Complete</h3>
              <p className="text-sm text-muted max-w-md mx-auto">
                Successfully imported <strong>{importedCount}</strong> games into your GameShelf
                library.
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-surface-2/40">
          {stage === 'setup' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-muted hover:text-text transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartScan}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-accent hover:bg-accent-hover rounded-control transition-colors shadow-lg shadow-accent/20"
              >
                <Play className="w-3.5 h-3.5" />
                Scan Folder
              </button>
            </>
          )}

          {stage === 'scanning' && (
            <div className="w-full flex justify-end">
              <button
                type="button"
                onClick={handleCancelScan}
                className="px-4 py-2 text-xs font-semibold text-danger border border-danger/30 hover:bg-danger/10 rounded-control transition-colors"
              >
                Stop / Cancel
              </button>
            </div>
          )}

          {stage === 'preview' && (
            <>
              <button
                type="button"
                onClick={() => setStage('setup')}
                className="px-4 py-2 text-xs font-semibold text-muted hover:text-text transition-colors"
              >
                Back / Choose Different Folder
              </button>
              <button
                type="button"
                disabled={selectedCount === 0 || isSubmitting}
                onClick={handleImport}
                className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed rounded-control transition-colors shadow-lg shadow-accent/20"
              >
                {isSubmitting ? (
                  <>
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Import {selectedCount} Selected {selectedCount === 1 ? 'Game' : 'Games'}
                  </>
                )}
              </button>
            </>
          )}

          {stage === 'complete' && (
            <div className="w-full flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 text-xs font-semibold text-white bg-accent hover:bg-accent-hover rounded-control transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
