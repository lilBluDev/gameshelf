import { ArtworkRole } from './models';

export interface GameCandidate {
  provider: string;
  provider_game_id: string;
  name: string;
  release_year?: number | null;
  match_score: number;
  confidence_tier: 'High' | 'Medium' | 'Low';
  steam_app_id?: number | null;
  verified: boolean;
}

export interface ArtworkCandidate {
  provider: string;
  asset_id: string;
  role: ArtworkRole;
  url: string;
  thumb_url?: string | null;
  width?: number | null;
  height?: number | null;
  mime_type?: string | null;
  author_name?: string | null;
  score: number;
  language?: string | null;
}

export interface CacheStats {
  file_count: number;
  total_bytes: number;
  formatted_size: string;
}

export interface SearchMetadataPayload {
  query: string;
  year?: number;
}

export interface GetArtworkCandidatesPayload {
  game_id: string;
  role: string;
  provider_game_id?: string;
}

export interface ApplyArtworkPayload {
  game_id: string;
  candidate: ArtworkCandidate;
}

export interface SelectLocalArtworkPayload {
  game_id: string;
  role: string;
  local_path: string;
}

export interface RemoveArtworkPayload {
  game_id: string;
  role: string;
}

export interface RefreshMetadataPayload {
  game_id: string;
  auto_download_artwork?: boolean;
}

export interface SetLockedFieldsPayload {
  game_id: string;
  locked_fields: string[];
}
