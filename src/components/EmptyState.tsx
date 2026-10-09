import React from 'react';
import { Gamepad2, SearchX } from 'lucide-react';

interface EmptyStateProps {
  isSearch: boolean;
  onClearSearch?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ isSearch, onClearSearch }) => {
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
            className="px-3.5 py-1.5 rounded-control bg-surface-2 border border-border text-xs text-text hover:bg-border transition-colors font-medium"
          >
            Clear Filters
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-12 text-center h-full max-w-md mx-auto">
      <div className="w-20 h-20 rounded-2xl bg-surface border border-border flex items-center justify-center mb-5 text-accent shadow-inner">
        <Gamepad2 className="w-10 h-10" />
      </div>
      <h3 className="text-lg font-semibold text-text mb-2">Your shelf is empty</h3>
      <p className="text-xs text-muted leading-relaxed mb-6">
        GameShelf stores your games in a fast, local-first SQLite database. Scanner support for Steam, standalone executables, and emulator ROMs arrives in Phase 2.
      </p>

      <div className="w-full bg-surface-2/60 border border-border rounded-card p-3 text-left">
        <div className="text-[11px] font-semibold text-text mb-1 flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent" />
          Next Phase: Game Import & Scanner
        </div>
        <p className="text-[11px] text-muted leading-normal">
          In Phase 2, automated folder scanning, Steam library detection, and manual executable linking will populate this grid.
        </p>
      </div>
    </div>
  );
};
