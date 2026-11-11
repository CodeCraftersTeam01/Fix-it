use crate::config::AppConfig;
use crate::diagnostics::CodeError;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct FixExplanation {
    pub summary: String,
    pub why_it_happened: String,
    pub steps: Vec<String>,
    pub code_hint: Option<String>,
}

#[derive(Serialize)]
struct ChatCompletionRequest {
    model: String,
    messages: Vec<ChatMessage>,
    temperature: f32,
}

#[derive(Serialize, Deserialize, Clone)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: ChatMessage,
}

pub struct AiClient;

impl AiClient {
    pub async fn analyze_error(
        error: &CodeError,
        config: &AppConfig,
    ) -> Result<FixExplanation, String> {
        if config.openai_api_key.trim().is_empty() {
            // Provide a sensible offline fallback response if API key is not configured yet
            return Ok(FixExplanation {
                summary: format!("Terdeteksi {} pada baris {:?}", error.error_type, error.line_number.unwrap_or(0)),
                why_it_happened: format!("Pesan error: {}. (Silakan masukkan OpenAI API Key di pengaturan FixIt untuk analisis AI mendalam)", error.raw_message),
                steps: vec![
                    "Periksa kembali sintaks pada baris terkait.".to_string(),
                    "Pastikan semua variabel dan fungsi telah dideklarasikan.".to_string(),
                ],
                code_hint: error.snippet.clone(),
            });
        }

        let system_prompt = r#"Anda adalah FixIt, asisten AI ramah dan edukatif untuk mahasiswa yang sedang praktikum pemrograman.
Tugas Anda adalah menganalisis pesan error kode yang diberikan dan memandu mahasiswa memahami serta memperbaikinya secara bertahap.
Output HARUS berformat JSON valid dengan struktur:
{
  "summary": "Ringkasan kesalahan dalam 1-2 kalimat bahasa Indonesia sederhana",
  "why_it_happened": "Penjelasan konsep mengapa error ini terjadi secara edukatif",
  "steps": [
    "Langkah 1 konkret perbaikan",
    "Langkah 2 konkret perbaikan",
    "Langkah 3 simpan dan tes ulang"
  ],
  "code_hint": "Potongan baris kode yang benar (opsional)"
}"#;

        let user_content = format!(
            "Berkas: {}\nBaris: {:?}\nTipe Error: {}\nPesan Error: {}\nPotongan Kode:\n{}",
            error.file_path,
            error.line_number,
            error.error_type,
            error.raw_message,
            error.snippet.as_deref().unwrap_or("(tidak tersedia)")
        );

        let endpoint = format!("{}/chat/completions", config.openai_base_url.trim_end_matches('/'));

        let request_body = ChatCompletionRequest {
            model: config.model_name.clone(),
            messages: vec![
                ChatMessage {
                    role: "system".to_string(),
                    content: system_prompt.to_string(),
                },
                ChatMessage {
                    role: "user".to_string(),
                    content: user_content,
                },
            ],
            temperature: 0.3,
        };

        let client = reqwest::Client::new();
        let resp = client
            .post(&endpoint)
            .header("Authorization", format!("Bearer {}", config.openai_api_key))
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send()
            .await
            .map_err(|e| format!("Gagal menghubungi AI endpoint: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let err_text = resp.text().await.unwrap_or_default();
            return Err(format!("AI API Error (Status {}): {}", status, err_text));
        }

        let body: ChatCompletionResponse = resp
            .json()
            .await
            .map_err(|e| format!("Gagal mem-parsing response AI: {}", e))?;

        let first_choice = body
            .choices
            .first()
            .ok_or_else(|| "Respons AI kosong".to_string())?;

        let content = first_choice.message.content.trim();
        // Clean markdown backticks if AI outputs ```json ... ```
        let clean_json = if let Some(stripped) = content.strip_prefix("```json") {
            stripped.strip_suffix("```").unwrap_or(stripped).trim()
        } else if let Some(stripped) = content.strip_prefix("```") {
            stripped.strip_suffix("```").unwrap_or(stripped).trim()
        } else {
            content
        };

        let explanation: FixExplanation = serde_json::from_str(clean_json).map_err(|e| {
            format!("Gagal memetakan JSON AI: {} - Raw: {}", e, clean_json)
        })?;

        Ok(explanation)
    }
}

