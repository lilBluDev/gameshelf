use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkipRule {
    pub id: String,
    pub name: String,
    pub description: String,
    pub patterns: Vec<String>,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExclusionRule {
    pub id: String,
    pub pattern: String,
    pub enabled: bool,
}

/// Default directories and patterns that are always excluded from folder traversal
pub fn default_exclusions() -> Vec<String> {
    vec![
        "$recycle.bin".to_string(),
        "system volume information".to_string(),
        "windows".to_string(),
        "node_modules".to_string(),
        ".git".to_string(),
        ".svn".to_string(),
        ".hg".to_string(),
        "appdata".to_string(),
        "temp".to_string(),
        "tmp".to_string(),
        "program files/common files".to_string(),
        "program files (x86)/common files".to_string(),
        "msocache".to_string(),
        "recovery".to_string(),
    ]
}

/// Default rules for files to skip by default with explainable reasons
pub fn default_skip_rules() -> Vec<SkipRule> {
    vec![
        SkipRule {
            id: "uninstallers".to_string(),
            name: "Uninstallers".to_string(),
            description: "Install and uninstall utilities (unins000, uninstall, setup)".to_string(),
            patterns: vec![
                "unins*.exe".to_string(),
                "uninstall*.exe".to_string(),
                "setup*.exe".to_string(),
                "install*.exe".to_string(),
                "*_is1.exe".to_string(),
            ],
            enabled: true,
        },
        SkipRule {
            id: "crash_reporters".to_string(),
            name: "Crash Reporters & Handlers".to_string(),
            description: "Automated telemetry and crash reporting binaries".to_string(),
            patterns: vec![
                "crashreport*.exe".to_string(),
                "crash_reporter*.exe".to_string(),
                "unitycrashhandler*.exe".to_string(),
                "werfault*.exe".to_string(),
                "feedback*.exe".to_string(),
            ],
            enabled: true,
        },
        SkipRule {
            id: "updaters".to_string(),
            name: "Updaters & Patchers".to_string(),
            description: "Background update and patch checkers".to_string(),
            patterns: vec![
                "update*.exe".to_string(),
                "updater*.exe".to_string(),
                "patcher*.exe".to_string(),
                "autoupdate*.exe".to_string(),
            ],
            enabled: true,
        },
        SkipRule {
            id: "redistributables".to_string(),
            name: "Redistributables & Dependencies".to_string(),
            description: "DirectX, VC++ runtime, and .NET installers".to_string(),
            patterns: vec![
                "dxsetup.exe".to_string(),
                "vcredist*.exe".to_string(),
                "vc_redist*.exe".to_string(),
                "dotnetfx*.exe".to_string(),
                "oalinst.exe".to_string(),
                "physx*.exe".to_string(),
            ],
            enabled: true,
        },
        SkipRule {
            id: "anticheat".to_string(),
            name: "Anti-Cheat & Support Services".to_string(),
            description: "Auxiliary anti-cheat service executables".to_string(),
            patterns: vec![
                "easyanticheat*.exe".to_string(),
                "beservice*.exe".to_string(),
                "battleye*.exe".to_string(),
                "punkbuster*.exe".to_string(),
                "pbsvc*.exe".to_string(),
            ],
            enabled: true,
        },
        SkipRule {
            id: "benchmarks".to_string(),
            name: "Standalone Benchmarks".to_string(),
            description: "Hardware benchmark and stress-testing executables".to_string(),
            patterns: vec!["*benchmark*.exe".to_string(), "bench*.exe".to_string()],
            enabled: true,
        },
    ]
}

/// Known game engine indicator files and libraries
pub const KNOWN_ENGINE_INDICATORS: &[(&str, &str)] = &[
    ("UnityPlayer.dll", "Unity Engine"),
    ("UnrealPak.exe", "Unreal Engine"),
    ("UE4Game.exe", "Unreal Engine"),
    ("fmod.dll", "FMOD Audio Engine"),
    ("fmod64.dll", "FMOD Audio Engine"),
    ("binkw32.dll", "Bink Video"),
    ("bink2w64.dll", "Bink Video"),
    ("steam_api.dll", "Steamworks API"),
    ("steam_api64.dll", "Steamworks API"),
    ("openal32.dll", "OpenAL Sound Engine"),
    ("SDL2.dll", "SDL2 Game Framework"),
    ("SDL.dll", "SDL Game Framework"),
    ("mono-2.0-bdwgc.dll", "Mono / Unity Engine"),
    ("XAudio2_7.dll", "DirectX XAudio"),
];

/// Match a string against a simple glob pattern with '*' wildcards (case-insensitive)
pub fn matches_glob(pattern: &str, text: &str) -> bool {
    let p = pattern.to_lowercase();
    let t = text.to_lowercase();

    if p == "*" {
        return true;
    }

    if !p.contains('*') {
        return p == t;
    }

    let parts: Vec<&str> = p.split('*').collect();

    // Pattern like "*foo"
    if parts.len() == 2 && parts[0].is_empty() {
        return t.ends_with(parts[1]);
    }
    // Pattern like "foo*"
    if parts.len() == 2 && parts[1].is_empty() {
        return t.starts_with(parts[0]);
    }
    // Pattern like "*foo*"
    if parts.len() == 3 && parts[0].is_empty() && parts[2].is_empty() {
        return t.contains(parts[1]);
    }
    // Pattern like "foo*bar"
    if parts.len() == 2 {
        return t.starts_with(parts[0]) && t[parts[0].len()..].ends_with(parts[1]);
    }

    // General fallback for multiple wildcards
    let mut current_idx = 0;
    for (i, part) in parts.iter().enumerate() {
        if part.is_empty() {
            continue;
        }
        if i == 0 {
            if !t.starts_with(part) {
                return false;
            }
            current_idx = part.len();
        } else if i == parts.len() - 1 {
            return t[current_idx..].ends_with(part);
        } else if let Some(found_idx) = t[current_idx..].find(part) {
            current_idx += found_idx + part.len();
        } else {
            return false;
        }
    }

    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_matches_glob() {
        assert!(matches_glob("unins*.exe", "unins000.exe"));
        assert!(matches_glob("unins*.exe", "UNINS001.EXE"));
        assert!(matches_glob("*benchmark*.exe", "GameBenchmark_x64.exe"));
        assert!(matches_glob("setup.exe", "setup.exe"));
        assert!(!matches_glob("setup.exe", "game_setup.exe"));
        assert!(matches_glob("*_is1.exe", "Game_is1.exe"));
    }
}
