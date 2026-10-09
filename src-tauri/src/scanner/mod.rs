pub mod classifier;
pub mod rules;
pub mod sources;

pub use classifier::{classify_executable, ConfidenceLevel, ScanCandidate};
pub use rules::{default_exclusions, default_skip_rules, ExclusionRule, SkipRule};
use serde::{Deserialize, Serialize};
pub use sources::ScanSource;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use crate::db::Database;
use crate::platform::windows::normalize_path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanProgress {
    pub current_directory: String,
    pub folders_scanned: usize,
    pub files_examined: usize,
    pub candidates_found: usize,
    pub skipped_count: usize,
    pub errors_count: usize,
    pub is_complete: bool,
    pub is_cancelled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub candidates: Vec<ScanCandidate>,
    pub folders_scanned: usize,
    pub files_examined: usize,
    pub skipped_count: usize,
    pub errors: Vec<String>,
    pub is_cancelled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanOptions {
    pub root_paths: Vec<String>,
    pub max_depth: usize,
    pub custom_exclusions: Vec<String>,
    pub show_skipped: bool,
}

impl Default for ScanOptions {
    fn default() -> Self {
        Self {
            root_paths: Vec::new(),
            max_depth: 4,
            custom_exclusions: Vec::new(),
            show_skipped: false,
        }
    }
}

/// Verify that a candidate scan root is safe and not a raw system drive root or Windows directory
pub fn is_safe_scan_root(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Err(format!("Directory does not exist: '{}'", path.display()));
    }
    if !path.is_dir() {
        return Err(format!("Path is not a directory: '{}'", path.display()));
    }

    let p_str = path.to_string_lossy().replace('\\', "/");
    let trimmed = p_str.trim_end_matches('/');

    // Check drive roots e.g. "C:", "D:"
    if trimmed.len() <= 2 && trimmed.ends_with(':') {
        return Err(
            "Cannot scan entire drive root. Please select a specific folder containing games."
                .to_string(),
        );
    }
    if trimmed.is_empty() || trimmed == "/" {
        return Err(
            "Cannot scan filesystem root directly. Please select a specific folder.".to_string(),
        );
    }

    let lower = trimmed.to_lowercase();
    if lower.ends_with("/windows") || lower.ends_with("/windows/system32") {
        return Err("Cannot scan Windows system directories.".to_string());
    }
    if lower.contains("$recycle.bin") || lower.contains("system volume information") {
        return Err("Cannot scan system or recycle directories.".to_string());
    }

    Ok(())
}

/// Check if a directory path relative to scan root matches any exclusion rule
pub fn is_excluded_path(path: &Path, root: &Path, exclusions: &[String]) -> bool {
    if path == root {
        return false;
    }

    let rel = match path.strip_prefix(root) {
        Ok(r) => r,
        Err(_) => path,
    };

    for comp in rel.components() {
        let name = comp.as_os_str().to_string_lossy().to_lowercase();
        for exc in exclusions {
            let e = exc.to_lowercase().replace('\\', "/");
            let clean_e = e.trim_matches('/');
            if name == clean_e || rules::matches_glob(clean_e, &name) {
                return true;
            }
        }
    }

    false
}

/// Perform folder scan with progress reporting, depth limiting, and clean cancellation
pub fn scan_directories<F>(
    roots: &[PathBuf],
    max_depth: usize,
    exclusions: &[String],
    skip_rules: &[SkipRule],
    cancel_flag: Arc<AtomicBool>,
    db: &Database,
    mut progress_cb: F,
) -> ScanResult
where
    F: FnMut(ScanProgress),
{
    let mut candidates: Vec<ScanCandidate> = Vec::new();
    let mut folders_scanned = 0;
    let mut files_examined = 0;
    let mut skipped_count = 0;
    let mut errors: Vec<String> = Vec::new();
    let mut is_cancelled = false;

    for root in roots {
        if cancel_flag.load(Ordering::Relaxed) {
            is_cancelled = true;
            break;
        }

        if let Err(e) = is_safe_scan_root(root) {
            errors.push(format!("Root '{}' rejected: {}", root.display(), e));
            continue;
        }

        // BFS traversal with depth tracking: (current_path, game_root_path, depth)
        let mut queue: std::collections::VecDeque<(PathBuf, PathBuf, usize)> =
            std::collections::VecDeque::new();
        queue.push_back((root.clone(), root.clone(), 0));

        while let Some((dir, game_root, depth)) = queue.pop_front() {
            if cancel_flag.load(Ordering::Relaxed) {
                is_cancelled = true;
                break;
            }

            if is_excluded_path(&dir, root, exclusions) {
                continue;
            }

            folders_scanned += 1;

            let progress = ScanProgress {
                current_directory: dir.to_string_lossy().to_string(),
                folders_scanned,
                files_examined,
                candidates_found: candidates.len(),
                skipped_count,
                errors_count: errors.len(),
                is_complete: false,
                is_cancelled: false,
            };
            progress_cb(progress);

            let read_dir_result = match fs::read_dir(&dir) {
                Ok(entries) => entries,
                Err(err) => {
                    errors.push(format!("Cannot read folder '{}': {}", dir.display(), err));
                    continue;
                }
            };

            let mut subdirectories = Vec::new();

            for entry_res in read_dir_result {
                if cancel_flag.load(Ordering::Relaxed) {
                    is_cancelled = true;
                    break;
                }

                let entry = match entry_res {
                    Ok(e) => e,
                    Err(e) => {
                        errors.push(format!("Error reading directory entry: {}", e));
                        continue;
                    }
                };

                let path = entry.path();
                let file_type = match entry.file_type() {
                    Ok(ft) => ft,
                    Err(_) => continue,
                };

                if file_type.is_dir() {
                    if depth < max_depth && !is_excluded_path(&path, root, exclusions) {
                        // If we are at depth 0 (the root), each immediate subdirectory is a potential game root
                        let next_game_root = if depth == 0 {
                            path.clone()
                        } else {
                            game_root.clone()
                        };
                        subdirectories.push((path, next_game_root, depth + 1));
                    }
                } else if file_type.is_file() {
                    let ext = path
                        .extension()
                        .and_then(|s| s.to_str())
                        .map(|s| s.to_lowercase())
                        .unwrap_or_default();

                    if ext == "exe" {
                        files_examined += 1;

                        let mut candidate = classify_executable(&path, &game_root, skip_rules);

                        // Check if candidate is already in the database
                        let norm = normalize_path(&candidate.executable_path);
                        if let Ok(Some(existing)) = db.find_game_by_normalized_path(&norm) {
                            candidate.existing_game_id = Some(existing.id);
                        }

                        if candidate.is_skipped {
                            skipped_count += 1;
                        }

                        candidates.push(candidate);
                    }
                }
            }

            if is_cancelled {
                break;
            }

            for sub in subdirectories {
                queue.push_back(sub);
            }
        }

        if is_cancelled {
            break;
        }
    }

    // Final completion progress event
    progress_cb(ScanProgress {
        current_directory: String::new(),
        folders_scanned,
        files_examined,
        candidates_found: candidates.len(),
        skipped_count,
        errors_count: errors.len(),
        is_complete: true,
        is_cancelled,
    });

    ScanResult {
        candidates,
        folders_scanned,
        files_examined,
        skipped_count,
        errors,
        is_cancelled,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use tempfile::tempdir;

    #[test]
    fn test_is_safe_scan_root() {
        let temp = tempdir().unwrap();
        assert!(is_safe_scan_root(temp.path()).is_ok());

        assert!(is_safe_scan_root(Path::new("C:/")).is_err());
        assert!(is_safe_scan_root(Path::new("C:")).is_err());
        assert!(is_safe_scan_root(Path::new("/")).is_err());
        assert!(is_safe_scan_root(Path::new("C:/Windows")).is_err());
        assert!(is_safe_scan_root(Path::new("C:/$Recycle.Bin")).is_err());
    }

    #[test]
    fn test_exclusion_rules_and_depth_limits() {
        let temp = tempdir().unwrap();
        let root = temp.path().to_path_buf();

        // Create structure:
        // root/
        //   Game1/Game1.exe (depth 1)
        //   Game2/sub/Game2.exe (depth 2)
        //   Game3/deep1/deep2/deep3/Game3.exe (depth 4)
        //   node_modules/Ignored.exe (depth 1, excluded)
        //   Game4/.git/Git.exe (depth 2, excluded)
        let game1_dir = root.join("Game1");
        fs::create_dir_all(&game1_dir).unwrap();
        File::create(game1_dir.join("Game1.exe")).unwrap();

        let game2_dir = root.join("Game2").join("sub");
        fs::create_dir_all(&game2_dir).unwrap();
        File::create(game2_dir.join("Game2.exe")).unwrap();

        let game3_dir = root.join("Game3").join("deep1").join("deep2").join("deep3");
        fs::create_dir_all(&game3_dir).unwrap();
        File::create(game3_dir.join("Game3.exe")).unwrap();

        let nm_dir = root.join("node_modules");
        fs::create_dir_all(&nm_dir).unwrap();
        File::create(nm_dir.join("Ignored.exe")).unwrap();

        let git_dir = root.join("Game4").join(".git");
        fs::create_dir_all(&git_dir).unwrap();
        File::create(git_dir.join("Git.exe")).unwrap();

        let db = Database::in_memory().unwrap();
        let cancel = Arc::new(AtomicBool::new(false));
        let exclusions = default_exclusions();
        let skip_rules = default_skip_rules();

        // Test with max_depth = 2 (should find Game1 and Game2, exclude node_modules and .git, and ignore Game3 at depth 4)
        let res = scan_directories(
            &[root.clone()],
            2,
            &exclusions,
            &skip_rules,
            cancel.clone(),
            &db,
            |_| {},
        );

        let found_names: Vec<String> = res
            .candidates
            .iter()
            .map(|c| {
                Path::new(&c.executable_path)
                    .file_name()
                    .unwrap()
                    .to_string_lossy()
                    .to_string()
            })
            .collect();

        assert!(found_names.contains(&"Game1.exe".to_string()));
        assert!(found_names.contains(&"Game2.exe".to_string()));
        assert!(
            !found_names.contains(&"Ignored.exe".to_string()),
            "node_modules must be excluded"
        );
        assert!(
            !found_names.contains(&"Git.exe".to_string()),
            ".git must be excluded"
        );
        assert!(
            !found_names.contains(&"Game3.exe".to_string()),
            "Depth > 2 must be skipped"
        );
    }

    #[test]
    fn test_candidate_classification_and_skip_rules() {
        let temp = tempdir().unwrap();
        let game_dir = temp.path().join("SuperGame");
        fs::create_dir_all(&game_dir).unwrap();

        let main_exe = game_dir.join("SuperGame.exe");
        let unins_exe = game_dir.join("unins000.exe");
        let crash_exe = game_dir.join("UnityCrashHandler64.exe");
        let dx_exe = game_dir.join("dxsetup.exe");

        File::create(&main_exe).unwrap();
        File::create(&unins_exe).unwrap();
        File::create(&crash_exe).unwrap();
        File::create(&dx_exe).unwrap();

        // Create Unity indicator
        File::create(game_dir.join("UnityPlayer.dll")).unwrap();

        let skip_rules = default_skip_rules();

        let cand_main = classify_executable(&main_exe, &game_dir, &skip_rules);
        assert!(!cand_main.is_skipped);
        assert_eq!(cand_main.confidence, ConfidenceLevel::High);
        assert!(cand_main.reason.contains("Unity Engine"));
        assert!(cand_main.selected);

        let cand_unins = classify_executable(&unins_exe, &game_dir, &skip_rules);
        assert!(cand_unins.is_skipped);
        assert!(!cand_unins.selected);
        assert!(cand_unins
            .skip_reason
            .as_ref()
            .unwrap()
            .contains("Uninstallers"));

        let cand_crash = classify_executable(&crash_exe, &game_dir, &skip_rules);
        assert!(cand_crash.is_skipped);
        assert!(cand_crash
            .skip_reason
            .as_ref()
            .unwrap()
            .contains("Crash Reporters"));

        let cand_dx = classify_executable(&dx_exe, &game_dir, &skip_rules);
        assert!(cand_dx.is_skipped);
        assert!(cand_dx
            .skip_reason
            .as_ref()
            .unwrap()
            .contains("Redistributables"));
    }

    #[test]
    fn test_cancellation_mid_scan_leaves_db_unchanged() {
        let temp = tempdir().unwrap();
        let game_dir = temp.path().join("GameX");
        fs::create_dir_all(&game_dir).unwrap();
        File::create(game_dir.join("GameX.exe")).unwrap();

        let db = Database::in_memory().unwrap();
        let cancel = Arc::new(AtomicBool::new(true)); // Pre-cancelled
        let exclusions = default_exclusions();
        let skip_rules = default_skip_rules();

        let res = scan_directories(
            &[temp.path().to_path_buf()],
            3,
            &exclusions,
            &skip_rules,
            cancel,
            &db,
            |_| {},
        );

        assert!(res.is_cancelled);
        assert_eq!(res.candidates.len(), 0);

        // Verify DB is clean
        let games = db.list_games(None, None, None, None, true).unwrap();
        assert_eq!(games.len(), 0, "Cancellation must leave database empty");
    }

    #[test]
    fn test_batch_import_and_user_override_preservation() {
        let temp = tempdir().unwrap();
        let game_dir = temp.path().join("Celeste");
        fs::create_dir_all(&game_dir).unwrap();
        let exe = game_dir.join("Celeste.exe");
        File::create(&exe).unwrap();

        let db = Database::in_memory().unwrap();
        let candidate = classify_executable(&exe, &game_dir, &default_skip_rules());

        // Import candidate
        let imported = db.import_scan_candidates(&[candidate.clone()]).unwrap();
        assert_eq!(imported, 1);

        let games = db.list_games(None, None, None, None, true).unwrap();
        assert_eq!(games.len(), 1);
        let game_id = &games[0].id;
        assert_eq!(games[0].title, "Celeste");

        // User edits title
        db.update_game_overrides(&crate::db::schema::GameOverrides {
            game_id: game_id.clone(),
            title: Some("Celeste (Modded)".to_string()),
            sort_title: None,
            description: None,
            developer: None,
            publisher: None,
            release_year: None,
            genres: None,
            tags: None,
            notes: Some("Favorite indie game".to_string()),
            user_tags: None,
            is_favorite: Some(true),
            is_hidden: None,
            updated_at: chrono::Utc::now().to_rfc3339(),
        })
        .unwrap();

        let updated_game = db.get_game_by_id(game_id).unwrap().unwrap();
        assert_eq!(updated_game.title, "Celeste (Modded)");
        assert_eq!(updated_game.notes.as_deref(), Some("Favorite indie game"));

        // Re-importing candidate (simulating a rescan import)
        db.import_scan_candidates(&[candidate]).unwrap();

        // Verify user override persisted!
        let re_checked = db.get_game_by_id(game_id).unwrap().unwrap();
        assert_eq!(re_checked.title, "Celeste (Modded)");
        assert_eq!(re_checked.notes.as_deref(), Some("Favorite indie game"));
    }

    #[test]
    fn test_rescan_detects_vanished_files_as_missing() {
        let temp = tempdir().unwrap();
        let root = temp.path().to_path_buf();
        let root_norm = normalize_path(&root);

        let game1_dir = root.join("Game1");
        fs::create_dir_all(&game1_dir).unwrap();
        let exe1 = game1_dir.join("Game1.exe");
        File::create(&exe1).unwrap();

        let game2_dir = root.join("Game2");
        fs::create_dir_all(&game2_dir).unwrap();
        let exe2 = game2_dir.join("Game2.exe");
        File::create(&exe2).unwrap();

        let db = Database::in_memory().unwrap();
        let skip_rules = default_skip_rules();
        let cand1 = classify_executable(&exe1, &game1_dir, &skip_rules);
        let cand2 = classify_executable(&exe2, &game2_dir, &skip_rules);

        db.import_scan_candidates(&[cand1, cand2]).unwrap();
        let initial_games = db.list_games(None, None, None, None, true).unwrap();
        assert_eq!(initial_games.len(), 2);
        assert!(initial_games
            .iter()
            .all(|g| g.status == crate::db::schema::GameStatus::Installed));

        // Delete Game2 from disk
        fs::remove_file(&exe2).unwrap();

        // Rescan: active paths only contains Game1
        let active = vec![normalize_path(&exe1)];
        let missing_count = db.mark_missing_folder_games(&root_norm, &active).unwrap();
        assert_eq!(missing_count, 1);

        let after_rescan = db.list_games(None, None, None, None, true).unwrap();
        let g1 = after_rescan.iter().find(|g| g.title == "Game1").unwrap();
        let g2 = after_rescan.iter().find(|g| g.title == "Game2").unwrap();

        assert_eq!(g1.status, crate::db::schema::GameStatus::Installed);
        assert_eq!(
            g2.status,
            crate::db::schema::GameStatus::Missing,
            "Deleted file must be marked Missing, never deleted from DB!"
        );
    }

    #[test]
    fn test_e2e_scan_preview_deselect_import_persist() {
        let temp = tempdir().unwrap();
        let root = temp.path().to_path_buf();

        let g1_dir = root.join("Doom");
        fs::create_dir_all(&g1_dir).unwrap();
        File::create(g1_dir.join("Doom.exe")).unwrap();

        let g2_dir = root.join("Portal");
        fs::create_dir_all(&g2_dir).unwrap();
        File::create(g2_dir.join("Portal.exe")).unwrap();

        let g3_dir = root.join("HalfLife");
        fs::create_dir_all(&g3_dir).unwrap();
        File::create(g3_dir.join("HalfLife.exe")).unwrap();

        let db_file = temp.path().join("test_library.db");
        let db = Database::new(&db_file).unwrap();

        // 1. Scan folder
        let cancel = Arc::new(AtomicBool::new(false));
        let scan_result = scan_directories(
            &[root.clone()],
            3,
            &default_exclusions(),
            &default_skip_rules(),
            cancel,
            &db,
            |_| {},
        );

        assert_eq!(scan_result.candidates.len(), 3);

        // 2. User preview & deselect Portal
        let mut candidates_to_import = scan_result.candidates;
        for c in &mut candidates_to_import {
            if c.title == "Portal" {
                c.selected = false;
            }
        }

        // 3. User clicks "Import Selected"
        let imported = db.import_scan_candidates(&candidates_to_import).unwrap();
        assert_eq!(imported, 2);

        // 4. Verify only Doom and HalfLife are present
        let games_before = db.list_games(None, None, None, None, true).unwrap();
        assert_eq!(games_before.len(), 2);
        assert!(games_before.iter().any(|g| g.title == "Doom"));
        assert!(games_before.iter().any(|g| g.title == "HalfLife"));
        assert!(!games_before.iter().any(|g| g.title == "Portal"));

        // 5. Restart application: reopen database from disk
        drop(db);
        let reopened_db = Database::new(&db_file).unwrap();
        let games_after = reopened_db
            .list_games(None, None, None, None, true)
            .unwrap();
        assert_eq!(
            games_after.len(),
            2,
            "Imported games must persist across app restart"
        );
        assert!(games_after
            .iter()
            .all(|g| g.status == crate::db::schema::GameStatus::Installed));
    }
}
