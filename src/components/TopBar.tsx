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
    <div className="h-13 min-h-[52px] border-b border-border bg-surface px-5 flex items-center justify-between gap-3 select-none flex-shrink-0">
      <div className="relative flex-1 max-w-xs sm:max-w-sm">
        <Search className="w-3.5 h-3.5 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={localQuery}
          onChange={(e) => setLocalQuery(e.target.value)}
          placeholder="Search library..."
          aria-label="Search library"
          className="w-full bg-surface-2/60  rounded-control pl-8.5 pr-7 py-1 text-xs text-text placeholder-muted/80 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
        />
        {localQuery && (
          <button
            onClick={handleClear}
            aria-label="Clear search query"
            title="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-text p-0.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded-control"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2.5">
        <span className="text-xs text-muted font-mono tabular-nums">
          {totalGames} {totalGames === 1 ? 'game' : 'games'}
        </span>

        <div className="h-3.5 w-px bg-border/80" />

        <div className="flex items-center gap-1.5 bg-surface-2/60  rounded-control px-2 py-1 text-xs text-text focus-within:border-accent focus-within:ring-1 focus-within:ring-accent">
          <ArrowUpDown className="w-3 h-3 text-muted" />
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

        <div className="flex items-center bg-surface-2/60  rounded-control p-0.5" role="group" aria-label="View layout mode">
          <button
            onClick={() => onViewModeChange('grid')}
            title="Grid View"
            aria-label="Switch to grid view"
            aria-pressed={viewMode === 'grid'}
            className={`p-1 rounded-[6px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent ${
              viewMode === 'grid'
                ? 'bg-surface text-text shadow-xs '
                : 'text-muted hover:text-text'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onViewModeChange('list')}
            title="List View"
            aria-label="Switch to list view"
            aria-pressed={viewMode === 'list'}
            className={`p-1 rounded-[6px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent ${
              viewMode === 'list'
                ? 'bg-surface text-text shadow-xs '
                : 'text-muted hover:text-text'
            }`}
          >
            <List className="w-3.5 h-3.5" />
          </button>
        </div>

        {onOpenScanFolder && (
          <button
            onClick={onOpenScanFolder}
            title="Scan Folder for Games"
            className="flex items-center gap-1.5 bg-surface-2/60  hover:bg-surface-2 text-text rounded-control px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
          >
            <FolderSearch className="w-3.5 h-3.5 text-muted" />
            <span>Scan Folder</span>
          </button>
        )}

        {onOpenScanRoms && (
          <button
            onClick={onOpenScanRoms}
            title="Scan & Import ROMs"
            className="flex items-center gap-1.5 bg-surface-2/60  hover:bg-surface-2 text-text rounded-control px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
          >
            <Disc className="w-3.5 h-3.5 text-muted" />
            <span>Scan ROMs</span>
          </button>
        )}

        <button
          onClick={onOpenAddGame}
          title="Add Game Executable or Shortcut"
          className="flex items-center gap-1.5 bg-accent hover:bg-accent-hover text-white rounded-control px-3 py-1 text-xs font-medium shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Game</span>
        </button>
      </div>
    </div>
  );
};
