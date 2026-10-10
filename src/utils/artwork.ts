/**
 * Generates deterministic colors and initials for placeholder covers.
 */

const GRADIENT_PALETTES = [
  ['#14171F', '#1C202B'],
  ['#181522', '#221E30'],
  ['#131B22', '#1B2630'],
  ['#141F1A', '#1C2B24'],
  ['#1F161A', '#2B1F25'],
  ['#1A1816', '#252220'],
];

export function getDeterministicGradient(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash << 5) - hash + title.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % GRADIENT_PALETTES.length;
  const [c1, c2] = GRADIENT_PALETTES[index];
  return `linear-gradient(145deg, ${c1} 0%, ${c2} 100%)`;
}

export function getTitleInitials(title: string): string {
  const clean = title.replace(/[^a-zA-Z0-9\s]/g, '').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'GS';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

import { convertFileSrc } from '@tauri-apps/api/core';
import { ArtworkAsset } from '../types/models';

export function resolveArtworkSrc(asset?: ArtworkAsset | null): string | null {
  if (!asset) return null;
  if (asset.cached_path) {
    try {
      return convertFileSrc(asset.cached_path);
    } catch {
      return `http://asset.localhost/${encodeURIComponent(asset.cached_path)}`;
    }
  }
  if (asset.source_url) {
    return asset.source_url;
  }
  return null;
}
