use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

use super::rules::{matches_glob, SkipRule, KNOWN_ENGINE_INDICATORS};
use crate::platform::windows::{extract_pe_title, infer_title_from_stem};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ConfidenceLevel {
    High,
    Medium,
    Low,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanCandidate {
    pub id: String,
    pub title: String,
    pub executable_path: String,
    pub working_dir: String,
    pub args: Vec<String>,
    pub confidence: ConfidenceLevel,
    pub reason: String,
    pub file_size_bytes: u64,
    pub is_skipped: bool,
    pub skip_reason: Option<String>,
    pub selected: bool,
    pub existing_game_id: Option<String>,
}

/// Generic executable stems that typically need their folder name used as the game title
const GENERIC_EXECUTABLE_STEMS: &[&str] = &[
    "game",
    "play",
    "start",
    "run",
    "launch",
    "launcher",
    "main",
    "client",
    "app",
    "shipping",
    "bootstrap",
    "win64",
    "win32",
    "x64",
    "x86",
    "bin",
];

/// Classify an executable file candidate against heuristic rules
pub fn classify_executable(
    exe_path: &Path,
    game_root_dir: &Path,
    skip_rules: &[SkipRule],
) -> ScanCandidate {
    let file_name = exe_path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("game.exe");
    let stem = exe_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("game");
    let stem_lower = stem.to_lowercase();

    let metadata = fs::metadata(exe_path).ok();
    let file_size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
    let working_dir = exe_path
        .parent()
        .unwrap_or(game_root_dir)
        .to_string_lossy()
        .to_string();

    // 1. Evaluate skip rules
    let mut is_skipped = false;
    let mut skip_reason = None;

    for rule in skip_rules {
        if !rule.enabled {
            continue;
        }
        for pattern in &rule.patterns {
            if matches_glob(pattern, file_name) {
                is_skipped = true;
                skip_reason = Some(format!("Skipped by rule '{}' ({})", rule.name, pattern));
                break;
            }
        }
        if is_skipped {
            break;
        }
    }

    // 2. Title inference
    let pe_title = extract_pe_title(exe_path);
    let folder_name = game_root_dir
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("Game");

    let mut probable_title = if let Some(ref title) = pe_title {
        title.clone()
    } else if GENERIC_EXECUTABLE_STEMS.contains(&stem_lower.as_str()) {
        infer_title_from_stem(folder_name)
    } else {
        infer_title_from_stem(stem)
    };

    if probable_title.trim().is_empty() {
        probable_title = infer_title_from_stem(folder_name);
    }

    // 3. Game Engine & indicators inspection
    let mut engine_indicators = Vec::new();
    let exe_dir = exe_path.parent();

    if let Some(dir) = exe_dir {
        // Check for <stem>_Data (Unity standard)
        let unity_data = dir.join(format!("{}_Data", stem));
        if unity_data.exists() && unity_data.is_dir() {
            engine_indicators.push("Unity Data Folder".to_string());
        }

        // Check for known engine libraries in current dir and parent dir
        for &(file_indicator, engine_name) in KNOWN_ENGINE_INDICATORS {
            if dir.join(file_indicator).exists() {
                if !engine_indicators.contains(&engine_name.to_string()) {
                    engine_indicators.push(engine_name.to_string());
                }
            } else if let Some(parent) = dir.parent() {
                if parent.join(file_indicator).exists()
                    && !engine_indicators.contains(&engine_name.to_string())
                {
                    engine_indicators.push(engine_name.to_string());
                }
            }
        }
    }

    // 4. Confidence scoring and explainable reason string
    let mut reasons = Vec::new();
    let mut score = 0; // 0-10 scale

    // Depth heuristic (relative to game root)
    let is_top_level = exe_dir == Some(game_root_dir);
    if is_top_level {
        score += 3;
        reasons.push("Top-level executable in game folder".to_string());
    } else if let Some(dir) = exe_dir {
        let dir_name = dir.file_name().and_then(|s| s.to_str()).unwrap_or("");
        let dir_lower = dir_name.to_lowercase();
        if dir_lower == "bin"
            || dir_lower == "x64"
            || dir_lower == "win64"
            || dir_lower == "release"
        {
            score += 2;
            reasons.push(format!("Located in binary subdirectory '{}'", dir_name));
        } else {
            score += 1;
            reasons.push(format!("Nested in '{}'", dir_name));
        }
    }

    if let Some(pe) = &pe_title {
        score += 3;
        reasons.push(format!("Windows PE Product Name '{}'", pe));
    }

    if !engine_indicators.is_empty() {
        score += 4;
        reasons.push(format!("Detected {}", engine_indicators.join(", ")));
    }

    let size_mb = file_size as f64 / (1024.0 * 1024.0);
    if size_mb >= 20.0 {
        score += 2;
        reasons.push(format!("{:.1} MB game binary", size_mb));
    } else if size_mb >= 5.0 {
        score += 1;
        reasons.push(format!("{:.1} MB binary", size_mb));
    }

    let confidence = if score >= 6 {
        ConfidenceLevel::High
    } else if score >= 3 {
        ConfidenceLevel::Medium
    } else {
        ConfidenceLevel::Low
    };

    let reason_summary = if is_skipped {
        skip_reason.clone().unwrap_or_else(|| "Skipped".to_string())
    } else if reasons.is_empty() {
        "Standalone Windows executable".to_string()
    } else {
        reasons.join("; ")
    };

    ScanCandidate {
        id: uuid::Uuid::new_v4().to_string(),
        title: probable_title,
        executable_path: exe_path.to_string_lossy().to_string(),
        working_dir,
        args: Vec::new(),
        confidence,
        reason: reason_summary,
        file_size_bytes: file_size,
        is_skipped,
        skip_reason,
        selected: !is_skipped, // unselected if skipped by default
        existing_game_id: None,
    }
}
