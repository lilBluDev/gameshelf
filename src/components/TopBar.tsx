import React from 'react';
import { Search, LayoutGrid, List, Plus, ArrowUpDown, X } from 'lucide-react';
import { ViewMode } from '../types/api';

interface TopBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
  sortBy: 'title' | 'release_year' | 'status';
  onSortByChange: (sort: 'title' | 'release_year' | 'status') => void;
  totalGames: number;
}

export const TopBar: React.FC<TopBarProps> = ({
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  sortBy,
  onSortByChange,
  totalGames,
}) => {
  return (
    <div className="h-14 border-b border-border bg-bg/50 backdrop-blur px-6 flex items-center justify-between gap-4 select-none flex-shrink-0">
      {/* Search Input */}
      <div className="relative flex-1 max-w-md">
        <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search games, developers, tags..."
          className="w-full bg-surface border border-border rounded-control pl-9 pr-8 py-1.5 text-xs text-text placeholder-muted focus:outline-none focus:border-accent transition-colors"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-text p-0.5"
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
        <div className="flex items-center gap-1.5 bg-surface border border-border rounded-control px-2.5 py-1 text-xs text-text">
          <ArrowUpDown className="w-3.5 h-3.5 text-muted" />
          <span className="text-muted text-[11px]">Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => onSortByChange(e.target.value as 'title' | 'release_year' | 'status')}
            className="bg-transparent text-text border-none focus:outline-none text-xs cursor-pointer"
          >
            <option value="title" className="bg-surface text-text">Title (A-Z)</option>
            <option value="release_year" className="bg-surface text-text">Release Year</option>
            <option value="status" className="bg-surface text-text">Status</option>
          </select>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center bg-surface border border-border rounded-control p-0.5">
          <button
            onClick={() => onViewModeChange('grid')}
            title="Grid View"
            className={`p-1.5 rounded-control transition-colors ${
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
            className={`p-1.5 rounded-control transition-colors ${
              viewMode === 'list'
                ? 'bg-surface-2 text-text shadow-sm'
                : 'text-muted hover:text-text'
            }`}
          >
            <List className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Add Game Button (Disabled until Phase 2) */}
        <button
          disabled
          title="Game importing is coming in Phase 2"
          className="flex items-center gap-1.5 bg-accent/30 text-accent border border-accent/20 rounded-control px-3 py-1.5 text-xs font-medium cursor-not-allowed opacity-60 transition-opacity"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Game</span>
          <span className="text-[10px] bg-bg/60 px-1 py-0.2 rounded text-muted font-mono">
            Phase 2
          </span>
        </button>
      </div>
    </div>
  );
};
