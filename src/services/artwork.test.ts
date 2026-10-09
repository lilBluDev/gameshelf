import { describe, it, expect, beforeEach } from 'vitest';
import {
  getDeterministicGradient,
  getTitleInitials,
  resolveArtworkSrc,
} from '../utils/artwork';
import {
  applyArtworkAsset,
  clearArtworkCache,
  getArtworkCandidates,
  getCacheStats,
  getGameArtwork,
  getLockedFields,
  getSteamGridDbStatus,
  refreshGameMetadata,
  removeArtworkForRole,
  removeSteamGridDbApiKey,
  searchMetadata,
  selectLocalArtwork,
  setLockedFields,
  setSteamGridDbApiKey,
  testSteamGridDbConnection,
} from './artwork';
import { ArtworkAsset } from '../types/models';
import { ArtworkCandidate } from '../types/artwork';

describe('Artwork Utilities', () => {
  it('generates consistent initials for different titles', () => {
    expect(getTitleInitials('Chrono Trigger')).toBe('CT');
    expect(getTitleInitials('Doom')).toBe('DO');
    expect(getTitleInitials('Super Mario 64')).toBe('SM');
    expect(getTitleInitials('')).toBe('GS');
    expect(getTitleInitials('   ')).toBe('GS');
  });

  it('generates deterministic gradient css strings', () => {
    const g1 = getDeterministicGradient('Chrono Trigger');
    const g2 = getDeterministicGradient('Chrono Trigger');
    const g3 = getDeterministicGradient('Final Fantasy VII');

    expect(g1).toContain('linear-gradient(');
    expect(g1).toBe(g2); // Deterministic
    expect(typeof g3).toBe('string');
  });

  it('resolves artwork sources accurately', () => {
    expect(resolveArtworkSrc(null)).toBeNull();
    expect(resolveArtworkSrc(undefined)).toBeNull();

    // From cached local path
    const cachedAsset: ArtworkAsset = {
      id: 'art-1',
      game_id: 'g-1',
      role: 'cover',
      provider: 'steamgriddb',
      provider_asset_id: '123',
      source_url: 'https://example.com/cover.jpg',
      cached_path: 'C:\\Users\\GameShelf\\cache\\art.jpg',
      width: 600,
      height: 900,
      mime_type: 'image/jpeg',
      attribution: 'Artist',
      is_selected: true,
    };
    const resolvedCached = resolveArtworkSrc(cachedAsset);
    expect(resolvedCached).toBeTruthy();
    expect(
      resolvedCached?.includes('asset.localhost') ||
      resolvedCached?.includes('http://') ||
      resolvedCached?.includes('https://')
    ).toBe(true);

    // Fallback to source URL when cached path is missing
    const remoteAsset: ArtworkAsset = {
      ...cachedAsset,
      cached_path: null,
    };
    expect(resolveArtworkSrc(remoteAsset)).toBe('https://example.com/cover.jpg');
  });
});

describe('Artwork and Metadata Service', () => {
  beforeEach(async () => {
    await removeSteamGridDbApiKey();
  });

  it('manages SteamGridDB credential state', async () => {
    expect(await getSteamGridDbStatus()).toBe(false);

    await setSteamGridDbApiKey('secret_sgdb_key_123');
    expect(await getSteamGridDbStatus()).toBe(true);

    const isConnected = await testSteamGridDbConnection();
    expect(isConnected).toBe(true);

    await removeSteamGridDbApiKey();
    expect(await getSteamGridDbStatus()).toBe(false);
  });

  it('searches metadata and retrieves artwork candidates', async () => {
    const candidates = await searchMetadata('Terraria');
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].name).toBe('Terraria');
    expect(candidates[0].confidence_tier).toBe('High');

    const artworkList = await getArtworkCandidates('game-123', 'cover');
    expect(artworkList.length).toBeGreaterThan(0);
    expect(artworkList[0].role).toBe('cover');
    expect(artworkList[0].url).toContain('https://');
  });

  it('applies, selects local, and removes artwork assets', async () => {
    const candidate: ArtworkCandidate = {
      provider: 'steamgriddb',
      asset_id: 'sgdb-999',
      role: 'cover',
      url: 'https://images.example.com/art.jpg',
      thumb_url: 'https://images.example.com/thumb.jpg',
      width: 600,
      height: 900,
      mime_type: 'image/jpeg',
      author_name: 'Artist99',
      score: 95,
      language: 'en',
    };

    // Apply remote candidate
    const applied = await applyArtworkAsset('game-test-1', candidate);
    expect(applied.role).toBe('cover');
    expect(applied.is_selected).toBe(true);

    // Select local file for hero
    const localHero = await selectLocalArtwork('game-test-1', 'hero', 'C:/wallpapers/hero.png');
    expect(localHero.role).toBe('hero');
    expect(localHero.provider).toBe('local');
    expect(localHero.cached_path).toBe('C:/wallpapers/hero.png');

    // Retrieve active artwork for game
    const gameArt = await getGameArtwork('game-test-1');
    expect(gameArt.cover).toBeDefined();
    expect(gameArt.hero).toBeDefined();

    // Remove cover artwork
    await removeArtworkForRole('game-test-1', 'cover');
    const updatedArt = await getGameArtwork('game-test-1');
    expect(updatedArt.cover).toBeUndefined();
    expect(updatedArt.hero).toBeDefined();
  });

  it('queries cache stats and clears cache', async () => {
    const stats = await getCacheStats();
    expect(stats.file_count).toBeGreaterThanOrEqual(0);
    expect(stats.formatted_size).toBeDefined();

    const clearedCount = await clearArtworkCache();
    expect(clearedCount).toBeGreaterThanOrEqual(0);
  });

  it('manages locked fields for preventing automatic overwrites', async () => {
    expect(await getLockedFields('game-locked-test')).toEqual([]);

    await setLockedFields('game-locked-test', ['cover', 'title', 'genres']);
    const locked = await getLockedFields('game-locked-test');
    expect(locked).toContain('cover');
    expect(locked).toContain('title');
    expect(locked).toContain('genres');
    expect(locked.length).toBe(3);
  });

  it('triggers metadata refresh for game', async () => {
    const refreshed = await refreshGameMetadata('game-ref-1', true);
    expect(refreshed.id).toBe('game-ref-1');
  });
});
