use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type")]
pub enum LaunchAction {
    Executable {
        path: String,
        args: Vec<String>,
        #[serde(default)]
        working_dir: Option<String>,
        #[serde(default)]
        env: Option<HashMap<String, String>>,
    },
    Steam {
        app_id: u32,
    },
    Shortcut {
        target: String,
        args: Vec<String>,
        #[serde(default)]
        working_dir: Option<String>,
    },
    EmulatedGame {
        profile_id: String,
        rom_path: String,
        #[serde(default)]
        arg_overrides: Option<Vec<String>>,
    },
    Unavailable {
        reason: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SourceKind {
    Steam,
    Standalone,
    Shortcut,
    Emulated,
    Manual,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum GameStatus {
    Installed,
    Missing,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Game {
    pub id: String,
    pub title: String,
    pub sort_title: String,
    pub description: Option<String>,
    pub developer: Option<String>,
    pub publisher: Option<String>,
    pub release_year: Option<i32>,
    pub genres: Vec<String>,
    pub tags: Vec<String>,
    pub source_kind: SourceKind,
    pub source_id: Option<String>,
    pub install_dir: Option<String>,
    pub launch_action: LaunchAction,
    pub status: GameStatus,
    pub last_scanned_at: Option<String>,
    pub is_favorite: bool,
    pub is_hidden: bool,
    pub notes: Option<String>,
    pub user_tags: Vec<String>,
    pub match_confidence: Option<f64>,
    pub provider_attribution: Option<String>,
    pub last_launched_at: Option<String>,
    pub normalized_path: Option<String>,
    pub created_at: String,
    #[serde(default)]
    pub artwork: Option<HashMap<String, ArtworkAsset>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameOverrides {
    pub game_id: String,
    pub title: Option<String>,
    pub sort_title: Option<String>,
    pub description: Option<String>,
    pub developer: Option<String>,
    pub publisher: Option<String>,
    pub release_year: Option<i32>,
    pub genres: Option<Vec<String>>,
    pub tags: Option<Vec<String>>,
    pub notes: Option<String>,
    pub user_tags: Option<Vec<String>>,
    pub is_favorite: Option<bool>,
    pub is_hidden: Option<bool>,
    #[serde(default)]
    pub locked_fields: Option<Vec<String>>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtworkAsset {
    pub id: String,
    pub game_id: String,
    pub role: String,
    pub provider: String,
    pub provider_asset_id: Option<String>,
    pub source_url: Option<String>,
    pub cached_path: Option<String>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub mime_type: Option<String>,
    pub attribution: Option<String>,
    pub is_selected: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmulatorProfile {
    pub id: String,
    pub name: String,
    pub executable_path: String,
    pub detection_source: String,
    pub systems: Vec<String>,
    pub extensions: Vec<String>,
    pub argument_template: Vec<String>,
    pub working_dir_rule: String,
    pub validation_status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanJob {
    pub id: String,
    pub root_path: String,
    pub options: String,
    pub status: String,
    pub candidates_count: i32,
    pub imported_count: i32,
    pub skipped_count: i32,
    pub error_count: i32,
    pub is_cancellable: bool,
    pub errors_summary: Option<String>,
    pub started_at: String,
    pub completed_at: Option<String>,
}
