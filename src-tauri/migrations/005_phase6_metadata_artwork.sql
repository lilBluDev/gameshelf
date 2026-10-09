-- Phase 6: Metadata & Artwork
-- Add locked_fields to game_overrides to persist locked metadata fields and artwork roles across automatic refreshes

ALTER TABLE game_overrides ADD COLUMN locked_fields TEXT DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_artwork_selected ON artwork_assets(game_id, is_selected);
CREATE INDEX IF NOT EXISTS idx_artwork_provider ON artwork_assets(provider, provider_asset_id);
