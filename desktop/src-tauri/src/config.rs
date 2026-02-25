use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    #[serde(default)]
    pub github_pat: String,
    #[serde(default = "default_poll_interval")]
    pub poll_interval_ms: u64,
}

fn default_poll_interval() -> u64 {
    60_000
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            github_pat: String::new(),
            poll_interval_ms: default_poll_interval(),
        }
    }
}

fn get_config_path() -> Result<PathBuf, String> {
    let config_dir = dirs::config_dir()
        .ok_or_else(|| "Failed to determine config directory".to_string())?;
    Ok(config_dir.join("gh-dash").join("config.json"))
}

#[tauri::command]
pub fn get_config() -> Result<AppConfig, String> {
    let config_path = get_config_path()?;

    if !config_path.exists() {
        if let Some(parent) = config_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create config dir: {}", e))?;
        }
        let default_config = AppConfig::default();
        let json = serde_json::to_string_pretty(&default_config)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;
        fs::write(&config_path, json)
            .map_err(|e| format!("Failed to write config: {}", e))?;
        return Ok(default_config);
    }

    let contents = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config: {}", e))?;
    serde_json::from_str(&contents)
        .map_err(|e| format!("Failed to parse config: {}", e))
}

#[tauri::command]
pub fn save_pat(pat: String) -> Result<AppConfig, String> {
    let config_path = get_config_path()?;
    let mut config = get_config()?;
    config.github_pat = pat;

    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    fs::write(&config_path, json)
        .map_err(|e| format!("Failed to write config: {}", e))?;
    Ok(config)
}

#[tauri::command]
pub fn save_poll_interval(interval_ms: u64) -> Result<AppConfig, String> {
    let config_path = get_config_path()?;
    let mut config = get_config()?;
    config.poll_interval_ms = interval_ms;

    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    fs::write(&config_path, json)
        .map_err(|e| format!("Failed to write config: {}", e))?;
    Ok(config)
}
