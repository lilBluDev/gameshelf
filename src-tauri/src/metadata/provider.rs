use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::metadata::matching::ConfidenceTier;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ArtworkRole {
    Cover,
    Hero,
    Logo,
    Icon,
    Background,
}

impl ArtworkRole {
    pub fn as_str(&self) -> &'static str {
        match self {
            ArtworkRole::Cover => "cover",
            ArtworkRole::Hero => "hero",
            ArtworkRole::Logo => "logo",
            ArtworkRole::Icon => "icon",
            ArtworkRole::Background => "background",
        }
    }

    pub fn from_str_loose(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "cover" | "grid" => Some(ArtworkRole::Cover),
            "hero" | "banner" => Some(ArtworkRole::Hero),
            "logo" => Some(ArtworkRole::Logo),
            "icon" => Some(ArtworkRole::Icon),
            "background" => Some(ArtworkRole::Background),
            _ => None,
        }
    }
}

impl std::fmt::Display for ArtworkRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// A matched game candidate from a metadata provider
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameCandidate {
    pub provider: String,
    pub provider_game_id: String,
    pub name: String,
    pub release_year: Option<i32>,
    pub match_score: f64,
    pub confidence_tier: ConfidenceTier,
    pub steam_app_id: Option<u32>,
    pub verified: bool,
}

/// An artwork candidate returned from a metadata provider
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtworkCandidate {
    pub provider: String,
    pub asset_id: String,
    pub role: ArtworkRole,
    pub url: String,
    pub thumb_url: Option<String>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub mime_type: Option<String>,
    pub author_name: Option<String>,
    pub score: i32,
    pub language: Option<String>,
}

#[allow(async_fn_in_trait)]
pub trait MetadataProvider: Send + Sync {
    /// Provider name, e.g. "steamgriddb"
    fn name(&self) -> &'static str;

    /// Test if authentication/connectivity is valid
    async fn test_connection(&self) -> Result<bool, AppError>;

    /// Search for game candidates matching title
    async fn search_games(
        &self,
        query: &str,
        target_year: Option<i32>,
    ) -> Result<Vec<GameCandidate>, AppError>;

    /// Exact lookup by Steam App ID
    async fn lookup_by_steam_app_id(&self, app_id: u32) -> Result<Option<GameCandidate>, AppError>;

    /// Exact lookup by provider game ID
    async fn lookup_by_id(&self, provider_id: &str) -> Result<Option<GameCandidate>, AppError>;

    /// Fetch artwork assets for a game ID and specific role
    async fn get_artwork(
        &self,
        provider_game_id: &str,
        role: ArtworkRole,
    ) -> Result<Vec<ArtworkCandidate>, AppError>;
}
