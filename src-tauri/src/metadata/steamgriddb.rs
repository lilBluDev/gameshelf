use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, USER_AGENT};
use reqwest::Client;
use serde::Deserialize;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;
use tracing::{debug, warn};

use crate::error::{AppError, AppResult};
use crate::metadata::matching::{calculate_match_score, ConfidenceTier};
use crate::metadata::provider::{ArtworkCandidate, ArtworkRole, GameCandidate, MetadataProvider};

const DEFAULT_BASE_URL: &str = "https://www.steamgriddb.com/api/v2";
const MIN_REQUEST_INTERVAL: Duration = Duration::from_millis(260); // Max ~3.8 req/sec (< 4 req/sec limit)

#[derive(Clone)]
pub struct SteamGridDbClient {
    base_url: String,
    api_key: Option<String>,
    http_client: Client,
    last_request_time: Arc<Mutex<Option<Instant>>>,
}

#[derive(Debug, Deserialize)]
struct SgdbResponse<T> {
    success: bool,
    data: Option<T>,
    errors: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct SgdbGameItem {
    id: u64,
    name: String,
    #[serde(default)]
    types: Vec<String>,
    #[serde(default)]
    verified: bool,
    #[serde(default)]
    release_date: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct SgdbAuthor {
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SgdbAssetItem {
    id: u64,
    score: Option<i32>,
    url: String,
    thumb: Option<String>,
    width: Option<i32>,
    height: Option<i32>,
    mime: Option<String>,
    #[serde(default)]
    nsfw: bool,
    #[serde(default)]
    humor: bool,
    author: Option<SgdbAuthor>,
    language: Option<String>,
}

impl SteamGridDbClient {
    pub fn new(api_key: Option<String>) -> Self {
        Self::with_base_url(DEFAULT_BASE_URL, api_key)
    }

    pub fn with_base_url(base_url: &str, api_key: Option<String>) -> Self {
        let http_client = Client::builder()
            .timeout(Duration::from_secs(12))
            .build()
            .unwrap_or_else(|_| Client::new());

        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            api_key,
            http_client,
            last_request_time: Arc::new(Mutex::new(None)),
        }
    }

    /// Rate limiter: throttles outgoing requests to <= 4 requests/sec
    async fn throttle(&self) {
        let mut last_time = self.last_request_time.lock().await;
        if let Some(prev) = *last_time {
            let elapsed = prev.elapsed();
            if elapsed < MIN_REQUEST_INTERVAL {
                let wait = MIN_REQUEST_INTERVAL - elapsed;
                tokio::time::sleep(wait).await;
            }
        }
        *last_time = Some(Instant::now());
    }

    /// Execute a rate-limited HTTP GET request with retry backoff on 429
    async fn get_json<T: for<'de> Deserialize<'de>>(&self, endpoint: &str) -> AppResult<Option<T>> {
        let key = self.api_key.as_ref().ok_or_else(|| {
            AppError::Provider("SteamGridDB API key is not configured".to_string())
        })?;

        let url = format!("{}{}", self.base_url, endpoint);
        let mut retries = 0;
        let max_retries = 2;

        loop {
            self.throttle().await;

            let mut headers = HeaderMap::new();
            headers.insert(
                USER_AGENT,
                HeaderValue::from_static("GameShelf/0.1.0 (Desktop; Windows)"),
            );
            if let Ok(val) = HeaderValue::from_str(&format!("Bearer {}", key.trim())) {
                headers.insert(AUTHORIZATION, val);
            }

            debug!(url = %url, "Sending request to SteamGridDB API");
            let response = self
                .http_client
                .get(&url)
                .headers(headers)
                .send()
                .await
                .map_err(|e| AppError::Network(format!("SteamGridDB connection failed: {}", e)))?;

            let status = response.status();
            if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
                if retries < max_retries {
                    retries += 1;
                    let backoff = Duration::from_millis(1000 * retries);
                    warn!(
                        url = %url,
                        retries = retries,
                        "SteamGridDB 429 Too Many Requests; backing off for {:?}",
                        backoff
                    );
                    tokio::time::sleep(backoff).await;
                    continue;
                } else {
                    return Err(AppError::Provider(
                        "SteamGridDB rate limit exceeded. Please wait a moment.".to_string(),
                    ));
                }
            }

            if status == reqwest::StatusCode::UNAUTHORIZED {
                return Err(AppError::Provider(
                    "Invalid SteamGridDB API key. Please check your credentials.".to_string(),
                ));
            }

            if status == reqwest::StatusCode::NOT_FOUND {
                return Ok(None);
            }

            if !status.is_success() {
                return Err(AppError::Provider(format!(
                    "SteamGridDB API error: HTTP {}",
                    status
                )));
            }

            let body_text = response
                .text()
                .await
                .map_err(|e| AppError::Network(format!("Failed to read response body: {}", e)))?;

            let parsed: SgdbResponse<T> = serde_json::from_str(&body_text).map_err(|e| {
                AppError::Provider(format!(
                    "Failed to parse SteamGridDB response JSON: {} (body: {})",
                    e, body_text
                ))
            })?;

            if !parsed.success {
                if let Some(errors) = parsed.errors {
                    let err_msg = errors.join(", ");
                    if err_msg.to_lowercase().contains("not found") {
                        return Ok(None);
                    }
                    return Err(AppError::Provider(format!(
                        "SteamGridDB error: {}",
                        err_msg
                    )));
                }
                return Ok(None);
            }

            return Ok(parsed.data);
        }
    }
}

impl MetadataProvider for SteamGridDbClient {
    fn name(&self) -> &'static str {
        "steamgriddb"
    }

    async fn test_connection(&self) -> Result<bool, AppError> {
        // Query autocomplete with a short search term to verify auth
        let result: AppResult<Option<Vec<SgdbGameItem>>> =
            self.get_json("/search/autocomplete/portal").await;
        match result {
            Ok(_) => Ok(true),
            Err(e) => {
                warn!(error = ?e, "SteamGridDB connection test failed");
                Err(e)
            }
        }
    }

    async fn search_games(
        &self,
        query: &str,
        target_year: Option<i32>,
    ) -> Result<Vec<GameCandidate>, AppError> {
        let encoded_term = urlencoding_simple(query);
        let endpoint = format!("/search/autocomplete/{}", encoded_term);
        let items: Option<Vec<SgdbGameItem>> = self.get_json(&endpoint).await?;

        let mut candidates = Vec::new();
        if let Some(list) = items {
            for item in list {
                let release_year = item.release_date.map(|ts| {
                    // SGDB release_date is Unix timestamp in seconds
                    1970 + (ts / 31_557_600) as i32
                });

                let match_score =
                    calculate_match_score(query, &item.name, target_year, release_year);
                let confidence_tier = ConfidenceTier::from_score(match_score);

                let is_steam = item.types.iter().any(|t| t == "steam");
                let steam_app_id = if is_steam {
                    // Sometimes SGDB doesn't embed the exact app_id in autocomplete, but flag is kept
                    None
                } else {
                    None
                };

                candidates.push(GameCandidate {
                    provider: self.name().to_string(),
                    provider_game_id: item.id.to_string(),
                    name: item.name,
                    release_year,
                    match_score,
                    confidence_tier,
                    steam_app_id,
                    verified: item.verified,
                });
            }
        }

        // Sort descending by match score
        candidates.sort_by(|a, b| {
            b.match_score
                .partial_cmp(&a.match_score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        Ok(candidates)
    }

    async fn lookup_by_steam_app_id(&self, app_id: u32) -> Result<Option<GameCandidate>, AppError> {
        let endpoint = format!("/games/steam/{}", app_id);
        let item: Option<SgdbGameItem> = self.get_json(&endpoint).await?;

        if let Some(game) = item {
            let release_year = game.release_date.map(|ts| 1970 + (ts / 31_557_600) as i32);
            Ok(Some(GameCandidate {
                provider: self.name().to_string(),
                provider_game_id: game.id.to_string(),
                name: game.name,
                release_year,
                match_score: 1.0,
                confidence_tier: ConfidenceTier::High,
                steam_app_id: Some(app_id),
                verified: game.verified,
            }))
        } else {
            Ok(None)
        }
    }

    async fn lookup_by_id(&self, provider_id: &str) -> Result<Option<GameCandidate>, AppError> {
        let endpoint = format!("/games/id/{}", provider_id);
        let item: Option<SgdbGameItem> = self.get_json(&endpoint).await?;

        if let Some(game) = item {
            let release_year = game.release_date.map(|ts| 1970 + (ts / 31_557_600) as i32);
            Ok(Some(GameCandidate {
                provider: self.name().to_string(),
                provider_game_id: game.id.to_string(),
                name: game.name,
                release_year,
                match_score: 1.0,
                confidence_tier: ConfidenceTier::High,
                steam_app_id: None,
                verified: game.verified,
            }))
        } else {
            Ok(None)
        }
    }

    async fn get_artwork(
        &self,
        provider_game_id: &str,
        role: ArtworkRole,
    ) -> Result<Vec<ArtworkCandidate>, AppError> {
        let endpoint = match role {
            ArtworkRole::Cover => {
                format!("/grids/game/{}?dimensions=600x900", provider_game_id)
            }
            ArtworkRole::Hero => format!("/heroes/game/{}", provider_game_id),
            ArtworkRole::Logo => format!("/logos/game/{}", provider_game_id),
            ArtworkRole::Icon => format!("/icons/game/{}", provider_game_id),
            ArtworkRole::Background => format!("/heroes/game/{}", provider_game_id),
        };

        let items: Option<Vec<SgdbAssetItem>> = self.get_json(&endpoint).await?;

        let mut results = Vec::new();
        if let Some(list) = items {
            for asset in list {
                // Filter out NSFW and humor by default
                if asset.nsfw || asset.humor {
                    continue;
                }

                results.push(ArtworkCandidate {
                    provider: self.name().to_string(),
                    asset_id: asset.id.to_string(),
                    role,
                    url: asset.url,
                    thumb_url: asset.thumb,
                    width: asset.width,
                    height: asset.height,
                    mime_type: asset.mime,
                    author_name: asset.author.and_then(|a| a.name),
                    score: asset.score.unwrap_or(0),
                    language: asset.language,
                });
            }
        }

        // Sort by score descending
        results.sort_by_key(|a| std::cmp::Reverse(a.score));

        // If specific dimensions query returned empty for Cover, fallback to general grids
        if results.is_empty() && role == ArtworkRole::Cover {
            let fallback_endpoint = format!("/grids/game/{}", provider_game_id);
            if let Ok(Some(list)) = self
                .get_json::<Vec<SgdbAssetItem>>(&fallback_endpoint)
                .await
            {
                for asset in list {
                    if !asset.nsfw && !asset.humor {
                        results.push(ArtworkCandidate {
                            provider: self.name().to_string(),
                            asset_id: asset.id.to_string(),
                            role,
                            url: asset.url,
                            thumb_url: asset.thumb,
                            width: asset.width,
                            height: asset.height,
                            mime_type: asset.mime,
                            author_name: asset.author.and_then(|a| a.name),
                            score: asset.score.unwrap_or(0),
                            language: asset.language,
                        });
                    }
                }
                results.sort_by_key(|a| std::cmp::Reverse(a.score));
            }
        }

        Ok(results)
    }
}

/// Simple percent-encoding for URI path components
fn urlencoding_simple(s: &str) -> String {
    let mut result = String::with_capacity(s.len() * 2);
    for b in s.as_bytes() {
        match *b {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                result.push(*b as char);
            }
            b' ' => result.push_str("%20"),
            other => {
                result.push_str(&format!("%{:02X}", other));
            }
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_urlencoding_simple() {
        assert_eq!(urlencoding_simple("Half-Life 2"), "Half-Life%202");
        assert_eq!(urlencoding_simple("Doom (2016)"), "Doom%20%282016%29");
    }

    #[test]
    fn test_client_init() {
        let client = SteamGridDbClient::new(Some("test-token-123".to_string()));
        assert_eq!(client.name(), "steamgriddb");
        assert_eq!(client.base_url, DEFAULT_BASE_URL);
    }
}
