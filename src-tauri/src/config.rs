use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ProviderModel {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct CustomProvider {
    pub id: String,
    pub name: String,
    pub protocol: String, // "openai" | "anthropic"
    pub base_url: String,
    #[serde(default)]
    pub api_keys: Vec<String>,
    #[serde(default)]
    pub active_model: String,
    #[serde(default)]
    pub available_models: Vec<ProviderModel>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct AppConfig {
    pub openai_base_url: String,
    pub openai_api_key: String,
    pub model_name: String,
    pub idle_delay_ms: u64,
    pub watched_paths: Vec<String>,
    #[serde(default = "default_active_provider")]
    pub active_provider: String,
    #[serde(default = "default_custom_providers")]
    pub custom_providers: Vec<CustomProvider>,
}

fn default_active_provider() -> String {
    "openai".to_string()
}

fn default_custom_providers() -> Vec<CustomProvider> {
    Vec::new()
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            openai_base_url: "https://api.openai.com/v1".to_string(),
            openai_api_key: String::new(),
            model_name: "gpt-4o".to_string(),
            idle_delay_ms: 2500,
            watched_paths: Vec::new(),
            active_provider: default_active_provider(),
            custom_providers: default_custom_providers(),
        }
    }
}

impl AppConfig {
    pub fn config_path() -> PathBuf {
        let base = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
        base.join("fixit").join("config.json")
    }

    pub fn get_effective_llm_config(&self) -> (String, String, String) {
        for cp in &self.custom_providers {
            if cp.id == self.active_provider {
                let key = cp.api_keys.first().cloned().unwrap_or_default();
                let model = if !cp.active_model.trim().is_empty() {
                    cp.active_model.clone()
                } else if !self.model_name.trim().is_empty() {
                    self.model_name.clone()
                } else {
                    cp.available_models
                        .first()
                        .map(|m| m.id.clone())
                        .unwrap_or_else(|| "default".to_string())
                };
                return (cp.base_url.clone(), key, model);
            }
        }
        (
            self.openai_base_url.clone(),
            self.openai_api_key.clone(),
            self.model_name.clone(),
        )
    }

    pub fn percent_decode(s: &str) -> String {
        let mut bytes = Vec::new();
        let mut chars = s.bytes();
        while let Some(b) = chars.next() {
            if b == b'%' {
                let h1 = chars.next().unwrap_or(0);
                let h2 = chars.next().unwrap_or(0);
                if let Ok(val) = u8::from_str_radix(std::str::from_utf8(&[h1, h2]).unwrap_or("00"), 16) {
                    bytes.push(val);
                    continue;
                }
            }
            bytes.push(b);
        }
        String::from_utf8_lossy(&bytes).to_string()
    }

    pub fn discover_ide_workspaces() -> Vec<String> {
        let mut paths = std::collections::BTreeSet::new();
        if let Some(home) = dirs::home_dir() {
            let herd = home.join("Herd");
            if herd.exists() {
                paths.insert(herd.to_string_lossy().to_string());
                if let Ok(entries) = fs::read_dir(&herd) {
                    for entry in entries.flatten() {
                        if let Ok(file_type) = entry.file_type() {
                            if file_type.is_dir() {
                                paths.insert(entry.path().to_string_lossy().to_string());
                            }
                        }
                    }
                }
            }

            let ides = [
                "Antigravity IDE",
                "Antigravity",
                "Code",
                "Code - Insiders",
                "Cursor",
                "Windsurf",
                "VSCodium",
                "Kiro",
                "Zed",
                "Sublime Text",
            ];
            let app_support = home.join("Library").join("Application Support");

            for ide in ides {
                let ide_dir = app_support.join(ide);
                let ws_storage = ide_dir.join("User").join("workspaceStorage");

                // 1. Check workspaceStorage for open tabs & windows
                if ws_storage.exists() {
                    if let Ok(entries) = fs::read_dir(ws_storage) {
                        for entry in entries.flatten() {
                            let ws_json = entry.path().join("workspace.json");
                            if ws_json.exists() {
                                if let Ok(content) = fs::read_to_string(&ws_json) {
                                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                                        // Case A: Single folder
                                        if let Some(folder_uri) = val["folder"].as_str() {
                                            if let Some(stripped) = folder_uri.strip_prefix("file://") {
                                                let decoded = Self::percent_decode(stripped);
                                                let p = PathBuf::from(decoded);
                                                if p.exists() {
                                                    paths.insert(p.to_string_lossy().to_string());
                                                }
                                            }
                                        }
                                        // Case B: Multi-root workspace file (.code-workspace)
                                        if let Some(ws_uri) = val["workspace"].as_str() {
                                            if let Some(stripped) = ws_uri.strip_prefix("file://") {
                                                let decoded = Self::percent_decode(stripped);
                                                let ws_path = PathBuf::from(&decoded);
                                                if ws_path.exists() {
                                                    if let Ok(ws_content) = fs::read_to_string(&ws_path) {
                                                        if let Ok(ws_val) = serde_json::from_str::<serde_json::Value>(&ws_content) {
                                                            if let Some(folders) = ws_val["folders"].as_array() {
                                                                let ws_dir = ws_path.parent().unwrap_or(&ws_path);
                                                                for f in folders {
                                                                    if let Some(rel) = f["path"].as_str() {
                                                                        let folder_path = ws_dir.join(rel);
                                                                        if folder_path.exists() {
                                                                            paths.insert(folder_path.to_string_lossy().to_string());
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // 2. Check globalStorage/state.vscdb for active & recently opened multi-IDE tabs
                let vscdb = ide_dir.join("User").join("globalStorage").join("state.vscdb");
                if vscdb.exists() {
                    if let Ok(out) = std::process::Command::new("sqlite3")
                        .args([
                            &vscdb.to_string_lossy().to_string(),
                            "SELECT value FROM ItemTable WHERE key = 'history.recentlyOpenedPathsList'",
                        ])
                        .output()
                    {
                        let stdout = String::from_utf8_lossy(&out.stdout);
                        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&stdout) {
                            if let Some(entries) = v.get("entries").and_then(|e| e.as_array()) {
                                for entry in entries {
                                    if let Some(f_uri) = entry.get("folderUri").and_then(|u| u.as_str()) {
                                        if let Some(stripped) = f_uri.strip_prefix("file://") {
                                            let decoded = Self::percent_decode(stripped);
                                            let p = PathBuf::from(decoded);
                                            if p.exists() {
                                                paths.insert(p.to_string_lossy().to_string());
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        paths.into_iter().collect()
    }

    pub fn default_watched_paths() -> Vec<String> {
        let mut paths = Self::discover_ide_workspaces();
        if paths.is_empty() {
            if let Some(home) = dirs::home_dir() {
                let herd = home.join("Herd");
                if herd.exists() {
                    paths.push(herd.to_string_lossy().to_string());
                } else {
                    paths.push(home.to_string_lossy().to_string());
                }
            }
        }
        if paths.is_empty() {
            if let Ok(cwd) = std::env::current_dir() {
                paths.push(cwd.to_string_lossy().to_string());
            }
        }
        paths
    }

    pub fn load() -> Self {
        let mut config = Self::default();
        let path = Self::config_path();
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(loaded) = serde_json::from_str::<AppConfig>(&content) {
                    config = loaded;
                }
            }
        }
        // Always ensure active IDE workspaces and Herd are monitored
        let discovered = Self::discover_ide_workspaces();
        let mut set: std::collections::BTreeSet<String> = config.watched_paths.into_iter().collect();
        for p in discovered {
            set.insert(p);
        }
        if set.is_empty() {
            config.watched_paths = Self::default_watched_paths();
        } else {
            config.watched_paths = set.into_iter().collect();
        }
        let _ = config.save();
        config
    }

    pub fn save(&self) -> Result<(), String> {
        let path = Self::config_path();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let json = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        fs::write(path, json).map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config_values() {
        let config = AppConfig::default();
        assert_eq!(config.openai_base_url, "https://api.openai.com/v1");
        assert_eq!(config.model_name, "gpt-4o");
        assert_eq!(config.active_provider, "openai");
        assert_eq!(config.idle_delay_ms, 2500);
        assert!(config.watched_paths.is_empty());
        assert!(config.custom_providers.is_empty());
    }

    #[test]
    fn test_serialization_roundtrip() {
        let mut config = AppConfig::default();
        config.openai_api_key = "test-sk-12345".to_string();
        config.watched_paths.push("/Users/student/project".to_string());

        let serialized = serde_json::to_string(&config).unwrap();
        let deserialized: AppConfig = serde_json::from_str(&serialized).unwrap();

        assert_eq!(config, deserialized);
        assert_eq!(deserialized.openai_api_key, "test-sk-12345");
        assert_eq!(deserialized.watched_paths.len(), 1);
    }
}

