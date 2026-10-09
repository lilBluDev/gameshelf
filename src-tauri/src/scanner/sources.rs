use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanSource {
    pub id: String,
    pub path: String,
    pub normalized_path: String,
    pub depth: usize,
    pub last_scanned_at: Option<String>,
    pub game_count: usize,
    pub created_at: String,
    pub updated_at: String,
}
