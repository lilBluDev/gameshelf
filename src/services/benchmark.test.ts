import { describe, it, expect } from 'vitest';
import { Game } from '../types/models';

function generate1000SyntheticFrontendGames(): Game[] {
  const games: Game[] = [];
  const titles = ['Cyber', 'Fantasy', 'Shadow', 'Quest', 'Warrior', 'Odyssey', 'Dark', 'Star', 'Mega', 'Zero'];

  for (let i = 1; i <= 1000; i++) {
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
  const games = generate1000SyntheticFrontendGames();

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
    expect(searchLatency).toBeLessThan(15); // Sub-15ms search across 1,000 items
    console.log(`[FRONTEND BENCHMARK] Filtered 1,000 games for "${q}" in ${searchLatency.toFixed(2)}ms`);
  });

  it('measures multi-field sorting latency across 1,000 items', () => {
    const t0 = performance.now();
    const sorted = [...games].sort((a, b) => a.sort_title.localeCompare(b.sort_title));
    const sortLatency = performance.now() - t0;

    expect(sorted.length).toBe(1000);
    expect(sortLatency).toBeLessThan(60); // Fast sorting across 1,000 items
    console.log(`[FRONTEND BENCHMARK] Sorted 1,000 games by sort_title in ${sortLatency.toFixed(2)}ms`);
  });

  it('measures windowed rendering slice efficiency', () => {
    const windowSize = 60;
    const t0 = performance.now();
    const windowSlice = games.slice(0, windowSize);
    const sliceLatency = performance.now() - t0;

    expect(windowSlice.length).toBe(windowSize);
    expect(sliceLatency).toBeLessThan(1); // Near-instantaneous slice
    console.log(`[FRONTEND BENCHMARK] Window slice of ${windowSize} items extracted in ${sliceLatency.toFixed(3)}ms`);
  });
});
