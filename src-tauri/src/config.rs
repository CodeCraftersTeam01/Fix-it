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
    "ciora".to_string()
}

fn default_custom_providers() -> Vec<CustomProvider> {
    vec![CustomProvider {
        id: "ciora".to_string(),
        name: "Ciora".to_string(),
        protocol: "openai".to_string(),
        base_url: "https://ciora.id/v1".to_string(),
        api_keys: vec!["sk-c89127398127367e5".to_string()],
        active_model: "glm-5.3-flash-free".to_string(),
        available_models: vec![
            ProviderModel {
                id: "glm-5.3-flash-free".to_string(),
                name: "glm-5.3-flash-free".to_string(),
                description: Some("Model glm-5.3-flash-free dari Ciora".to_string()),
            },
            ProviderModel {
                id: "nvidia/nemotron-3.5-super-v1-free".to_string(),
                name: "nvidia/nemotron-3.5-super-v1-free".to_string(),
                description: Some("Model nvidia/nemotron-3.5-super-v1-free dari Ciora".to_string()),
            },
            ProviderModel {
                id: "ciora-vision-free".to_string(),
                name: "ciora-vision-free".to_string(),
                description: Some("Model ciora-vision-free dari Ciora".to_string()),
            },
        ],
    }]
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            openai_base_url: "https://api.openai.com/v1".to_string(),
            openai_api_key: String::new(),
            model_name: "gpt-4o-mini".to_string(),
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

    pub fn default_watched_paths() -> Vec<String> {
        let mut paths = Vec::new();
        if let Some(home) = dirs::home_dir() {
            let herd = home.join("Herd");
            if herd.exists() {
                paths.push(herd.to_string_lossy().to_string());
            } else {
                paths.push(home.to_string_lossy().to_string());
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
        if config.watched_paths.is_empty() {
            config.watched_paths = Self::default_watched_paths();
            let _ = config.save();
        }
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
        assert_eq!(config.model_name, "gpt-4o-mini");
        assert_eq!(config.idle_delay_ms, 2500);
        assert!(config.watched_paths.is_empty());
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

