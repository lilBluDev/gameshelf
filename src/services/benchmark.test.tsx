import { describe, it, expect } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { Game } from '../types/models';
import { VirtualizedLibrary } from '../components/VirtualizedLibrary';

function generateSyntheticGames(count: number): Game[] {
  const games: Game[] = [];
  const titles = ['Cyber', 'Fantasy', 'Shadow', 'Quest', 'Warrior', 'Odyssey', 'Dark', 'Star', 'Mega', 'Zero'];

  for (let i = 1; i <= count; i++) {
    const word = titles[i % titles.length];
    games.push({
      id: `synth-${i}`,
      title: `${word} Adventure #${i}`,
      sort_title: `${word} adventure #${i}`.toLowerCase(),
      description: `Synthetic benchmark game item #${i}`,
      developer: `Studio ${i % 25}`,
      publisher: `Publisher ${i % 15}`,
      release_year: 1995 + (i % 30),
      genres: ['Action', 'RPG'],
      tags: ['Benchmark', `Tag${i % 10}`],
      source_kind: i % 3 === 0 ? 'Steam' : i % 3 === 1 ? 'Standalone' : 'Emulated',
      source_id: `${100000 + i}`,
      launch_action: { type: 'Steam', app_id: 100000 + i },
      status: 'Installed',
      is_favorite: i % 10 === 0,
      is_hidden: false,
      user_tags: [`Custom${i % 5}`],
    });
  }

  return games;
}

describe('Frontend 1,000 Games Performance Benchmark', () => {
  const games = generateSyntheticGames(1000);

  it('verifies 1,000 games dataset generation', () => {
    expect(games.length).toBe(1000);
  });

  it('measures search latency across 1,000 items', () => {
    const q = 'cyber';
    const t0 = performance.now();
    const filtered = games.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        g.developer?.toLowerCase().includes(q) ||
        g.user_tags.some((t) => t.toLowerCase().includes(q))
    );
    const searchLatency = performance.now() - t0;

    expect(filtered.length).toBe(100);
    expect(searchLatency).toBeLessThan(15);
    console.log(`[FRONTEND BENCHMARK] Filtered 1,000 games for "${q}" in ${searchLatency.toFixed(2)}ms`);
  });

  it('measures multi-field sorting latency across 1,000 items', () => {
    const t0 = performance.now();
    const sorted = [...games].sort((a, b) => a.sort_title.localeCompare(b.sort_title));
    const sortLatency = performance.now() - t0;

    expect(sorted.length).toBe(1000);
    expect(sortLatency).toBeLessThan(60);
    console.log(`[FRONTEND BENCHMARK] Sorted 1,000 games by sort_title in ${sortLatency.toFixed(2)}ms`);
  });

  it('mounts 5,000 synthetic games with bounded DOM card count before and after scroll', async () => {
    const games5k = generateSyntheticGames(5000);
    expect(games5k.length).toBe(5000);

    const { container } = render(
      <VirtualizedLibrary
        games={games5k}
        viewMode="grid"
        cardSize="medium"
        selectedGame={null}
        onSelectGame={() => {}}
        playtimeTrackingEnabled={false}
      />
    );

    const scrollContainer = container.querySelector('[data-testid="virtualized-scroll-container"]') as HTMLDivElement;
    expect(scrollContainer).toBeTruthy();

    const initialCards = container.querySelectorAll('[data-testid="game-card"]');
    const initialCount = initialCards.length;
    console.log(`[DOM BENCHMARK] Initial 5,000 games rendered card count: ${initialCount}`);

    expect(initialCount).toBeGreaterThan(0);
    expect(initialCount).toBeLessThan(60);

    const totalContainer = container.querySelector('[data-testid="virtual-total-container"]') as HTMLDivElement;
    const totalHeight = parseFloat(totalContainer.style.height || '0');
    expect(totalHeight).toBeGreaterThan(100000);

    await act(async () => {
      scrollContainer.scrollTop = totalHeight - 800;
      fireEvent.scroll(scrollContainer);
    });

    const scrolledCards = container.querySelectorAll('[data-testid="game-card"]');
    const scrolledCount = scrolledCards.length;
    console.log(`[DOM BENCHMARK] Scrolled-to-end 5,000 games rendered card count: ${scrolledCount}`);

    expect(scrolledCount).toBeGreaterThan(0);
    expect(scrolledCount).toBeLessThan(60);
  });
});
