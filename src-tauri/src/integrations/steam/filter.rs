use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SteamFilterRule {
    pub id: String,
    pub name: String,
    pub description: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilterResult {
    pub is_filtered: bool,
    pub matched_rule_id: Option<String>,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SteamFilterConfig {
    pub rules: Vec<SteamFilterRule>,
    pub explicit_included_app_ids: Vec<u32>,
    pub explicit_excluded_app_ids: Vec<u32>,
}

impl Default for SteamFilterConfig {
    fn default() -> Self {
        Self {
            rules: vec![
                SteamFilterRule {
                    id: "redistributables".to_string(),
                    name: "Common Redistributables".to_string(),
                    description: "Filters runtime redistributables such as DirectX, VC++, and .NET frameworks (App ID 228980)".to_string(),
                    enabled: true,
                },
                SteamFilterRule {
                    id: "proton_runtime".to_string(),
                    name: "Proton & Linux Runtimes".to_string(),
                    description: "Filters Proton compatibility layers and Steam Linux Runtime container environments".to_string(),
                    enabled: true,
                },
                SteamFilterRule {
                    id: "sdks".to_string(),
                    name: "Software Development Kits".to_string(),
                    description: "Filters development toolkits, engine SDKs, and workshop developer tools".to_string(),
                    enabled: true,
                },
                SteamFilterRule {
                    id: "dedicated_servers".to_string(),
                    name: "Dedicated Game Servers".to_string(),
                    description: "Filters headless dedicated game servers and distribution tools".to_string(),
                    enabled: true,
                },
                SteamFilterRule {
                    id: "internal_tools".to_string(),
                    name: "VR & Launcher Tools".to_string(),
                    description: "Filters SteamVR utilities, Steam controller configs, and diagnostic tools".to_string(),
                    enabled: true,
                },
            ],
            explicit_included_app_ids: Vec::new(),
            explicit_excluded_app_ids: Vec::new(),
        }
    }
}

impl SteamFilterConfig {
    /// Evaluates whether an app should be filtered out based on rules and user overrides
    pub fn evaluate(&self, app_id: u32, name: &str) -> FilterResult {
        // 1. User explicit inclusion override takes highest precedence
        if self.explicit_included_app_ids.contains(&app_id) {
            return FilterResult {
                is_filtered: false,
                matched_rule_id: None,
                reason: None,
            };
        }

        // 2. User explicit exclusion override
        if self.explicit_excluded_app_ids.contains(&app_id) {
            return FilterResult {
                is_filtered: true,
                matched_rule_id: Some("user_override".to_string()),
                reason: Some("Manually excluded by user".to_string()),
            };
        }

        let name_lower = name.to_lowercase();

        for rule in &self.rules {
            if !rule.enabled {
                continue;
            }

            match rule.id.as_str() {
                "redistributables" => {
                    if app_id == 228980
                        || name_lower.contains("steamworks common redistributables")
                        || name_lower.contains("steamworks shared")
                    {
                        return FilterResult {
                            is_filtered: true,
                            matched_rule_id: Some(rule.id.clone()),
                            reason: Some(format!("Matches rule: {}", rule.name)),
                        };
                    }
                }
                "proton_runtime" => {
                    if name_lower.starts_with("proton ")
                        || name_lower == "proton experimental"
                        || name_lower.contains("steam linux runtime")
                    {
                        return FilterResult {
                            is_filtered: true,
                            matched_rule_id: Some(rule.id.clone()),
                            reason: Some(format!("Matches rule: {}", rule.name)),
                        };
                    }
                }
                "sdks" => {
                    if name_lower.ends_with(" sdk")
                        || name_lower.contains(" software development kit")
                        || name_lower.starts_with("source sdk")
                    {
                        return FilterResult {
                            is_filtered: true,
                            matched_rule_id: Some(rule.id.clone()),
                            reason: Some(format!("Matches rule: {}", rule.name)),
                        };
                    }
                }
                "dedicated_servers" => {
                    if name_lower.ends_with(" dedicated server")
                        || name_lower.contains(" dedicated server ")
                    {
                        return FilterResult {
                            is_filtered: true,
                            matched_rule_id: Some(rule.id.clone()),
                            reason: Some(format!("Matches rule: {}", rule.name)),
                        };
                    }
                }
                "internal_tools" => {
                    if name_lower == "steamvr"
                        || name_lower.ends_with(" tool")
                        || name_lower.ends_with(" tools")
                    {
                        return FilterResult {
                            is_filtered: true,
                            matched_rule_id: Some(rule.id.clone()),
                            reason: Some(format!("Matches rule: {}", rule.name)),
                        };
                    }
                }
                _ => {}
            }
        }

        FilterResult {
            is_filtered: false,
            matched_rule_id: None,
            reason: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_filter_redistributables() {
        let config = SteamFilterConfig::default();
        let res = config.evaluate(228980, "Steamworks Common Redistributables");
        assert!(res.is_filtered);
        assert_eq!(res.matched_rule_id, Some("redistributables".to_string()));
    }

    #[test]
    fn test_filter_proton_and_runtime() {
        let config = SteamFilterConfig::default();
        let res = config.evaluate(1234, "Proton 8.0");
        assert!(res.is_filtered);
        assert_eq!(res.matched_rule_id, Some("proton_runtime".to_string()));

        let res2 = config.evaluate(1235, "Steam Linux Runtime - Soldier");
        assert!(res2.is_filtered);
    }

    #[test]
    fn test_filter_dedicated_servers() {
        let config = SteamFilterConfig::default();
        let res = config.evaluate(9999, "Valheim Dedicated Server");
        assert!(res.is_filtered);
        assert_eq!(res.matched_rule_id, Some("dedicated_servers".to_string()));
    }

    #[test]
    fn test_allow_legitimate_games() {
        let config = SteamFilterConfig::default();
        let res = config.evaluate(105600, "Terraria");
        assert!(!res.is_filtered);

        let res2 = config.evaluate(236390, "War Thunder");
        assert!(!res2.is_filtered);
    }

    #[test]
    fn test_user_explicit_include_override() {
        let mut config = SteamFilterConfig::default();
        config.explicit_included_app_ids.push(228980);
        let res = config.evaluate(228980, "Steamworks Common Redistributables");
        assert!(!res.is_filtered);
    }

    #[test]
    fn test_disabled_rule() {
        let mut config = SteamFilterConfig::default();
        if let Some(rule) = config.rules.iter_mut().find(|r| r.id == "redistributables") {
            rule.enabled = false;
        }
        let res = config.evaluate(228980, "Steamworks Common Redistributables");
        assert!(!res.is_filtered);
    }
}
