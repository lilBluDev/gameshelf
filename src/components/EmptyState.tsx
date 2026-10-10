import React from 'react';
import { Gamepad2, SearchX, Plus, FolderSearch, Disc } from 'lucide-react';

interface EmptyStateProps {
  isSearch: boolean;
  onClearSearch?: () => void;
  onOpenAddGame?: () => void;
  onOpenScanFolder?: () => void;
  onOpenScanRoms?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  isSearch,
  onClearSearch,
  onOpenAddGame,
  onOpenScanFolder,
  onOpenScanRoms,
}) => {
  if (isSearch) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center h-full">
        <div className="w-16 h-16 rounded-full bg-surface-2 border border-border flex items-center justify-center mb-4 text-muted">
          <SearchX className="w-8 h-8" />
        </div>
        <h3 className="text-base font-semibold text-text mb-1">No matching games</h3>
        <p className="text-xs text-muted max-w-sm mb-4">
          We couldn't find any games matching your current search or filters.
        </p>
        {onClearSearch && (
          <button
            onClick={onClearSearch}
            className="px-3.5 py-1.5 rounded-control bg-surface-2 text-xs text-text hover:bg-border transition-colors font-medium"
          >
            Clear Filters
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-12 text-center h-full max-w-md mx-auto">
      <div className="w-20 h-20 rounded-dialog bg-surface border border-border flex items-center justify-center mb-5 text-accent shadow-inner">
        <Gamepad2 className="w-10 h-10" />
      </div>
      <h3 className="text-lg font-semibold text-text mb-2">Your shelf is empty</h3>
      <p className="text-xs text-muted leading-relaxed mb-6">
        GameShelf discovers your installed PC games, Steam titles, and DRM-free directories with safe, local-first performance.
      </p>

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row items-center gap-3 w-full justify-center">
        {onOpenScanFolder && (
          <button
            onClick={onOpenScanFolder}
            className="flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2.5 rounded-control bg-accent hover:bg-accent-hover text-white text-xs font-semibold shadow-lg shadow-accent/20 transition-all"
          >
            <FolderSearch className="w-4 h-4" />
            <span>Scan Folder for Games</span>
          </button>
        )}
        {onOpenScanRoms && (
          <button
            onClick={onOpenScanRoms}
            className="flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2.5 rounded-control bg-surface hover:bg-surface-2 text-text text-xs font-medium transition-all"
          >
            <Disc className="w-4 h-4 text-accent" />
            <span>Scan for ROMs</span>
          </button>
        )}
        {onOpenAddGame && (
          <button
            onClick={onOpenAddGame}
            className="flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2.5 rounded-control bg-surface hover:bg-surface-2 text-text text-xs font-medium transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add Single Game</span>
          </button>
        )}
      </div>
    </div>
  );
};

