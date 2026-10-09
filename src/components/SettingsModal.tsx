import React, { useState, useEffect } from 'react';
import {
  X,
  Sliders,
  Palette,
  FolderSearch,
  Layers,
  Cpu,
  Image as ImageIcon,
  Activity,
  Check,
  ShieldCheck,
  Flame,
  RefreshCw,
  AlertTriangle,
  Folder,
  Filter,
  CheckCircle2,
  PlusCircle,
} from 'lucide-react';
import {
  AppInfo,
  AppSettings,
  CardSize,
  SteamStatusResponse,
  SkippedSteamApp,
  ThemeMode,
  ViewMode,
} from '../types/api';
import { APP_CONFIG } from '../config/appConfig';
import { api } from '../services/api';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  appInfo: AppInfo | null;
  settings: AppSettings;
  onUpdateSetting: (key: string, value: string) => Promise<void>;
  onRefreshGames?: () => void;
}

type SettingsSection =
  | 'general'
  | 'appearance'
  | 'library'
  | 'integrations'
  | 'emulators'
  | 'metadata'
  | 'diagnostics';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  appInfo,
  settings,
  onUpdateSetting,
  onRefreshGames,
}) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>('appearance');

  // Steam integration state
  const [steamStatus, setSteamStatus] = useState<SteamStatusResponse | null>(null);
  const [loadingSteam, setLoadingSteam] = useState(false);
  const [rescanningSteam, setRescanningSteam] = useState(false);
  const [steamPathInput, setSteamPathInput] = useState('');
  const [steamMessage, setSteamMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [skippedApps, setSkippedApps] = useState<SkippedSteamApp[]>([]);

  const loadSteamStatus = async () => {
    try {
      setLoadingSteam(true);
      const res = await api.getSteamStatus();
      setSteamStatus(res);
      setSteamPathInput(res.steam_path || '');
    } catch (err: unknown) {
      console.warn('Failed to load Steam status:', err);
    } finally {
      setLoadingSteam(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeSection === 'integrations') {
      loadSteamStatus();
    }
  }, [isOpen, activeSection]);

  if (!isOpen) return null;

  const handleSaveSteamPath = async () => {
    try {
      await api.configureSteamPath(steamPathInput.trim() || undefined);
      setSteamMessage({ type: 'success', text: 'Steam path saved successfully.' });
      await loadSteamStatus();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setSteamMessage({ type: 'error', text: e.message || 'Failed to save Steam path' });
    }
  };

  const handleToggleLibrary = async (libraryPath: string, currentlyEnabled: boolean) => {
    try {
      await api.setSteamLibraryEnabled(libraryPath, !currentlyEnabled);
      await loadSteamStatus();
    } catch (err: unknown) {
      console.warn('Failed to toggle library:', err);
    }
  };

  const handleToggleRule = async (ruleId: string, currentlyEnabled: boolean) => {
    try {
      await api.updateSteamFilterRule(ruleId, !currentlyEnabled);
      await loadSteamStatus();
    } catch (err: unknown) {
      console.warn('Failed to toggle filter rule:', err);
    }
  };

  const handleIncludeSkippedApp = async (appId: number) => {
    try {
      await api.includeSkippedSteamApp(appId);
      setSteamMessage({
        type: 'success',
        text: `Included App ID ${appId}. Click 'Rescan Steam Library' to import it.`,
      });
      await loadSteamStatus();
    } catch (err: unknown) {
      console.warn('Failed to include app:', err);
    }
  };

  const handleRescanSteam = async () => {
    try {
      setRescanningSteam(true);
      setSteamMessage(null);
      const res = await api.rescanSteam();
      setSkippedApps(res.skipped_apps);
      setSteamMessage({
        type: 'success',
        text: `Scan complete: ${res.imported_games.length} game(s) imported, ${res.skipped_apps.length} tool(s) skipped.`,
      });
      await loadSteamStatus();
      onRefreshGames?.();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setSteamMessage({
        type: 'error',
        text: e.message || 'Failed to scan Steam libraries. Verify your Steam path.',
      });
    } finally {
      setRescanningSteam(false);
    }
  };

  const sections: { id: SettingsSection; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'general', label: 'General', icon: Sliders },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'library', label: 'Library & Scan', icon: FolderSearch },
    { id: 'integrations', label: 'Integrations', icon: Layers },
    { id: 'emulators', label: 'Emulators', icon: Cpu },
    { id: 'metadata', label: 'Metadata & Artwork', icon: ImageIcon },
    { id: 'diagnostics', label: 'Diagnostics', icon: Activity },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 select-none">
      <div className="w-full max-w-3xl h-[560px] bg-surface border border-border rounded-dialog shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="h-12 border-b border-border px-5 flex items-center justify-between bg-surface-2/40 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-text">Preferences</h3>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-control text-muted hover:text-text hover:bg-surface-2 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex flex-1 min-h-0">
          {/* Sidebar Tabs */}
          <div className="w-48 bg-surface border-r border-border p-2 space-y-1 flex-shrink-0">
            {sections.map((sec) => {
              const Icon = sec.icon;
              const isActive = activeSection === sec.id;
              return (
                <button
                  key={sec.id}
                  onClick={() => setActiveSection(sec.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-control text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-accent text-white shadow-sm'
                      : 'text-text hover:bg-surface-2 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{sec.label}</span>
                </button>
              );
            })}
          </div>

          {/* Section Detail Panes */}
          <div className="flex-1 p-6 overflow-y-auto space-y-6">
            {/* General Section */}
            {activeSection === 'general' && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-text">General Preferences</h4>
                  <p className="text-xs text-muted">Configure basic application behaviors and startup options.</p>
                </div>
                <div className="bg-surface-2/40 border border-border rounded-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium text-text">Close to Tray</div>
                      <div className="text-[11px] text-muted">Keep GameShelf running in system notification tray on close.</div>
                    </div>
                    <span className="text-[10px] bg-surface-2 px-2 py-0.5 rounded text-muted border border-border">
                      Not available yet
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Appearance Section */}
            {activeSection === 'appearance' && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-semibold text-text">Theme & Display</h4>
                  <p className="text-xs text-muted">Personalize the application look, feel, and card dimensions.</p>
                </div>

                <div className="space-y-4">
                  {/* Theme Selector */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-text">Color Theme</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['dark', 'light', 'system'] as ThemeMode[]).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => onUpdateSetting('theme', mode)}
                          className={`px-3 py-2 rounded-control border text-xs capitalize font-medium flex items-center justify-center gap-2 transition-colors ${
                            settings.theme === mode
                              ? 'border-accent bg-accent/10 text-white font-semibold'
                              : 'border-border bg-surface-2 text-muted hover:text-text'
                          }`}
                        >
                          {settings.theme === mode && <Check className="w-3.5 h-3.5 text-accent" />}
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Default View Mode */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-text">Default Library View</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['grid', 'list'] as ViewMode[]).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => onUpdateSetting('default_view_mode', mode)}
                          className={`px-3 py-2 rounded-control border text-xs capitalize font-medium flex items-center justify-center gap-2 transition-colors ${
                            settings.default_view_mode === mode
                              ? 'border-accent bg-accent/10 text-white font-semibold'
                              : 'border-border bg-surface-2 text-muted hover:text-text'
                          }`}
                        >
                          {settings.default_view_mode === mode && <Check className="w-3.5 h-3.5 text-accent" />}
                          {mode} View
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Card Size */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-text">Cover Grid Card Size</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['small', 'medium', 'large'] as CardSize[]).map((size) => (
                        <button
                          key={size}
                          onClick={() => onUpdateSetting('grid_card_size', size)}
                          className={`px-3 py-2 rounded-control border text-xs capitalize font-medium flex items-center justify-center gap-2 transition-colors ${
                            settings.grid_card_size === size
                              ? 'border-accent bg-accent/10 text-white font-semibold'
                              : 'border-border bg-surface-2 text-muted hover:text-text'
                          }`}
                        >
                          {settings.grid_card_size === size && <Check className="w-3.5 h-3.5 text-accent" />}
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Library & Scan Section */}
            {activeSection === 'library' && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-text">Library & Scan Folders</h4>
                  <p className="text-xs text-muted">Manage directory roots for automatic game discovery.</p>
                </div>
                <div className="bg-surface-2/40 border border-border rounded-card p-6 text-center space-y-2">
                  <FolderSearch className="w-8 h-8 text-muted mx-auto" />
                  <div className="text-xs font-medium text-text">Automated folder scanner arrives in Phase 4</div>
                  <p className="text-[11px] text-muted max-w-sm mx-auto">
                    Manual game additions via "+ Add Game" and Steam library import are fully functional now.
                  </p>
                </div>
              </div>
            )}

            {/* Integrations Section */}
            {activeSection === 'integrations' && (
              <div className="space-y-5">
                <div>
                  <h4 className="text-sm font-semibold text-text">Platform Integrations</h4>
                  <p className="text-xs text-muted">Discover local Steam installations and manage library folder imports.</p>
                </div>

                {steamMessage && (
                  <div
                    className={`p-3 rounded-control text-xs flex items-center gap-2 ${
                      steamMessage.type === 'success'
                        ? 'bg-success/10 text-success border border-success/30'
                        : 'bg-danger/10 text-danger border border-danger/30'
                    }`}
                  >
                    {steamMessage.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    )}
                    <span>{steamMessage.text}</span>
                  </div>
                )}

                {/* Steam Integration Box */}
                <div className="bg-surface-2/40 border border-border rounded-card p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Flame className="w-5 h-5 text-accent" />
                      <div>
                        <div className="text-xs font-bold text-text">Steam (Installed Games)</div>
                        <div className="text-[11px] text-muted">
                          Local VDF manifest discovery without web accounts or API keys
                        </div>
                      </div>
                    </div>
                    {/* Status Badge */}
                    <div>
                      {loadingSteam ? (
                        <span className="text-[10px] bg-surface-2 text-muted px-2 py-0.5 rounded border border-border">
                          Checking...
                        </span>
                      ) : steamStatus?.is_installed ? (
                        <span className="text-[10px] bg-success/20 text-success px-2 py-0.5 rounded border border-success/30 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Supported
                        </span>
                      ) : (
                        <span className="text-[10px] bg-warning/20 text-warning px-2 py-0.5 rounded border border-warning/30 font-semibold flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Needs Configuration
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Steam Path Configuration */}
                  <div className="space-y-1.5 pt-1">
                    <label className="text-[11px] font-medium text-muted">Steam Installation Directory</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={steamPathInput}
                        onChange={(e) => setSteamPathInput(e.target.value)}
                        placeholder="C:\Program Files (x86)\Steam"
                        className="flex-1 bg-surface border border-border rounded-control px-3 py-1.5 text-xs text-text placeholder-muted focus:outline-none focus:border-accent"
                      />
                      <button
                        onClick={handleSaveSteamPath}
                        className="px-3 py-1.5 bg-surface-2 hover:bg-surface-2/80 border border-border text-xs font-medium text-text rounded-control transition-colors"
                      >
                        Save Path
                      </button>
                    </div>
                    <p className="text-[10px] text-muted">
                      Auto-detected from Windows Registry (HKCU/HKLM) or standard directories.
                    </p>
                  </div>

                  {/* Detected Libraries */}
                  {steamStatus && steamStatus.libraries.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <div className="text-xs font-semibold text-text flex items-center justify-between">
                        <span>Steam Library Folders ({steamStatus.libraries.length})</span>
                        <span className="text-[10px] text-muted">Enable / disable per library</span>
                      </div>
                      <div className="space-y-1.5">
                        {steamStatus.libraries.map((lib) => (
                          <div
                            key={lib.normalized_path}
                            className={`p-2.5 rounded-control border text-xs flex items-center justify-between ${
                              lib.is_accessible
                                ? 'bg-surface border-border text-text'
                                : 'bg-surface/50 border-danger/40 text-muted'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Folder className="w-4 h-4 text-muted flex-shrink-0" />
                              <div className="truncate">
                                <div className="font-mono text-[11px] text-text truncate">{lib.path}</div>
                                <div className="text-[10px] text-muted flex items-center gap-2">
                                  <span>{lib.label || 'Steam Library'}</span>
                                  {lib.is_accessible ? (
                                    <span className="text-success">• Accessible</span>
                                  ) : (
                                    <span className="text-danger">• Disconnected / Missing</span>
                                  )}
                                  {lib.game_count > 0 && <span>• {lib.game_count} games detected</span>}
                                </div>
                              </div>
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer flex-shrink-0 ml-3">
                              <input
                                type="checkbox"
                                checked={lib.is_enabled}
                                onChange={() => handleToggleLibrary(lib.path, lib.is_enabled)}
                                className="w-3.5 h-3.5 rounded text-accent focus:ring-accent accent-accent"
                              />
                              <span className="text-[11px] text-muted">
                                {lib.is_enabled ? 'Enabled' : 'Disabled'}
                              </span>
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Non-Game Filter Rules */}
                  {steamStatus && steamStatus.filter_config.rules.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <div className="text-xs font-semibold text-text flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <Filter className="w-3.5 h-3.5 text-muted" />
                          Non-Game Filtering Rules
                        </span>
                        <span className="text-[10px] text-muted">Skip redistributables, runtimes & SDKs</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {steamStatus.filter_config.rules.map((rule) => (
                          <div
                            key={rule.id}
                            className="p-2 bg-surface border border-border rounded-control text-xs flex items-start gap-2"
                          >
                            <input
                              type="checkbox"
                              checked={rule.enabled}
                              onChange={() => handleToggleRule(rule.id, rule.enabled)}
                              className="w-3.5 h-3.5 rounded mt-0.5 text-accent focus:ring-accent accent-accent flex-shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="text-[11px] font-medium text-text">{rule.name}</div>
                              <div className="text-[9px] text-muted line-clamp-1">{rule.description}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Warnings List */}
                  {steamStatus && steamStatus.warnings.length > 0 && (
                    <div className="p-2.5 bg-warning/10 border border-warning/30 rounded-control space-y-1">
                      <div className="text-[11px] font-semibold text-warning flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Scan Warnings
                      </div>
                      {steamStatus.warnings.map((w, idx) => (
                        <div key={idx} className="text-[10px] text-muted">
                          • {w}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Skipped Items from Last Scan */}
                  {skippedApps.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="text-xs font-semibold text-text">
                        Filtered Non-Game Items ({skippedApps.length})
                      </div>
                      <div className="max-h-28 overflow-y-auto space-y-1 border border-border rounded-control p-1.5 bg-surface">
                        {skippedApps.map((skipped) => (
                          <div
                            key={skipped.app_id}
                            className="p-1.5 bg-surface-2/40 rounded text-[11px] flex items-center justify-between"
                          >
                            <div className="truncate pr-2">
                              <span className="font-medium text-text">{skipped.name}</span>
                              <span className="text-[10px] text-muted ml-1.5">({skipped.reason})</span>
                            </div>
                            <button
                              onClick={() => handleIncludeSkippedApp(skipped.app_id)}
                              className="text-[10px] bg-accent/20 hover:bg-accent/40 text-accent px-2 py-0.5 rounded border border-accent/30 flex items-center gap-1 flex-shrink-0"
                            >
                              <PlusCircle className="w-3 h-3" />
                              Include
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions & Last Scanned */}
                  <div className="pt-2 border-t border-border flex items-center justify-between">
                    <div className="text-[11px] text-muted">
                      {steamStatus?.last_scanned_at ? (
                        <span>Last scanned: {new Date(steamStatus.last_scanned_at).toLocaleString()}</span>
                      ) : (
                        <span>Not scanned yet</span>
                      )}
                    </div>
                    <button
                      onClick={handleRescanSteam}
                      disabled={rescanningSteam || !steamStatus?.is_installed}
                      className="px-3.5 py-1.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-control text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${rescanningSteam ? 'animate-spin' : ''}`} />
                      {rescanningSteam ? 'Scanning Libraries...' : 'Rescan Steam Library'}
                    </button>
                  </div>
                </div>

                {/* Other Stores */}
                <div className="space-y-2 pt-2">
                  <div className="text-xs font-semibold text-muted">Other Store Adapters (Out of Scope for v1)</div>
                  {['Epic Games Store', 'GOG Galaxy', 'Ubisoft Connect', 'EA App'].map((store) => (
                    <div
                      key={store}
                      className="bg-surface-2/20 border border-border/60 rounded-card p-2.5 flex items-center justify-between opacity-50 cursor-not-allowed"
                    >
                      <div className="text-xs text-muted">{store}</div>
                      <span className="text-[10px] bg-surface px-2 py-0.5 rounded border border-border text-muted">
                        Not available yet
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Emulators Section */}
            {activeSection === 'emulators' && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-text">Emulator Profiles</h4>
                  <p className="text-xs text-muted">Configure standalone emulators, argument templates, and ROM folders.</p>
                </div>
                <div className="bg-surface-2/40 border border-border rounded-card p-6 text-center space-y-2">
                  <Cpu className="w-8 h-8 text-muted mx-auto" />
                  <div className="text-xs font-medium text-text">Emulator manager arrives in Phase 5</div>
                  <p className="text-[11px] text-muted max-w-sm mx-auto">
                    Supported emulators (RetroArch, RPCS3, Dolphin, DuckStation, PCSX2) with parameterized CLI placeholders.
                  </p>
                </div>
              </div>
            )}

            {/* Metadata & Artwork Section */}
            {activeSection === 'metadata' && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-text">Metadata & Artwork Providers</h4>
                  <p className="text-xs text-muted">Download covers, banners, logos, and icons for your games.</p>
                </div>
                <div className="bg-surface-2/40 border border-border rounded-card p-6 text-center space-y-2">
                  <ImageIcon className="w-8 h-8 text-muted mx-auto" />
                  <div className="text-xs font-medium text-text">SteamGridDB integration arrives in Phase 4</div>
                  <p className="text-[11px] text-muted max-w-sm mx-auto">
                    User-supplied API keys will be stored securely in Windows Credential Manager via keyring.
                  </p>
                </div>
              </div>
            )}

            {/* Diagnostics Section */}
            {activeSection === 'diagnostics' && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-text">Diagnostics & Local Storage</h4>
                  <p className="text-xs text-muted">Backend paths, database versions, and system information.</p>
                </div>

                <div className="bg-surface-2/40 border border-border rounded-card divide-y divide-border text-xs">
                  <div className="p-3 flex items-center justify-between">
                    <span className="text-muted">Host Environment</span>
                    <span className="font-mono text-text">{appInfo?.os || 'Windows (Host)'}</span>
                  </div>
                  <div className="p-3 flex items-center justify-between">
                    <span className="text-muted">Application Bundle ID</span>
                    <span className="font-mono text-text">{appInfo?.bundle_id || APP_CONFIG.bundleIdentifier}</span>
                  </div>
                  <div className="p-3 flex items-center justify-between">
                    <span className="text-muted">Database Schema Version</span>
                    <span className="font-mono text-text">v{appInfo?.db_version ?? 2} (SQLite rusqlite)</span>
                  </div>
                  <div className="p-3 flex flex-col gap-1">
                    <span className="text-muted">App Data Directory</span>
                    <span className="font-mono text-[11px] text-text break-all">
                      {appInfo?.data_dir || 'AppData/Local/com.gameshelf.app'}
                    </span>
                  </div>
                  <div className="p-3 flex flex-col gap-1">
                    <span className="text-muted">Rotating Log Directory</span>
                    <span className="font-mono text-[11px] text-text break-all">
                      {appInfo?.log_dir || 'AppData/Local/com.gameshelf.app/logs'}
                    </span>
                  </div>
                </div>

                {/* Privacy Notice */}
                <div className="bg-surface-2/20 border border-border rounded-card p-3.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-text">
                    <ShieldCheck className="w-4 h-4 text-success" />
                    <span>Privacy Notice</span>
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed">
                    GameShelf is 100% local-first. No telemetry, session logging, or personal data is collected or transmitted.
                    All library information, paths, and settings reside strictly on this computer.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
