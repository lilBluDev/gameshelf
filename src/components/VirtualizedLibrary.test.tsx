import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VirtualizedLibrary, getColumnCount, getGridRowHeight } from './VirtualizedLibrary';
import { Game } from '../types/models';

function createSyntheticGame(id: number): Game {
  return {
    id: `game-${id}`,
    title: `Synthetic Title ${id}`,
    sort_title: `synthetic title ${id}`,
    source_kind: 'Steam',
    status: 'Installed',
    genres: ['Action'],
    tags: [],
    user_tags: [],
    launch_action: { type: 'Steam', app_id: 1000 + id },
    is_favorite: false,
    is_hidden: false,
    created_at: '2026-01-01T00:00:00Z',
  };
}

describe('VirtualizedLibrary Layout Engine', () => {
  describe('getColumnCount pure function', () => {
    it('returns default fallback on 0 or negative width', () => {
      expect(getColumnCount(0, 'medium')).toBe(4);
      expect(getColumnCount(-50, 'small')).toBe(4);
    });

    it('calculates expected column counts across test widths for small card size', () => {
      expect(getColumnCount(640, 'small')).toBe(4);
      expect(getColumnCount(900, 'small')).toBe(6);
      expect(getColumnCount(1000, 'small')).toBe(6);
      expect(getColumnCount(1350, 'small')).toBe(9);
      expect(getColumnCount(1700, 'small')).toBe(11);
    });

    it('calculates expected column counts across test widths for medium card size', () => {
      expect(getColumnCount(640, 'medium')).toBe(3);
      expect(getColumnCount(900, 'medium')).toBe(4);
      expect(getColumnCount(1000, 'medium')).toBe(5);
      expect(getColumnCount(1350, 'medium')).toBe(7);
      expect(getColumnCount(1700, 'medium')).toBe(9);
    });

    it('calculates expected column counts across test widths for large card size', () => {
      expect(getColumnCount(640, 'large')).toBe(2);
      expect(getColumnCount(900, 'large')).toBe(3);
      expect(getColumnCount(1000, 'large')).toBe(4);
      expect(getColumnCount(1350, 'large')).toBe(5);
      expect(getColumnCount(1700, 'large')).toBe(7);
    });
  });

  describe('getGridRowHeight pure function', () => {
    it('returns default fallback on 0 or negative width/columns', () => {
      expect(getGridRowHeight(0, 4)).toBe(340);
      expect(getGridRowHeight(1000, 0)).toBe(340);
    });

    it('computes proportional 2:3 cover height plus title block and gap', () => {
      const height = getGridRowHeight(1344, 7, 16);
      expect(height).toBeGreaterThan(300);
      expect(height).toBeLessThan(400);
    });
  });

  describe('Component bounded rendering', () => {
    it('renders bounded cards for a large collection', () => {
      const games = Array.from({ length: 100 }, (_, i) => createSyntheticGame(i));
      const onSelect = vi.fn();

      render(
        <div style={{ height: '600px', width: '1000px' }}>
          <VirtualizedLibrary
            games={games}
            viewMode="grid"
            cardSize="medium"
            selectedGame={null}
            onSelectGame={onSelect}
            playtimeTrackingEnabled={false}
          />
        </div>
      );

      const renderedCards = screen.getAllByTestId('game-card');
      expect(renderedCards.length).toBeLessThan(100);
      expect(renderedCards.length).toBeGreaterThan(0);
    });
  });
});
