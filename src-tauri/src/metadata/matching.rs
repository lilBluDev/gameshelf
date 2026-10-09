use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ConfidenceTier {
    High,
    Medium,
    Low,
}

impl ConfidenceTier {
    pub fn from_score(score: f64) -> Self {
        if score >= 0.85 {
            ConfidenceTier::High
        } else if score >= 0.60 {
            ConfidenceTier::Medium
        } else {
            ConfidenceTier::Low
        }
    }
}

/// Parsed title components
#[derive(Debug, Clone, PartialEq)]
pub struct ParsedTitle {
    pub clean_title: String,
    pub detected_year: Option<i32>,
    pub sequel_identifier: Option<String>,
}

/// Normalize roman numerals and arabic numbers to a canonical representation
fn canonicalize_numeral(token: &str) -> Option<&'static str> {
    match token.to_lowercase().as_str() {
        "1" | "i" => Some("1"),
        "2" | "ii" => Some("2"),
        "3" | "iii" => Some("3"),
        "4" | "iv" => Some("4"),
        "5" | "v" => Some("5"),
        "6" | "vi" => Some("6"),
        "7" | "vii" => Some("7"),
        "8" | "viii" => Some("8"),
        "9" | "ix" => Some("9"),
        "10" | "x" => Some("10"),
        "11" | "xi" => Some("11"),
        "12" | "xii" => Some("12"),
        "13" | "xiii" => Some("13"),
        "14" | "xiv" => Some("14"),
        "15" | "xv" => Some("15"),
        "16" | "xvi" => Some("16"),
        _ => None,
    }
}

/// Strip common file extensions if filename was provided
fn strip_extension(input: &str) -> &str {
    let lower = input.to_lowercase();
    let extensions = [
        ".exe", ".lnk", ".url", ".iso", ".bin", ".cue", ".chd", ".cso", ".rvz", ".smc", ".sfc",
        ".nes", ".gba", ".gbc", ".gb", ".nds", ".3ds", ".n64", ".z64", ".gcm", ".wbfs", ".nsp",
        ".xci", ".pkg", ".pbp", ".zip", ".7z",
    ];
    for ext in extensions {
        if lower.ends_with(ext) {
            return &input[..input.len() - ext.len()];
        }
    }
    input
}

/// Parse and normalize a title string:
/// 1. Strips file extensions, underscores, brackets
/// 2. Extracts release year if in parentheses (e.g. "Prey (2006)")
/// 3. Removes edition junk ("Game of the Year", "GOTY", "Remastered", "v1.0", regional tags)
/// 4. Extracts canonical sequel identifier (e.g. "2" for "II")
pub fn parse_and_normalize_title(raw: &str) -> ParsedTitle {
    let without_ext = strip_extension(raw);
    let working_spaces = without_ext.replace('_', " ");

    // Filter out version strings like v1.0, v2.3, ver1.0
    let mut words_no_version = Vec::new();
    for word in working_spaces.split_whitespace() {
        let w_lower = word.to_lowercase();
        let trimmed_v = w_lower.trim_start_matches('v').trim_start_matches("er");
        if (w_lower.starts_with('v') || w_lower.starts_with("ver"))
            && !trimmed_v.is_empty()
            && trimmed_v.chars().next().is_some_and(|c| c.is_ascii_digit())
        {
            continue;
        }
        words_no_version.push(word);
    }
    let mut working = words_no_version.join(" ").replace('.', " ");

    // Extract 4-digit year in parentheses or brackets (1970 - 2039)
    let mut detected_year = None;
    let bytes = working.as_bytes();
    let mut year_ranges = Vec::new();

    // Scan for (YYYY) or [YYYY]
    for (i, &b) in bytes.iter().enumerate() {
        if (b == b'(' || b == b'[') && i + 5 < bytes.len() {
            let close = bytes[i + 5];
            if close == b')' || close == b']' {
                if let Ok(slice) = std::str::from_utf8(&bytes[i + 1..i + 5]) {
                    if let Ok(year) = slice.parse::<i32>() {
                        if (1970..=2039).contains(&year) {
                            detected_year = Some(year);
                            year_ranges.push((i, i + 6));
                        }
                    }
                }
            }
        }
    }

    for (start, end) in year_ranges.into_iter().rev() {
        working.replace_range(start..end, " ");
    }

    // Lowercase for tag removal
    let mut lower = working.to_lowercase();

    // Remove text inside brackets [ ... ] or parentheses ( ... )
    // These typically contain region, dump info, translations: (USA), [En,Ja], (v1.1)
    let mut cleaned_paren = String::with_capacity(lower.len());
    let mut depth = 0;
    for c in lower.chars() {
        match c {
            '(' | '[' => depth += 1,
            ')' | ']' => {
                if depth > 0 {
                    depth -= 1;
                }
            }
            _ => {
                if depth == 0 {
                    cleaned_paren.push(c);
                }
            }
        }
    }
    lower = cleaned_paren;

    // Edition / junk phrases to remove
    let junk_phrases = [
        "game of the year edition",
        "game of the year",
        "goty edition",
        "goty",
        "digital deluxe edition",
        "deluxe edition",
        "complete edition",
        "definitive edition",
        "director's cut",
        "directors cut",
        "anniversary edition",
        "enhanced edition",
        "special edition",
        "collector's edition",
        "collectors edition",
        "standard edition",
        "day one edition",
        "remastered",
        "early access",
        "disc 1",
        "disc 2",
        "disc 3",
        "disc 4",
        "cd 1",
        "cd 2",
    ];

    for junk in &junk_phrases {
        lower = lower.replace(junk, " ");
    }

    // Replace special punctuation with space except alphanumeric
    let mut clean_chars = String::with_capacity(lower.len());
    for c in lower.chars() {
        if c.is_alphanumeric() {
            clean_chars.push(c);
        } else {
            clean_chars.push(' ');
        }
    }

    // Canonicalize numeral tokens into unified representation
    let mut canonical_tokens = Vec::new();
    let mut sequel_identifier = None;
    for token in clean_chars.split_whitespace() {
        if token.starts_with('v') && token[1..].chars().all(|c| c.is_ascii_digit()) {
            continue;
        }
        if let Some(canon) = canonicalize_numeral(token) {
            sequel_identifier = Some(canon.to_string());
            canonical_tokens.push(canon);
        } else {
            canonical_tokens.push(token);
        }
    }

    let clean_title = canonical_tokens.join(" ");

    ParsedTitle {
        clean_title,
        detected_year,
        sequel_identifier,
    }
}

/// Calculate similarity score (0.0 to 1.0) between query and candidate title
pub fn calculate_match_score(
    query_title: &str,
    candidate_title: &str,
    query_year: Option<i32>,
    candidate_year: Option<i32>,
) -> f64 {
    let q_parsed = parse_and_normalize_title(query_title);
    let c_parsed = parse_and_normalize_title(candidate_title);

    let effective_q_year = query_year.or(q_parsed.detected_year);
    let effective_c_year = candidate_year.or(c_parsed.detected_year);

    // Exact clean title match
    if q_parsed.clean_title == c_parsed.clean_title {
        // Year check bonus or penalty
        if let (Some(qy), Some(cy)) = (effective_q_year, effective_c_year) {
            if qy == cy {
                return 1.0;
            } else {
                // Different release years (e.g. Prey 2006 vs 2017)
                return 0.70;
            }
        }
        return 0.95;
    }

    // If sequel identifiers conflict (e.g. "Doom" vs "Doom 2", "Final Fantasy 7" vs "Final Fantasy 8")
    if q_parsed.sequel_identifier != c_parsed.sequel_identifier {
        // If one has a sequel number and the other doesn't, or they are different numbers
        if q_parsed.sequel_identifier.is_some() || c_parsed.sequel_identifier.is_some() {
            return 0.30; // Heavy penalty to prevent wrong sequel binding
        }
    }

    // Token-based Jaccard similarity
    let q_tokens: HashSet<&str> = q_parsed.clean_title.split_whitespace().collect();
    let c_tokens: HashSet<&str> = c_parsed.clean_title.split_whitespace().collect();

    if q_tokens.is_empty() || c_tokens.is_empty() {
        return 0.0;
    }

    let intersection = q_tokens.intersection(&c_tokens).count();
    let union = q_tokens.union(&c_tokens).count();
    let jaccard = (intersection as f64) / (union as f64);

    let mut score = jaccard;

    // Subsequence / containment bonus: if candidate contains the full query title
    if c_parsed.clean_title.starts_with(&q_parsed.clean_title)
        || q_parsed.clean_title.starts_with(&c_parsed.clean_title)
    {
        score = (score + 0.20).min(0.90);
    }

    // Year adjustment
    if let (Some(qy), Some(cy)) = (effective_q_year, effective_c_year) {
        if qy == cy {
            score = (score + 0.08).min(1.0);
        } else {
            score = (score - 0.25).max(0.0);
        }
    }

    score
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_title_cleaning_editions_and_regions() {
        let p1 = parse_and_normalize_title("The Witcher 3: Wild Hunt - Game of the Year Edition");
        assert_eq!(p1.clean_title, "the witcher 3 wild hunt");
        assert_eq!(p1.sequel_identifier.as_deref(), Some("3"));

        let p2 = parse_and_normalize_title("Super Mario World (USA) [En]");
        assert_eq!(p2.clean_title, "super mario world");
        assert_eq!(p2.sequel_identifier, None);

        let p3 = parse_and_normalize_title("Dark_Souls_Remastered_v1.0.exe");
        assert_eq!(p3.clean_title, "dark souls");
    }

    #[test]
    fn test_year_extraction() {
        let p1 = parse_and_normalize_title("Prey (2006)");
        assert_eq!(p1.clean_title, "prey");
        assert_eq!(p1.detected_year, Some(2006));

        let p2 = parse_and_normalize_title("Prey (2017)");
        assert_eq!(p2.clean_title, "prey");
        assert_eq!(p2.detected_year, Some(2017));

        let score_diff = calculate_match_score("Prey (2006)", "Prey (2017)", None, None);
        assert!(
            score_diff < 0.75,
            "Different years should be penalized: {}",
            score_diff
        );

        let score_same = calculate_match_score("Prey (2006)", "Prey (2006)", None, None);
        assert_eq!(score_same, 1.0);
    }

    #[test]
    fn test_sequels_not_confused() {
        // Doom vs Doom II
        let score_sequel = calculate_match_score("Doom", "Doom II", None, None);
        assert!(
            score_sequel <= 0.35,
            "Sequel difference should score low: {}",
            score_sequel
        );

        // Doom 2 vs Doom II
        let score_roman = calculate_match_score("Doom 2", "Doom II", None, None);
        assert!(
            score_roman >= 0.85,
            "Equivalent numeral should score high: {}",
            score_roman
        );

        // Final Fantasy VII vs Final Fantasy VIII
        let score_ff = calculate_match_score("Final Fantasy VII", "Final Fantasy VIII", None, None);
        assert!(
            score_ff <= 0.35,
            "Different sequels should score low: {}",
            score_ff
        );
    }

    #[test]
    fn test_confidence_tiers() {
        assert_eq!(ConfidenceTier::from_score(0.95), ConfidenceTier::High);
        assert_eq!(ConfidenceTier::from_score(0.70), ConfidenceTier::Medium);
        assert_eq!(ConfidenceTier::from_score(0.40), ConfidenceTier::Low);
    }
}
