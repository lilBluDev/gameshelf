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
  AlertCircle,
  Folder,
  Filter,
  CheckCircle2,
  PlusCircle,
  Trash2,
  FolderPlus,
  Play,
  Edit2,
  ExternalLink,
  Disc,
  RotateCw,
  Key,
  Eye,
  EyeOff,
  HardDrive,
  Copy,
  FolderOpen,
  FileText,
  Loader2,
} from 'lucide-react';
import {
  AppInfo,
  AppSettings,
  CardSize,
  ScanSource,
  SteamStatusResponse,
  SkippedSteamApp,
  ThemeMode,
  ViewMode,
  LaunchResult,
} from '../types/api';
import { EmulatorProfile, WorkingDirRule } from '../types/models';
import { CacheStats } from '../types/artwork';
import { APP_CONFIG } from '../config/appConfig';
import { api } from '../services/api';
import { scannerService } from '../services/scanner';
import { emulatorService } from '../services/emulators';
import {
  clearArtworkCache,
  getCacheStats,
  getSteamGridDbStatus,
  removeSteamGridDbApiKey,
  setSteamGridDbApiKey,
  testSteamGridDbConnection,
} from '../services/artwork';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  appInfo: AppInfo | null;
  settings: AppSettings;
  onUpdateSetting: (key: string, value: string) => Promise<void>;
  onRefreshGames?: () => void;
  onOpenScanFolder?: (path?: string) => void;
  onOpenScanRoms?: (profileId?: string) => void;
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
  onOpenScanFolder,
  onOpenScanRoms,
}) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>('appearance');

  // Steam integration state
  const [steamStatus, setSteamStatus] = useState<SteamStatusResponse | null>(null);
  const [loadingSteam, setLoadingSteam] = useState(false);
  const [rescanningSteam, setRescanningSteam] = useState(false);
  const [steamPathInput, setSteamPathInput] = useState('');
  const [steamMessage, setSteamMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [skippedApps, setSkippedApps] = useState<SkippedSteamApp[]>([]);

  // SteamGridDB & Artwork state (Phase 6)
  const [sgdbConfigured, setSgdbConfigured] = useState(false);
  const [sgdbKeyInput, setSgdbKeyInput] = useState('');
  const [showSgdbKey, setShowSgdbKey] = useState(false);
  const [isTestingSgdb, setIsTestingSgdb] = useState(false);
  const [sgdbMessage, setSgdbMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [isConfirmingClearPlaytime, setIsConfirmingClearPlaytime] = useState(false);
  const [isClearingPlaytime, setIsClearingPlaytime] = useState(false);
  const [playtimeMessage, setPlaytimeMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleClearAllPlaytime = async () => {
    setIsClearingPlaytime(true);
    try {
      await api.clearAllPlaytime();
      setPlaytimeMessage({ type: 'success', text: 'All recorded playtime and session history cleared.' });
      setIsConfirmingClearPlaytime(false);
      onRefreshGames?.();
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e);
      setPlaytimeMessage({ type: 'error', text: msg || 'Failed to clear playtime data.' });
    } finally {
      setIsClearingPlaytime(false);
    }
  };

  const loadMetadataSettings = async () => {
    try {
      const configured = await getSteamGridDbStatus();
      setSgdbConfigured(configured);
      const stats = await getCacheStats();
      setCacheStats(stats);
    } catch (e) {
      console.warn('Failed to load metadata settings:', e);
    }
  };

  const handleSaveSgdbKey = async () => {
    if (!sgdbKeyInput.trim()) return;
    try {
      await setSteamGridDbApiKey(sgdbKeyInput.trim());
      setSgdbConfigured(true);
      setSgdbKeyInput('');
      setSgdbMessage({ type: 'success', text: 'SteamGridDB API key saved securely in Windows Credential Manager.' });
      await loadMetadataSettings();
    } catch (e: any) {
      setSgdbMessage({ type: 'error', text: e?.message || 'Failed to save API key.' });
    }
  };

  const handleRemoveSgdbKey = async () => {
    try {
      await removeSteamGridDbApiKey();
      setSgdbConfigured(false);
      setSgdbKeyInput('');
      setSgdbMessage({ type: 'success', text: 'SteamGridDB API key removed from Windows Credential Manager.' });
      await loadMetadataSettings();
    } catch (e: any) {
      setSgdbMessage({ type: 'error', text: e?.message || 'Failed to remove API key.' });
    }
  };

  const handleTestSgdb = async () => {
    setIsTestingSgdb(true);
    setSgdbMessage(null);
    try {
      const ok = await testSteamGridDbConnection(sgdbKeyInput.trim() || undefined);
      if (ok) {
        setSgdbMessage({ type: 'success', text: 'Connection successful! SteamGridDB API key is verified.' });
      } else {
        setSgdbMessage({ type: 'error', text: 'Connection failed. Please check the API key.' });
      }
    } catch (e: any) {
      setSgdbMessage({ type: 'error', text: e?.message || 'Connection test failed.' });
    } finally {
      setIsTestingSgdb(false);
    }
  };

  const handleClearCache = async () => {
    setIsClearingCache(true);
    try {
      const count = await clearArtworkCache();
      const updatedStats = await getCacheStats();
      setCacheStats(updatedStats);
      setSgdbMessage({ type: 'success', text: `Artwork cache cleared: ${count} cached file(s) removed.` });
    } catch (e: any) {
      setSgdbMessage({ type: 'error', text: e?.message || 'Failed to clear artwork cache.' });
    } finally {
      setIsClearingCache(false);
    }
  };

  // Diagnostics actions state (Phase 7)
  const [copyingDiag, setCopyingDiag] = useState(false);
  const [diagCopied, setDiagCopied] = useState(false);
  const [openingLogs, setOpeningLogs] = useState(false);
  const [diagSummaryText, setDiagSummaryText] = useState<string | null>(null);

  const handleCopyDiagnostics = async () => {
    setCopyingDiag(true);
    try {
      const summary = await api.getDiagnosticSummary();
      setDiagSummaryText(summary);
      await navigator.clipboard.writeText(summary);
      setDiagCopied(true);
      setTimeout(() => setDiagCopied(false), 3000);
    } catch (e) {
      console.warn('Failed to copy diagnostics:', e);
    } finally {
      setCopyingDiag(false);
    }
  };

  const handleOpenLogs = async () => {
    setOpeningLogs(true);
    try {
      await api.openLogs();
    } catch (e) {
      console.warn('Failed to open logs:', e);
    } finally {
      setOpeningLogs(false);
    }
  };

  // Managed folder scan sources state (Phase 4)
  const [scanSources, setScanSources] = useState<ScanSource[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [rescanningSourceId, setRescanningSourceId] = useState<string | null>(null);
  const [sourceMessage, setSourceMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [newSourcePath, setNewSourcePath] = useState('');
  const [showAddSourceInput, setShowAddSourceInput] = useState(false);

  const loadScanSources = async () => {
    try {
      setLoadingSources(true);
      const res = await scannerService.getScanSources();
      setScanSources(res);
    } catch (err) {
      console.warn('Failed to load scan sources:', err);
    } finally {
      setLoadingSources(false);
    }
  };

  const handleRescanSource = async (sourceId: string) => {
    try {
      setRescanningSourceId(sourceId);
      setSourceMessage(null);
      const res = await scannerService.rescanSource(sourceId);
      setSourceMessage({
        type: 'success',
        text: `Rescan complete: ${res.candidates.length} candidate(s) found, ${res.skipped_count} utility file(s) skipped.`,
      });
      await loadScanSources();
      onRefreshGames?.();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setSourceMessage({
        type: 'error',
        text: e.message || 'Failed to rescan folder source.',
      });
    } finally {
      setRescanningSourceId(null);
    }
  };

  const handleRemoveSource = async (sourceId: string) => {
    try {
      await scannerService.removeScanSource(sourceId);
      await loadScanSources();
      setSourceMessage({
        type: 'success',
        text: 'Folder removed from managed sources. (Games in library were preserved).',
      });
    } catch (err: unknown) {
      const e = err as { message?: string };
      setSourceMessage({
        type: 'error',
        text: e.message || 'Failed to remove scan source.',
      });
    }
  };

  const handleAddSource = async () => {
    if (!newSourcePath.trim()) return;
    try {
      await scannerService.addScanSource(newSourcePath.trim(), 4);
      setNewSourcePath('');
      setShowAddSourceInput(false);
      await loadScanSources();
      setSourceMessage({
        type: 'success',
        text: 'Scan source added successfully. You can rescan it anytime.',
      });
    } catch (err: unknown) {
      const e = err as { message?: string };
      setSourceMessage({
        type: 'error',
        text: e.message || 'Failed to add folder source. Ensure path is a valid game folder.',
      });
    }
  };

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

  // Emulators state & handlers (Phase 5)
  const [emulatorProfiles, setEmulatorProfiles] = useState<EmulatorProfile[]>([]);
  const [loadingEmulators, setLoadingEmulators] = useState<boolean>(false);
  const [detectingEmulators, setDetectingEmulators] = useState<boolean>(false);
  const [emulatorMessage, setEmulatorMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Edit / Create Profile Modal state
  const [editingProfile, setEditingProfile] = useState<EmulatorProfile | null>(null);
  const [isNewProfile, setIsNewProfile] = useState<boolean>(false);
  const [editName, setEditName] = useState<string>('');
  const [editSystems, setEditSystems] = useState<string>('');
  const [editExtensions, setEditExtensions] = useState<string>('');
  const [editExecutablePath, setEditExecutablePath] = useState<string>('');
  const [editCorePath, setEditCorePath] = useState<string>('');
  const [editTemplate, setEditTemplate] = useState<string>('');
  const [editWorkingDirRule, setEditWorkingDirRule] = useState<'EmulatorDir' | 'RomDir' | 'Custom'>('EmulatorDir');
  const [editCustomWorkingDir, setEditCustomWorkingDir] = useState<string>('');
  const [savingProfile, setSavingProfile] = useState<boolean>(false);

  // Test Launch state
  const [testingProfile, setTestingProfile] = useState<EmulatorProfile | null>(null);
  const [testFilePath, setTestFilePath] = useState<string>('');
  const [testingLaunch, setTestingLaunch] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<LaunchResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const loadEmulatorProfiles = async () => {
    try {
      setLoadingEmulators(true);
      const profiles = await emulatorService.getEmulatorProfiles();
      setEmulatorProfiles(profiles);
    } catch (err) {
      console.warn('Failed to load emulator profiles:', err);
    } finally {
      setLoadingEmulators(false);
    }
  };

  const handleDetectEmulators = async () => {
    try {
      setDetectingEmulators(true);
      setEmulatorMessage(null);
      const updated = await emulatorService.detectEmulators();
      setEmulatorProfiles(updated);
      const readyCount = updated.filter((p) => p.validation_status.status === 'Verified').length;
      setEmulatorMessage({
        type: 'success',
        text: `Detection complete: ${readyCount} emulator(s) ready with verified executables.`,
      });
    } catch (err: unknown) {
      const e = err as { message?: string };
      setEmulatorMessage({
        type: 'error',
        text: e.message || 'Failed to detect emulators on system.',
      });
    } finally {
      setDetectingEmulators(false);
    }
  };

  const handleOpenEditProfile = (profile: EmulatorProfile) => {
    setIsNewProfile(false);
    setEditingProfile(profile);
    setEditName(profile.name);
    setEditSystems(profile.systems.join(', '));
    setEditExtensions(profile.supported_extensions.join(', '));
    setEditExecutablePath(profile.executable_path || '');
    setEditCorePath(profile.core_path || '');
    setEditTemplate(JSON.stringify(profile.argument_template));
    if (typeof profile.working_dir_rule === 'string') {
      setEditWorkingDirRule(profile.working_dir_rule as 'EmulatorDir' | 'RomDir');
      setEditCustomWorkingDir('');
    } else if (
      profile.working_dir_rule &&
      typeof profile.working_dir_rule === 'object' &&
      'Custom' in profile.working_dir_rule
    ) {
      setEditWorkingDirRule('Custom');
      setEditCustomWorkingDir((profile.working_dir_rule as { Custom: string }).Custom);
    }
  };

  const handleOpenAddProfile = () => {
    setIsNewProfile(true);
    const newId = `custom-${Date.now().toString(36)}`;
    const template = ['{rom}'];
    const p: EmulatorProfile = {
      id: newId,
      name: 'Custom Emulator',
      systems: ['Custom System'],
      supported_extensions: ['.iso', '.bin', '.rom'],
      argument_template: template,
      working_dir_rule: 'EmulatorDir',
      executable_path: '',
      core_path: null,
      is_builtin: false,
      detection_hints: { known_paths: [], registry_keys: [], shortcut_names: [], executable_names: [] },
      verification_source: null,
      validation_status: { status: 'ExecutableMissing' },
    };
    setEditingProfile(p);
    setEditName(p.name);
    setEditSystems('Custom System');
    setEditExtensions('.iso, .bin, .rom');
    setEditExecutablePath('');
    setEditCorePath('');
    setEditTemplate('["{rom}"]');
    setEditWorkingDirRule('EmulatorDir');
    setEditCustomWorkingDir('');
  };

  const handleSaveProfile = async () => {
    if (!editingProfile) return;
    if (!editName.trim()) {
      setEmulatorMessage({ type: 'error', text: 'Profile name cannot be empty.' });
      return;
    }

    let parsedTemplate: string[] = [];
    try {
      const trimmed = editTemplate.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        parsedTemplate = JSON.parse(trimmed);
      } else {
        parsedTemplate = trimmed.split(/\s+/).filter(Boolean);
      }
    } catch {
      setEmulatorMessage({
        type: 'error',
        text: 'Invalid argument template JSON/format. Must be a JSON array like ["{rom}"] or space-separated tokens.',
      });
      return;
    }

    if (!parsedTemplate.some((t) => t.includes('{rom}'))) {
      setEmulatorMessage({ type: 'error', text: 'Argument template must contain the {rom} placeholder.' });
      return;
    }

    let rule: WorkingDirRule = 'EmulatorDir';
    if (editWorkingDirRule === 'RomDir') {
      rule = 'RomDir';
    } else if (editWorkingDirRule === 'Custom') {
      rule = { Custom: editCustomWorkingDir.trim() };
    }

    const updatedProfile: EmulatorProfile = {
      ...editingProfile,
      name: editName.trim(),
      systems: editSystems
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      supported_extensions: editExtensions
        .split(',')
        .map((e) => {
          const s = e.trim().toLowerCase();
          return s.startsWith('.') ? s : `.${s}`;
        })
        .filter(Boolean),
      argument_template: parsedTemplate,
      working_dir_rule: rule,
      executable_path: editExecutablePath.trim() || null,
      core_path: editCorePath.trim() || null,
    };

    try {
      setSavingProfile(true);
      await emulatorService.saveEmulatorProfile(updatedProfile);
      setEditingProfile(null);
      await loadEmulatorProfiles();
      setEmulatorMessage({ type: 'success', text: `Saved profile "${updatedProfile.name}".` });
    } catch (err: unknown) {
      const e = err as { message?: string };
      setEmulatorMessage({ type: 'error', text: e.message || 'Failed to save emulator profile.' });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleDeleteProfile = async (id: string) => {
    try {
      await emulatorService.deleteEmulatorProfile(id);
      await loadEmulatorProfiles();
      setEmulatorMessage({ type: 'success', text: 'Custom emulator profile deleted.' });
    } catch (err: unknown) {
      const e = err as { message?: string };
      setEmulatorMessage({ type: 'error', text: e.message || 'Failed to delete profile.' });
    }
  };

  const handleOpenTestLaunch = (profile: EmulatorProfile) => {
    setTestingProfile(profile);
    setTestFilePath('');
    setTestResult(null);
    setTestError(null);
  };

  const handleRunTestLaunch = async () => {
    if (!testingProfile) return;
    if (!testFilePath.trim()) {
      setTestError('Please provide an existing ROM or test file path to launch.');
      return;
    }

    try {
      setTestingLaunch(true);
      setTestError(null);
      setTestResult(null);
      const res = await emulatorService.testLaunchEmulator(testingProfile.id, testFilePath.trim());
      setTestResult(res);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setTestError(e.message || 'Test launch failed.');
    } finally {
      setTestingLaunch(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeSection === 'integrations') {
      loadSteamStatus();
    } else if (isOpen && activeSection === 'library') {
      loadScanSources();
    } else if (isOpen && activeSection === 'emulators') {
      loadEmulatorProfiles();
    } else if (isOpen && activeSection === 'metadata') {
      loadMetadataSettings();
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
                  <p className="text-xs text-muted">Configure basic application behaviors, tray presence, and startup options.</p>
                </div>
                <div className="bg-surface-2/40 border border-border rounded-card divide-y divide-border text-xs">
                  {/* Launch on Startup */}
                  <div className="p-4 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="text-xs font-medium text-text">Launch on System Startup</div>
                      <div className="text-xs text-muted">
                        Automatically start GameShelf minimized when logging into Windows (HKCU Run key).
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.launch_on_startup === true || String(settings.launch_on_startup) === 'true'}
                      onChange={(e) => onUpdateSetting('launch_on_startup', e.target.checked ? 'true' : 'false')}
                      aria-label="Toggle launch on startup"
                      className="w-4 h-4 rounded border-border bg-surface text-accent focus:ring-accent focus:ring-offset-0 cursor-pointer accent-accent"
                    />
                  </div>

                  {/* Minimize to Tray */}
                  <div className="p-4 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="text-xs font-medium text-text">Minimize to System Tray</div>
                      <div className="text-xs text-muted">
                        Hide window into system tray notification area when minimized.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.minimize_to_tray === true || String(settings.minimize_to_tray) === 'true'}
                      onChange={(e) => onUpdateSetting('minimize_to_tray', e.target.checked ? 'true' : 'false')}
                      aria-label="Toggle minimize to tray"
                      className="w-4 h-4 rounded border-border bg-surface text-accent focus:ring-accent focus:ring-offset-0 cursor-pointer accent-accent"
                    />
                  </div>

                  {/* Close to Tray */}
                  <div className="p-4 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="text-xs font-medium text-text">Close to System Tray</div>
                      <div className="text-xs text-muted">Keep GameShelf active in system notification tray when window is closed.</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.close_to_tray === true || String(settings.close_to_tray) === 'true'}
                      onChange={(e) => onUpdateSetting('close_to_tray', e.target.checked ? 'true' : 'false')}
                      aria-label="Toggle close to tray"
                      className="w-4 h-4 rounded border-border bg-surface text-accent focus:ring-accent focus:ring-offset-0 cursor-pointer accent-accent"
                    />
                  </div>

                  {/* Local Playtime Tracking */}
                  <div className="p-4 flex items-center justify-between">
                    <div className="space-y-0.5 max-w-[80%]">
                      <div className="text-xs font-medium text-text flex items-center gap-1.5">
                        <span>Local Playtime Tracking</span>
                        <span className="text-xs px-1.5 py-0.2 rounded bg-accent/15 text-accent border border-accent/30 font-normal">
                          Local only
                        </span>
                      </div>
                      <div className="text-xs text-muted">
                        Record how long games run on this machine. Standalone and emulator sessions are exact; Steam launches are labeled approximate.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.playtime_tracking_enabled === true || String(settings.playtime_tracking_enabled) === 'true'}
                      onChange={(e) => onUpdateSetting('playtime_tracking_enabled', e.target.checked ? 'true' : 'false')}
                      aria-label="Toggle local playtime tracking"
                      className="w-4 h-4 rounded border-border bg-surface text-accent focus:ring-accent focus:ring-offset-0 cursor-pointer accent-accent"
                    />
                  </div>

                  <div className="p-4 space-y-3">
                    <div className="text-xs text-muted leading-relaxed">
                      Playtime tracking is strictly local to your machine in SQLite. No playtime data, session telemetry, or process lists are ever transmitted to any remote server or third party.
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <div>
                        <div className="text-xs font-medium text-text">Clear Playtime Data</div>
                        <div className="text-xs text-muted">Zero all accumulated playtime and delete all logged session records across all games.</div>
                      </div>
                      <button
                        onClick={() => setIsConfirmingClearPlaytime(true)}
                        className="px-3 py-1.5 rounded-control bg-danger/10 hover:bg-danger/20 border border-danger/30 text-xs font-semibold text-danger transition-colors"
                      >
                        Clear All Playtime
                      </button>
                    </div>
                    {playtimeMessage && (
                      <div className={`p-2.5 rounded-control text-xs ${playtimeMessage.type === 'success' ? 'bg-accent/10 border border-accent/30 text-accent' : 'bg-danger/10 border border-danger/30 text-danger'}`}>
                        {playtimeMessage.text}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Appearance Section */}
            {activeSection === 'appearance' && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-semibold text-text">Theme & Display</h4>
                  <p className="text-xs text-muted">Personalize application colors, motion, and card presentation.</p>
                </div>

                <div className="space-y-5">
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

                  {/* Accent Color Picker */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-text">Accent Color</label>
                      <span className="font-mono text-xs text-muted">{settings.accent_color || '#7C6CFF'}</span>
                    </div>
                    <div className="flex items-center gap-3 bg-surface-2/40 border border-border p-3 rounded-card">
                      {[
                        { name: 'GameShelf Violet', value: '#7C6CFF' },
                        { name: 'Cyber Cyan', value: '#00D2FF' },
                        { name: 'Emerald Mint', value: '#10B981' },
                        { name: 'Sunset Coral', value: '#FF6B6B' },
                        { name: 'Amber Gold', value: '#F59E0B' },
                        { name: 'Electric Pink', value: '#EC4899' },
                      ].map((preset) => {
                        const isSelected = (settings.accent_color || '#7C6CFF').toLowerCase() === preset.value.toLowerCase();
                        return (
                          <button
                            key={preset.value}
                            onClick={() => onUpdateSetting('accent_color', preset.value)}
                            title={preset.name}
                            aria-label={`Select ${preset.name} accent`}
                            className={`w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-110 shadow-sm border-2 ${
                              isSelected ? 'border-white scale-105' : 'border-transparent'
                            }`}
                            style={{ backgroundColor: preset.value }}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5 text-white drop-shadow" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Reduced Motion Override */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-text">Motion & Animations</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'system', label: 'Follow OS' },
                        { id: 'always', label: 'Reduced Motion' },
                        { id: 'never', label: 'Full Animations' },
                      ].map((m) => (
                        <button
                          key={m.id}
                          onClick={() => onUpdateSetting('reduced_motion', m.id)}
                          className={`px-3 py-2 rounded-control border text-xs font-medium flex items-center justify-center gap-2 transition-colors ${
                            (settings.reduced_motion || 'system') === m.id
                              ? 'border-accent bg-accent/10 text-white font-semibold'
                              : 'border-border bg-surface-2 text-muted hover:text-text'
                          }`}
                        >
                          {(settings.reduced_motion || 'system') === m.id && <Check className="w-3.5 h-3.5 text-accent" />}
                          {m.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted">
                      Reduced motion disables heavy CSS card transitions and modal zooms for maximum UI snappiness.
                    </p>
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

            {/* Library & Scan Section (Phase 4) */}
            {activeSection === 'library' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-text">Managed Scan Folders</h4>
                    <p className="text-xs text-muted">
                      Directory roots tracked for automatic game discovery and one-click rescanning.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {onOpenScanFolder && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenScanFolder();
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-control shadow-sm transition-colors"
                      >
                        <FolderSearch className="w-3.5 h-3.5" />
                        <span>Scan Folder Now</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowAddSourceInput(!showAddSourceInput)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-2 border border-border hover:bg-surface-2/80 text-text text-xs font-medium rounded-control transition-colors"
                    >
                      <FolderPlus className="w-3.5 h-3.5 text-accent" />
                      <span>{showAddSourceInput ? 'Cancel' : 'Add Root'}</span>
                    </button>
                  </div>
                </div>

                {/* Status Message */}
                {sourceMessage && (
                  <div
                    className={`p-3 rounded-control border text-xs flex items-center justify-between ${
                      sourceMessage.type === 'success'
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        : 'bg-danger/10 border-danger/20 text-danger'
                    }`}
                  >
                    <span>{sourceMessage.text}</span>
                    <button
                      onClick={() => setSourceMessage(null)}
                      className="p-1 hover:text-white"
                      title="Dismiss"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Add Source Input Row */}
                {showAddSourceInput && (
                  <div className="p-3 bg-surface-2/60 border border-border rounded-card space-y-2 animate-fade-in">
                    <label className="text-xs font-medium text-text">Add Folder Scan Root</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newSourcePath}
                        onChange={(e) => setNewSourcePath(e.target.value)}
                        placeholder="e.g. D:\Games or C:\Games\DRMFree"
                        className="flex-1 bg-surface border border-border rounded-control px-3 py-1.5 text-xs text-text placeholder-muted focus:outline-none focus:border-accent"
                      />
                      <button
                        type="button"
                        onClick={handleAddSource}
                        className="px-4 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-control transition-colors"
                      >
                        Add Source
                      </button>
                    </div>
                  </div>
                )}

                {/* Scan Sources List */}
                <div className="space-y-2">
                  {loadingSources ? (
                    <div className="py-8 text-center text-xs text-muted">
                      <RefreshCw className="w-5 h-5 mx-auto animate-spin mb-2 text-accent" />
                      Loading managed scan folders...
                    </div>
                  ) : scanSources.length === 0 ? (
                    <div className="p-6 bg-surface-2/30 border border-border rounded-card text-center space-y-2">
                      <Folder className="w-8 h-8 text-muted/40 mx-auto" />
                      <div className="text-xs font-medium text-text">No managed scan roots yet</div>
                      <p className="text-xs text-muted max-w-sm mx-auto">
                        Add a games directory to track it for rescans, or use "Scan Folder Now" to inspect and import games.
                      </p>
                    </div>
                  ) : (
                    scanSources.map((source) => (
                      <div
                        key={source.id}
                        className="p-3 bg-surface-2/40 border border-border rounded-card flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-control bg-surface flex items-center justify-center border border-border text-accent flex-shrink-0">
                            <Folder className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-text truncate">
                              {source.path}
                            </div>
                            <div className="text-xs text-muted flex items-center gap-2 mt-0.5">
                              <span>{source.game_count} games tracked</span>
                              <span>•</span>
                              <span>Depth: {source.depth}</span>
                              <span>•</span>
                              <span>
                                Last scanned:{' '}
                                {source.last_scanned_at
                                  ? new Date(source.last_scanned_at).toLocaleDateString()
                                  : 'Never'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            type="button"
                            disabled={rescanningSourceId === source.id}
                            onClick={() => handleRescanSource(source.id)}
                            className="flex items-center gap-1.5 px-2.5 py-1 bg-surface border border-border hover:bg-surface-2 text-text text-xs rounded transition-colors"
                            title="Rescan this directory"
                          >
                            <RefreshCw
                              className={`w-3 h-3 text-accent ${
                                rescanningSourceId === source.id ? 'animate-spin' : ''
                              }`}
                            />
                            <span>{rescanningSourceId === source.id ? 'Scanning...' : 'Rescan'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveSource(source.id)}
                            className="p-1.5 text-muted hover:text-danger rounded hover:bg-surface transition-colors"
                            title="Remove this scan root (keeps library games)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Exclusions & Protection Notice */}
                <div className="p-4 bg-surface-2/20 border border-border rounded-card space-y-2">
                  <div className="text-xs font-semibold text-text flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-accent" />
                    <span>Built-in Scan Exclusions & Safety</span>
                  </div>
                  <p className="text-xs text-muted leading-relaxed">
                    GameShelf automatically bypasses system noise and cache directories:
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[
                      '$Recycle.Bin',
                      'System Volume Information',
                      'Windows',
                      'node_modules',
                      '.git',
                      '.svn',
                      'AppData',
                      'temp',
                      'tmp',
                    ].map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded bg-surface border border-border text-xs text-muted font-mono"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-muted/80 pt-1">
                    Whole drive roots (such as <code>C:\</code>) are blocked to prevent accidental system traversals.
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
                        <div className="text-xs text-muted">
                          Local VDF manifest discovery without web accounts or API keys
                        </div>
                      </div>
                    </div>
                    {/* Status Badge */}
                    <div>
                      {loadingSteam ? (
                        <span className="text-xs bg-surface-2 text-muted px-2 py-0.5 rounded border border-border">
                          Checking...
                        </span>
                      ) : steamStatus?.is_installed ? (
                        <span className="text-xs bg-success/20 text-success px-2 py-0.5 rounded border border-success/30 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Supported
                        </span>
                      ) : (
                        <span className="text-xs bg-warning/20 text-warning px-2 py-0.5 rounded border border-warning/30 font-semibold flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Needs Configuration
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Steam Path Configuration */}
                  <div className="space-y-1.5 pt-1">
                    <label className="text-xs font-medium text-muted">Steam Installation Directory</label>
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
                    <p className="text-xs text-muted">
                      Auto-detected from Windows Registry (HKCU/HKLM) or standard directories.
                    </p>
                  </div>

                  {/* Detected Libraries */}
                  {steamStatus && steamStatus.libraries.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <div className="text-xs font-semibold text-text flex items-center justify-between">
                        <span>Steam Library Folders ({steamStatus.libraries.length})</span>
                        <span className="text-xs text-muted">Enable / disable per library</span>
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
                                <div className="font-mono text-xs text-text truncate">{lib.path}</div>
                                <div className="text-xs text-muted flex items-center gap-2">
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
                              <span className="text-xs text-muted">
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
                        <span className="text-xs text-muted">Skip redistributables, runtimes & SDKs</span>
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
                              <div className="text-xs font-medium text-text">{rule.name}</div>
                              <div className="text-xs text-muted line-clamp-1">{rule.description}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Warnings List */}
                  {steamStatus && steamStatus.warnings.length > 0 && (
                    <div className="p-2.5 bg-warning/10 border border-warning/30 rounded-control space-y-1">
                      <div className="text-xs font-semibold text-warning flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Scan Warnings
                      </div>
                      {steamStatus.warnings.map((w, idx) => (
                        <div key={idx} className="text-xs text-muted">
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
                            className="p-1.5 bg-surface-2/40 rounded text-xs flex items-center justify-between"
                          >
                            <div className="truncate pr-2">
                              <span className="font-medium text-text">{skipped.name}</span>
                              <span className="text-xs text-muted ml-1.5">({skipped.reason})</span>
                            </div>
                            <button
                              onClick={() => handleIncludeSkippedApp(skipped.app_id)}
                              className="text-xs bg-accent/20 hover:bg-accent/40 text-accent px-2 py-0.5 rounded border border-accent/30 flex items-center gap-1 flex-shrink-0"
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
                    <div className="text-xs text-muted">
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
                      <span className="text-xs bg-surface px-2 py-0.5 rounded border border-border text-muted">
                        Not available yet
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Emulators Section (Phase 5) */}
            {activeSection === 'emulators' && (
              <div className="space-y-4">
                {emulatorMessage && (
                  <div
                    className={`p-3 rounded-control text-xs flex items-center justify-between border ${
                      emulatorMessage.type === 'success'
                        ? 'bg-success/10 border-success/30 text-success'
                        : 'bg-danger/10 border-danger/30 text-danger'
                    }`}
                  >
                    <span>{emulatorMessage.text}</span>
                    <button
                      onClick={() => setEmulatorMessage(null)}
                      className="text-muted hover:text-text ml-2 text-xs"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-semibold text-text">Emulator Profiles</h4>
                    <p className="text-xs text-muted">
                      Data-driven emulator CLI profiles, bounded detection, and argument expansion.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleDetectEmulators}
                      disabled={detectingEmulators}
                      className="flex items-center gap-1.5 bg-surface border border-border hover:bg-surface-2 text-text rounded-control px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-50"
                      title="Scan standard install paths, Start Menu shortcuts, and PATH"
                    >
                      <RotateCw
                        className={`w-3.5 h-3.5 text-accent ${detectingEmulators ? 'animate-spin' : ''}`}
                      />
                      <span>{detectingEmulators ? 'Detecting...' : 'Auto-Detect'}</span>
                    </button>
                    <button
                      onClick={handleOpenAddProfile}
                      className="flex items-center gap-1.5 bg-accent hover:bg-accent-hover text-white rounded-control px-3 py-1.5 text-xs font-semibold shadow-sm transition-all"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>Add Profile</span>
                    </button>
                  </div>
                </div>

                {loadingEmulators ? (
                  <div className="py-12 text-center text-xs text-muted flex items-center justify-center gap-2">
                    <RotateCw className="w-4 h-4 animate-spin text-accent" />
                    <span>Loading emulator profiles...</span>
                  </div>
                ) : emulatorProfiles.length === 0 ? (
                  <div className="bg-surface-2/40 border border-border rounded-card p-6 text-center text-xs text-muted">
                    No emulator profiles found. Click &ldquo;Auto-Detect&rdquo; or &ldquo;Add Profile&rdquo;.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {emulatorProfiles.map((p) => {
                      const isVerified = p.validation_status.status === 'Verified';
                      const isMissing = p.validation_status.status === 'ExecutableMissing';
                      const isNeedsConfig = p.validation_status.status === 'NeedsConfiguration';
                      const isInvalid = p.validation_status.status === 'InvalidTemplate';

                      return (
                        <div
                          key={p.id}
                          className="bg-surface-2/40 border border-border rounded-card p-4 space-y-3 hover:border-border/80 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 rounded-control bg-surface border border-border flex items-center justify-center text-accent mt-0.5">
                                <Cpu className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-bold text-text">{p.name}</span>
                                  {p.is_builtin ? (
                                    <span className="text-xs bg-accent/10 text-accent border border-accent/20 px-1.5 py-0.2 rounded font-medium">
                                      Built-in
                                    </span>
                                  ) : (
                                    <span className="text-xs bg-surface text-muted border border-border px-1.5 py-0.2 rounded font-medium">
                                      Custom
                                    </span>
                                  )}
                                  {p.verification_source && (
                                    <a
                                      href={p.verification_source}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-xs text-muted hover:text-accent flex items-center gap-0.5 underline"
                                      title="View verified CLI documentation source"
                                    >
                                      <span>CLI Docs</span>
                                      <ExternalLink className="w-2.5 h-2.5" />
                                    </a>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap mt-1">
                                  {p.systems.map((sys) => (
                                    <span
                                      key={sys}
                                      className="text-xs bg-surface px-1.5 py-0.5 rounded border border-border text-muted"
                                    >
                                      {sys}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>

                            {/* Status Badge */}
                            <div>
                              {isVerified && (
                                <span className="text-xs font-semibold bg-success/10 text-success border border-success/30 px-2 py-0.5 rounded flex items-center gap-1">
                                  <Check className="w-3 h-3" /> Ready
                                </span>
                              )}
                              {isMissing && (
                                <span className="text-xs font-medium bg-warning/10 text-warning border border-warning/30 px-2 py-0.5 rounded flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" /> Executable Missing
                                </span>
                              )}
                              {isNeedsConfig && (
                                <span
                                  className="text-xs font-medium bg-warning/10 text-warning border border-warning/30 px-2 py-0.5 rounded flex items-center gap-1"
                                  title={p.validation_status.detail}
                                >
                                  <AlertCircle className="w-3 h-3" /> Needs Config
                                </span>
                              )}
                              {isInvalid && (
                                <span
                                  className="text-xs font-medium bg-danger/10 text-danger border border-danger/30 px-2 py-0.5 rounded flex items-center gap-1"
                                  title={p.validation_status.detail}
                                >
                                  <AlertCircle className="w-3 h-3" /> Invalid
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Path Details */}
                          <div className="space-y-1 bg-surface/60 rounded p-2.5 border border-border/50 text-xs font-mono">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-muted font-sans text-xs">Executable:</span>
                              <span
                                className={`truncate flex-1 text-right ${
                                  p.executable_path ? 'text-text' : 'text-warning font-sans'
                                }`}
                              >
                                {p.executable_path || 'Not located / Not configured'}
                              </span>
                            </div>
                            {p.core_path !== undefined && (
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-muted font-sans text-xs">Libretro Core:</span>
                                <span
                                  className={`truncate flex-1 text-right ${
                                    p.core_path ? 'text-text' : 'text-muted font-sans'
                                  }`}
                                >
                                  {p.core_path || 'None'}
                                </span>
                              </div>
                            )}
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-muted font-sans text-xs">Template:</span>
                              <span className="text-accent truncate flex-1 text-right">
                                {p.argument_template.join(' ')}
                              </span>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center justify-between pt-1 text-xs">
                            <div className="text-xs text-muted truncate max-w-[280px]">
                              Exts:{' '}
                              <span className="text-text font-mono">
                                {p.supported_extensions.join(', ')}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {onOpenScanRoms && (
                                <button
                                  onClick={() => {
                                    onClose();
                                    onOpenScanRoms(p.id);
                                  }}
                                  className="flex items-center gap-1 bg-surface border border-border hover:bg-surface-2 text-text px-2.5 py-1 rounded text-xs transition-colors"
                                  title="Scan a ROM folder with this emulator profile"
                                >
                                  <Disc className="w-3 h-3 text-accent" />
                                  <span>Scan ROMs</span>
                                </button>
                              )}
                              <button
                                onClick={() => handleOpenTestLaunch(p)}
                                disabled={!p.executable_path}
                                className="flex items-center gap-1 bg-surface border border-border hover:bg-surface-2 text-text px-2.5 py-1 rounded text-xs transition-colors disabled:opacity-40"
                                title="Run test launch with a dummy or sample ROM file"
                              >
                                <Play className="w-3 h-3 text-accent" />
                                <span>Test Launch</span>
                              </button>
                              <button
                                onClick={() => handleOpenEditProfile(p)}
                                className="flex items-center gap-1 bg-surface border border-border hover:bg-surface-2 text-text px-2.5 py-1 rounded text-xs transition-colors"
                              >
                                <Edit2 className="w-3 h-3 text-muted" />
                                <span>Configure</span>
                              </button>
                              {!p.is_builtin && (
                                <button
                                  onClick={() => handleDeleteProfile(p.id)}
                                  className="text-muted hover:text-danger p-1 rounded hover:bg-surface transition-colors"
                                  title="Delete custom emulator profile"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Edit Profile Dialog Modal */}
                {editingProfile && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-surface border border-border rounded-dialog shadow-2xl w-full max-w-lg p-5 space-y-4 max-h-[90vh] overflow-y-auto">
                      <div className="flex items-center justify-between border-b border-border pb-3">
                        <div className="flex items-center gap-2">
                          <Cpu className="w-4 h-4 text-accent" />
                          <h4 className="text-sm font-bold text-text">
                            {isNewProfile ? 'Add Emulator Profile' : `Configure ${editingProfile.name}`}
                          </h4>
                        </div>
                        <button
                          onClick={() => setEditingProfile(null)}
                          className="text-muted hover:text-text p-1"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="space-y-3 text-xs">
                        {/* Profile Name */}
                        <div className="space-y-1">
                          <label className="font-semibold text-text">Profile Name</label>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="e.g. RetroArch, DuckStation, PCSX2"
                            className="w-full bg-surface-2 border border-border rounded-control px-3 py-1.5 text-text focus:outline-none focus:border-accent"
                          />
                        </div>

                        {/* Systems */}
                        <div className="space-y-1">
                          <label className="font-semibold text-text">Supported Systems</label>
                          <input
                            type="text"
                            value={editSystems}
                            onChange={(e) => setEditSystems(e.target.value)}
                            placeholder="e.g. PlayStation, PlayStation 2 (comma-separated)"
                            className="w-full bg-surface-2 border border-border rounded-control px-3 py-1.5 text-text focus:outline-none focus:border-accent"
                          />
                        </div>

                        {/* Supported Extensions */}
                        <div className="space-y-1">
                          <label className="font-semibold text-text">Supported Extensions</label>
                          <input
                            type="text"
                            value={editExtensions}
                            onChange={(e) => setEditExtensions(e.target.value)}
                            placeholder=".iso, .bin, .cue, .chd (comma-separated)"
                            className="w-full bg-surface-2 border border-border rounded-control px-3 py-1.5 text-text font-mono focus:outline-none focus:border-accent"
                          />
                        </div>

                        {/* Executable Path */}
                        <div className="space-y-1">
                          <label className="font-semibold text-text">Executable Path</label>
                          <input
                            type="text"
                            value={editExecutablePath}
                            onChange={(e) => setEditExecutablePath(e.target.value)}
                            placeholder="C:\Emulators\RetroArch\retroarch.exe"
                            className="w-full bg-surface-2 border border-border rounded-control px-3 py-1.5 text-text font-mono focus:outline-none focus:border-accent"
                          />
                        </div>

                        {/* Core Path (Libretro) */}
                        <div className="space-y-1">
                          <label className="font-semibold text-text">
                            Libretro Core Path (Optional / RetroArch)
                          </label>
                          <input
                            type="text"
                            value={editCorePath}
                            onChange={(e) => setEditCorePath(e.target.value)}
                            placeholder="C:\Emulators\RetroArch\cores\beetle_psx_libretro.dll"
                            className="w-full bg-surface-2 border border-border rounded-control px-3 py-1.5 text-text font-mono focus:outline-none focus:border-accent"
                          />
                        </div>

                        {/* Argument Template */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="font-semibold text-text">Argument Template</label>
                            <span className="text-xs text-muted">Must contain &#123;rom&#125;</span>
                          </div>
                          <input
                            type="text"
                            value={editTemplate}
                            onChange={(e) => setEditTemplate(e.target.value)}
                            placeholder='["-batch", "{rom}"] or -batch {rom}'
                            className="w-full bg-surface-2 border border-border rounded-control px-3 py-1.5 text-text font-mono focus:outline-none focus:border-accent"
                          />
                          {/* Helper placeholder chips */}
                          <div className="flex items-center gap-1.5 flex-wrap pt-1">
                            <span className="text-xs text-muted">Insert placeholder:</span>
                            {['{rom}', '{core}', '{game_dir}', '{emulator_dir}', '{basename}'].map(
                              (ph) => (
                                <button
                                  key={ph}
                                  type="button"
                                  onClick={() => {
                                    if (!editTemplate.includes(ph)) {
                                      setEditTemplate((prev) =>
                                        prev.trim().endsWith(']')
                                          ? prev.replace(/]$/, `, "${ph}"]`)
                                          : `${prev} ${ph}`
                                      );
                                    }
                                  }}
                                  className="text-xs bg-surface hover:bg-surface-2 border border-border text-accent px-1.5 py-0.5 rounded font-mono"
                                >
                                  {ph}
                                </button>
                              )
                            )}
                          </div>
                        </div>

                        {/* Working Directory Rule */}
                        <div className="space-y-1.5 pt-1">
                          <label className="font-semibold text-text">Working Directory Rule</label>
                          <div className="flex items-center gap-4 text-xs">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="radio"
                                name="wdirRule"
                                value="EmulatorDir"
                                checked={editWorkingDirRule === 'EmulatorDir'}
                                onChange={() => setEditWorkingDirRule('EmulatorDir')}
                                className="accent-accent"
                              />
                              <span>Emulator Directory</span>
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="radio"
                                name="wdirRule"
                                value="RomDir"
                                checked={editWorkingDirRule === 'RomDir'}
                                onChange={() => setEditWorkingDirRule('RomDir')}
                                className="accent-accent"
                              />
                              <span>ROM Directory</span>
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="radio"
                                name="wdirRule"
                                value="Custom"
                                checked={editWorkingDirRule === 'Custom'}
                                onChange={() => setEditWorkingDirRule('Custom')}
                                className="accent-accent"
                              />
                              <span>Custom</span>
                            </label>
                          </div>
                          {editWorkingDirRule === 'Custom' && (
                            <input
                              type="text"
                              value={editCustomWorkingDir}
                              onChange={(e) => setEditCustomWorkingDir(e.target.value)}
                              placeholder="C:\Emulators\WorkingDir"
                              className="w-full bg-surface-2 border border-border rounded-control px-3 py-1 text-text font-mono mt-1 focus:outline-none"
                            />
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
                        <button
                          type="button"
                          onClick={() => setEditingProfile(null)}
                          className="px-3 py-1.5 rounded-control text-xs font-medium text-muted hover:text-text hover:bg-surface-2 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveProfile}
                          disabled={savingProfile}
                          className="flex items-center gap-1.5 px-4 py-1.5 rounded-control text-xs font-semibold bg-accent hover:bg-accent-hover text-white transition-all disabled:opacity-50"
                        >
                          {savingProfile && <RotateCw className="w-3 h-3 animate-spin" />}
                          <span>Save Profile</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Test Launch Modal Dialog */}
                {testingProfile && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-surface border border-border rounded-dialog shadow-2xl w-full max-w-md p-5 space-y-4">
                      <div className="flex items-center justify-between border-b border-border pb-3">
                        <div className="flex items-center gap-2">
                          <Play className="w-4 h-4 text-accent" />
                          <h4 className="text-sm font-bold text-text">
                            Test Launch — {testingProfile.name}
                          </h4>
                        </div>
                        <button
                          onClick={() => setTestingProfile(null)}
                          className="text-muted hover:text-text p-1"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="space-y-3 text-xs">
                        <p className="text-muted">
                          Provide an existing ROM or sample file to verify argument vector expansion
                          and process execution.
                        </p>

                        <div className="space-y-1">
                          <label className="font-semibold text-text">Test ROM / File Path</label>
                          <input
                            type="text"
                            value={testFilePath}
                            onChange={(e) => setTestFilePath(e.target.value)}
                            placeholder="C:\Games\ROMs\test_game.iso"
                            className="w-full bg-surface-2 border border-border rounded-control px-3 py-1.5 text-text font-mono focus:outline-none focus:border-accent"
                          />
                        </div>

                        {testError && (
                          <div className="p-3 rounded bg-danger/10 border border-danger/30 text-danger text-xs">
                            {testError}
                          </div>
                        )}

                        {testResult && (
                          <div className="p-3 rounded bg-success/10 border border-success/30 text-success text-xs space-y-1">
                            <div className="font-bold">Process Launched Successfully!</div>
                            <div>PID: {testResult.pid}</div>
                            <div className="font-mono text-xs text-text">
                              {testResult.message}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
                        <button
                          onClick={() => setTestingProfile(null)}
                          className="px-3 py-1.5 rounded-control text-xs font-medium text-muted hover:text-text hover:bg-surface-2 transition-colors"
                        >
                          Close
                        </button>
                        <button
                          onClick={handleRunTestLaunch}
                          disabled={testingLaunch || !testFilePath.trim()}
                          className="flex items-center gap-1.5 px-4 py-1.5 rounded-control text-xs font-semibold bg-accent hover:bg-accent-hover text-white transition-all disabled:opacity-50"
                        >
                          {testingLaunch ? (
                            <RotateCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                          <span>Run Launch</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Metadata & Artwork Section (Phase 6) */}
            {activeSection === 'metadata' && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-semibold text-text">Metadata & Artwork Providers</h4>
                  <p className="text-xs text-muted">
                    Configure community artwork providers and manage cached game covers, banners, logos, and icons.
                  </p>
                </div>

                {/* Status / Message Alert */}
                {sgdbMessage && (
                  <div
                    className={`p-3 rounded-control border text-xs flex items-center justify-between ${
                      sgdbMessage.type === 'success'
                        ? 'bg-success/10 border-success/30 text-success'
                        : 'bg-danger/10 border-danger/30 text-danger'
                    }`}
                  >
                    <span>{sgdbMessage.text}</span>
                    <button
                      onClick={() => setSgdbMessage(null)}
                      className="hover:underline font-medium ml-2"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {/* SteamGridDB API Key Card */}
                <div className="bg-surface-2/40 border border-border rounded-card p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Key className="w-4 h-4 text-accent" />
                      <div>
                        <h5 className="text-xs font-semibold text-text">SteamGridDB API v2</h5>
                        <p className="text-xs text-muted">
                          Official &amp; community game covers (2:3 portrait), heroes, logos, and icons.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {sgdbConfigured ? (
                        <span className="flex items-center gap-1 text-xs font-medium text-success bg-success/10 border border-success/20 rounded px-2 py-0.5">
                          <Check className="w-3 h-3" /> Configured
                        </span>
                      ) : (
                        <span className="text-xs text-muted bg-surface-2 border border-border rounded px-2 py-0.5">
                          Not configured
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-text block">
                      API Key (Stored in Windows Credential Manager)
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type={showSgdbKey ? 'text' : 'password'}
                          value={sgdbKeyInput}
                          onChange={(e) => setSgdbKeyInput(e.target.value)}
                          placeholder={
                            sgdbConfigured
                              ? '••••••••••••••••••••••••••••••••'
                              : 'Enter your SteamGridDB API key...'
                          }
                          className="w-full rounded-control border border-border bg-surface px-3 py-1.5 pr-9 text-xs text-text placeholder-muted focus:border-accent focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSgdbKey(!showSgdbKey)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-text"
                          title={showSgdbKey ? 'Hide key' : 'Show key'}
                        >
                          {showSgdbKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      <button
                        onClick={handleTestSgdb}
                        disabled={isTestingSgdb || (!sgdbConfigured && !sgdbKeyInput.trim())}
                        className="rounded-control border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-2 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {isTestingSgdb ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
                        Test Connection
                      </button>

                      <button
                        onClick={handleSaveSgdbKey}
                        disabled={!sgdbKeyInput.trim()}
                        className="rounded-control bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
                      >
                        Save Key
                      </button>

                      {sgdbConfigured && (
                        <button
                          onClick={handleRemoveSgdbKey}
                          className="rounded-control border border-danger/30 bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/20 transition-colors"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <p className="text-xs text-muted">
                      Need a key? Generate one at{' '}
                      <span className="font-mono text-accent">steamgriddb.com/profile/preferences/api</span>.
                      Your key is securely kept in Windows Credential Manager and is never hardcoded, logged, or sent in telemetry.
                    </p>
                  </div>
                </div>

                {/* Artwork Cache Management Card */}
                <div className="bg-surface-2/40 border border-border rounded-card p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <HardDrive className="w-4 h-4 text-accent" />
                      <div>
                        <h5 className="text-xs font-semibold text-text">Artwork Disk Cache</h5>
                        <p className="text-xs text-muted">
                          Locally cached thumbnails, covers, and logos downloaded from providers.
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-mono font-medium text-text">
                        {cacheStats?.formatted_size || '0 B'}
                      </div>
                      <div className="text-xs text-muted">
                        {cacheStats?.file_count || 0} cached file(s)
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-border/60">
                    <p className="text-xs text-muted max-w-md">
                      Clearing the cache removes downloaded image files to reclaim disk space. User-selected local images
                      in custom paths are preserved.
                    </p>

                    <button
                      onClick={handleClearCache}
                      disabled={isClearingCache || !cacheStats || cacheStats.file_count === 0}
                      className="rounded-control border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-2 hover:border-danger hover:text-danger transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {isClearingCache ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      Clear Cache
                    </button>
                  </div>
                </div>

                {/* Fallbacks & Privacy notice */}
                <div className="rounded-control bg-surface-2/20 border border-border/60 p-4 space-y-2 text-xs text-muted">
                  <div className="flex items-center gap-1.5 font-medium text-text">
                    <ShieldCheck className="w-3.5 h-3.5 text-accent" />
                    <span>Fallbacks &amp; Privacy Statement</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1">
                    <li>
                      <strong>Steam Fallback:</strong> For Steam games, official library capsule, header, and hero artwork
                      is automatically resolved from Steam's public CDN even without a SteamGridDB key.
                    </li>
                    <li>
                      <strong>Deterministic Fallbacks:</strong> Games without remote artwork display clean title initials
                      with deterministic color gradients.
                    </li>
                    <li>
                      <strong>Privacy:</strong> GameShelf is local-first. Game paths and metadata never leave your computer
                      unless you search SteamGridDB.
                    </li>
                    <li>
                      <strong>Attribution:</strong> Game covers and artwork provided by SteamGridDB and Steam CDN.
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {/* Diagnostics Section */}
            {activeSection === 'diagnostics' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-text">Diagnostics & Local Storage</h4>
                    <p className="text-xs text-muted">Backend paths, database health, logs, and system information.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleOpenLogs}
                      disabled={openingLogs}
                      title="Reveal logs folder in Windows File Explorer"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-border hover:bg-surface-2 text-text text-xs font-medium rounded-control transition-colors disabled:opacity-50"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-accent" />
                      <span>{openingLogs ? 'Opening...' : 'Open Logs Folder'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyDiagnostics}
                      disabled={copyingDiag}
                      title="Copy sanitized markdown diagnostic report to clipboard"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-control shadow-sm transition-colors disabled:opacity-50"
                    >
                      {diagCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-white" />
                          <span>Copied to Clipboard!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>{copyingDiag ? 'Copying...' : 'Copy Diagnostics'}</span>
                        </>
                      )}
                    </button>
                  </div>
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
                    <span className="font-mono text-text">v{appInfo?.db_version ?? 5} (SQLite rusqlite)</span>
                  </div>
                  <div className="p-3 flex items-center justify-between">
                    <span className="text-muted">Database Integrity</span>
                    <span className="font-mono text-success flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>PASSED (PRAGMA quick_check)</span>
                    </span>
                  </div>
                  <div className="p-3 flex flex-col gap-1">
                    <span className="text-muted">App Data Directory</span>
                    <span className="font-mono text-xs text-text break-all">
                      {appInfo?.data_dir || 'AppData/Local/com.gameshelf.app'}
                    </span>
                  </div>
                  <div className="p-3 flex flex-col gap-1">
                    <span className="text-muted">Rotating Log Directory</span>
                    <span className="font-mono text-xs text-text break-all">
                      {appInfo?.log_dir || 'AppData/Local/com.gameshelf.app/logs'}
                    </span>
                  </div>
                </div>

                {diagSummaryText && (
                  <div className="bg-surface-2/60 border border-border rounded-card p-3 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-text">
                      <FileText className="w-3.5 h-3.5 text-accent" />
                      <span>Sanitized Diagnostic Summary</span>
                    </div>
                    <pre className="text-xs font-mono text-muted bg-surface/70 p-2.5 rounded border border-border/50 whitespace-pre-wrap max-h-36 overflow-y-auto">
                      {diagSummaryText}
                    </pre>
                  </div>
                )}

                {/* Privacy Notice */}
                <div className="bg-surface-2/20 border border-border rounded-card p-3.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-text">
                    <ShieldCheck className="w-4 h-4 text-success" />
                    <span>Privacy Notice</span>
                  </div>
                  <p className="text-xs text-muted leading-relaxed">
                    GameShelf is 100% local-first. No telemetry, session logging, or personal data is collected or transmitted.
                    All library information, paths, and settings reside strictly on this computer. Diagnostic exports omit all personal paths and secret keys.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {isConfirmingClearPlaytime && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-100">
          <div className="w-full max-w-sm bg-surface border border-border rounded-dialog shadow-2xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-danger/20 border border-danger/40 flex items-center justify-center text-danger flex-shrink-0">
                <Trash2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-text">Clear All Playtime Data?</h3>
                <p className="text-xs text-muted mt-0.5">
                  This will permanently zero total playtime and remove all session history for every game in your library.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmingClearPlaytime(false)}
                disabled={isClearingPlaytime}
                className="px-3 py-1.5 rounded-control bg-surface-2 hover:bg-surface-2/80 border border-border text-xs font-medium text-text transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearAllPlaytime}
                disabled={isClearingPlaytime}
                className="px-4 py-1.5 rounded-control bg-danger hover:bg-danger/90 text-white text-xs font-semibold shadow-sm flex items-center gap-1.5 disabled:opacity-50"
              >
                {isClearingPlaytime ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Clear All Playtime</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
