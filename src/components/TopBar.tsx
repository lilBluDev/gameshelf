import React from 'react';
import { Search, LayoutGrid, List, Plus, ArrowUpDown, X, FolderSearch, Disc } from 'lucide-react';
import { SortField, ViewMode } from '../types/api';

interface TopBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
  sortBy: SortField;
  onSortByChange: (sort: SortField) => void;
  totalGames: number;
  playtimeTrackingEnabled?: boolean;
  onOpenAddGame: () => void;
  onOpenScanFolder?: () => void;
  onOpenScanRoms?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  sortBy,
  onSortByChange,
  totalGames,
  playtimeTrackingEnabled,
  onOpenAddGame,
  onOpenScanFolder,
  onOpenScanRoms,
}) => {
  const [localQuery, setLocalQuery] = React.useState(searchQuery);

  React.useEffect(() => {
    setLocalQuery(searchQuery);
  }, [searchQuery]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (localQuery !== searchQuery) {
        onSearchChange(localQuery);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [localQuery, searchQuery, onSearchChange]);

  const handleClear = () => {
    setLocalQuery('');
    onSearchChange('');
  };

  return (
    <div className="h-14 border-b border-border bg-bg/50 backdrop-blur px-6 flex items-center justify-between gap-4 select-none flex-shrink-0">
      {/* Search Input */}
      <div className="relative flex-1 max-w-md">
        <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={localQuery}
          onChange={(e) => setLocalQuery(e.target.value)}
          placeholder="Search title, developer, tags..."
          aria-label="Search library"
          className="w-full bg-surface border border-border rounded-control pl-9 pr-8 py-1.5 text-xs text-text placeholder-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
        />
        {localQuery && (
          <button
            onClick={handleClear}
            aria-label="Clear search query"
            title="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-text p-0.5 focus:outline-none focus:ring-1 focus:ring-accent rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Total count badge */}
        <span className="text-xs text-muted font-mono">
          {totalGames} {totalGames === 1 ? 'game' : 'games'}
        </span>

        <div className="h-4 w-px bg-border" />

        {/* Sort selector */}
        <div className="flex items-center gap-1.5 bg-surface border border-border rounded-control px-2.5 py-1 text-xs text-text focus-within:border-accent focus-within:ring-1 focus-within:ring-accent">
          <ArrowUpDown className="w-3.5 h-3.5 text-muted" />
          <span className="text-muted text-xs">Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => onSortByChange(e.target.value as SortField)}
            aria-label="Sort library games"
            className="bg-transparent text-text border-none focus:outline-none text-xs cursor-pointer"
          >
            <option value="title" className="bg-surface text-text">Title (A-Z)</option>
            <option value="recently_added" className="bg-surface text-text">Recently Added</option>
            <option value="recently_played" className="bg-surface text-text">Recently Played</option>
            {playtimeTrackingEnabled && (
              <option value="most_played" className="bg-surface text-text">Most Played</option>
            )}
            <option value="release_year" className="bg-surface text-text">Release Year</option>
            <option value="status" className="bg-surface text-text">Status</option>
          </select>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center bg-surface border border-border rounded-control p-0.5">
          <button
            onClick={() => onViewModeChange('grid')}
            title="Grid View"
            aria-label="Switch to grid view"
            className={`p-1.5 rounded-control transition-colors focus:outline-none focus:ring-1 focus:ring-accent ${
              viewMode === 'grid'
                ? 'bg-surface-2 text-text shadow-sm'
                : 'text-muted hover:text-text'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onViewModeChange('list')}
            title="List View"
            aria-label="Switch to list view"
            className={`p-1.5 rounded-control transition-colors focus:outline-none focus:ring-1 focus:ring-accent ${
              viewMode === 'list'
                ? 'bg-surface-2 text-text shadow-sm'
                : 'text-muted hover:text-text'
            }`}
          >
            <List className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Scan Folder Button (Phase 4) */}
        {onOpenScanFolder && (
          <button
            onClick={onOpenScanFolder}
            title="Scan Folder for Games"
            className="flex items-center gap-1.5 bg-surface border border-border hover:bg-surface-2 text-text rounded-control px-3 py-1.5 text-xs font-medium transition-all"
          >
            <FolderSearch className="w-3.5 h-3.5 text-accent" />
            <span>Scan Folder</span>
          </button>
        )}

        {/* Scan ROMs Button (Phase 5) */}
        {onOpenScanRoms && (
          <button
            onClick={onOpenScanRoms}
            title="Scan & Import ROMs"
            className="flex items-center gap-1.5 bg-surface border border-border hover:bg-surface-2 text-text rounded-control px-3 py-1.5 text-xs font-medium transition-all"
          >
            <Disc className="w-3.5 h-3.5 text-accent" />
            <span>Scan ROMs</span>
          </button>
        )}

        {/* Add Game Button (Phase 2) */}
        <button
          onClick={onOpenAddGame}
          title="Add Game Executable or Shortcut"
          className="flex items-center gap-1.5 bg-accent hover:bg-accent-hover text-white rounded-control px-3.5 py-1.5 text-xs font-semibold shadow-sm transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Game</span>
        </button>
      </div>
    </div>
  );
};
