pub mod ai_client;
pub mod config;
pub mod diagnostics;
pub mod watcher;

use ai_client::AiClient;
use config::AppConfig;
use diagnostics::DiagnosticsParser;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, Window};
use tauri_plugin_notification::NotificationExt;
use tokio::sync::Mutex;
use watcher::SmartIdleWatcher;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Mutex<AppConfig>>,
}

pub mod commands {
    use super::*;
    use crate::ai_client::FixExplanation;
    use crate::diagnostics::CodeError;

    #[tauri::command]
    pub async fn close_window(window: Window) -> Result<(), String> {
        window.close().map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub async fn hide_window(window: Window) -> Result<(), String> {
        window.hide().map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub async fn get_config(state: tauri::State<'_, AppState>) -> Result<AppConfig, String> {
        let conf = state.config.lock().await;
        Ok(conf.clone())
    }

    #[tauri::command]
    pub async fn save_config(
        new_config: AppConfig,
        state: tauri::State<'_, AppState>,
    ) -> Result<(), String> {
        new_config.save()?;
        let mut conf = state.config.lock().await;
        *conf = new_config;
        Ok(())
    }

    #[tauri::command]
    pub async fn analyze_code_error(
        error: CodeError,
        state: tauri::State<'_, AppState>,
    ) -> Result<FixExplanation, String> {
        let conf = state.config.lock().await;
        AiClient::analyze_error(&error, &conf).await
    }

    #[tauri::command]
    pub async fn ask_followup(
        question: String,
        state: tauri::State<'_, AppState>,
    ) -> Result<String, String> {
        let conf = state.config.lock().await;
        if conf.openai_api_key.trim().is_empty() {
            return Ok("Silakan konfigurasikan OpenAI API Key pada pengaturan FixIt untuk mengaktifkan fitur chat tanya jawab interaktif.".to_string());
        }

        let endpoint = format!("{}/chat/completions", conf.openai_base_url.trim_end_matches('/'));
        let payload = serde_json::json!({
            "model": conf.model_name,
            "messages": [
                {
                    "role": "system",
                    "content": "Anda adalah asisten praktikum pemrograman FixIt. Jawablah pertanyaan mahasiswa secara ramah, ringkas, dan jelas dalam bahasa Indonesia."
                },
                {
                    "role": "user",
                    "content": question
                }
            ],
            "temperature": 0.4
        });

        let client = reqwest::Client::new();
        let resp = client
            .post(&endpoint)
            .header("Authorization", format!("Bearer {}", conf.openai_api_key))
            .json(&payload)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            return Err(format!("AI error: {}", resp.status()));
        }

        let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
        let content = json["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("Maaf, tidak dapat memproses jawaban.")
            .to_string();

        Ok(content)
    }
}

pub fn setup_background_service(app: &AppHandle, config: &AppConfig) {
    let app_handle = app.clone();
    let idle_ms = config.idle_delay_ms;
    let paths: Vec<PathBuf> = config.watched_paths.iter().map(PathBuf::from).collect();

    if paths.is_empty() {
        return;
    }

    let watcher = SmartIdleWatcher::new(idle_ms);
    let app_for_callback = app_handle.clone();

    let _ = watcher.watch_paths(paths, move |changed_file| {
        let app_inner = app_for_callback.clone();
        tokio::spawn(async move {
            if let Some(mut err) = DiagnosticsParser::inspect_file(&changed_file) {
                let file_name = changed_file
                    .file_name()
                    .map(|f| f.to_string_lossy().to_string())
                    .unwrap_or_else(|| "kode".to_string());

                let project = changed_file
                    .parent()
                    .and_then(|p| p.file_name())
                    .map(|p| p.to_string_lossy().to_string());
                err.project_name = project;

                let line_str = err.line_number.map(|l| format!(" di baris {}", l)).unwrap_or_default();
                let notif_body = format!("Ditemukan {}{} pada berkas {}", err.error_type, line_str, file_name);

                let _ = app_inner
                    .notification()
                    .builder()
                    .title("FixIt: Ada Error Terdeteksi")
                    .body(&notif_body)
                    .show();

                let state: tauri::State<AppState> = app_inner.state();
                let conf = state.config.lock().await;
                if let Ok(explanation) = AiClient::analyze_error(&err, &conf).await {
                    let _ = app_inner.emit("fixit-error-detected", serde_json::json!({
                        "error": err,
                        "explanation": explanation
                    }));
                }

                if let Some(win) = app_inner.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
        });
    });
}

pub fn run() {
    let initial_config = AppConfig::load();
    let app_state = AppState {
        config: Arc::new(Mutex::new(initial_config.clone())),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::close_window,
            commands::hide_window,
            commands::get_config,
            commands::save_config,
            commands::analyze_code_error,
            commands::ask_followup
        ])
        .setup(move |app| {
            setup_background_service(&app.handle().clone(), &initial_config);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running FixIt application");
}
