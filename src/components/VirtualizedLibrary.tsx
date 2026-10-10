import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer, observeElementRect } from '@tanstack/react-virtual';
import { Game } from '../types/models';
import { GameCard } from './GameCard';

export interface VirtualizedLibraryProps {
  games: Game[];
  viewMode: 'grid' | 'list';
  cardSize: 'small' | 'medium' | 'large';
  selectedGame: Game | null;
  onSelectGame: (game: Game) => void;
  playtimeTrackingEnabled: boolean;
  onContextMenu?: (
    game: Game,
    event: React.MouseEvent | { clientX: number; clientY: number },
    targetElement?: HTMLElement
  ) => void;
}

export function getColumnCount(width: number, size: 'small' | 'medium' | 'large'): number {
  if (width <= 0) return 4;
  const gap = 16;
  const minCardWidth = {
    small: 132,
    medium: 168,
    large: 216,
  }[size] || 168;
  return Math.max(1, Math.floor((width + gap) / (minCardWidth + gap)));
}

export function getGridRowHeight(width: number, columns: number, gap: number = 16): number {
  if (width <= 0 || columns <= 0) return 340;
  const actualCardWidth = Math.max(80, (width - (columns - 1) * gap) / columns);
  const coverHeight = Math.round(actualCardWidth * 1.5);
  const titleBlockHeight = 52;
  return coverHeight + titleBlockHeight + gap;
}

export const VirtualizedLibrary: React.FC<VirtualizedLibraryProps> = ({
  games,
  viewMode,
  cardSize,
  selectedGame,
  onSelectGame,
  playtimeTrackingEnabled,
  onContextMenu,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const scrollOffsetRef = useRef<number>(0);
  const [containerWidth, setContainerWidth] = useState(1024);

  useEffect(() => {
    if (!parentRef.current) return;
    const updateWidth = () => {
      if (parentRef.current && parentRef.current.clientWidth > 0) {
        setContainerWidth(parentRef.current.clientWidth);
      }
    };
    updateWidth();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => updateWidth());
      observer.observe(parentRef.current);
      return () => observer.disconnect();
    }
  }, []);

  const columnCount = useMemo(() => {
    if (viewMode === 'list') return 1;
    return getColumnCount(containerWidth, cardSize);
  }, [viewMode, containerWidth, cardSize]);

  const rowCount = useMemo(() => {
    if (columnCount <= 1) return games.length;
    return Math.ceil(games.length / columnCount);
  }, [games.length, columnCount]);

  const rowHeight = useMemo(() => {
    if (viewMode === 'list') return 54;
    return getGridRowHeight(containerWidth, columnCount, 16);
  }, [viewMode, containerWidth, columnCount]);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 3,
    observeElementRect: (instance, cb) => {
      return observeElementRect(instance, (rect) => {
        const width = rect.width > 0 ? rect.width : (parentRef.current?.clientWidth || 1024);
        const height = rect.height > 0 ? rect.height : (parentRef.current?.clientHeight || 800);
        cb({ width, height });
      });
    },
  });

  useEffect(() => {
    if (parentRef.current && scrollOffsetRef.current > 0) {
      parentRef.current.scrollTop = scrollOffsetRef.current;
    }
  }, [viewMode]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    scrollOffsetRef.current = e.currentTarget.scrollTop;
  };

  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <main
      ref={parentRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto p-5 sm:p-6"
      data-testid="virtualized-scroll-container"
    >
      <div
        data-testid="virtual-total-container"
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualRow) => {
          if (viewMode === 'list') {
            const game = games[virtualRow.index];
            if (!game) return null;
            return (
              <div
                key={game.id}
                data-index={virtualRow.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div className="max-w-4xl mx-auto mb-1">
                  <GameCard
                    game={game}
                    isSelected={selectedGame?.id === game.id}
                    onSelect={onSelectGame}
                    viewMode="list"
                    playtimeTrackingEnabled={playtimeTrackingEnabled}
                    onContextMenu={onContextMenu}
                  />
                </div>
              </div>
            );
          }

          const startIndex = virtualRow.index * columnCount;
          const rowGames = games.slice(startIndex, startIndex + columnCount);

          return (
            <div
              key={virtualRow.index}
              data-index={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                  gap: '16px',
                }}
              >
                {rowGames.map((game) => (
                  <GameCard
                    key={game.id}
                    game={game}
                    isSelected={selectedGame?.id === game.id}
                    onSelect={onSelectGame}
                    viewMode="grid"
                    playtimeTrackingEnabled={playtimeTrackingEnabled}
                    onContextMenu={onContextMenu}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
};
