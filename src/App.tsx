import React, { useEffect, useState, useMemo } from 'react';
import { TitleBar } from './components/TitleBar';
import { Sidebar, NavFilter } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { GameCard } from './components/GameCard';
import { GameDetailPanel } from './components/GameDetailPanel';
import { EmptyState } from './components/EmptyState';
import { SettingsModal } from './components/SettingsModal';
import { AddGameModal } from './components/AddGameModal';
import { ToastContainer, ToastMessage } from './components/Toast';
import { api } from './services/api';
import { AppInfo, AppSettings, CommandError, SortField, ViewMode } from './types/api';
import { Game } from './types/models';

export const App: React.FC = () => {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [settings, setSettings] = useState<AppSettings>({
    theme: 'dark',
    default_view_mode: 'grid',
    grid_card_size: 'medium',
    steam_grid_db_configured: false,
    close_to_tray: false,
  });

  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<NavFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('title');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAddGameOpen, setIsAddGameOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

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

  // Handle setting updates
  const handleUpdateSetting = async (key: string, value: string) => {
    try {
      await api.setSetting(key, value);
      setSettings((prev) => ({
        ...prev,
        [key]: value,
      }));
      if (key === 'default_view_mode') {
        setViewMode(value as ViewMode);
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
    } else if (activeFilter === 'steam') {
      result = result.filter((g) => g.source_kind === 'Steam');
    } else if (activeFilter === 'pc') {
      result = result.filter((g) => g.source_kind === 'Standalone' || g.source_kind === 'Shortcut' || g.source_kind === 'Manual');
    } else if (activeFilter === 'emulated') {
      result = result.filter((g) => g.source_kind === 'Emulated');
    }

    // Search
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

    // Sort
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

  // Dynamic grid column sizing based on settings.grid_card_size
  const gridClasses = useMemo(() => {
    switch (settings.grid_card_size) {
      case 'small':
        return 'grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3';
      case 'large':
        return 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5';
      case 'medium':
      default:
        return 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4';
    }
  }, [settings.grid_card_size]);

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
            onOpenAddGame={() => setIsAddGameOpen(true)}
          />

          {/* Games Display Area */}
          <main className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center h-full text-xs text-muted">
                Loading library...
              </div>
            ) : visibleGames.length === 0 ? (
              <EmptyState
                isSearch={searchQuery.length > 0 || activeFilter !== 'all'}
                onClearSearch={() => {
                  setSearchQuery('');
                  setActiveFilter('all');
                }}
              />
            ) : viewMode === 'grid' ? (
              <div className={gridClasses}>
                {visibleGames.map((game) => (
                  <GameCard
                    key={game.id}
                    game={game}
                    isSelected={selectedGame?.id === game.id}
                    onSelect={setSelectedGame}
                    viewMode="grid"
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-w-4xl mx-auto">
                {visibleGames.map((game) => (
                  <GameCard
                    key={game.id}
                    game={game}
                    isSelected={selectedGame?.id === game.id}
                    onSelect={setSelectedGame}
                    viewMode="list"
                  />
                ))}
              </div>
            )}
          </main>
        </div>

        {/* Right Detail Inspection Panel */}
        {selectedGame && (
          <GameDetailPanel
            game={selectedGame}
            onClose={() => setSelectedGame(null)}
            onGameUpdated={handleGameUpdated}
            onGameRemoved={handleGameRemoved}
            onError={(t, m) => addToast('error', t, m)}
            onSuccess={(t, m) => addToast('success', t, m)}
          />
        )}
      </div>

      {/* Add Game Modal */}
      <AddGameModal
        isOpen={isAddGameOpen}
        onClose={() => setIsAddGameOpen(false)}
        onGameAdded={handleGameAdded}
        onOpenExisting={(existing) => {
          setSelectedGame(existing);
          setIsAddGameOpen(false);
        }}
        onError={(t, m) => addToast('error', t, m)}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        appInfo={appInfo}
        settings={settings}
        onUpdateSetting={handleUpdateSetting}
      />

      {/* Toast Messages */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
};

export default App;
