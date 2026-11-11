pub mod ai_client;
pub mod config;
pub mod diagnostics;
pub mod flood_guard;
pub mod runtime_endpoint;
pub mod runtime_log_watcher;
pub mod runtime_parser;
pub mod watcher;

use ai_client::{AiClient, FixExplanation};
use config::AppConfig;
use diagnostics::DiagnosticsParser;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Window};
use tauri_plugin_notification::NotificationExt;
use tokio::sync::Mutex;
use watcher::SmartIdleWatcher;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct ActiveErrorRecord {
    pub error: diagnostics::CodeError,
    pub explanation: ai_client::FixExplanation,
    pub hit_count: u32,
    pub is_looping: bool,
    pub updated_at: u64,
}

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Mutex<AppConfig>>,
    pub flood_guard: Arc<Mutex<flood_guard::FloodGuard>>,
    pub active_errors: Arc<Mutex<HashMap<String, ActiveErrorRecord>>>,
}

impl AppState {
    pub fn new(config: AppConfig) -> Self {
        Self {
            config: Arc::new(Mutex::new(config)),
            flood_guard: Arc::new(Mutex::new(flood_guard::FloodGuard::new())),
            active_errors: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn with_flood_guard(config: AppConfig, flood_guard: flood_guard::FloodGuard) -> Self {
        Self {
            config: Arc::new(Mutex::new(config)),
            flood_guard: Arc::new(Mutex::new(flood_guard)),
            active_errors: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn add_or_update_error(
        &self,
        err: diagnostics::CodeError,
        explanation: ai_client::FixExplanation,
        hit_count: u32,
        is_looping: bool,
    ) -> ActiveErrorRecord {
        let mut errors = self.active_errors.lock().await;
        let norm_key = err.file_path.trim().replace('\\', "/");

        let existing_key = errors
            .keys()
            .find(|k| path_matches(k, &err.file_path))
            .cloned();
        let key = existing_key.unwrap_or(norm_key);

        let record = ActiveErrorRecord {
            error: err,
            explanation,
            hit_count,
            is_looping,
            updated_at: current_timestamp(),
        };

        errors.insert(key, record.clone());
        record
    }

    pub async fn get_error_for_file(&self, file_path: &str) -> Option<ActiveErrorRecord> {
        let errors = self.active_errors.lock().await;
        errors
            .iter()
            .find(|(k, _)| path_matches(k, file_path))
            .map(|(_, v)| v.clone())
    }

    pub async fn resolve_error(&self, file_path: &str) -> bool {
        let mut fg = self.flood_guard.lock().await;
        fg.reset_file(file_path);
        drop(fg);

        let mut errors = self.active_errors.lock().await;
        let mut removed = false;
        errors.retain(|k, _| {
            let m = path_matches(k, file_path);
            if m {
                removed = true;
            }
            !m
        });
        removed
    }

    pub async fn clear_all_errors(&self) {
        let mut fg = self.flood_guard.lock().await;
        *fg = flood_guard::FloodGuard::new();
        drop(fg);

        let mut errors = self.active_errors.lock().await;
        errors.clear();
    }

    pub async fn evaluate_flood(
        &self,
        file: &str,
        line: Option<usize>,
        err_type: &str,
        msg: &str,
    ) -> flood_guard::FloodAction {
        let mut fg = self.flood_guard.lock().await;
        fg.evaluate(file, line, err_type, msg)
    }

    pub async fn get_all_active_errors(&self) -> Vec<ActiveErrorRecord> {
        let errors = self.active_errors.lock().await;
        errors.values().cloned().collect()
    }
}

pub fn current_timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn path_matches(path1: &str, path2: &str) -> bool {
    let p1 = path1.trim().replace('\\', "/");
    let p2 = path2.trim().replace('\\', "/");
    if p1.is_empty() || p2.is_empty() {
        return false;
    }
    if p1 == p2 {
        return true;
    }
    if p1.ends_with(&p2) && p1[..p1.len() - p2.len()].ends_with('/') {
        return true;
    }
    if p2.ends_with(&p1) && p2[..p2.len() - p1.len()].ends_with('/') {
        return true;
    }
    false
}

pub fn create_fallback_explanation(err: &diagnostics::CodeError) -> FixExplanation {
    FixExplanation {
        summary: format!(
            "Terdeteksi {} pada baris {:?}",
            err.error_type,
            err.line_number.unwrap_or(0)
        ),
        why_it_happened: format!("Pesan error runtime/interpreter: {}", err.raw_message),
        steps: vec![
            "Periksa baris kode dan fungsi yang dipanggil.".to_string(),
            "Pastikan tipe data, nama metode, atau query database sudah benar.".to_string(),
            "Simpan kembali berkas dan muat ulang halaman.".to_string(),
        ],
        code_hint: err.snippet.clone(),
    }
}

pub fn init_env_path() {
    let mut paths = vec![
        "/opt/homebrew/bin".to_string(),
        "/usr/local/bin".to_string(),
    ];
    if let Some(home) = dirs::home_dir() {
        paths.push(format!("{}/.local/bin", home.display()));
        paths.push(format!("{}/Library/Application Support/Herd/bin", home.display()));
    }
    if let Ok(current_path) = std::env::var("PATH") {
        paths.push(current_path);
    }
    let new_path = paths.join(":");
    std::env::set_var("PATH", new_path);
}

pub mod commands {
    use super::*;
    use crate::ai_client::FixExplanation;
    use crate::diagnostics::CodeError;

    #[tauri::command]
    pub async fn start_dragging(window: Window) -> Result<(), String> {
        window.start_dragging().map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub async fn close_window(window: Window) -> Result<(), String> {
        // Closing via popup 'X' button only hides the window so background watcher remains active!
        window.hide().map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub async fn hide_window(window: Window) -> Result<(), String> {
        let _ = window.emit("fixit-reset-standby", ());
        window.hide().map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub async fn toggle_hud_expand(window: Window) -> Result<bool, String> {
        let size = window.inner_size().map_err(|e| e.to_string())?;
        let scale_factor = window.scale_factor().unwrap_or(1.0);
        let logical_w = size.width as f64 / scale_factor;

        let (new_w, new_h, is_expanded) = if logical_w > 450.0 {
            (380.0, 640.0, false)
        } else {
            (540.0, 740.0, true)
        };

        window
            .set_size(tauri::LogicalSize::new(new_w, new_h))
            .map_err(|e| e.to_string())?;
        Ok(is_expanded)
    }

    #[tauri::command]
    pub async fn open_settings_window(app: tauri::AppHandle) -> Result<(), String> {
        if let Some(window) = app.get_webview_window("settings") {
            window.show().map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    #[tauri::command]
    pub async fn hide_settings_window(app: tauri::AppHandle) -> Result<(), String> {
        if let Some(window) = app.get_webview_window("settings") {
            window.hide().map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    #[tauri::command]
    pub async fn discover_ide_workspaces() -> Result<Vec<String>, String> {
        Ok(AppConfig::discover_ide_workspaces())
    }

    #[tauri::command]
    pub async fn fetch_models_from_provider(
        base_url: String,
        api_key: Option<String>,
    ) -> Result<Vec<String>, String> {
        let clean_url = base_url.trim().trim_end_matches('/');
        let models_endpoint = if clean_url.ends_with("/models") {
            clean_url.to_string()
        } else {
            format!("{}/models", clean_url)
        };

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(12))
            .build()
            .map_err(|e| e.to_string())?;

        let mut req = client.get(&models_endpoint);

        if let Some(key) = api_key {
            let trimmed_key = key.trim();
            if !trimmed_key.is_empty() {
                req = req.header("Authorization", format!("Bearer {}", trimmed_key));
            }
        }

        let resp = req
            .send()
            .await
            .map_err(|e| format!("Koneksi gagal ke {}: {}", models_endpoint, e))?;

        if !resp.status().is_success() {
            return Err(format!(
                "Server mengembalikan status HTTP {}: {}",
                resp.status(),
                resp.status().canonical_reason().unwrap_or("Error")
            ));
        }

        let json: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("Format JSON tidak valid: {}", e))?;

        let mut model_ids: Vec<String> = Vec::new();

        // 1. OpenAI format: { "data": [ { "id": "..." } ] }
        if let Some(data) = json.get("data").and_then(|d| d.as_array()) {
            for item in data {
                if let Some(id) = item.get("id").and_then(|id| id.as_str()) {
                    model_ids.push(id.to_string());
                } else if let Some(s) = item.as_str() {
                    model_ids.push(s.to_string());
                }
            }
        }
        // 2. Ollama / alternative format: { "models": [ { "name": "..." } or { "id": "..." } ] }
        else if let Some(models) = json.get("models").and_then(|m| m.as_array()) {
            for item in models {
                if let Some(id) = item.get("id").and_then(|id| id.as_str()) {
                    model_ids.push(id.to_string());
                } else if let Some(name) = item.get("name").and_then(|name| name.as_str()) {
                    model_ids.push(name.to_string());
                } else if let Some(s) = item.as_str() {
                    model_ids.push(s.to_string());
                }
            }
        }
        // 3. Array at root: [ { "id": "..." }, ... ] or [ "gpt-4o", ... ]
        else if let Some(arr) = json.as_array() {
            for item in arr {
                if let Some(id) = item.get("id").and_then(|id| id.as_str()) {
                    model_ids.push(id.to_string());
                } else if let Some(s) = item.as_str() {
                    model_ids.push(s.to_string());
                }
            }
        }

        // Deduplicate and sort
        model_ids.sort();
        model_ids.dedup();

        if model_ids.is_empty() {
            return Err("Tidak ada model yang ditemukan dalam respon /models.".to_string());
        }

        Ok(model_ids)
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

    #[tauri::command]
    pub async fn ping_provider(
        base_url: String,
        api_key: Option<String>,
        protocol: Option<String>,
        _model_id: Option<String>,
    ) -> Result<u64, String> {
        let trimmed_url = base_url.trim().trim_end_matches('/');
        if trimmed_url.is_empty() {
            return Err("Base URL kosong".to_string());
        }

        let proto = protocol.unwrap_or_else(|| "openai".to_string()).to_lowercase();
        let key = api_key.unwrap_or_default().trim().to_string();

        if key.is_empty() {
            return Err("API Key belum diisi".to_string());
        }

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(6))
            .build()
            .map_err(|e| format!("Client error: {}", e))?;

        let start = std::time::Instant::now();

        let resp = if proto == "anthropic" {
            let endpoint = if trimmed_url.ends_with("/models") {
                trimmed_url.to_string()
            } else {
                format!("{}/models", trimmed_url)
            };
            client
                .get(&endpoint)
                .header("x-api-key", &key)
                .header("anthropic-version", "2023-06-01")
                .send()
                .await
        } else if proto == "gemini" {
            let endpoint = if trimmed_url.ends_with("/models") {
                format!("{}?key={}", trimmed_url, key)
            } else {
                format!("{}/models?key={}", trimmed_url, key)
            };
            client
                .get(&endpoint)
                .send()
                .await
        } else {
            // OpenAI compatible
            let endpoint = if trimmed_url.ends_with("/models") {
                trimmed_url.to_string()
            } else {
                format!("{}/models", trimmed_url)
            };
            client
                .get(&endpoint)
                .header("Authorization", format!("Bearer {}", key))
                .send()
                .await
        };

        let response = match resp {
            Ok(r) => r,
            Err(e) => {
                if e.is_timeout() {
                    return Err("Timeout (6s)".to_string());
                }
                return Err(format!("Network Error: {}", e));
            }
        };

        let status = response.status();
        let elapsed = start.elapsed().as_millis() as u64;

        if status.is_success() {
            Ok(elapsed)
        } else if status.as_u16() == 401 {
            Err("401 (Invalid Key)".to_string())
        } else if status.as_u16() == 403 {
            Err("403 (Akses Ditolak)".to_string())
        } else if status.as_u16() == 404 {
            Err("404 (Not Found)".to_string())
        } else if status.as_u16() == 429 {
            Err("429 (Rate Limit / Quota Habis)".to_string())
        } else {
            Err(format!("HTTP {} Error", status.as_u16()))
        }
    }

    #[tauri::command]
    pub async fn clear_active_error(
        app: tauri::AppHandle,
        state: tauri::State<'_, AppState>,
        file_path: Option<String>,
    ) -> Result<(), String> {
        if let Some(ref path) = file_path {
            state.resolve_error(path).await;
            let _ = app.emit(
                "fixit-error-resolved",
                serde_json::json!({
                    "file_path": path
                }),
            );
        } else {
            state.clear_all_errors().await;
            let _ = app.emit("fixit-reset-standby", ());
        }

        let sync_errors = state.get_all_active_errors().await;
        let _ = app.emit("fixit-errors-sync", &sync_errors);

        Ok(())
    }

    #[tauri::command]
    pub async fn get_active_errors(
        state: tauri::State<'_, AppState>,
    ) -> Result<Vec<ActiveErrorRecord>, String> {
        Ok(state.get_all_active_errors().await)
    }
}

pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let show_item = MenuItem::with_id(app, "show", "Buka FixIt", true, None::<&str>)?;
    let settings_item = MenuItem::with_id(app, "settings", "Pengaturan AI & Model...", true, None::<&str>)?;
    let hide_item = MenuItem::with_id(app, "hide", "Sembunyikan Jendela", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Keluar FixIt (Hentikan Background)", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &settings_item, &hide_item, &quit_item])?;

    let icon = tauri::include_image!("icons/tray.png");

    let _tray = TrayIconBuilder::with_id("fixit-tray")
        .icon(icon)
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("FixIt - Coding Assistant (Aktif di Background)")
        .on_menu_event(|app, event| {
            match event.id.as_ref() {
                "show" => {
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                }
                "settings" => {
                    let _ = app.emit("open-settings", ());
                    if let Some(win) = app.get_webview_window("settings") {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                }
                "hide" => {
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.emit("fixit-reset-standby", ());
                        let _ = win.hide();
                    }
                    if let Some(win) = app.get_webview_window("settings") {
                        let _ = win.hide();
                    }
                }
                "quit" => {
                    // This is the ONLY way to exit the app and terminate background service
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(win) = app.get_webview_window("main") {
                    if win.is_visible().unwrap_or(false) {
                        let _ = win.hide();
                    } else {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}

fn detect_active_ide() -> String {
    let output = std::process::Command::new("ps")
        .args(["-ax", "-o", "comm="])
        .output();
    if let Ok(out) = output {
        let text = String::from_utf8_lossy(&out.stdout).to_lowercase();
        if text.contains("antigravity ide") {
            return "Antigravity IDE".to_string();
        }
        if text.contains("cursor") {
            return "Cursor".to_string();
        }
        if text.contains("windsurf") {
            return "Windsurf".to_string();
        }
        if text.contains("kiro") {
            return "Kiro".to_string();
        }
        if text.contains("code") {
            return "VS Code".to_string();
        }
    }
    "Antigravity / VS Code".to_string()
}

#[derive(Clone)]
pub struct DebounceCache {
    entries: std::collections::HashMap<(String, Option<usize>), std::time::Instant>,
    window: std::time::Duration,
}

impl DebounceCache {
    pub fn new(window_ms: u64) -> Self {
        Self {
            entries: std::collections::HashMap::new(),
            window: std::time::Duration::from_millis(window_ms),
        }
    }

    pub fn check_and_record(&mut self, file_path: &str, line_number: Option<usize>) -> bool {
        let now = std::time::Instant::now();
        // Prune entries older than 10s to prevent unbounded memory growth
        self.entries
            .retain(|_, time| now.duration_since(*time) < std::time::Duration::from_secs(10));

        let key = (file_path.to_string(), line_number);
        if let Some(last_time) = self.entries.get(&key) {
            if now.duration_since(*last_time) < self.window {
                return false;
            }
        }
        self.entries.insert(key, now);
        true
    }
}

pub fn crash_info_to_code_error(
    crash_info: &runtime_parser::RuntimeCrashInfo,
) -> diagnostics::CodeError {
    let line_number = if crash_info.line_number > 0 {
        Some(crash_info.line_number as usize)
    } else {
        None
    };

    let p = std::path::Path::new(&crash_info.file_path);
    let snippet = crash_info
        .snippet
        .clone()
        .or_else(|| diagnostics::DiagnosticsParser::extract_snippet(p, line_number));

    let project_name = p
        .parent()
        .and_then(|parent| parent.file_name())
        .map(|parent| parent.to_string_lossy().to_string());

    diagnostics::CodeError {
        file_path: crash_info.file_path.clone(),
        line_number,
        error_type: crash_info.error_type.clone(),
        raw_message: crash_info.message.clone(),
        snippet,
        project_name,
    }
}

pub async fn resolve_file_error(app_handle: &AppHandle, file_path: &str) {
    let state: tauri::State<AppState> = app_handle.state();
    state.resolve_error(file_path).await;

    let _ = app_handle.emit(
        "fixit-error-resolved",
        serde_json::json!({
            "file_path": file_path
        }),
    );

    let sync_errors = state.get_all_active_errors().await;
    let _ = app_handle.emit("fixit-errors-sync", &sync_errors);
}

pub async fn process_and_emit_error(app_handle: &AppHandle, mut err: diagnostics::CodeError) {
    let p = std::path::Path::new(&err.file_path);
    let file_name = p
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_else(|| "kode".to_string());

    if err.project_name.is_none() {
        let project = p
            .parent()
            .and_then(|parent| parent.file_name())
            .map(|parent| parent.to_string_lossy().to_string())
            .unwrap_or_else(|| "Workspace".to_string());
        err.project_name = Some(project);
    }

    let state: tauri::State<AppState> = app_handle.state();
    let flood_action = state
        .evaluate_flood(
            &err.file_path,
            err.line_number,
            &err.error_type,
            &err.raw_message,
        )
        .await;

    match flood_action {
        flood_guard::FloodAction::CachedOrIgnored => {
            // Drop redundant duplicate within debounce window
            return;
        }
        flood_guard::FloodAction::LoopThrottled { hit_count } => {
            // Rapid repeat / loop detected: Do NOT call AI again!
            let record = if let Some(existing) = state.get_error_for_file(&err.file_path).await {
                state
                    .add_or_update_error(err.clone(), existing.explanation, hit_count, true)
                    .await
            } else {
                let fallback = create_fallback_explanation(&err);
                state
                    .add_or_update_error(err.clone(), fallback, hit_count, true)
                    .await
            };

            let _ = app_handle.emit(
                "fixit-error-detected",
                serde_json::json!({
                    "error": record.error,
                    "explanation": record.explanation,
                    "hit_count": record.hit_count,
                    "is_looping": true
                }),
            );

            let sync_errors = state.get_all_active_errors().await;
            let _ = app_handle.emit("fixit-errors-sync", &sync_errors);

            if let Some(win) = app_handle.get_webview_window("main") {
                let _ = win.show();
            }
        }
        flood_guard::FloodAction::ProcessFresh => {
            let editor = detect_active_ide();
            let line_str = err
                .line_number
                .map(|l| format!(" di baris {}", l))
                .unwrap_or_default();
            let notif_body = format!(
                "Ditemukan {}{} pada berkas {}",
                err.error_type, line_str, file_name
            );

            let _ = app_handle
                .notification()
                .builder()
                .title("FixIt: Ada Error Terdeteksi")
                .body(&notif_body)
                .show();

            // Emit analyzing/thinking status immediately to the HUD
            let _ = app_handle.emit(
                "fixit-error-analyzing",
                serde_json::json!({
                    "file_name": file_name,
                    "editor": editor,
                    "line": err.line_number,
                    "error_type": err.error_type,
                    "file_path": err.file_path,
                }),
            );

            if let Some(win) = app_handle.get_webview_window("main") {
                let _ = win.show();
                let _ = win.set_focus();
            }

            let conf = state.config.lock().await.clone();
            let explanation = match AiClient::analyze_error(&err, &conf).await {
                Ok(exp) => exp,
                Err(e) => {
                    eprintln!("FixIt AI Analysis Error: {}", e);
                    create_fallback_explanation(&err)
                }
            };

            let record = state
                .add_or_update_error(err.clone(), explanation, 1, false)
                .await;

            let _ = app_handle.emit(
                "fixit-error-detected",
                serde_json::json!({
                    "error": record.error,
                    "explanation": record.explanation,
                    "hit_count": 1,
                    "is_looping": false
                }),
            );

            let sync_errors = state.get_all_active_errors().await;
            let _ = app_handle.emit("fixit-errors-sync", &sync_errors);

            if let Some(win) = app_handle.get_webview_window("main") {
                let _ = win.show();
            }
        }
    }
}

pub fn setup_background_service(
    app: &AppHandle,
    config: &AppConfig,
    _debounce_cache: Arc<std::sync::Mutex<DebounceCache>>,
) {
    let app_handle = app.clone();
    let idle_ms = config.idle_delay_ms;
    let paths: Vec<PathBuf> = config.watched_paths.iter().map(PathBuf::from).collect();

    if paths.is_empty() {
        return;
    }

    let watcher = SmartIdleWatcher::new(idle_ms);
    let app_for_writing = app_handle.clone();
    let app_for_idle = app_handle.clone();
    let app_for_log = app_handle.clone();

    let log_tailer = Arc::new(std::sync::Mutex::new(runtime_log_watcher::LogTailer::new()));
    let watched_paths_clone = paths.clone();

    let _ = watcher.watch_paths(
        paths,
        // 1. Real-time writing callback
        move |writing_file| {
            let app_inner = app_for_writing.clone();
            let file_name = writing_file
                .file_name()
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_else(|| "berkas".to_string());

            let project = writing_file
                .parent()
                .and_then(|p| p.file_name())
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|| "Workspace".to_string());

            let editor = detect_active_ide();

            let _ = app_inner.emit("fixit-file-writing", serde_json::json!({
                "file_path": writing_file.to_string_lossy().to_string(),
                "file_name": file_name,
                "project": project,
                "editor": editor,
                "status": "Sedang Menulis...",
                "timestamp": current_timestamp()
            }));
        },
        // 2. Idle debounce callback (evaluates code after student pauses typing)
        move |changed_file| {
            let app_inner = app_for_idle.clone();
            tauri::async_runtime::spawn(async move {
                let file_name = changed_file
                    .file_name()
                    .map(|f| f.to_string_lossy().to_string())
                    .unwrap_or_else(|| "kode".to_string());

                let project = changed_file
                    .parent()
                    .and_then(|p| p.file_name())
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|| "Workspace".to_string());

                let editor = detect_active_ide();

                if let Some(mut err) = DiagnosticsParser::inspect_file(&changed_file) {
                    err.project_name = Some(project.clone());
                    process_and_emit_error(&app_inner, err).await;
                } else {
                    let file_path_str = changed_file.to_string_lossy().to_string();
                    resolve_file_error(&app_inner, &file_path_str).await;

                    // Valid syntax after typing paused
                    let _ = app_inner.emit("fixit-file-valid", serde_json::json!({
                        "file_path": file_path_str,
                        "file_name": file_name,
                        "project": project,
                        "editor": editor,
                        "status": "Sintaks Valid ✓",
                        "timestamp": current_timestamp()
                    }));
                }
            });
        },
        // 3. Log event callback (Pipeline 1: Universal Log Tailer)
        move |log_file| {
            let entries = {
                if let Ok(mut tailer) = log_tailer.lock() {
                    tailer.read_new_entries(&log_file).unwrap_or_default()
                } else {
                    Vec::new()
                }
            };

            if entries.is_empty() {
                return;
            }

            // Determine workspace root if log_file is inside one of watched_paths
            let workspace_root = watched_paths_clone
                .iter()
                .find(|w| log_file.starts_with(w))
                .map(|p| p.to_string_lossy().to_string());

            for entry in entries {
                if let Some(crash_info) = runtime_parser::parse_runtime_log_entry(
                    &entry,
                    workspace_root.as_deref(),
                ) {
                    let code_error = crash_info_to_code_error(&crash_info);
                    let app_inner = app_for_log.clone();
                    tauri::async_runtime::spawn(async move {
                        process_and_emit_error(&app_inner, code_error).await;
                    });
                }
            }
        },
    );
}

pub fn run() {
    init_env_path();
    let initial_config = AppConfig::load();
    let app_state = AppState::new(initial_config.clone());

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::start_dragging,
            commands::close_window,
            commands::hide_window,
            commands::open_settings_window,
            commands::hide_settings_window,
            commands::get_config,
            commands::save_config,
            commands::analyze_code_error,
            commands::ask_followup,
            commands::discover_ide_workspaces,
            commands::fetch_models_from_provider,
            commands::toggle_hud_expand,
            commands::ping_provider,
            commands::clear_active_error,
            commands::get_active_errors
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Prevent destroying the window; hide it so background monitoring stays alive!
                api.prevent_close();
                let _ = window.emit("fixit-reset-standby", ());
                let _ = window.hide();
            }
        })
        .setup(move |app| {
            let debounce_cache = Arc::new(std::sync::Mutex::new(DebounceCache::new(1500)));

            let is_autostart = std::env::args().any(|arg| arg == "--autostart");
            #[cfg(target_os = "macos")]
            {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = window_vibrancy::apply_vibrancy(
                        &win,
                        window_vibrancy::NSVisualEffectMaterial::HudWindow,
                        Some(window_vibrancy::NSVisualEffectState::Active),
                        Some(32.0),
                    );
                    if is_autostart {
                        let _ = win.hide();
                    }
                }
                if let Some(settings_win) = app.get_webview_window("settings") {
                    let _ = window_vibrancy::apply_vibrancy(
                        &settings_win,
                        window_vibrancy::NSVisualEffectMaterial::HudWindow,
                        Some(window_vibrancy::NSVisualEffectState::Active),
                        Some(24.0),
                    );
                }
            }
            #[cfg(not(target_os = "macos"))]
            {
                if is_autostart {
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.hide();
                    }
                }
            }
            let _ = setup_tray(app.handle());
            setup_background_service(&app.handle().clone(), &initial_config, Arc::clone(&debounce_cache));

            // Pipeline 2: Local Loopback Ingestion on 127.0.0.1:45678
            let app_for_endpoint = app.handle().clone();
            runtime_endpoint::start_loopback_reporter(45678, move |crash_info| {
                let code_error = crash_info_to_code_error(&crash_info);
                let app_inner = app_for_endpoint.clone();
                tauri::async_runtime::spawn(async move {
                    process_and_emit_error(&app_inner, code_error).await;
                });
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running FixIt application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_debounce_cache_window() {
        let mut debounce = DebounceCache::new(50);
        assert!(debounce.check_and_record("app/Http/Controllers/TestController.php", Some(42)));
        // Immediate second call should be debounced
        assert!(!debounce.check_and_record("app/Http/Controllers/TestController.php", Some(42)));
        // Different line should not be debounced
        assert!(debounce.check_and_record("app/Http/Controllers/TestController.php", Some(43)));
        // Different file should not be debounced
        assert!(debounce.check_and_record("app/Http/Controllers/OtherController.php", Some(42)));

        // After window expires
        std::thread::sleep(std::time::Duration::from_millis(60));
        assert!(debounce.check_and_record("app/Http/Controllers/TestController.php", Some(42)));
    }

    #[test]
    fn test_crash_info_to_code_error_conversion() {
        let crash = runtime_parser::RuntimeCrashInfo {
            error_type: "QueryException".to_string(),
            message: "SQLSTATE[HY000]: General error: 1 no such table: users".to_string(),
            file_path: "/var/www/app/Models/User.php".to_string(),
            line_number: 28,
            snippet: Some("> 28 | return User::all();".to_string()),
        };

        let err = crash_info_to_code_error(&crash);
        assert_eq!(err.file_path, "/var/www/app/Models/User.php");
        assert_eq!(err.line_number, Some(28));
        assert_eq!(err.error_type, "QueryException");
        assert_eq!(err.raw_message, "SQLSTATE[HY000]: General error: 1 no such table: users");
        assert_eq!(err.snippet, Some("> 28 | return User::all();".to_string()));
        assert_eq!(err.project_name, Some("Models".to_string()));
    }

    #[tokio::test]
    async fn test_multi_error_registry_multiple_files() {
        let state = AppState::new(AppConfig::default());

        let err_a = diagnostics::CodeError {
            file_path: "/var/www/app/Http/Controllers/AuthController.php".to_string(),
            line_number: Some(45),
            error_type: "ParseError".to_string(),
            raw_message: "syntax error, unexpected token".to_string(),
            snippet: Some("return view('login');".to_string()),
            project_name: Some("FixIt".to_string()),
        };
        let exp_a = FixExplanation {
            summary: "Syntax error in AuthController".to_string(),
            why_it_happened: "Missing semicolon".to_string(),
            steps: vec!["Add semicolon".to_string()],
            code_hint: None,
        };

        let err_b = diagnostics::CodeError {
            file_path: "/var/www/app/Models/User.php".to_string(),
            line_number: Some(28),
            error_type: "QueryException".to_string(),
            raw_message: "no such table: users".to_string(),
            snippet: Some("return User::all();".to_string()),
            project_name: Some("FixIt".to_string()),
        };
        let exp_b = FixExplanation {
            summary: "Database error in User".to_string(),
            why_it_happened: "Migration missing".to_string(),
            steps: vec!["Run php artisan migrate".to_string()],
            code_hint: None,
        };

        state.add_or_update_error(err_a, exp_a, 1, false).await;
        state.add_or_update_error(err_b, exp_b, 1, false).await;

        let all = state.get_all_active_errors().await;
        assert_eq!(all.len(), 2, "Both files should be present in multi-error registry");

        let auth_err = state.get_error_for_file("app/Http/Controllers/AuthController.php").await;
        assert!(auth_err.is_some());
        assert_eq!(auth_err.unwrap().error.error_type, "ParseError");

        let user_err = state.get_error_for_file("app/Models/User.php").await;
        assert!(user_err.is_some());
        assert_eq!(user_err.unwrap().error.error_type, "QueryException");
    }

    #[tokio::test]
    async fn test_resolve_file_leaves_remaining_files() {
        let state = AppState::new(AppConfig::default());

        let err_a = diagnostics::CodeError {
            file_path: "/var/www/app/Http/Controllers/AuthController.php".to_string(),
            line_number: Some(45),
            error_type: "ParseError".to_string(),
            raw_message: "syntax error".to_string(),
            snippet: None,
            project_name: None,
        };
        let exp_a = FixExplanation {
            summary: "Auth error".to_string(),
            why_it_happened: "reason".to_string(),
            steps: vec![],
            code_hint: None,
        };

        let err_b = diagnostics::CodeError {
            file_path: "/var/www/app/Models/User.php".to_string(),
            line_number: Some(28),
            error_type: "QueryException".to_string(),
            raw_message: "db error".to_string(),
            snippet: None,
            project_name: None,
        };
        let exp_b = FixExplanation {
            summary: "User error".to_string(),
            why_it_happened: "reason".to_string(),
            steps: vec![],
            code_hint: None,
        };

        state.add_or_update_error(err_a, exp_a, 1, false).await;
        state.add_or_update_error(err_b, exp_b, 1, false).await;

        // Resolve file A
        let removed = state.resolve_error("app/Http/Controllers/AuthController.php").await;
        assert!(removed, "File A error should be resolved and removed");

        // File A is gone
        assert!(state.get_error_for_file("AuthController.php").await.is_none());

        // File B remains active!
        let remaining = state.get_all_active_errors().await;
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].error.file_path, "/var/www/app/Models/User.php");

        // Resolve file B
        state.resolve_error("app/Models/User.php").await;
        assert_eq!(state.get_all_active_errors().await.len(), 0);
    }

    #[tokio::test]
    async fn test_loop_throttle_updates_hit_count_without_requerying_ai() {
        let state = AppState::new(AppConfig::default());
        let file = "/var/www/app/Http/Controllers/PollingController.php";
        let line = Some(15);
        let err_type = "ErrorException";
        let msg = "Undefined variable: pollInterval";

        // 1. First occurrence is fresh
        let action1 = state.evaluate_flood(file, line, err_type, msg).await;
        assert_eq!(action1, flood_guard::FloodAction::ProcessFresh);

        let initial_exp = FixExplanation {
            summary: "Original AI explanation for PollingController".to_string(),
            why_it_happened: "Variable undefined".to_string(),
            steps: vec!["Initialize $pollInterval".to_string()],
            code_hint: Some("$pollInterval = 500;".to_string()),
        };

        let err = diagnostics::CodeError {
            file_path: file.to_string(),
            line_number: line,
            error_type: err_type.to_string(),
            raw_message: msg.to_string(),
            snippet: None,
            project_name: None,
        };

        state.add_or_update_error(err.clone(), initial_exp.clone(), 1, false).await;

        // 2. Second rapid occurrence within 5s returns LoopThrottled { hit_count: 2 }
        let action2 = state.evaluate_flood(file, line, err_type, msg).await;
        assert_eq!(action2, flood_guard::FloodAction::LoopThrottled { hit_count: 2 });

        // Update record with existing explanation, hit_count = 2, is_looping = true
        let existing = state.get_error_for_file(file).await.unwrap();
        state.add_or_update_error(err.clone(), existing.explanation, 2, true).await;

        let record = state.get_error_for_file(file).await.unwrap();
        assert_eq!(record.hit_count, 2);
        assert!(record.is_looping);
        assert_eq!(record.explanation.summary, "Original AI explanation for PollingController");

        // 3. Third rapid burst
        let action3 = state.evaluate_flood(file, line, err_type, msg).await;
        assert_eq!(action3, flood_guard::FloodAction::LoopThrottled { hit_count: 3 });

        // 4. Resolving file resets history
        state.resolve_error(file).await;
        assert!(state.get_error_for_file(file).await.is_none());

        // Subsequent error after resolution is ProcessFresh
        let action_fresh = state.evaluate_flood(file, line, err_type, msg).await;
        assert_eq!(action_fresh, flood_guard::FloodAction::ProcessFresh);
    }

    #[tokio::test]
    async fn test_clear_all_errors() {
        let state = AppState::new(AppConfig::default());
        let err = diagnostics::CodeError {
            file_path: "app/Models/Test.php".to_string(),
            line_number: Some(10),
            error_type: "Error".to_string(),
            raw_message: "some error".to_string(),
            snippet: None,
            project_name: None,
        };
        let exp = FixExplanation {
            summary: "summary".to_string(),
            why_it_happened: "why".to_string(),
            steps: vec![],
            code_hint: None,
        };

        state.add_or_update_error(err, exp, 1, false).await;
        assert_eq!(state.get_all_active_errors().await.len(), 1);

        state.clear_all_errors().await;
        assert_eq!(state.get_all_active_errors().await.len(), 0);
    }

    #[test]
    fn test_path_matches_utility() {
        assert!(path_matches("app/Http/Controllers/User.php", "app/Http/Controllers/User.php"));
        assert!(path_matches("/Users/dev/project/app/Http/Controllers/User.php", "app/Http/Controllers/User.php"));
        assert!(path_matches("app/Http/Controllers/User.php", "/Users/dev/project/app/Http/Controllers/User.php"));
        assert!(path_matches("User.php", "/path/to/User.php"));
        assert!(!path_matches("SuperUser.php", "/path/to/User.php"));
        assert!(!path_matches("/path/to/User.php", "SuperUser.php"));
        assert!(!path_matches("", "User.php"));
    }
}
