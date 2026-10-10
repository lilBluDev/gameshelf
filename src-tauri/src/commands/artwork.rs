use serde::Deserialize;
use std::collections::HashMap;
use std::path::Path;
use tauri::State;
use tracing::{info, warn};

use crate::cache::artwork::CacheStats;
use crate::db::schema::{ArtworkAsset, Game, LaunchAction};
use crate::error::{AppError, AppResult};
use crate::metadata::matching::ConfidenceTier;
use crate::metadata::provider::{ArtworkCandidate, ArtworkRole, GameCandidate, MetadataProvider};
use crate::metadata::steamgriddb::SteamGridDbClient;
use crate::platform::credentials;
use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct SearchMetadataPayload {
    pub query: String,
    pub year: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct GetArtworkCandidatesPayload {
    pub game_id: String,
    pub role: String,
    pub provider_game_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ApplyArtworkPayload {
    pub game_id: String,
    pub candidate: ArtworkCandidate,
}

#[derive(Debug, Deserialize)]
pub struct SelectLocalArtworkPayload {
    pub game_id: String,
    pub role: String,
    pub local_path: String,
}

#[derive(Debug, Deserialize)]
pub struct RemoveArtworkPayload {
    pub game_id: String,
    pub role: String,
}

#[derive(Debug, Deserialize)]
pub struct RefreshMetadataPayload {
    pub game_id: String,
    #[serde(default)]
    pub auto_download_artwork: bool,
}

#[derive(Debug, Deserialize)]
pub struct SetLockedFieldsPayload {
    pub game_id: String,
    pub locked_fields: Vec<String>,
}

/// Helper to create a SteamGridDbClient with the stored credential
fn get_sgdb_client() -> AppResult<Option<SteamGridDbClient>> {
    match credentials::get_steamgriddb_key()? {
        Some(key) => Ok(Some(SteamGridDbClient::new(Some(key)))),
        None => Ok(None),
    }
}

/// Helper: generates fallback Steam CDN candidates for a Steam game
fn get_steam_cdn_candidates(app_id: u32, role: ArtworkRole) -> Vec<ArtworkCandidate> {
    let mut candidates = Vec::new();
    match role {
        ArtworkRole::Cover => {
            candidates.push(ArtworkCandidate {
                provider: "steam_cdn".to_string(),
                asset_id: format!("steam_lib_600x900_{}", app_id),
                role,
                url: format!(
                    "https://cdn.cloudflare.steamstatic.com/steam/apps/{}/library_600x900_2x.jpg",
                    app_id
                ),
                thumb_url: Some(format!(
                    "https://cdn.cloudflare.steamstatic.com/steam/apps/{}/header.jpg",
                    app_id
                )),
                width: Some(600),
                height: Some(900),
                mime_type: Some("image/jpeg".to_string()),
                author_name: Some("Steam Official".to_string()),
                score: 100,
                language: Some("en".to_string()),
            });
            candidates.push(ArtworkCandidate {
                provider: "steam_cdn".to_string(),
                asset_id: format!("steam_header_{}", app_id),
                role,
                url: format!(
                    "https://cdn.cloudflare.steamstatic.com/steam/apps/{}/header.jpg",
                    app_id
                ),
                thumb_url: Some(format!(
                    "https://cdn.cloudflare.steamstatic.com/steam/apps/{}/header.jpg",
                    app_id
                )),
                width: Some(460),
                height: Some(215),
                mime_type: Some("image/jpeg".to_string()),
                author_name: Some("Steam Header".to_string()),
                score: 80,
                language: Some("en".to_string()),
            });
        }
        ArtworkRole::Hero => {
            candidates.push(ArtworkCandidate {
                provider: "steam_cdn".to_string(),
                asset_id: format!("steam_hero_{}", app_id),
                role,
                url: format!(
                    "https://cdn.cloudflare.steamstatic.com/steam/apps/{}/library_hero.jpg",
                    app_id
                ),
                thumb_url: None,
                width: Some(1920),
                height: Some(620),
                mime_type: Some("image/jpeg".to_string()),
                author_name: Some("Steam Official".to_string()),
                score: 100,
                language: Some("en".to_string()),
            });
        }
        ArtworkRole::Logo => {
            candidates.push(ArtworkCandidate {
                provider: "steam_cdn".to_string(),
                asset_id: format!("steam_logo_{}", app_id),
                role,
                url: format!(
                    "https://cdn.cloudflare.steamstatic.com/steam/apps/{}/logo.png",
                    app_id
                ),
                thumb_url: None,
                width: Some(640),
                height: Some(360),
                mime_type: Some("image/png".to_string()),
                author_name: Some("Steam Official".to_string()),
                score: 100,
                language: Some("en".to_string()),
            });
        }
        ArtworkRole::Icon => {
            candidates.push(ArtworkCandidate {
                provider: "steam_cdn".to_string(),
                asset_id: format!("steam_icon_{}", app_id),
                role,
                url: format!(
                    "https://cdn.cloudflare.steamstatic.com/steam/apps/{}/capsule_184x69.jpg",
                    app_id
                ),
                thumb_url: None,
                width: Some(184),
                height: Some(69),
                mime_type: Some("image/jpeg".to_string()),
                author_name: Some("Steam Capsule".to_string()),
                score: 70,
                language: Some("en".to_string()),
            });
        }
        ArtworkRole::Background => {
            candidates.push(ArtworkCandidate {
                provider: "steam_cdn".to_string(),
                asset_id: format!("steam_bg_{}", app_id),
                role,
                url: format!(
                    "https://cdn.cloudflare.steamstatic.com/steam/apps/{}/page_bg_generated_v6b.jpg",
                    app_id
                ),
                thumb_url: None,
                width: Some(1920),
                height: Some(1080),
                mime_type: Some("image/jpeg".to_string()),
                author_name: Some("Steam Background".to_string()),
                score: 90,
                language: Some("en".to_string()),
            });
        }
    }
    candidates
}

#[tauri::command]
pub async fn get_steamgriddb_status() -> AppResult<bool> {
    credentials::has_steamgriddb_key()
}

#[tauri::command]
pub async fn set_steamgriddb_api_key(key: String) -> AppResult<()> {
    credentials::set_steamgriddb_key(&key)
}

#[tauri::command]
pub async fn remove_steamgriddb_api_key() -> AppResult<()> {
    credentials::delete_steamgriddb_key()
}

#[tauri::command]
pub async fn test_steamgriddb_connection(key: Option<String>) -> AppResult<bool> {
    let test_key = match key {
        Some(k) if !k.trim().is_empty() => k,
        _ => match credentials::get_steamgriddb_key()? {
            Some(k) => k,
            None => {
                return Err(AppError::Provider(
                    "No SteamGridDB API key provided".to_string(),
                ))
            }
        },
    };

    let client = SteamGridDbClient::new(Some(test_key));
    client.test_connection().await
}

#[tauri::command]
pub async fn search_metadata(payload: SearchMetadataPayload) -> AppResult<Vec<GameCandidate>> {
    let client = match get_sgdb_client()? {
        Some(c) => c,
        None => return Ok(Vec::new()),
    };

    client.search_games(&payload.query, payload.year).await
}

#[tauri::command]
pub async fn get_artwork_candidates(
    state: State<'_, AppState>,
    payload: GetArtworkCandidatesPayload,
) -> AppResult<Vec<ArtworkCandidate>> {
    let role = ArtworkRole::from_str_loose(&payload.role).unwrap_or(ArtworkRole::Cover);
    let mut candidates = Vec::new();

    let game = state.db.get_game_by_id(&payload.game_id)?;

    // If game has Steam App ID, offer Steam CDN public artwork
    let steam_app_id = game.as_ref().and_then(|g| match &g.launch_action {
        LaunchAction::Steam { app_id } => Some(*app_id),
        _ => g
            .source_id
            .as_deref()
            .and_then(|sid| sid.parse::<u32>().ok()),
    });

    if let Some(app_id) = steam_app_id {
        let steam_cands = get_steam_cdn_candidates(app_id, role);
        candidates.extend(steam_cands);
    }

    // If SteamGridDB is configured, query SGDB assets
    if let Some(client) = get_sgdb_client()? {
        let sgdb_game_id = if let Some(id) = payload.provider_game_id {
            Some(id)
        } else if let Some(app_id) = steam_app_id {
            match client.lookup_by_steam_app_id(app_id).await {
                Ok(Some(c)) => Some(c.provider_game_id),
                _ => None,
            }
        } else if let Some(ref g) = game {
            // Search by game title
            match client.search_games(&g.title, g.release_year).await {
                Ok(list) => list.into_iter().next().map(|c| c.provider_game_id),
                _ => None,
            }
        } else {
            None
        };

        if let Some(id) = sgdb_game_id {
            match client.get_artwork(&id, role).await {
                Ok(sgdb_cands) => {
                    // Prepend SGDB assets before CDN fallbacks
                    let mut combined = sgdb_cands;
                    combined.extend(candidates);
                    candidates = combined;
                }
                Err(e) => {
                    warn!(error = ?e, "Failed to fetch artwork from SteamGridDB");
                }
            }
        }
    }

    Ok(candidates)
}

#[tauri::command]
pub async fn apply_artwork_asset(
    state: State<'_, AppState>,
    payload: ApplyArtworkPayload,
) -> AppResult<ArtworkAsset> {
    let cand = payload.candidate;
    let downloaded = state
        .artwork_cache
        .download_and_validate(&payload.game_id, cand.role, &cand.asset_id, &cand.url)
        .await?;

    let asset = ArtworkAsset {
        id: uuid::Uuid::new_v4().to_string(),
        game_id: payload.game_id.clone(),
        role: cand.role.as_str().to_string(),
        provider: cand.provider,
        provider_asset_id: Some(cand.asset_id),
        source_url: Some(cand.url),
        cached_path: Some(downloaded.cached_path.to_string_lossy().to_string()),
        width: Some(downloaded.width),
        height: Some(downloaded.height),
        mime_type: Some(downloaded.mime_type),
        attribution: cand.author_name,
        is_selected: true,
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    let db = state.db.clone();
    let asset_clone = asset.clone();
    let gid = payload.game_id.clone();
    tokio::task::spawn_blocking(move || -> AppResult<()> {
        db.save_artwork_asset(&asset_clone)?;
        db.select_artwork_asset(&gid, &asset_clone.id)?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::Internal(format!("Artwork task failed: {}", e)))??;

    info!(
        game_id = %payload.game_id,
        role = %asset.role,
        "Artwork asset successfully applied and selected"
    );

    Ok(asset)
}

#[tauri::command]
pub async fn select_local_artwork(
    state: State<'_, AppState>,
    payload: SelectLocalArtworkPayload,
) -> AppResult<ArtworkAsset> {
    let role = ArtworkRole::from_str_loose(&payload.role).unwrap_or(ArtworkRole::Cover);
    let path = Path::new(&payload.local_path);

    let downloaded = state
        .artwork_cache
        .import_local_image(&payload.game_id, role, path)?;

    let asset = ArtworkAsset {
        id: uuid::Uuid::new_v4().to_string(),
        game_id: payload.game_id.clone(),
        role: role.as_str().to_string(),
        provider: "local".to_string(),
        provider_asset_id: None,
        source_url: None,
        cached_path: Some(downloaded.cached_path.to_string_lossy().to_string()),
        width: Some(downloaded.width),
        height: Some(downloaded.height),
        mime_type: Some(downloaded.mime_type),
        attribution: Some("Custom Local File".to_string()),
        is_selected: true,
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    let db = state.db.clone();
    let asset_clone = asset.clone();
    let gid = payload.game_id.clone();
    tokio::task::spawn_blocking(move || -> AppResult<()> {
        db.save_artwork_asset(&asset_clone)?;
        db.select_artwork_asset(&gid, &asset_clone.id)?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::Internal(format!("Local artwork task failed: {}", e)))??;

    info!(
        game_id = %payload.game_id,
        role = %asset.role,
        "Local artwork asset successfully selected"
    );

    Ok(asset)
}

#[tauri::command]
pub async fn remove_artwork_for_role(
    state: State<'_, AppState>,
    payload: RemoveArtworkPayload,
) -> AppResult<()> {
    state
        .db
        .remove_selected_artwork(&payload.game_id, &payload.role)
}

#[tauri::command]
pub async fn get_game_artwork(
    state: State<'_, AppState>,
    game_id: String,
) -> AppResult<HashMap<String, ArtworkAsset>> {
    state.db.get_selected_artwork(&game_id)
}

#[tauri::command]
pub async fn get_cache_stats(state: State<'_, AppState>) -> AppResult<CacheStats> {
    state.artwork_cache.get_stats()
}

#[tauri::command]
pub async fn clear_artwork_cache(state: State<'_, AppState>) -> AppResult<usize> {
    state.artwork_cache.clear_cache()
}

#[tauri::command]
pub async fn refresh_game_metadata(
    state: State<'_, AppState>,
    payload: RefreshMetadataPayload,
) -> AppResult<Game> {
    let game = state
        .db
        .get_game_by_id(&payload.game_id)?
        .ok_or_else(|| AppError::Internal(format!("Game not found: {}", payload.game_id)))?;

    let locked = state.db.get_locked_fields(&payload.game_id)?;

    // If client is available, search for candidate
    if let Some(client) = get_sgdb_client()? {
        let candidate = match &game.launch_action {
            LaunchAction::Steam { app_id } => client
                .lookup_by_steam_app_id(*app_id)
                .await
                .unwrap_or_default(),
            _ => match client.search_games(&game.title, game.release_year).await {
                Ok(list) => list
                    .into_iter()
                    .find(|c| c.confidence_tier == ConfidenceTier::High || c.match_score >= 0.85),
                Err(_) => None,
            },
        };

        if let Some(c) = candidate {
            // Update metadata without overwriting locked fields
            let provider_attribution = format!("SteamGridDB ({})", c.provider_game_id);
            state.db.update_game_metadata_from_provider(
                &payload.game_id,
                None,
                None,
                None,
                c.release_year,
                None,
                None,
                Some(c.match_score),
                Some(&provider_attribution),
            )?;

            // If auto download artwork is requested, download missing roles that are not locked
            if payload.auto_download_artwork {
                let existing_artwork = state.db.get_selected_artwork(&payload.game_id)?;
                let roles = [
                    ArtworkRole::Cover,
                    ArtworkRole::Hero,
                    ArtworkRole::Logo,
                    ArtworkRole::Icon,
                ];

                for role in roles {
                    let role_str = role.as_str();
                    if locked.contains(role_str) || existing_artwork.contains_key(role_str) {
                        continue;
                    }

                    if let Ok(cands) = client.get_artwork(&c.provider_game_id, role).await {
                        if let Some(top_cand) = cands.into_iter().next() {
                            if let Ok(downloaded) = state
                                .artwork_cache
                                .download_and_validate(
                                    &payload.game_id,
                                    role,
                                    &top_cand.asset_id,
                                    &top_cand.url,
                                )
                                .await
                            {
                                let asset = ArtworkAsset {
                                    id: uuid::Uuid::new_v4().to_string(),
                                    game_id: payload.game_id.clone(),
                                    role: role.as_str().to_string(),
                                    provider: top_cand.provider,
                                    provider_asset_id: Some(top_cand.asset_id),
                                    source_url: Some(top_cand.url),
                                    cached_path: Some(
                                        downloaded.cached_path.to_string_lossy().to_string(),
                                    ),
                                    width: Some(downloaded.width),
                                    height: Some(downloaded.height),
                                    mime_type: Some(downloaded.mime_type),
                                    attribution: top_cand.author_name,
                                    is_selected: true,
                                    created_at: chrono::Utc::now().to_rfc3339(),
                                };
                                let _ = state.db.save_artwork_asset(&asset);
                                let _ = state.db.select_artwork_asset(&payload.game_id, &asset.id);
                            }
                        }
                    }
                }
            }
        }
    } else {
        // Fallback: If Steam game and no SGDB key, auto-fetch Steam CDN cover if missing
        if let LaunchAction::Steam { app_id } = game.launch_action {
            let existing_artwork = state.db.get_selected_artwork(&payload.game_id)?;
            if !existing_artwork.contains_key("cover") && !locked.contains("cover") {
                let steam_covers = get_steam_cdn_candidates(app_id, ArtworkRole::Cover);
                if let Some(top_cover) = steam_covers.into_iter().next() {
                    if let Ok(downloaded) = state
                        .artwork_cache
                        .download_and_validate(
                            &payload.game_id,
                            ArtworkRole::Cover,
                            &top_cover.asset_id,
                            &top_cover.url,
                        )
                        .await
                    {
                        let asset = ArtworkAsset {
                            id: uuid::Uuid::new_v4().to_string(),
                            game_id: payload.game_id.clone(),
                            role: "cover".to_string(),
                            provider: top_cover.provider,
                            provider_asset_id: Some(top_cover.asset_id),
                            source_url: Some(top_cover.url),
                            cached_path: Some(downloaded.cached_path.to_string_lossy().to_string()),
                            width: Some(downloaded.width),
                            height: Some(downloaded.height),
                            mime_type: Some(downloaded.mime_type),
                            attribution: top_cover.author_name,
                            is_selected: true,
                            created_at: chrono::Utc::now().to_rfc3339(),
                        };
                        let _ = state.db.save_artwork_asset(&asset);
                        let _ = state.db.select_artwork_asset(&payload.game_id, &asset.id);
                    }
                }
            }
        }
    }

    let updated = state.db.get_game_by_id(&payload.game_id)?.unwrap_or(game);

    Ok(updated)
}

#[tauri::command]
pub async fn set_locked_fields(
    state: State<'_, AppState>,
    payload: SetLockedFieldsPayload,
) -> AppResult<()> {
    state
        .db
        .set_locked_fields(&payload.game_id, &payload.locked_fields)
}

#[tauri::command]
pub async fn get_locked_fields(
    state: State<'_, AppState>,
    game_id: String,
) -> AppResult<Vec<String>> {
    let set = state.db.get_locked_fields(&game_id)?;
    Ok(set.into_iter().collect())
}
