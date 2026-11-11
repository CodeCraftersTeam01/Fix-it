pub mod ai_client;
pub mod config;
pub mod diagnostics;
pub mod watcher;

use ai_client::{AiClient, FixExplanation};
use config::AppConfig;
use diagnostics::DiagnosticsParser;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Window};
use tauri_plugin_notification::NotificationExt;
use tokio::sync::Mutex;
use watcher::SmartIdleWatcher;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Mutex<AppConfig>>,
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

pub fn setup_background_service(app: &AppHandle, config: &AppConfig) {
    let app_handle = app.clone();
    let idle_ms = config.idle_delay_ms;
    let paths: Vec<PathBuf> = config.watched_paths.iter().map(PathBuf::from).collect();

    if paths.is_empty() {
        return;
    }

    let watcher = SmartIdleWatcher::new(idle_ms);
    let app_for_writing = app_handle.clone();
    let app_for_idle = app_handle.clone();

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
                "timestamp": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis()
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

                    let line_str = err.line_number.map(|l| format!(" di baris {}", l)).unwrap_or_default();
                    let notif_body = format!("Ditemukan {}{} pada berkas {}", err.error_type, line_str, file_name);

                    let _ = app_inner
                        .notification()
                        .builder()
                        .title("FixIt: Ada Error Terdeteksi")
                        .body(&notif_body)
                        .show();

                    // Emit analyzing/thinking status immediately to the HUD
                    let _ = app_inner.emit("fixit-error-analyzing", serde_json::json!({
                        "file_name": file_name,
                        "editor": editor,
                        "line": err.line_number,
                        "error_type": err.error_type,
                        "file_path": changed_file.to_string_lossy().to_string(),
                    }));

                    if let Some(win) = app_inner.get_webview_window("main") {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }

                    let state: tauri::State<AppState> = app_inner.state();
                    let conf = state.config.lock().await;
                    let explanation = match AiClient::analyze_error(&err, &conf).await {
                        Ok(exp) => exp,
                        Err(e) => {
                            eprintln!("FixIt AI Analysis Error: {}", e);
                            FixExplanation {
                                summary: format!("Terdeteksi {} pada baris {:?}", err.error_type, err.line_number.unwrap_or(0)),
                                why_it_happened: format!("Pesan error interpreter: {}", err.raw_message),
                                steps: vec![
                                    "Periksa sintaks pada baris terkait.".to_string(),
                                    "Pastikan tanda kurung, kutip, atau titik koma sudah sesuai.".to_string(),
                                    "Simpan kembali berkas (Cmd + S).".to_string(),
                                ],
                                code_hint: err.snippet.clone(),
                            }
                        }
                    };

                    let _ = app_inner.emit("fixit-error-detected", serde_json::json!({
                        "error": err,
                        "explanation": explanation
                    }));

                    if let Some(win) = app_inner.get_webview_window("main") {
                        let _ = win.show();
                    }
                } else {
                    // Valid syntax after typing paused
                    let _ = app_inner.emit("fixit-file-valid", serde_json::json!({
                        "file_path": changed_file.to_string_lossy().to_string(),
                        "file_name": file_name,
                        "project": project,
                        "editor": editor,
                        "status": "Sintaks Valid ✓",
                        "timestamp": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis()
                    }));
                }
            });
        },
    );
}

pub fn run() {
    init_env_path();
    let initial_config = AppConfig::load();
    let app_state = AppState {
        config: Arc::new(Mutex::new(initial_config.clone())),
    };

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
            commands::ping_provider
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Prevent destroying the window; hide it so background monitoring stays alive!
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(move |app| {
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
            setup_background_service(&app.handle().clone(), &initial_config);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running FixIt application");
}
