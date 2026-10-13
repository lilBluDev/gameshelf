import React, { useState, useEffect } from 'react';
import {
  X,
  Disc,
  FolderOpen,
  Check,
  AlertCircle,
  AlertTriangle,
  RotateCw,
  Edit2,
  Layers,
  CheckSquare,
  Square,
} from 'lucide-react';
import { emulatorService } from '../services/emulators';
import { EmulatorProfile } from '../types/models';
import { RomCandidate, RomScanResult } from '../types/api';

interface ScanRomsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
  initialProfileId?: string;
  initialFolderPath?: string;
}

type ScanStage = 'setup' | 'scanning' | 'preview' | 'complete';

export const ScanRomsModal: React.FC<ScanRomsModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
  initialProfileId,
  initialFolderPath = '',
}) => {
  const [stage, setStage] = useState<ScanStage>('setup');
  const [profiles, setProfiles] = useState<EmulatorProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState<boolean>(true);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [selectedSystem, setSelectedSystem] = useState<string>('');
  const [folderPath, setFolderPath] = useState<string>(initialFolderPath);
  const [maxDepth, setMaxDepth] = useState<number>(4);
  const [extraExtensions, setExtraExtensions] = useState<string>('');

  // Scanning & Candidate states
  const [scanResult, setScanResult] = useState<RomScanResult | null>(null);
  const [candidates, setCandidates] = useState<RomCandidate[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [importedCount, setImportedCount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  // Load emulator profiles when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const loadProfiles = async () => {
      try {
        setLoadingProfiles(true);
        const list = await emulatorService.getEmulatorProfiles();
        setProfiles(list);

        if (list.length > 0) {
          const defaultProf =
            list.find((p) => p.id === initialProfileId) ||
            list.find((p) => p.validation_status.status === 'Verified') ||
            list[0];

          setSelectedProfileId(defaultProf.id);
          setSelectedSystem(defaultProf.systems[0] || 'Default');
        }
      } catch (err: unknown) {
        const e = err as { message?: string };
        setError(e.message || 'Failed to load emulator profiles');
      } finally {
        setLoadingProfiles(false);
      }
    };

    loadProfiles();
  }, [isOpen, initialProfileId]);

  // When selected profile changes, update available system options
  const selectedProfile = profiles.find((p) => p.id === selectedProfileId);

  useEffect(() => {
    if (selectedProfile && selectedProfile.systems.length > 0) {
      if (!selectedProfile.systems.includes(selectedSystem)) {
        setSelectedSystem(selectedProfile.systems[0]);
      }
    }
  }, [selectedProfileId, selectedProfile, selectedSystem]);

  if (!isOpen) return null;

  const handleStartScan = async () => {
    if (!folderPath.trim()) {
      setError('Please provide a ROM folder path to scan.');
      return;
    }
    if (!selectedProfileId) {
      setError('Please select an emulator profile.');
      return;
    }

    setError(null);
    setStage('scanning');

    try {
      const extraExts = extraExtensions
        .split(',')
        .map((e) => e.trim())
        .filter((e) => e.length > 0);

      const result = await emulatorService.scanRomFolder({
        folder_path: folderPath.trim(),
        profile_id: selectedProfileId,
        system: selectedSystem || 'Generic',
        extra_extensions: extraExts,
        max_depth: maxDepth,
      });

      setScanResult(result);
      setCandidates(result.candidates);
      setStage('preview');
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'Failed to scan ROM folder.');
      setStage('setup');
    }
  };

  const handleToggleCandidate = (id: string) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c))
    );
  };

  const handleSelectAll = (select: boolean) => {
    setCandidates((prev) =>
      prev.map((c) => (c.is_duplicate ? c : { ...c, selected: select }))
    );
  };

  const handleSaveTitleEdit = (id: string) => {
    if (editTitle.trim()) {
      setCandidates((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: editTitle.trim() } : c))
      );
    }
    setEditingId(null);
  };

  const handleImport = async () => {
    const selectedCandidates = candidates.filter((c) => c.selected);
    if (selectedCandidates.length === 0) {
      setError('No games selected for import.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const count = await emulatorService.importEmulatedGames(selectedCandidates);
      setImportedCount(count);
      setStage('complete');
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'Failed to import selected games into library.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Scan & Import ROMs"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 animate-fade-in"
    >
      <div className="bg-surface border border-border rounded-dialog shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-2/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-control bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
              <Disc className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-text">Scan & Import ROMs</h3>
              <p className="text-xs text-muted">
                Discover ROMs with automatic multi-disc & multi-track grouping
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-text p-1.5 rounded-control hover:bg-surface-2 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 bg-danger/10 border border-danger/30 text-danger rounded-control p-3.5 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* STAGE 1: SETUP */}
          {stage === 'setup' && (
            <div className="space-y-5">
              {/* Emulator Profile Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text">Target Emulator Profile</label>
                {loadingProfiles ? (
                  <div className="text-xs text-muted flex items-center gap-2">
                    <RotateCw className="w-3.5 h-3.5 animate-spin" /> Loading emulator profiles...
                  </div>
                ) : profiles.length === 0 ? (
                  <div className="text-xs text-warning bg-warning/10 border border-warning/20 p-3 rounded-control">
                    No emulator profiles found. Please add or detect emulators in Settings.
                  </div>
                ) : (
                  <select
                    value={selectedProfileId}
                    onChange={(e) => setSelectedProfileId(e.target.value)}
                    className="w-full bg-surface-2/60 rounded-control px-3 py-2 text-xs text-text focus:outline-none focus:border-accent"
                  >
                    {profiles.map((p) => {
                      const statusStr =
                        p.validation_status.status === 'Verified'
                          ? 'Verified'
                          : p.validation_status.status === 'ExecutableMissing'
                          ? 'Executable Missing'
                          : p.validation_status.status;
                      return (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.systems.join(', ')}) — [{statusStr}]
                        </option>
                      );
                    })}
                  </select>
                )}
              </div>

              {/* Profile Status Notice */}
              {selectedProfile && selectedProfile.validation_status.status !== 'Verified' && (
                <div className="bg-warning/10 border border-warning/30 rounded-control p-3 text-xs text-warning flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-semibold">Emulator not fully configured:</span>{' '}
                    {selectedProfile.validation_status.status === 'ExecutableMissing'
                      ? 'The emulator executable has not been located yet. You can scan and import ROMs now, and set the executable path later in Settings.'
                      : selectedProfile.validation_status.detail || 'Needs configuration.'}
                  </div>
                </div>
              )}

              {/* System Selector */}
              {selectedProfile && selectedProfile.systems.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-text">System / Platform</label>
                  <select
                    value={selectedSystem}
                    onChange={(e) => setSelectedSystem(e.target.value)}
                    className="w-full bg-surface-2/60 rounded-control px-3 py-2 text-xs text-text focus:outline-none focus:border-accent"
                  >
                    {selectedProfile.systems.map((sys) => (
                      <option key={sys} value={sys}>
                        {sys}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Folder Path Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text">ROM Directory Path</label>
                <div className="relative">
                  <input
                    type="text"
                    value={folderPath}
                    onChange={(e) => setFolderPath(e.target.value)}
                    placeholder="e.g. D:\Emulation\ROMs\PS1 or C:\Games\SNES"
                    className="w-full bg-surface-2/60 rounded-control px-3 py-2 pr-9 text-xs text-text placeholder-muted focus:outline-none focus:border-accent"
                  />
                  <FolderOpen className="w-4 h-4 text-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <p className="text-xs text-muted">
                  Supported extensions for this profile:{' '}
                  <span className="text-text font-mono">
                    {selectedProfile?.supported_extensions.join(', ') || 'None'}
                  </span>
                </p>
              </div>

              {/* Advanced Options Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border/50">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-text">Max Directory Depth</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={1}
                      max={6}
                      value={maxDepth}
                      onChange={(e) => setMaxDepth(parseInt(e.target.value, 10))}
                      className="flex-1 accent-accent"
                    />
                    <span className="text-xs font-mono text-text bg-surface-2 px-2 py-0.5 rounded">
                      {maxDepth} levels
                    </span>
                  </div>
                  <p className="text-xs text-muted">Prevents unbounded filesystem traversal.</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-text">Extra Extensions (Optional)</label>
                  <input
                    type="text"
                    value={extraExtensions}
                    onChange={(e) => setExtraExtensions(e.target.value)}
                    placeholder=".zip, .7z (comma-separated)"
                    className="w-full bg-surface-2/60 rounded-control px-3 py-1.5 text-xs text-text placeholder-muted focus:outline-none focus:border-accent"
                  />
                  <p className="text-xs text-muted">Additional file types to scan for this run.</p>
                </div>
              </div>
            </div>
          )}

          {/* STAGE 2: SCANNING */}
          {stage === 'scanning' && (
            <div className="py-16 text-center space-y-4">
              <div className="relative w-14 h-14 mx-auto">
                <RotateCw className="w-14 h-14 text-accent animate-spin opacity-80" />
                <Disc className="w-6 h-6 text-text absolute inset-0 m-auto animate-pulse" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-text">Scanning ROM Directory...</h4>
                <p className="text-xs text-muted max-w-md mx-auto">
                  Inspecting disk images, parsing CUE multi-tracks, and grouping multi-disc sets.
                </p>
              </div>
            </div>
          )}

          {/* STAGE 3: PREVIEW & CURATION */}
          {stage === 'preview' && scanResult && (
            <div className="space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-surface-2/60 border border-border rounded-control p-3">
                  <div className="text-xs text-muted">ROM Candidates Found</div>
                  <div className="text-lg font-bold text-text">{candidates.length}</div>
                </div>
                <div className="bg-surface-2/60 border border-border rounded-control p-3">
                  <div className="text-xs text-muted">Grouped Tracks & Discs</div>
                  <div className="text-lg font-bold text-accent">
                    {scanResult.grouped_files_count}
                  </div>
                </div>
                <div className="bg-surface-2/60 border border-border rounded-control p-3">
                  <div className="text-xs text-muted">Already in Library</div>
                  <div className="text-lg font-bold text-muted">
                    {scanResult.duplicates_count}
                  </div>
                </div>
              </div>

              {/* Selection Controls */}
              <div className="flex items-center justify-between py-2 border-b border-border text-xs">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleSelectAll(true)}
                    className="flex items-center gap-1.5 text-text hover:text-accent transition-colors font-medium"
                  >
                    <CheckSquare className="w-3.5 h-3.5 text-accent" /> Select All
                  </button>
                  <button
                    onClick={() => handleSelectAll(false)}
                    className="flex items-center gap-1.5 text-muted hover:text-text transition-colors font-medium"
                  >
                    <Square className="w-3.5 h-3.5" /> Deselect All
                  </button>
                </div>
                <span className="text-muted">
                  {candidates.filter((c) => c.selected).length} of {candidates.length} selected
                </span>
              </div>

              {/* Candidates List */}
              {candidates.length === 0 ? (
                <div className="py-12 text-center text-muted text-xs">
                  No matching ROMs found in the specified folder for profile &ldquo;{selectedProfile?.name}&rdquo;.
                </div>
              ) : (
                <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                  {candidates.map((cand) => (
                    <div
                      key={cand.id}
                      className={`p-3 rounded-control border transition-all ${
                        cand.is_duplicate
                          ? 'bg-surface-2/20 border-border/40 opacity-70'
                          : cand.selected
                          ? 'bg-surface-2/70 border-accent/40 shadow-sm'
                          : 'bg-surface-2/30 border-border hover:border-border/80'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={cand.selected}
                          disabled={cand.is_duplicate}
                          onChange={() => handleToggleCandidate(cand.id)}
                          className="mt-1 w-4 h-4 rounded border-border accent-accent cursor-pointer"
                        />

                        <div className="flex-1 min-w-0">
                          {/* Title & Inline Edit */}
                          <div className="flex items-center gap-2">
                            {editingId === cand.id ? (
                              <div className="flex items-center gap-2 flex-1">
                                <input
                                  type="text"
                                  value={editTitle}
                                  onChange={(e) => setEditTitle(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveTitleEdit(cand.id);
                                    if (e.key === 'Escape') setEditingId(null);
                                  }}
                                  className="flex-1 bg-surface border border-accent rounded px-2 py-0.5 text-xs text-text focus:outline-none"
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleSaveTitleEdit(cand.id)}
                                  className="text-xs bg-accent text-white px-2 py-0.5 rounded"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="text-xs text-muted hover:text-text px-1"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                <span className="text-xs font-semibold text-text truncate">
                                  {cand.title}
                                </span>
                                <button
                                  onClick={() => {
                                    setEditingId(cand.id);
                                    setEditTitle(cand.title);
                                  }}
                                  className="text-muted hover:text-text p-0.5"
                                  title="Edit Title"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              </div>
                            )}

                            {/* System Tag */}
                            <span className="text-xs font-medium px-2 py-0.5 rounded bg-surface text-muted flex-shrink-0">
                              {cand.system}
                            </span>

                            {/* Duplicate Tag */}
                            {cand.is_duplicate && (
                              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-warning/10 text-warning border border-warning/20 flex-shrink-0">
                                In Library
                              </span>
                            )}
                          </div>

                          {/* File Path & Size */}
                          <div className="text-xs text-muted font-mono truncate mt-0.5">
                            {cand.rom_path}
                          </div>

                          {/* Grouped Badges */}
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <span className="text-xs text-muted bg-surface/50 px-2 py-0.5 rounded/60">
                              {formatBytes(cand.file_size_bytes)}
                            </span>

                            {cand.grouped_files.length > 0 && (
                              <span className="text-xs text-accent bg-accent/10 border border-accent/20 px-2 py-0.5 rounded flex items-center gap-1">
                                <Layers className="w-3 h-3" />
                                {cand.grouped_files.length} linked track(s) / disc(s) grouped
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STAGE 4: COMPLETE */}
          {stage === 'complete' && (
            <div className="py-12 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-success/20 text-success border border-success/30 flex items-center justify-center mx-auto">
                <Check className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-text">Import Successful!</h4>
                <p className="text-xs text-muted max-w-sm mx-auto">
                  Imported {importedCount} emulated game(s) into your library. You can launch them
                  directly or manage their covers.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-surface-2/40">
          {stage === 'setup' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-control text-xs font-medium text-muted hover:text-text hover:bg-surface-2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleStartScan}
                disabled={loadingProfiles || profiles.length === 0}
                className="flex items-center gap-2 px-5 py-2 rounded-control text-xs font-semibold bg-accent hover:bg-accent-hover text-white transition-all shadow-sm disabled:opacity-50"
              >
                <RotateCw className="w-3.5 h-3.5" /> Start Scan
              </button>
            </>
          )}

          {stage === 'scanning' && (
            <div className="w-full text-right">
              <button
                onClick={() => setStage('setup')}
                className="px-4 py-2 rounded-control text-xs font-medium text-muted hover:text-text hover:bg-surface-2 transition-colors"
              >
                Cancel Scan
              </button>
            </div>
          )}

          {stage === 'preview' && (
            <>
              <button
                onClick={() => setStage('setup')}
                className="px-4 py-2 rounded-control text-xs font-medium text-muted hover:text-text hover:bg-surface-2 transition-colors"
              >
                Back to Settings
              </button>
              <button
                onClick={handleImport}
                disabled={isSubmitting || candidates.filter((c) => c.selected).length === 0}
                className="flex items-center gap-2 px-5 py-2 rounded-control text-xs font-semibold bg-accent hover:bg-accent-hover text-white transition-all shadow-sm disabled:opacity-50"
              >
                {isSubmitting ? (
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                Import {candidates.filter((c) => c.selected).length} Games
              </button>
            </>
          )}

          {stage === 'complete' && (
            <div className="w-full text-right">
              <button
                onClick={() => {
                  onImportComplete();
                  onClose();
                }}
                className="px-5 py-2 rounded-control text-xs font-semibold bg-accent hover:bg-accent-hover text-white transition-all shadow-sm"
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
