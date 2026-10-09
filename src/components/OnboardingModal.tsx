import React, { useState, useEffect } from 'react';
import {
  Gamepad2,
  CheckCircle2,
  ChevronRight,
  FolderSearch,
  Disc,
  Sparkles,
  Key,
  Layers,
  ArrowRight,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../services/api';
import { SteamStatusResponse } from '../types/api';
import { setSteamGridDbApiKey, testSteamGridDbConnection } from '../services/artwork';

interface OnboardingModalProps {
  isOpen: boolean;
  onComplete: () => void;
  onOpenScanFolder?: () => void;
  onOpenScanRoms?: (profileId?: string) => void;
  onRefreshGames?: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onComplete,
  onOpenScanFolder,
  onOpenScanRoms,
  onRefreshGames,
}) => {
  const [step, setStep] = useState<number>(1);
  const [steamStatus, setSteamStatus] = useState<SteamStatusResponse | null>(null);
  const [loadingSteam, setLoadingSteam] = useState(true);
  const [importingSteam, setImportingSteam] = useState(false);
  const [steamImportedCount, setSteamImportedCount] = useState<number | null>(null);

  const [sgdbKey, setSgdbKey] = useState('');
  const [testingKey, setTestingKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');

  useEffect(() => {
    if (!isOpen) return;
    const checkSteam = async () => {
      try {
        setLoadingSteam(true);
        const status = await api.getSteamStatus();
        setSteamStatus(status);
      } catch (e) {
        console.warn('Onboarding Steam check failed:', e);
      } finally {
        setLoadingSteam(false);
      }
    };
    checkSteam();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFinish = async () => {
    try {
      await api.setSetting('onboarding_completed', 'true');
    } catch (e) {
      console.warn('Failed to mark onboarding completed:', e);
    }
    onComplete();
  };

  const handleImportSteam = async () => {
    try {
      setImportingSteam(true);
      const res = await api.rescanSteam();
      setSteamImportedCount(res.imported_games.length);
      onRefreshGames?.();
    } catch (e) {
      console.warn('Failed to import steam in onboarding:', e);
    } finally {
      setImportingSteam(false);
    }
  };

  const handleTestAndSaveKey = async () => {
    if (!sgdbKey.trim()) return;
    try {
      setTestingKey(true);
      const ok = await testSteamGridDbConnection(sgdbKey.trim());
      if (ok) {
        await setSteamGridDbApiKey(sgdbKey.trim());
        setKeyStatus('valid');
      } else {
        setKeyStatus('invalid');
      }
    } catch {
      setKeyStatus('invalid');
    } finally {
      setTestingKey(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 select-none">
      <div className="w-full max-w-xl bg-surface border border-border rounded-dialog shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header with step indicators */}
        <div className="h-14 border-b border-border px-6 flex items-center justify-between bg-surface-2/40 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-accent/20 border border-accent/40 flex items-center justify-center text-accent">
              <Gamepad2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text">Welcome to GameShelf</h2>
              <p className="text-[11px] text-muted">First-time library setup (Step {step} of 4)</p>
            </div>
          </div>
          <button
            onClick={handleFinish}
            title="Skip setup and go to library"
            aria-label="Skip setup"
            className="text-xs text-muted hover:text-text px-2 py-1 rounded-control hover:bg-surface-2 transition-colors"
          >
            Skip Setup
          </button>
        </div>

        {/* Step Progress Bar */}
        <div className="h-1 bg-surface-2 flex">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`flex-1 transition-all duration-300 ${
                s <= step ? 'bg-accent' : 'bg-transparent'
              }`}
            />
          ))}
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 flex-1 min-h-[340px] flex flex-col justify-between">
          {/* STEP 1: Welcome & Steam */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-text flex items-center gap-2">
                  <span>Steam Library Detection</span>
                </h3>
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  GameShelf automatically finds and launches your installed Steam games without needing your login or API keys.
                </p>
              </div>

              <div className="bg-surface-2/50 border border-border rounded-card p-4 space-y-3">
                {loadingSteam ? (
                  <div className="flex items-center gap-2 text-xs text-muted py-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-accent" />
                    <span>Detecting Steam installation...</span>
                  </div>
                ) : steamStatus?.is_installed ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-success font-medium">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Steam Detected ({steamStatus.libraries.length} library folder(s))</span>
                    </div>
                    <div className="text-[11px] text-muted font-mono break-all bg-surface/50 p-2 rounded border border-border/50">
                      {steamStatus.steam_path}
                    </div>

                    {steamImportedCount !== null ? (
                      <div className="text-xs text-success font-medium pt-1">
                        ✓ Successfully imported {steamImportedCount} games into your library!
                      </div>
                    ) : (
                      <button
                        onClick={handleImportSteam}
                        disabled={importingSteam}
                        className="mt-2 w-full py-2 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-control flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-sm"
                      >
                        {importingSteam ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Scanning Steam Games...</span>
                          </>
                        ) : (
                          <>
                            <Layers className="w-3.5 h-3.5" />
                            <span>Import Steam Games Now</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-muted space-y-1">
                    <div className="text-text font-medium">Steam was not automatically found.</div>
                    <div className="text-[11px]">
                      No problem! You can link your Steam folder or add standalone games anytime in Settings.
                    </div>
                  </div>
                )}
              </div>

              <div className="text-[11px] text-muted flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-accent" />
                <span>Local-first: GameShelf reads local app manifests only. No login required.</span>
              </div>
            </div>
          )}

          {/* STEP 2: Standalone & ROMs */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-text">Standalone PC Games & ROMs</h3>
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  Have games from DRM-free stores, itch.io, or retro emulators? GameShelf organizes them in one clean library.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-surface-2/40 border border-border rounded-card p-4 space-y-2 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-text font-medium text-xs">
                      <FolderSearch className="w-4 h-4 text-accent" />
                      <span>PC Game Folders</span>
                    </div>
                    <p className="text-[11px] text-muted mt-1">
                      Scan folders for .exe and .lnk shortcuts with smart filtering.
                    </p>
                  </div>
                  {onOpenScanFolder && (
                    <button
                      onClick={() => {
                        handleFinish();
                        onOpenScanFolder();
                      }}
                      className="w-full py-1.5 bg-surface border border-border hover:bg-surface-2 text-text text-xs font-medium rounded-control transition-colors"
                    >
                      Scan Folder
                    </button>
                  )}
                </div>

                <div className="bg-surface-2/40 border border-border rounded-card p-4 space-y-2 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-text font-medium text-xs">
                      <Disc className="w-4 h-4 text-accent" />
                      <span>Emulators & ROMs</span>
                    </div>
                    <p className="text-[11px] text-muted mt-1">
                      Configure emulator profiles (RetroArch, RPCS3, Dolphin, etc.) and ROM paths.
                    </p>
                  </div>
                  {onOpenScanRoms && (
                    <button
                      onClick={() => {
                        handleFinish();
                        onOpenScanRoms();
                      }}
                      className="w-full py-1.5 bg-surface border border-border hover:bg-surface-2 text-text text-xs font-medium rounded-control transition-colors"
                    >
                      Setup ROMs
                    </button>
                  )}
                </div>
              </div>

              <div className="text-[11px] text-muted">
                You can scan and import directories at any time using the TopBar controls or Settings.
              </div>
            </div>
          )}

          {/* STEP 3: SteamGridDB Artwork */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-text flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-accent" />
                  <span>Artwork & Covers (Optional)</span>
                </h3>
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  Provide a SteamGridDB API key to unlock community artwork, vertical covers, hero banners, and transparent logos.
                </p>
              </div>

              <div className="bg-surface-2/40 border border-border rounded-card p-4 space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-accent" />
                    <span>SteamGridDB API Key</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      value={sgdbKey}
                      onChange={(e) => {
                        setSgdbKey(e.target.value);
                        setKeyStatus('idle');
                      }}
                      placeholder="Paste your API key here..."
                      className="flex-1 bg-surface border border-border rounded-control px-3 py-1.5 text-xs text-text placeholder-muted focus:outline-none focus:border-accent"
                    />
                    <button
                      onClick={handleTestAndSaveKey}
                      disabled={testingKey || !sgdbKey.trim()}
                      className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-medium rounded-control disabled:opacity-50 transition-colors flex items-center gap-1.5"
                    >
                      {testingKey && <RefreshCw className="w-3 h-3 animate-spin" />}
                      <span>Save Key</span>
                    </button>
                  </div>

                  {keyStatus === 'valid' && (
                    <div className="text-xs text-success flex items-center gap-1.5 pt-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>API key verified and securely stored in Windows Credential Manager!</span>
                    </div>
                  )}

                  {keyStatus === 'invalid' && (
                    <div className="text-xs text-danger pt-1">
                      Could not authenticate with SteamGridDB. Please check your key.
                    </div>
                  )}
                </div>

                <div className="text-[11px] text-muted space-y-1 pt-1 border-t border-border/50">
                  <div>
                    Need a free key? Get one at{' '}
                    <span className="text-accent font-mono">steamgriddb.com/profile/preferences/api</span>
                  </div>
                  <div>
                    If you skip this, official Steam games will still fetch covers automatically, and standalone games will have clean deterministic color placeholders.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Ready */}
          {step === 4 && (
            <div className="space-y-4 text-center py-4">
              <div className="w-12 h-12 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center mx-auto text-accent mb-2">
                <CheckCircle2 className="w-6 h-6 text-accent" />
              </div>

              <div>
                <h3 className="text-lg font-bold text-text">You're All Set!</h3>
                <p className="text-xs text-muted max-w-sm mx-auto mt-1 leading-relaxed">
                  GameShelf is ready to launch. You can configure more folders, manage emulators, and customize themes at any time in Preferences.
                </p>
              </div>

              <div className="bg-surface-2/40 border border-border rounded-card p-4 max-w-sm mx-auto text-left text-xs space-y-2">
                <div className="flex items-center justify-between text-muted">
                  <span>Steam Integration</span>
                  <span className="text-text font-medium">{steamStatus?.is_installed ? 'Active' : 'Manual'}</span>
                </div>
                <div className="flex items-center justify-between text-muted">
                  <span>Artwork Service</span>
                  <span className="text-text font-medium">
                    {keyStatus === 'valid' ? 'SteamGridDB Active' : 'Steam CDN & Fallbacks'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-muted">
                  <span>Data & Privacy</span>
                  <span className="text-success font-medium">100% Local-First</span>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Footer */}
          <div className="flex items-center justify-between pt-4 border-t border-border mt-auto">
            {step > 1 ? (
              <button
                onClick={() => setStep(step - 1)}
                className="px-4 py-1.5 rounded-control border border-border text-xs text-muted hover:text-text hover:bg-surface-2 transition-colors"
              >
                Back
              </button>
            ) : (
              <div />
            )}

            {step < 4 ? (
              <button
                onClick={() => setStep(step + 1)}
                className="px-5 py-1.5 rounded-control bg-accent hover:bg-accent-hover text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <span>Continue</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={handleFinish}
                className="px-6 py-2 rounded-control bg-accent hover:bg-accent-hover text-white text-xs font-bold flex items-center gap-2 transition-colors shadow-lg"
              >
                <span>Enter GameShelf Library</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
