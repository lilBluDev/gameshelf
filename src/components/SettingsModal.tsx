import React, { useState } from 'react';
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
} from 'lucide-react';
import { AppInfo, AppSettings, CardSize, ThemeMode, ViewMode } from '../types/api';
import { APP_CONFIG } from '../config/appConfig';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  appInfo: AppInfo | null;
  settings: AppSettings;
  onUpdateSetting: (key: string, value: string) => Promise<void>;
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
}) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>('appearance');

  if (!isOpen) return null;

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
      <div className="w-full max-w-3xl h-[520px] bg-surface border border-border rounded-dialog shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="h-12 border-b border-border px-5 flex items-center justify-between bg-surface-2/40 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-text">Preferences</h3>
            <span className="text-[10px] text-muted font-mono px-1.5 py-0.5 rounded bg-surface border border-border">
              {APP_CONFIG.name}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-control text-muted hover:text-text hover:bg-surface-2 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Split */}
        <div className="flex flex-1 min-h-0">
          {/* Navigation Sidebar */}
          <aside className="w-48 bg-surface-2/30 border-r border-border p-2 space-y-1 overflow-y-auto">
            {sections.map((sec) => {
              const Icon = sec.icon;
              const isActive = activeSection === sec.id;
              return (
                <button
                  key={sec.id}
                  onClick={() => setActiveSection(sec.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-control text-xs font-medium transition-colors text-left ${
                    isActive
                      ? 'bg-accent text-white shadow-sm'
                      : 'text-muted hover:text-text hover:bg-surface-2/60'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{sec.label}</span>
                </button>
              );
            })}
          </aside>

          {/* Section Content */}
          <main className="flex-1 p-6 overflow-y-auto space-y-6">
            {/* General Section */}
            {activeSection === 'general' && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-text">General Settings</h4>
                  <p className="text-xs text-muted">Core launcher behavior and application information.</p>
                </div>

                <div className="bg-surface-2/50 border border-border rounded-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium text-text">Application Name</div>
                      <div className="text-[11px] text-muted">{APP_CONFIG.name}</div>
                    </div>
                    <span className="text-xs font-mono text-muted">{APP_CONFIG.bundleIdentifier}</span>
                  </div>

                  <div className="h-px bg-border" />

                  <div className="flex items-center justify-between opacity-50 cursor-not-allowed">
                    <div>
                      <div className="text-xs font-medium text-text">Minimize to System Tray</div>
                      <div className="text-[11px] text-muted">Keep GameShelf running in tray on close</div>
                    </div>
                    <span className="text-[10px] bg-surface px-2 py-0.5 rounded border border-border text-muted">
                      Not available yet
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Appearance Section */}
            {activeSection === 'appearance' && (
              <div className="space-y-5">
                <div>
                  <h4 className="text-sm font-semibold text-text">Appearance & Theme</h4>
                  <p className="text-xs text-muted">Customize the visual theme, layout density, and view modes.</p>
                </div>

                {/* Theme Selector */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-text">Theme Mode</label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['dark', 'light', 'system'] as ThemeMode[]).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => onUpdateSetting('theme', mode)}
                        className={`flex items-center justify-between p-3 rounded-card border text-xs font-medium capitalize transition-all ${
                          settings.theme === mode
                            ? 'bg-surface-2 border-accent text-accent ring-1 ring-accent'
                            : 'bg-surface-2/40 border-border text-muted hover:text-text hover:border-muted/50'
                        }`}
                      >
                        <span>{mode}</span>
                        {settings.theme === mode && <Check className="w-3.5 h-3.5" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Default View Mode */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-text">Default Library View</label>
                  <div className="grid grid-cols-2 gap-3">
                    {(['grid', 'list'] as ViewMode[]).map((vm) => (
                      <button
                        key={vm}
                        onClick={() => onUpdateSetting('default_view_mode', vm)}
                        className={`flex items-center justify-between p-3 rounded-card border text-xs font-medium capitalize transition-all ${
                          settings.default_view_mode === vm
                            ? 'bg-surface-2 border-accent text-accent ring-1 ring-accent'
                            : 'bg-surface-2/40 border-border text-muted hover:text-text hover:border-muted/50'
                        }`}
                      >
                        <span>{vm === 'grid' ? 'Cover Grid (2:3)' : 'Detailed List'}</span>
                        {settings.default_view_mode === vm && <Check className="w-3.5 h-3.5" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Card Size */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-text">Grid Card Size</label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['small', 'medium', 'large'] as CardSize[]).map((sz) => (
                      <button
                        key={sz}
                        onClick={() => onUpdateSetting('grid_card_size', sz)}
                        className={`flex items-center justify-between p-3 rounded-card border text-xs font-medium capitalize transition-all ${
                          settings.grid_card_size === sz
                            ? 'bg-surface-2 border-accent text-accent ring-1 ring-accent'
                            : 'bg-surface-2/40 border-border text-muted hover:text-text hover:border-muted/50'
                        }`}
                      >
                        <span>{sz}</span>
                        {settings.grid_card_size === sz && <Check className="w-3.5 h-3.5" />}
                      </button>
                    ))}
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
                  <div className="text-xs font-medium text-text">Scan directories configuration arrives in Phase 2</div>
                  <p className="text-[11px] text-muted max-w-sm mx-auto">
                    Phase 2 will introduce recursive directory scanning, executable heuristic matching, and custom scan rules.
                  </p>
                </div>
              </div>
            )}

            {/* Integrations Section */}
            {activeSection === 'integrations' && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-text">Platform Integrations</h4>
                  <p className="text-xs text-muted">Connect local game launcher manifests and directories.</p>
                </div>

                <div className="space-y-2">
                  {/* Steam */}
                  <div className="bg-surface-2/50 border border-border rounded-card p-3 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium text-text">Steam (Installed Games)</div>
                      <div className="text-[11px] text-muted">Local VDF manifest detection without Web API key</div>
                    </div>
                    <span className="text-[10px] bg-accent/20 text-accent px-2 py-0.5 rounded border border-accent/30 font-medium">
                      Phase 2
                    </span>
                  </div>

                  {/* Epic / GOG / others disabled */}
                  {['Epic Games Store', 'GOG Galaxy', 'Ubisoft Connect', 'EA App'].map((store) => (
                    <div
                      key={store}
                      className="bg-surface-2/20 border border-border/60 rounded-card p-3 flex items-center justify-between opacity-50 cursor-not-allowed"
                    >
                      <div>
                        <div className="text-xs font-medium text-muted">{store}</div>
                        <div className="text-[11px] text-muted">Store library adapter</div>
                      </div>
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
                  <div className="text-xs font-medium text-text">SteamGridDB integration arrives in Phase 3</div>
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

                <div className="bg-surface-2/50 border border-border rounded-card p-3 space-y-2.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-muted text-[11px]">Host Environment</span>
                    <span className="text-text font-mono text-[11px]">{appInfo?.os || 'Windows 11'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted text-[11px]">Database Schema Version</span>
                    <span className="text-text font-mono text-[11px]">v{appInfo?.db_version || 1}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted text-[11px]">App Data Path</span>
                    <span className="text-text font-mono text-[10px] truncate max-w-[240px]" title={appInfo?.data_dir}>
                      {appInfo?.data_dir || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted text-[11px]">Log Directory</span>
                    <span className="text-text font-mono text-[10px] truncate max-w-[240px]" title={appInfo?.log_dir}>
                      {appInfo?.log_dir || '—'}
                    </span>
                  </div>
                </div>

                {/* Privacy Guarantee Statement */}
                <div className="bg-surface-2/30 border border-border rounded-card p-3 flex items-start gap-2.5">
                  <ShieldCheck className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                  <div className="text-[11px] text-muted leading-relaxed">
                    <strong className="text-text block mb-0.5">Privacy Notice</strong>
                    GameShelf is 100% local-first. We collect no telemetry, track no sessions, and store all metadata in your local SQLite database.
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};
