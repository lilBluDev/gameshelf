use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};
use std::fs;
use std::path::{Path, PathBuf};

use crate::emulators::profiles::EmulatorProfile;
use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RomCandidate {
    pub id: String,
    pub title: String,
    pub rom_path: String,
    pub system: String,
    pub profile_id: String,
    pub file_size_bytes: u64,
    pub grouped_files: Vec<String>,
    pub selected: bool,
    pub is_duplicate: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RomScanOptions {
    pub folder_path: String,
    pub profile_id: String,
    pub system: String,
    pub extra_extensions: Vec<String>,
    pub max_depth: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RomScanResult {
    pub candidates: Vec<RomCandidate>,
    pub total_files_scanned: usize,
    pub grouped_files_count: usize,
    pub duplicates_count: usize,
}

/// Recursively scans a ROM folder for games matching an emulator profile's extensions,
/// performing smart grouping for CUE/BIN multi-tracks and M3U / Multi-disc sets.
pub fn scan_rom_directory(
    options: &RomScanOptions,
    profile: &EmulatorProfile,
    existing_rom_paths: &HashSet<String>,
) -> AppResult<RomScanResult> {
    let root = Path::new(&options.folder_path);
    if !root.exists() || !root.is_dir() {
        return Err(crate::error::AppError::Internal(format!(
            "ROM directory does not exist or is not a folder: '{}'",
            options.folder_path
        )));
    }

    // Build effective extension set (lowercase with leading dot)
    let mut allowed_exts: HashSet<String> = profile
        .supported_extensions
        .iter()
        .map(|e| normalize_ext(e))
        .collect();

    for ext in &options.extra_extensions {
        allowed_exts.insert(normalize_ext(ext));
    }

    let mut scanned_files: Vec<PathBuf> = Vec::new();
    let max_depth = options.max_depth.clamp(1, 6);

    // BFS Directory Traversal
    let mut queue = VecDeque::new();
    queue.push_back((root.to_path_buf(), 0));

    while let Some((curr_dir, depth)) = queue.pop_front() {
        if depth > max_depth {
            continue;
        }

        if let Ok(entries) = fs::read_dir(&curr_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    scanned_files.push(path);
                } else if path.is_dir() && depth < max_depth {
                    queue.push_back((path, depth + 1));
                }
            }
        }
    }

    let total_files_scanned = scanned_files.len();

    // 1. First pass: Identify all .m3u playlists and parse them to claim multi-disc member files
    let mut m3u_grouped_files: HashMap<PathBuf, Vec<PathBuf>> = HashMap::new();
    let mut files_claimed_by_m3u: HashSet<PathBuf> = HashSet::new();

    for file in &scanned_files {
        if let Some(ext) = file.extension().and_then(|s| s.to_str()) {
            if ext.eq_ignore_ascii_case("m3u") || ext.eq_ignore_ascii_case("m3u8") {
                if let Ok(content) = fs::read_to_string(file) {
                    let parent = file.parent().unwrap_or(root);
                    let mut referenced_files = Vec::new();
                    for line in content.lines() {
                        let trimmed = line.trim();
                        if trimmed.is_empty() || trimmed.starts_with('#') {
                            continue;
                        }
                        let disc_path = parent.join(trimmed);
                        if disc_path.exists() {
                            files_claimed_by_m3u.insert(canonicalize_or_norm(&disc_path));
                            referenced_files.push(disc_path);
                        }
                    }
                    m3u_grouped_files.insert(file.clone(), referenced_files);
                }
            }
        }
    }

    // 2. Second pass: Identify all .cue files and parse their FILE references to claim .bin tracks
    let mut cue_grouped_files: HashMap<PathBuf, Vec<PathBuf>> = HashMap::new();
    let mut files_claimed_by_cue: HashSet<PathBuf> = HashSet::new();

    for file in &scanned_files {
        if let Some(ext) = file.extension().and_then(|s| s.to_str()) {
            if ext.eq_ignore_ascii_case("cue") {
                let parent = file.parent().unwrap_or(root);
                let mut tracks = Vec::new();

                // Read .cue content for exact FILE references
                if let Ok(content) = fs::read_to_string(file) {
                    for line in content.lines() {
                        let trimmed = line.trim();
                        if trimmed.to_uppercase().starts_with("FILE") {
                            // Format: FILE "filename" BINARY or FILE filename BINARY
                            if let Some(track_rel) = extract_quoted_or_word(trimmed, "FILE") {
                                let track_path = parent.join(&track_rel);
                                if track_path.exists() {
                                    files_claimed_by_cue.insert(canonicalize_or_norm(&track_path));
                                    if !tracks.contains(&track_path) {
                                        tracks.push(track_path);
                                    }
                                }
                            }
                        }
                    }
                }

                // Also group sibling .bin files with matching stem
                if let Some(stem) = file.file_stem().and_then(|s| s.to_str()) {
                    let stem_lower = stem.to_lowercase();
                    if let Ok(entries) = fs::read_dir(parent) {
                        for sibling in entries.flatten() {
                            let sibling_path = sibling.path();
                            if sibling_path.is_file() && sibling_path != *file {
                                if let Some(sib_ext) =
                                    sibling_path.extension().and_then(|s| s.to_str())
                                {
                                    if sib_ext.eq_ignore_ascii_case("bin") {
                                        if let Some(sib_stem) =
                                            sibling_path.file_stem().and_then(|s| s.to_str())
                                        {
                                            if sib_stem.to_lowercase().starts_with(&stem_lower) {
                                                files_claimed_by_cue
                                                    .insert(canonicalize_or_norm(&sibling_path));
                                                if !tracks.contains(&sibling_path) {
                                                    tracks.push(sibling_path);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                cue_grouped_files.insert(file.clone(), tracks);
            }
        }
    }

    // 3. Third pass: Identify multi-disc sets that don't have an .m3u playlist (e.g. "Game (Disc 1).iso", "Game (Disc 2).iso")
    let mut disc_groups: HashMap<(PathBuf, String), Vec<(PathBuf, usize)>> = HashMap::new();
    let mut files_claimed_by_disc_group: HashSet<PathBuf> = HashSet::new();

    for file in &scanned_files {
        let norm_file = canonicalize_or_norm(file);
        if files_claimed_by_m3u.contains(&norm_file) || files_claimed_by_cue.contains(&norm_file) {
            continue;
        }

        if let Some(ext) = file.extension().and_then(|s| s.to_str()) {
            if allowed_exts.contains(&normalize_ext(ext)) {
                if let Some(stem) = file.file_stem().and_then(|s| s.to_str()) {
                    if let Some((clean_base, disc_num)) = parse_disc_info(stem) {
                        let parent = file.parent().unwrap_or(root).to_path_buf();
                        disc_groups
                            .entry((parent, clean_base))
                            .or_default()
                            .push((file.clone(), disc_num));
                    }
                }
            }
        }
    }

    // Discs with more than 1 file are grouped under Disc 1
    let mut multi_disc_primary_map: HashMap<PathBuf, Vec<PathBuf>> = HashMap::new();
    for (_key, mut discs) in disc_groups {
        if discs.len() > 1 {
            discs.sort_by_key(|d| d.1);
            let (primary, _) = discs.remove(0);
            let mut secondaries = Vec::new();
            for (secondary, _) in discs {
                files_claimed_by_disc_group.insert(canonicalize_or_norm(&secondary));
                secondaries.push(secondary);
            }
            multi_disc_primary_map.insert(primary, secondaries);
        }
    }

    // 4. Build final candidates list
    let mut candidates: Vec<RomCandidate> = Vec::new();
    let mut grouped_files_count = 0;
    let mut duplicates_count = 0;

    for file in &scanned_files {
        let norm_file = canonicalize_or_norm(file);

        // Skip files claimed by an .m3u playlist, .cue file, or multi-disc set
        if files_claimed_by_m3u.contains(&norm_file)
            || files_claimed_by_cue.contains(&norm_file)
            || files_claimed_by_disc_group.contains(&norm_file)
        {
            continue;
        }

        let ext = match file.extension().and_then(|s| s.to_str()) {
            Some(e) => normalize_ext(e),
            None => continue,
        };

        // Check if allowed extension or .m3u
        if !allowed_exts.contains(&ext) && ext != ".m3u" && ext != ".m3u8" {
            continue;
        }

        let mut grouped: Vec<String> = Vec::new();

        if let Some(m3u_tracks) = m3u_grouped_files.get(file) {
            for t in m3u_tracks {
                grouped.push(t.to_string_lossy().to_string());
            }
        }

        if let Some(cue_tracks) = cue_grouped_files.get(file) {
            for t in cue_tracks {
                grouped.push(t.to_string_lossy().to_string());
            }
        }

        if let Some(other_discs) = multi_disc_primary_map.get(file) {
            for d in other_discs {
                grouped.push(d.to_string_lossy().to_string());
            }
        }

        grouped_files_count += grouped.len();

        let rom_path_str = file.to_string_lossy().to_string();
        let normalized_path = crate::platform::windows::normalize_path(&rom_path_str);
        let is_duplicate = existing_rom_paths.contains(&normalized_path);

        if is_duplicate {
            duplicates_count += 1;
        }

        let stem = file
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Unknown");
        let title = clean_rom_title(stem);
        let file_size = fs::metadata(file).map(|m| m.len()).unwrap_or(0);

        candidates.push(RomCandidate {
            id: uuid::Uuid::new_v4().to_string(),
            title,
            rom_path: rom_path_str,
            system: options.system.clone(),
            profile_id: options.profile_id.clone(),
            file_size_bytes: file_size,
            grouped_files: grouped,
            selected: !is_duplicate,
            is_duplicate,
        });
    }

    candidates.sort_by_key(|a| a.title.to_lowercase());

    Ok(RomScanResult {
        candidates,
        total_files_scanned,
        grouped_files_count,
        duplicates_count,
    })
}

/// Extracts quoted filename from a CUE FILE line e.g. `FILE "Track 1.bin" BINARY`
fn extract_quoted_or_word(line: &str, keyword: &str) -> Option<String> {
    let rest = line[keyword.len()..].trim();
    if let Some(after_quote) = rest.strip_prefix('"') {
        if let Some(end_quote) = after_quote.find('"') {
            return Some(after_quote[..end_quote].to_string());
        }
    } else if let Some(first_word) = rest.split_whitespace().next() {
        return Some(first_word.to_string());
    }
    None
}

/// Extracts (clean_title_without_disc, disc_number) if the stem contains a disc marker
pub fn parse_disc_info(stem: &str) -> Option<(String, usize)> {
    let lower = stem.to_lowercase();
    for marker in &["disc", "cd"] {
        if let Some(idx) = lower.find(marker) {
            let after = &lower[idx + marker.len()..];
            let trimmed = after.trim_start();
            let digits: String = trimmed.chars().take_while(|c| c.is_ascii_digit()).collect();
            if !digits.is_empty() {
                if let Ok(num) = digits.parse::<usize>() {
                    let mut start = idx;
                    while start > 0
                        && matches!(stem.as_bytes()[start - 1], b' ' | b'(' | b'[' | b'_' | b'-')
                    {
                        start -= 1;
                    }
                    let trailing_punct = trimmed[digits.len()..]
                        .chars()
                        .take_while(|c| matches!(*c, ')' | ']' | ' ' | '_' | '-'))
                        .count();
                    let end = idx
                        + marker.len()
                        + (after.len() - trimmed.len())
                        + digits.len()
                        + trailing_punct;
                    let clean = format!("{}{}", &stem[..start], &stem[end.min(stem.len())..]);
                    return Some((clean_rom_title_base(&clean), num));
                }
            }
        }
    }
    None
}

/// Cleans raw ROM filename stems by removing region codes, disc tags, and dump tags
pub fn clean_rom_title(stem: &str) -> String {
    if let Some((clean, _)) = parse_disc_info(stem) {
        clean_rom_title_base(&clean)
    } else {
        clean_rom_title_base(stem)
    }
}

pub fn clean_rom_title_base(stem: &str) -> String {
    let mut title = stem.to_string();

    // 1. Remove bracketed dump/revision tags like "[!]", "[b1]", "[v1.0]"
    while let Some(open) = title.find('[') {
        if let Some(close) = title[open..].find(']') {
            title.drain(open..=open + close);
        } else {
            break;
        }
    }

    // 2. Remove common tags in parentheses e.g. (USA) (Europe) (Japan) (Rev 1) (En,Fr)
    let regions = [
        "usa", "europe", "japan", "world", "rev", "beta", "demo", "en", "fr", "de", "es", "it",
        "v1.", "v2.",
    ];
    let mut changed = true;
    while changed {
        changed = false;
        if let Some(open) = title.find('(') {
            if let Some(close) = title[open..].find(')') {
                let inside = &title[open + 1..open + close].to_lowercase();
                if regions.iter().any(|r| inside.contains(r)) {
                    title.drain(open..=open + close);
                    changed = true;
                }
            }
        }
    }

    // 3. Normalize whitespace and punctuation
    let cleaned = title
        .replace(['_', '-'], " ")
        .split_whitespace()
        .collect::<Vec<&str>>()
        .join(" ");

    if cleaned.is_empty() {
        stem.to_string()
    } else {
        cleaned
    }
}

fn normalize_ext(ext: &str) -> String {
    let mut e = ext.trim().to_lowercase();
    if !e.starts_with('.') {
        e.insert(0, '.');
    }
    e
}

fn canonicalize_or_norm(path: &Path) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::emulators::profiles::get_builtin_profiles;
    use std::fs::File;
    use std::io::Write;
    use tempfile::tempdir;

    #[test]
    fn test_cue_bin_grouping_prevents_individual_track_import() {
        let temp = tempdir().unwrap();
        let dir = temp.path();

        // Create game.cue
        let cue_path = dir.join("Castlevania - Symphony of the Night.cue");
        let mut f = File::create(&cue_path).unwrap();
        writeln!(
            f,
            r#"FILE "Castlevania - Symphony of the Night (Track 1).bin" BINARY"#
        )
        .unwrap();
        writeln!(f, r#"  TRACK 01 MODE2/2352"#).unwrap();
        writeln!(f, r#"    INDEX 01 00:00:00"#).unwrap();
        writeln!(
            f,
            r#"FILE "Castlevania - Symphony of the Night (Track 2).bin" BINARY"#
        )
        .unwrap();
        writeln!(f, r#"  TRACK 02 AUDIO"#).unwrap();

        // Create the bin files
        File::create(dir.join("Castlevania - Symphony of the Night (Track 1).bin")).unwrap();
        File::create(dir.join("Castlevania - Symphony of the Night (Track 2).bin")).unwrap();

        let duckstation = get_builtin_profiles()
            .into_iter()
            .find(|p| p.id == "duckstation")
            .unwrap();

        let options = RomScanOptions {
            folder_path: dir.to_str().unwrap().to_string(),
            profile_id: "duckstation".to_string(),
            system: "PlayStation".to_string(),
            extra_extensions: vec![],
            max_depth: 2,
        };

        let result = scan_rom_directory(&options, &duckstation, &HashSet::new()).unwrap();

        // Must produce exactly 1 candidate (the .cue file), NOT 3!
        assert_eq!(result.candidates.len(), 1);
        let cand = &result.candidates[0];
        assert_eq!(cand.title, "Castlevania Symphony of the Night");
        assert!(cand.rom_path.ends_with(".cue"));
        assert_eq!(cand.grouped_files.len(), 2);
    }

    #[test]
    fn test_m3u_playlist_grouping_multi_disc() {
        let temp = tempdir().unwrap();
        let dir = temp.path();

        // Create M3U playlist
        let m3u_path = dir.join("Metal Gear Solid.m3u");
        let mut f = File::create(&m3u_path).unwrap();
        writeln!(f, "Metal Gear Solid (Disc 1).cue").unwrap();
        writeln!(f, "Metal Gear Solid (Disc 2).cue").unwrap();

        // Create disc files
        File::create(dir.join("Metal Gear Solid (Disc 1).cue")).unwrap();
        File::create(dir.join("Metal Gear Solid (Disc 2).cue")).unwrap();

        let duckstation = get_builtin_profiles()
            .into_iter()
            .find(|p| p.id == "duckstation")
            .unwrap();

        let options = RomScanOptions {
            folder_path: dir.to_str().unwrap().to_string(),
            profile_id: "duckstation".to_string(),
            system: "PlayStation".to_string(),
            extra_extensions: vec![],
            max_depth: 2,
        };

        let result = scan_rom_directory(&options, &duckstation, &HashSet::new()).unwrap();

        // Exactly 1 candidate (the .m3u playlist)
        assert_eq!(result.candidates.len(), 1);
        let cand = &result.candidates[0];
        assert_eq!(cand.title, "Metal Gear Solid");
        assert!(cand.rom_path.ends_with(".m3u"));
        assert_eq!(cand.grouped_files.len(), 2);
    }

    #[test]
    fn test_multi_disc_grouping_without_m3u() {
        let temp = tempdir().unwrap();
        let dir = temp.path();

        // Create Disc 1 and Disc 2 files
        File::create(dir.join("Resident Evil 2 (Disc 1).iso")).unwrap();
        File::create(dir.join("Resident Evil 2 (Disc 2).iso")).unwrap();

        let dolphin = get_builtin_profiles()
            .into_iter()
            .find(|p| p.id == "dolphin")
            .unwrap();

        let options = RomScanOptions {
            folder_path: dir.to_str().unwrap().to_string(),
            profile_id: "dolphin".to_string(),
            system: "GameCube".to_string(),
            extra_extensions: vec![],
            max_depth: 2,
        };

        let result = scan_rom_directory(&options, &dolphin, &HashSet::new()).unwrap();

        // Exactly 1 candidate (Disc 1 as primary, Disc 2 grouped)
        assert_eq!(result.candidates.len(), 1);
        let cand = &result.candidates[0];
        assert_eq!(cand.title, "Resident Evil 2");
        assert!(cand.rom_path.ends_with("Resident Evil 2 (Disc 1).iso"));
        assert_eq!(cand.grouped_files.len(), 1);
        assert!(cand.grouped_files[0].ends_with("Resident Evil 2 (Disc 2).iso"));
    }

    #[test]
    fn test_clean_rom_title_strips_region_and_dump_tags() {
        assert_eq!(
            clean_rom_title("Super Mario 64 (USA) [!]"),
            "Super Mario 64"
        );
        assert_eq!(
            clean_rom_title("Final Fantasy VII (USA) (Disc 1)"),
            "Final Fantasy VII"
        );
    }
}
