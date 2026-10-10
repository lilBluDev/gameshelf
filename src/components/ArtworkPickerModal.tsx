import React, { useEffect, useState } from 'react';
import {
  X,
  Search,
  Upload,
  RotateCcw,
  Trash2,
  Check,
  Loader2,
  Sparkles,
  Lock,
  Unlock,
} from 'lucide-react';
import { ArtworkCandidate } from '../types/artwork';
import { ArtworkAsset, ArtworkRole, Game } from '../types/models';
import {
  applyArtworkAsset,
  getArtworkCandidates,
  getLockedFields,
  removeArtworkForRole,
  searchMetadata,
  selectLocalArtwork,
  setLockedFields,
} from '../services/artwork';

interface ArtworkPickerModalProps {
  game: Game;
  isOpen: boolean;
  onClose: () => void;
  onArtworkChanged: (updatedGameId: string) => void;
  initialRole?: ArtworkRole;
}

const ROLES: { id: ArtworkRole; label: string; aspect: string }[] = [
  { id: 'cover', label: 'Cover (2:3)', aspect: 'aspect-[2/3]' },
  { id: 'hero', label: 'Hero (Banner)', aspect: 'aspect-[96/31]' },
  { id: 'logo', label: 'Logo', aspect: 'aspect-[16/9]' },
  { id: 'icon', label: 'Icon (Square)', aspect: 'aspect-square' },
];

export const ArtworkPickerModal: React.FC<ArtworkPickerModalProps> = ({
  game,
  isOpen,
  onClose,
  onArtworkChanged,
  initialRole = 'cover',
}) => {
  const [activeRole, setActiveRole] = useState<ArtworkRole>(initialRole);
  const [candidates, setCandidates] = useState<ArtworkCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [searchQuery, setSearchQuery] = useState(game.title);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [customLocalPath, setCustomLocalPath] = useState('');
  const [isLocalInputOpen, setIsLocalInputOpen] = useState(false);
  const [lockedFields, setLockedFieldsState] = useState<string[]>([]);
  const [providerGameId, setProviderGameId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (isOpen) {
      setActiveRole(initialRole);
      setSearchQuery(game.title);
      setErrorMsg(null);
      loadLockedFields();
      loadCandidates(initialRole);
    }
  }, [isOpen, game.id, initialRole]);

  const loadLockedFields = async () => {
    try {
      const locked = await getLockedFields(game.id);
      setLockedFieldsState(locked);
    } catch {
      // Ignored
    }
  };

  const isRoleLocked = lockedFields.includes(activeRole);

  const toggleRoleLock = async () => {
    const updated = isRoleLocked
      ? lockedFields.filter((f) => f !== activeRole)
      : [...lockedFields, activeRole];
    setLockedFieldsState(updated);
    try {
      await setLockedFields(game.id, updated);
    } catch (e: any) {
      setErrorMsg(e?.message || 'Failed to update field lock');
    }
  };

  const loadCandidates = async (role: ArtworkRole, customProviderId?: string) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const list = await getArtworkCandidates(game.id, role, customProviderId || providerGameId);
      setCandidates(list);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not fetch artwork candidates');
      setCandidates([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRoleChange = (role: ArtworkRole) => {
    setActiveRole(role);
    setIsLocalInputOpen(false);
    loadCandidates(role);
  };

  const handleCustomSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    setErrorMsg(null);
    try {
      const gameMatches = await searchMetadata(searchQuery.trim(), game.release_year || undefined);
      if (gameMatches.length > 0) {
        const topMatch = gameMatches[0];
        setProviderGameId(topMatch.provider_game_id);
        const list = await getArtworkCandidates(game.id, activeRole, topMatch.provider_game_id);
        setCandidates(list);
      } else {
        setErrorMsg(`No titles found on SteamGridDB for "${searchQuery}"`);
        setCandidates([]);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Search failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyCandidate = async (candidate: ArtworkCandidate) => {
    setIsApplying(true);
    setErrorMsg(null);
    try {
      await applyArtworkAsset(game.id, candidate);
      onArtworkChanged(game.id);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to download and apply artwork');
    } finally {
      setIsApplying(false);
    }
  };

  const handleApplyLocal = async () => {
    if (!customLocalPath.trim()) return;
    setIsApplying(true);
    setErrorMsg(null);
    try {
      await selectLocalArtwork(game.id, activeRole, customLocalPath.trim());
      setCustomLocalPath('');
      setIsLocalInputOpen(false);
      onArtworkChanged(game.id);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load local artwork');
    } finally {
      setIsApplying(false);
    }
  };

  const handleRemoveCurrent = async () => {
    setIsApplying(true);
    try {
      await removeArtworkForRole(game.id, activeRole);
      onArtworkChanged(game.id);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to remove artwork');
    } finally {
      setIsApplying(false);
    }
  };

  const handleRestoreAutomatic = async () => {
    if (candidates.length > 0) {
      await handleApplyCandidate(candidates[0]);
    }
  };

  if (!isOpen) return null;

  const currentSelected: ArtworkAsset | undefined = game.artwork?.[activeRole];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="artwork-modal-title"
    >
      <div className="flex h-[88vh] w-full max-w-5xl flex-col rounded-dialog border border-border bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-accent" />
            <div>
              <h2 id="artwork-modal-title" className="text-lg font-semibold text-text">
                Artwork Manager — {game.title}
              </h2>
              <p className="text-xs text-muted">
                Choose official or community artwork from SteamGridDB, Steam CDN, or local files
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-control p-1.5 text-muted hover:bg-surface-2 hover:text-text transition-colors"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Role Tabs */}
        <div className="flex items-center justify-between border-b border-border bg-surface-2/40 px-6 py-2.5">
          <div className="flex gap-2">
            {ROLES.map((r) => (
              <button
                key={r.id}
                onClick={() => handleRoleChange(r.id)}
                className={`rounded-control px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  activeRole === r.id
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-muted hover:bg-surface-2 hover:text-text'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={toggleRoleLock}
              className={`flex items-center gap-1.5 rounded-control px-3 py-1.5 text-xs font-medium transition-colors ${
                isRoleLocked
                  ? 'bg-warning/20 text-warning border border-warning/30'
                  : 'bg-surface-2 text-muted hover:text-text'
              }`}
              title={
                isRoleLocked
                  ? 'Locked: automatic refreshes will preserve this choice'
                  : 'Unlocked: library refreshes may update this role'
              }
            >
              {isRoleLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
              {isRoleLocked ? 'Locked against changes' : 'Lock choice'}
            </button>
          </div>
        </div>

        {/* Toolbar: Search & Action buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3 bg-surface">
          <form onSubmit={handleCustomSearch} className="flex flex-1 max-w-md items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search game on SteamGridDB..."
                className="w-full rounded-control border border-border bg-surface-2 py-1.5 pl-9 pr-3 text-sm text-text placeholder-muted focus:border-accent focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="rounded-control bg-surface-2 px-3 py-1.5 text-sm font-medium text-text hover:bg-border transition-colors disabled:opacity-50"
            >
              Search
            </button>
          </form>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsLocalInputOpen(!isLocalInputOpen)}
              className="flex items-center gap-1.5 rounded-control border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-text hover:bg-border transition-colors"
            >
              <Upload className="h-3.5 w-3.5 text-muted" />
              Local File
            </button>

            {candidates.length > 0 && (
              <button
                onClick={handleRestoreAutomatic}
                disabled={isApplying}
                className="flex items-center gap-1.5 rounded-control border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-text hover:bg-border transition-colors disabled:opacity-50"
                title="Apply the top-scoring community choice"
              >
                <RotateCcw className="h-3.5 w-3.5 text-muted" />
                Automatic Choice
              </button>
            )}

            {currentSelected && (
              <button
                onClick={handleRemoveCurrent}
                disabled={isApplying}
                className="flex items-center gap-1.5 rounded-control border border-danger/30 bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/20 transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </button>
            )}
          </div>
        </div>

        {/* Local File Selector Panel */}
        {isLocalInputOpen && (
          <div className="flex items-center gap-3 border-b border-border bg-surface-2/60 px-6 py-3">
            <input
              type="text"
              value={customLocalPath}
              onChange={(e) => setCustomLocalPath(e.target.value)}
              placeholder="Enter absolute path to image file (e.g. C:\Images\cover.png)..."
              className="flex-1 rounded-control border border-border bg-surface py-1.5 px-3 text-sm text-text placeholder-muted focus:border-accent focus:outline-none"
            />
            <button
              onClick={handleApplyLocal}
              disabled={!customLocalPath.trim() || isApplying}
              className="rounded-control bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              Use Local File
            </button>
          </div>
        )}

        {/* Error Notification */}
        {errorMsg && (
          <div className="bg-danger/10 border-b border-danger/20 px-6 py-2 text-xs text-danger flex items-center justify-between">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="hover:underline">
              Dismiss
            </button>
          </div>
        )}

        {/* Gallery Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted">
              <Loader2 className="h-8 w-8 animate-spin text-accent" />
              <p className="text-sm">Fetching artwork candidates...</p>
            </div>
          ) : candidates.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
              <p className="text-base font-medium text-text">No artwork found for this role</p>
              <p className="max-w-md text-xs text-muted">
                Make sure a SteamGridDB API key is configured in Settings, try searching with a
                different title, or upload a local image file.
              </p>
            </div>
          ) : (
            <div
              className={`grid gap-4 ${
                activeRole === 'cover'
                  ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'
                  : activeRole === 'hero'
                  ? 'grid-cols-1 md:grid-cols-2'
                  : activeRole === 'logo'
                  ? 'grid-cols-2 md:grid-cols-3'
                  : 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6'
              }`}
            >
              {candidates.map((cand) => {
                const isCurrent =
                  currentSelected &&
                  (currentSelected.provider_asset_id === cand.asset_id ||
                    currentSelected.source_url === cand.url);

                return (
                  <div
                    key={cand.asset_id}
                    className={`group relative flex flex-col overflow-hidden rounded-control border transition-all ${
                      isCurrent
                        ? 'border-accent ring-2 ring-accent/30 bg-accent/5'
                        : 'border-border bg-surface-2 hover:border-accent/50'
                    }`}
                  >
                    {/* Thumbnail Image */}
                    <div
                      className={`relative w-full overflow-hidden bg-bg/50 ${
                        activeRole === 'cover'
                          ? 'aspect-[2/3]'
                          : activeRole === 'hero'
                          ? 'aspect-[96/31]'
                          : activeRole === 'logo'
                          ? 'aspect-[16/9] p-4 flex items-center justify-center'
                          : 'aspect-square'
                      }`}
                    >
                      <img
                        src={cand.thumb_url || cand.url}
                        alt="Artwork option"
                        loading="lazy"
                        className={`h-full w-full ${
                          activeRole === 'logo' ? 'object-contain' : 'object-cover'
                        } transition-transform duration-200 group-hover:scale-105`}
                      />

                      {isCurrent && (
                        <div className="absolute top-2 right-2 rounded-full bg-accent p-1 text-white shadow-md">
                          <Check className="h-3.5 w-3.5" />
                        </div>
                      )}

                      <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
                        {cand.width && cand.height && (
                          <span className="rounded bg-black/80 px-1.5 py-0.5 text-xs font-mono text-white/90">
                            {cand.width}×{cand.height}
                          </span>
                        )}
                        <span className="rounded bg-black/75 px-1.5 py-0.5 text-xs text-white/80">
                          {cand.provider === 'steam_cdn' ? 'Steam' : `Score ${cand.score}`}
                        </span>
                      </div>
                    </div>

                    {/* Meta info & Apply button */}
                    <div className="flex items-center justify-between p-2.5 bg-surface-2">
                      <div className="truncate pr-2">
                        <p className="truncate text-xs font-medium text-text">
                          {cand.author_name || (cand.provider === 'steam_cdn' ? 'Steam CDN' : 'Community')}
                        </p>
                        <p className="text-xs text-muted uppercase">{cand.mime_type?.replace('image/', '') || 'IMAGE'}</p>
                      </div>

                      <button
                        onClick={() => handleApplyCandidate(cand)}
                        disabled={isApplying || Boolean(isCurrent)}
                        className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                          isCurrent
                            ? 'bg-accent/20 text-accent cursor-default'
                            : 'bg-accent text-white hover:bg-accent-hover shadow-xs'
                        }`}
                      >
                        {isCurrent ? 'Active' : 'Use'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-between border-t border-border px-6 py-3 text-xs text-muted">
          <span>Artwork sourced via SteamGridDB API v2 &amp; Steam Storefront CDN.</span>
          <button onClick={onClose} className="rounded-control bg-surface-2 px-4 py-1.5 font-medium text-text hover:bg-border transition-colors">
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
