import React, { useEffect, useState, useMemo } from 'react';
import { TitleBar } from './components/TitleBar';
import { Sidebar, NavFilter } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { GameDetailPanel } from './components/GameDetailPanel';
import { EmptyState } from './components/EmptyState';
import { VirtualizedLibrary } from './components/VirtualizedLibrary';
import { SettingsModal } from './components/SettingsModal';
import { AddGameModal } from './components/AddGameModal';
import { ScanFolderModal } from './components/ScanFolderModal';
import { ScanRomsModal } from './components/ScanRomsModal';
import { ToastContainer, ToastMessage } from './components/Toast';
import { OnboardingModal } from './components/OnboardingModal';
import { ContextMenu } from './components/ContextMenu';
import { getGameActions } from './features/library/gameActions';
import { ArtworkPickerModal } from './components/ArtworkPickerModal';
import { refreshGameMetadata } from './services/artwork';
import { Trash2 } from 'lucide-react';
import { api, isTauri } from './services/api';
import { AppInfo, AppSettings, CommandError, SortField, ViewMode } from './types/api';
import { ActiveSessionInfo, Game } from './types/models';

export const App: React.FC = () => {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [settings, setSettings] = useState<AppSettings>({
    theme: 'dark',
    default_view_mode: 'grid',
    grid_card_size: 'medium',
    steam_grid_db_configured: false,
    close_to_tray: false,
    minimize_to_tray: false,
    launch_on_startup: false,
    onboarding_completed: false,
    accent_color: '#7C6CFF',
    reduced_motion: 'system',
    card_density: 'comfortable',
    playtime_tracking_enabled: false,
  });

  const [games, setGames] = useState<Game[]>([]);
  const [activeSessions, setActiveSessions] = useState<Record<string, ActiveSessionInfo>>({});
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<NavFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('title');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [isDetailPanelOpen, setIsDetailPanelOpen] = useState(false);
  const [contextMenuState, setContextMenuState] = useState<{
    x: number;
    y: number;
    game: Game;
    originElement?: HTMLElement;
  } | null>(null);
  const [gameToRemove, setGameToRemove] = useState<Game | null>(null);
  const [artworkPickerGame, setArtworkPickerGame] = useState<Game | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isAddGameOpen, setIsAddGameOpen] = useState(false);
  const [isScanFolderOpen, setIsScanFolderOpen] = useState(false);
  const [scanFolderInitialPath, setScanFolderInitialPath] = useState<string | undefined>(undefined);
  const [isScanRomsOpen, setIsScanRomsOpen] = useState(false);
  const [scanRomsProfileId, setScanRomsProfileId] = useState<string | undefined>(undefined);
  const [scanRomsFolderPath, setScanRomsFolderPath] = useState<string | undefined>(undefined);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const handleOpenScanFolder = (path?: string) => {
    setScanFolderInitialPath(path);
    setIsScanFolderOpen(true);
  };

  const handleOpenScanRoms = (profileId?: string, folderPath?: string) => {
    setScanRomsProfileId(profileId);
    setScanRomsFolderPath(folderPath);
    setIsScanRomsOpen(true);
  };

  const addToast = (type: 'error' | 'success' | 'info', title: string, message?: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Initial load: App info, settings, and games
  useEffect(() => {
    const initApp = async () => {
      try {
        setLoading(true);
        const [info, fetchedSettings] = await Promise.all([
          api.getAppInfo().catch((err: CommandError) => {
            console.warn('Failed to load app info:', err);
            return null;
          }),
          api.getSettings().catch((err: CommandError) => {
            console.warn('Failed to load settings:', err);
            return null;
          }),
        ]);

        if (info) setAppInfo(info);
        if (fetchedSettings) {
          setSettings(fetchedSettings);
          setViewMode(fetchedSettings.default_view_mode);
          if (!fetchedSettings.onboarding_completed) {
            setIsOnboardingOpen(true);
          }
        }

        const res = await api.listGames({ filter: 'all' });
        setGames(res.games);
      } catch (err: unknown) {
        const error = err as CommandError;
        addToast('error', 'Initialization Error', error.message || 'Failed to initialize app state');
      } finally {
        setLoading(false);
      }
    };

    initApp();
  }, []);

  // Listen for background playtime updates (child processes exiting)
  useEffect(() => {
    api.getActiveSessions()
      .then((list) => {
        const map: Record<string, ActiveSessionInfo> = {};
        list.forEach((s) => {
          map[s.game_id] = s;
        });
        setActiveSessions(map);
      })
      .catch(() => {});

    let unlisten: (() => void) | undefined;
    let unlistenStarted: (() => void) | undefined;
    let unlistenEnded: (() => void) | undefined;

    const setupListener = async () => {
      if (isTauri()) {
        try {
          const { listen } = await import('@tauri-apps/api/event');
          unlisten = await listen<{ game_id: string; additional_seconds: number; total_playtime_seconds: number }>(
            'game-playtime-updated',
            (event) => {
              const { game_id, total_playtime_seconds } = event.payload;
              setGames((prev) =>
                prev.map((g) => (g.id === game_id ? { ...g, playtime_seconds: total_playtime_seconds } : g))
              );
              setSelectedGame((prev) =>
                prev && prev.id === game_id ? { ...prev, playtime_seconds: total_playtime_seconds } : prev
              );
            }
          );

          unlistenStarted = await listen<{ session_id: string; game_id: string; tracking_method: string }>(
            'playtime-session-started',
            (event) => {
              const { session_id, game_id, tracking_method } = event.payload;
              setActiveSessions((prev) => ({
                ...prev,
                [game_id]: {
                  session_id,
                  game_id,
                  started_at: new Date().toISOString(),
                  tracking_method,
                },
              }));
            }
          );

          unlistenEnded = await listen<{ session_id: string; game_id: string; duration_secs: number; end_reason: string }>(
            'playtime-session-ended',
            (event) => {
              const { game_id } = event.payload;
              setActiveSessions((prev) => {
                const next = { ...prev };
                delete next[game_id];
                return next;
              });
              api.listGames({ filter: 'all' })
                .then((res) => {
                  setGames(res.games);
                })
                .catch(() => {});
            }
          );
        } catch (e) {
          console.warn('Failed to register playtime listeners', e);
        }
      }
    };
    setupListener();
    return () => {
      if (unlisten) unlisten();
      if (unlistenStarted) unlistenStarted();
      if (unlistenEnded) unlistenEnded();
    };
  }, []);

  // Reset sortBy to 'title' if playtime tracking gets disabled while 'most_played' was selected
  useEffect(() => {
    const trackingEnabled = settings.playtime_tracking_enabled === true || String(settings.playtime_tracking_enabled) === 'true';
    if (!trackingEnabled && sortBy === 'most_played') {
      setSortBy('title');
    }
  }, [settings.playtime_tracking_enabled, sortBy]);

  // Sync theme changes with DOM documentElement
  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = (isDark: boolean) => {
      if (isDark) {
        root.classList.remove('light');
      } else {
        root.classList.add('light');
      }
    };

    if (settings.theme === 'system') {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      applyTheme(media.matches);
      const listener = (e: MediaQueryListEvent) => applyTheme(e.matches);
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    } else {
      applyTheme(settings.theme === 'dark');
    }
  }, [settings.theme]);

  // Sync accent color with root CSS custom property
  useEffect(() => {
    if (settings.accent_color) {
      document.documentElement.style.setProperty('--color-accent', settings.accent_color);
    }
  }, [settings.accent_color]);

  // Sync reduced motion mode
  useEffect(() => {
    const root = document.documentElement;
    if (settings.reduced_motion === 'always') {
      root.classList.add('reduce-motion');
    } else {
      root.classList.remove('reduce-motion');
    }
  }, [settings.reduced_motion]);

  // Handle setting updates
  const handleUpdateSetting = async (key: string, value: string) => {
    try {
      await api.setSetting(key, value);
      const parsedValue =
        key === 'playtime_tracking_enabled'
          ? value === 'true'
          : key === 'close_to_tray' ||
            key === 'minimize_to_tray' ||
            key === 'launch_on_startup' ||
            key === 'onboarding_completed' ||
            key === 'steam_grid_db_configured'
          ? value === 'true'
          : value;

      setSettings((prev) => ({
        ...prev,
        [key]: parsedValue,
      }));
      if (key === 'default_view_mode') {
        setViewMode(value as ViewMode);
      }
      if (key === 'playtime_tracking_enabled' && value !== 'true' && sortBy === 'most_played') {
        setSortBy('title');
      }
      addToast('success', 'Setting Updated', `Changed ${key} to ${value}`);
    } catch (err: unknown) {
      const error = err as CommandError;
      addToast('error', 'Failed to save setting', error.message);
    }
  };

  // Handlers for Add, Update, and Remove
  const handleGameAdded = (newGame: Game) => {
    setGames((prev) => [newGame, ...prev]);
    setSelectedGame(newGame);
    setIsDetailPanelOpen(true);
    addToast('success', 'Game Added', `"${newGame.title}" has been added to your library.`);
  };

  const handleGameUpdated = (updated: Game) => {
    setGames((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
    setSelectedGame(updated);
  };

  const handleGameRemoved = (removedId: string) => {
    setGames((prev) => prev.filter((g) => g.id !== removedId));
    if (selectedGame?.id === removedId) {
      setSelectedGame(null);
    }
  };

  // Filtered and sorted games
  const visibleGames = useMemo(() => {
    let result = [...games];

    // Filter
    if (activeFilter === 'favorites') {
      result = result.filter((g) => g.is_favorite);
    } else if (activeFilter === 'recent') {
      result = result
        .filter((g) => Boolean(g.last_played_at || g.last_launched_at))
        .sort((a, b) => {
          const tA = a.last_played_at || a.last_launched_at || '';
          const tB = b.last_played_at || b.last_launched_at || '';
          return tB.localeCompare(tA);
        });
    } else if (activeFilter === 'steam') {
      result = result.filter((g) => g.source_kind === 'Steam');
    } else if (activeFilter === 'pc') {
      result = result.filter((g) => g.source_kind === 'Standalone' || g.source_kind === 'Shortcut' || g.source_kind === 'Manual');
    } else if (activeFilter === 'emulated') {
      result = result.filter((g) => g.source_kind === 'Emulated');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (g) =>
          g.title.toLowerCase().includes(q) ||
          g.developer?.toLowerCase().includes(q) ||
          g.publisher?.toLowerCase().includes(q) ||
          g.genres.some((genre) => genre.toLowerCase().includes(q)) ||
          g.user_tags.some((tag) => tag.toLowerCase().includes(q))
      );
    }

    result.sort((a, b) => {
      if (sortBy === 'title') {
        return a.sort_title.localeCompare(b.sort_title);
      } else if (sortBy === 'recently_added') {
        const tA = a.created_at || '';
        const tB = b.created_at || '';
        return tB.localeCompare(tA);
      } else if (sortBy === 'recently_played') {
        const lA = a.last_launched_at || '';
        const lB = b.last_launched_at || '';
        if (lA && !lB) return -1;
        if (!lA && lB) return 1;
        return lB.localeCompare(lA);
      } else if (sortBy === 'most_played') {
        const pA = a.playtime_seconds || 0;
        const pB = b.playtime_seconds || 0;
        return pB - pA;
      } else if (sortBy === 'release_year') {
        const yA = a.release_year || 0;
        const yB = b.release_year || 0;
        return yB - yA;
      } else if (sortBy === 'status') {
        return a.status.localeCompare(b.status);
      }
      return 0;
    });

    return result;
  }, [games, activeFilter, searchQuery, sortBy]);

  const counts = useMemo(() => {
    return {
      all: games.length,
      favorites: games.filter((g) => g.is_favorite).length,
      recent: games.filter((g) => Boolean(g.last_played_at || g.last_launched_at)).length,
      steam: games.filter((g) => g.source_kind === 'Steam').length,
      pc: games.filter(
        (g) =>
          g.source_kind === 'Standalone' ||
          g.source_kind === 'Shortcut' ||
          g.source_kind === 'Manual'
      ).length,
      emulated: games.filter((g) => g.source_kind === 'Emulated').length,
    };
  }, [games]);

  const handleRefreshGames = async () => {
    try {
      const res = await api.listGames({ filter: 'all' });
      setGames(res.games);
      if (selectedGame) {
        const refreshed = res.games.find((g) => g.id === selectedGame.id);
        if (refreshed) setSelectedGame(refreshed);
      }
    } catch (err: unknown) {
      console.warn('Failed to refresh games:', err);
    }
  };

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if (isInput) {
        return;
      }

      if (target?.closest('[data-testid="game-card"]')) {
        e.preventDefault();
        return;
      }

      if (!import.meta.env.DEV) {
        e.preventDefault();
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    return () => window.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  const handleSelectGame = (game: Game) => {
    setSelectedGame(game);
    setIsDetailPanelOpen(true);
  };

  const handleCardContextMenu = (
    game: Game,
    event: React.MouseEvent | { clientX: number; clientY: number },
    targetElement?: HTMLElement
  ) => {
    setSelectedGame(game);
    setContextMenuState({
      x: event.clientX,
      y: event.clientY,
      game,
      originElement: targetElement,
    });
  };

  const handlePlayFromMenu = async (game: Game) => {
    try {
      const res = await api.launchGame(game.id);
      addToast('success', 'Game Launched', res.message);
      handleRefreshGames();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err);
      addToast('error', 'Launch Failed', msg);
    }
  };

  const handleToggleFavoriteFromMenu = async (game: Game) => {
    try {
      const updated = await api.updateGame({ id: game.id, is_favorite: !game.is_favorite });
      setGames((prev) => prev.map((g) => (g.id === game.id ? updated : g)));
      if (selectedGame?.id === game.id) setSelectedGame(updated);
      addToast('success', updated.is_favorite ? 'Added to Favorites' : 'Removed from Favorites', `"${game.title}" updated`);
    } catch (err: unknown) {
      addToast('error', 'Update Failed', String(err));
    }
  };

  const handleToggleHideFromMenu = async (game: Game) => {
    try {
      const nextHidden = !game.is_hidden;
      const updated = await api.updateGame({ id: game.id, is_hidden: nextHidden });
      setGames((prev) => prev.map((g) => (g.id === game.id ? updated : g)));
      if (selectedGame?.id === game.id) setSelectedGame(updated);
      addToast('success', nextHidden ? 'Game Hidden' : 'Game Unhidden', `"${game.title}" status updated`);
    } catch (err: unknown) {
      addToast('error', 'Update Failed', String(err));
    }
  };

  const handleOpenFolderFromMenu = async (game: Game) => {
    try {
      await api.openFolder(game.id);
    } catch (err: unknown) {
      addToast('error', 'Open Folder Failed', String(err));
    }
  };

  const handleRefreshMetadataFromMenu = async (game: Game) => {
    try {
      addToast('info', 'Refreshing Metadata', `Looking up details for "${game.title}"...`);
      const updated = await refreshGameMetadata(game.id);
      setGames((prev) => prev.map((g) => (g.id === game.id ? updated : g)));
      if (selectedGame?.id === game.id) setSelectedGame(updated);
      addToast('success', 'Metadata Refreshed', `Updated details for "${game.title}"`);
    } catch (err: unknown) {
      addToast('error', 'Refresh Failed', String(err));
    }
  };

  const handleConfirmRemoveFromMenu = async () => {
    if (!gameToRemove) return;
    try {
      await api.removeGame(gameToRemove.id);
      setGames((prev) => prev.filter((g) => g.id !== gameToRemove.id));
      if (selectedGame?.id === gameToRemove.id) {
        setSelectedGame(null);
        setIsDetailPanelOpen(false);
      }
      addToast('success', 'Game Removed', `"${gameToRemove.title}" was removed from your library. Game files on disk were untouched.`);
      setGameToRemove(null);
    } catch (err: unknown) {
      addToast('error', 'Removal Failed', String(err));
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-bg text-text">
      {/* 1. Window Title Bar */}
      <TitleBar />

      {/* 2. Main Application Body */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Left Navigation Sidebar */}
        <Sidebar
          activeFilter={activeFilter}
          onSelectFilter={(f) => {
            setActiveFilter(f);
            setSelectedGame(null);
          }}
          onOpenSettings={() => setIsSettingsOpen(true)}
          counts={counts}
        />

        {/* Center Content Workspace */}
        <div className="flex-1 flex flex-col min-w-0 bg-bg">
          {/* Top Filter and Search Bar */}
          <TopBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            sortBy={sortBy}
            onSortByChange={setSortBy}
            totalGames={visibleGames.length}
            playtimeTrackingEnabled={Boolean(settings.playtime_tracking_enabled)}
            onOpenAddGame={() => setIsAddGameOpen(true)}
            onOpenScanFolder={() => handleOpenScanFolder()}
            onOpenScanRoms={() => handleOpenScanRoms()}
          />

          {loading ? (
            <main className="flex-1 overflow-y-auto p-6">
              <div className="flex items-center justify-center h-full text-xs text-muted">
                Loading library...
              </div>
            </main>
          ) : visibleGames.length === 0 ? (
            <main className="flex-1 overflow-y-auto p-6">
              <EmptyState
                isSearch={searchQuery.length > 0 || activeFilter !== 'all'}
                onClearSearch={() => {
                  setSearchQuery('');
                  setActiveFilter('all');
                }}
                onOpenAddGame={() => setIsAddGameOpen(true)}
                onOpenScanFolder={() => handleOpenScanFolder()}
                onOpenScanRoms={() => handleOpenScanRoms()}
              />
            </main>
          ) : (
            <VirtualizedLibrary
              games={visibleGames}
              viewMode={viewMode}
              cardSize={settings.grid_card_size || 'medium'}
              selectedGame={selectedGame}
              onSelectGame={handleSelectGame}
              playtimeTrackingEnabled={Boolean(settings.playtime_tracking_enabled)}
              onContextMenu={handleCardContextMenu}
            />
          )}
        </div>

        {selectedGame && isDetailPanelOpen && (
          <GameDetailPanel
            game={selectedGame}
            onClose={() => setIsDetailPanelOpen(false)}
            onGameUpdated={handleGameUpdated}
            onGameRemoved={handleGameRemoved}
            onError={(t, m) => addToast('error', t, m)}
            onSuccess={(t, m) => addToast('success', t, m)}
            playtimeTrackingEnabled={Boolean(settings.playtime_tracking_enabled)}
            isTrackingActive={Boolean(activeSessions[selectedGame.id])}
            onStopTracking={async () => {
              try {
                await api.stopTrackingSession(selectedGame.id);
                setActiveSessions((prev) => {
                  const next = { ...prev };
                  delete next[selectedGame.id];
                  return next;
                });
                handleRefreshGames();
                addToast('info', 'Session Stopped', `Stopped tracking session for "${selectedGame.title}".`);
              } catch (err: unknown) {
                const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err);
                addToast('error', 'Failed to stop session', msg);
              }
            }}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        )}
      </div>

      {contextMenuState && (
        <ContextMenu
          x={contextMenuState.x}
          y={contextMenuState.y}
          entries={getGameActions({
            game: contextMenuState.game,
            isRunning: Boolean(activeSessions[contextMenuState.game.id]),
            activeSession: Boolean(activeSessions[contextMenuState.game.id]),
            onStopTracking: async (g) => {
              try {
                await api.stopTrackingSession(g.id);
                setActiveSessions((prev) => {
                  const next = { ...prev };
                  delete next[g.id];
                  return next;
                });
                handleRefreshGames();
                addToast('info', 'Session Stopped', `Stopped tracking session for "${g.title}".`);
              } catch (err: unknown) {
                const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err);
                addToast('error', 'Failed to stop session', msg);
              }
            },
            onPlay: handlePlayFromMenu,
            onLaunchSettings: (g) => {
              setSelectedGame(g);
              setIsDetailPanelOpen(true);
            },
            onToggleFavorite: handleToggleFavoriteFromMenu,
            onToggleHide: handleToggleHideFromMenu,
            onOpenFolder: handleOpenFolderFromMenu,
            onChangeArtwork: (g) => setArtworkPickerGame(g),
            onRefreshMetadata: handleRefreshMetadataFromMenu,
            onEditDetails: (g) => {
              setSelectedGame(g);
              setIsDetailPanelOpen(true);
            },
            onRemoveFromLibrary: (g) => setGameToRemove(g),
          })}
          onClose={() => setContextMenuState(null)}
          originElement={contextMenuState.originElement}
        />
      )}

      {artworkPickerGame && (
        <ArtworkPickerModal
          game={artworkPickerGame}
          isOpen={Boolean(artworkPickerGame)}
          onClose={() => setArtworkPickerGame(null)}
          onArtworkChanged={handleRefreshGames}
          initialRole="cover"
        />
      )}

      {gameToRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-100">
          <div className="w-full max-w-md bg-surface border border-border rounded-dialog shadow-2xl p-5 space-y-4">
            <div className="flex items-center gap-2.5 text-danger border-b border-border pb-2.5">
              <Trash2 className="w-5 h-5 flex-shrink-0" />
              <h3 className="text-sm font-bold text-text">Remove from Library?</h3>
            </div>
            <div className="space-y-2 text-xs leading-relaxed text-text/80">
              <p>
                Are you sure you want to remove <strong>{gameToRemove.title}</strong> from your GameShelf library?
              </p>
              <div className="p-3 bg-surface-2 border border-border rounded-card text-muted text-xs leading-relaxed">
                <strong className="text-text block mb-0.5">Files are safe:</strong>
                This only removes the database entry and custom notes from GameShelf. Your game files, installations, and save data on your disk will <strong>NOT</strong> be deleted.
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setGameToRemove(null)}
                className="px-3.5 py-1.5 rounded-control text-xs text-muted hover:text-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRemoveFromMenu}
                className="px-4 py-1.5 rounded-control bg-danger hover:bg-danger/90 text-white text-xs font-semibold shadow-sm"
              >
                Remove from Library
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Game Modal */}
      <AddGameModal
        isOpen={isAddGameOpen}
        onClose={() => setIsAddGameOpen(false)}
        onGameAdded={handleGameAdded}
        onOpenExisting={(existing) => {
          setSelectedGame(existing);
          setIsDetailPanelOpen(true);
          setIsAddGameOpen(false);
        }}
        onError={(t, m) => addToast('error', t, m)}
      />

      {/* Scan Folder Modal (Phase 4) */}
      <ScanFolderModal
        isOpen={isScanFolderOpen}
        onClose={() => {
          setIsScanFolderOpen(false);
          setScanFolderInitialPath(undefined);
        }}
        onImportComplete={handleRefreshGames}
        initialPath={scanFolderInitialPath}
      />

      {/* Scan & Import ROMs Modal (Phase 5) */}
      <ScanRomsModal
        isOpen={isScanRomsOpen}
        onClose={() => {
          setIsScanRomsOpen(false);
          setScanRomsProfileId(undefined);
          setScanRomsFolderPath(undefined);
        }}
        onImportComplete={handleRefreshGames}
        initialProfileId={scanRomsProfileId}
        initialFolderPath={scanRomsFolderPath}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        appInfo={appInfo}
        settings={settings}
        onUpdateSetting={handleUpdateSetting}
        onRefreshGames={handleRefreshGames}
        onOpenScanFolder={handleOpenScanFolder}
        onOpenScanRoms={handleOpenScanRoms}
      />

      {/* First-Launch Onboarding Wizard (Phase 7) */}
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onComplete={() => {
          setIsOnboardingOpen(false);
          setSettings((prev) => ({ ...prev, onboarding_completed: true }));
        }}
        onOpenScanFolder={handleOpenScanFolder}
        onOpenScanRoms={handleOpenScanRoms}
        onRefreshGames={handleRefreshGames}
      />

      {/* Toast Messages */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
};

export default App;
