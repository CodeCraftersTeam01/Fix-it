# FixIt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun aplikasi desktop cerdas lintas platform (macOS, Windows, Linux) yang hemat memori (< 30 MB RAM) untuk mendeteksi error koding mahasiswa praktikum secara non-intrusif (smart idle debounce), memberikan notifikasi sistem, dan menyajikan jendela melayang (*floating HUD glass window*) berisi panduan perbaikan edukatif bertenaga AI OpenAI-compatible.

**Architecture:** Menggunakan arsitektur Tauri v2 (Rust backend + System Webview frontend). Engine Rust menangani pemantauan berkas lokal, mekanisme smart idle debounce, parsing diagnostik error, dan panggilan API AI. Frontend (React + Tailwind CSS) menyajikan jendela melayang *frameless* dengan efek kaca gelap (*vibrant dark blur*) yang menampilkan kartu bimbingan langkah demi langkah serta bar percakapan lanjutan.

**Tech Stack:**
- **Backend Core**: Tauri v2, Rust (crates: `notify`, `tokio`, `reqwest`, `serde`, `serde_json`, `tauri-plugin-notification`)
- **Frontend UI**: React 18 / 19, TypeScript, Tailwind CSS, Lucide Icons
- **AI Integration**: OpenAI-Compatible REST Client (`/v1/chat/completions`)

**Spec:** `docs/superpowers/specs/2026-11-11-fixit-design.md`

## Global Constraints
- Target RAM idle maksimal: 35 MB.
- Mendukung kustomisasi endpoint AI (`base_url`, `api_key`, `model_name`).
- Jeda *smart idle typing* default: 2.5 detik (dapat diatur pengguna).
- Desain jendela melayang wajib menyerupai referensi (dark glass, rounded corner, header status + close/expand, input chat di bawah).
- Aturan Git commit: 60% Lanvry (`wardilanang46@gmail.com`) / 40% CS-Orion (`codingsolver0@gmail.com`).

## Review Focus
1. **Debounce Overlap**: Mahasiswa mengetik cepat berturut-turut — pastikan timer idle di-reset tanpa memory leak atau race condition.
2. **Offline / Invalid API Key**: Ketika koneksi AI gagal atau API key salah, jendela HUD harus menampilkan pesan error edukatif ramah pemula, bukan crash.
3. **Empty / Non-Project Directory**: Penanganan jika path folder yang dipantau tidak valid atau terhapus.
4. **Large Log File Parsing**: Pembacaan log file (seperti `laravel.log`) hanya membaca delta/akhir berkas untuk mencegah konsumsi memori berlebih.
5. **Window Drag & Focus**: Jendela melayang dapat digeser atau ditutup dengan shortcut / tombol `(X)` tanpa meninggalkan proses zombie.

---

### Task 1: Tauri v2 & Frontend Scaffolding

**Files:**
- Create: `package.json`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`
- Create: `src/App.tsx`
- Test: `src-tauri/tests/scaffold_test.rs`

**Interfaces:**
- Produces: Basis aplikasi Tauri v2 yang dapat di-build dan dijalankan dengan webview transparan.

- [ ] **Step 1: Inisialisasi struktur proyek Tauri v2**
- [ ] **Step 2: Konfigurasi `tauri.conf.json` untuk jendela floating overlay (`decorations: false`, `transparent: true`, `alwaysOnTop: true`)**
- [ ] **Step 3: Setup Tailwind CSS & dependencies frontend**
- [ ] **Step 4: Jalankan verifikasi build Tauri**
- [ ] **Step 5: Commit**
  ```bash
  git -c user.name="Lanvry" -c user.email="wardilanang46@gmail.com" commit --author="Lanvry <wardilanang46@gmail.com>" -m "chore: scaffold tauri v2 and react frontend"
  ```

---

### Task 2: Configuration & App State Manager (Rust)

**Files:**
- Create: `src-tauri/src/config.rs`
- Test: `src-tauri/src/tests/config_test.rs`

**Interfaces:**
- Produces:
  ```rust
  pub struct AppConfig {
      pub openai_base_url: String,
      pub openai_api_key: String,
      pub model_name: String,
      pub idle_delay_ms: u64,
      pub watched_paths: Vec<String>,
  }
  impl AppConfig {
      pub fn load() -> Self;
      pub fn save(&self) -> Result<(), ConfigError>;
  }
  ```

- [ ] **Step 1: Tulis unit test untuk memuat default config dan menyimpan perubahan**
- [ ] **Step 2: Jalankan `cargo test config_test` (harus FAIL)**
- [ ] **Step 3: Implementasikan `AppConfig` dengan serialisasi JSON ke local config directory**
- [ ] **Step 4: Jalankan `cargo test config_test` (harus PASS)**
- [ ] **Step 5: Commit**
  ```bash
  git -c user.name="Lanvry" -c user.email="wardilanang46@gmail.com" commit --author="Lanvry <wardilanang46@gmail.com>" -m "feat(core): implement app configuration manager"
  ```

---

### Task 3: Smart Idle Debounce & File Watcher (Rust)

**Files:**
- Create: `src-tauri/src/watcher.rs`
- Test: `src-tauri/src/tests/watcher_test.rs`

**Interfaces:**
- Consumes: `AppConfig.idle_delay_ms`, `AppConfig.watched_paths`
- Produces:
  ```rust
  pub struct FileChangeEvent {
      pub path: PathBuf,
      pub timestamp: Instant,
  }
  pub struct SmartIdleWatcher {
      pub fn start<F>(&self, on_idle: F) where F: Fn(PathBuf) + Send + 'static;
  }
  ```

- [ ] **Step 1: Tulis test simulasi event berkas bertubi-tubi (debounce check)**
- [ ] **Step 2: Jalankan `cargo test watcher_test` (harus FAIL)**
- [ ] **Step 3: Implementasikan watcher dengan `notify-debouncer-mini` atau `tokio::time::sleep` debounce loop**
- [ ] **Step 4: Jalankan `cargo test watcher_test` (harus PASS)**
- [ ] **Step 5: Commit**
  ```bash
  git -c user.name="CS-Orion" -c user.email="codingsolver0@gmail.com" commit --author="CS-Orion <codingsolver0@gmail.com>" -m "feat(watcher): add smart idle typing debounce engine"
  ```

---

### Task 4: Error Diagnostic Extractor & Log Parser (Rust)

**Files:**
- Create: `src-tauri/src/diagnostics.rs`
- Test: `src-tauri/src/tests/diagnostics_test.rs`

**Interfaces:**
- Produces:
  ```rust
  #[derive(Serialize, Deserialize, Clone, Debug)]
  pub struct CodeError {
      pub file_path: String,
      pub line_number: Option<usize>,
      pub error_type: String,
      pub raw_message: String,
      pub snippet: Option<String>,
  }
  pub fn inspect_file_for_errors(path: &Path) -> Option<CodeError>;
  ```

- [ ] **Step 1: Tulis test kasus parser error sintaks (PHP, Python, JS/TS) dan log stack trace**
- [ ] **Step 2: Jalankan `cargo test diagnostics_test` (harus FAIL)**
- [ ] **Step 3: Implementasikan deteksi sintaks ringan & regex parser untuk error runtime/log umum**
- [ ] **Step 4: Jalankan `cargo test diagnostics_test` (harus PASS)**
- [ ] **Step 5: Commit**
  ```bash
  git -c user.name="Lanvry" -c user.email="wardilanang46@gmail.com" commit --author="Lanvry <wardilanang46@gmail.com>" -m "feat(diagnostics): implement multi-language error extractor"
  ```

---

### Task 5: OpenAI-Compatible AI Client & Educational Prompt (Rust)

**Files:**
- Create: `src-tauri/src/ai_client.rs`
- Test: `src-tauri/src/tests/ai_client_test.rs`

**Interfaces:**
- Consumes: `AppConfig`, `CodeError`
- Produces:
  ```rust
  #[derive(Serialize, Deserialize, Clone, Debug)]
  pub struct FixExplanation {
      pub summary: String,
      pub why_it_happened: String,
      pub steps: Vec<String>,
      pub code_hint: Option<String>,
  }
  pub async fn analyze_error(error: &CodeError, config: &AppConfig) -> Result<FixExplanation, AiError>;
  ```

- [ ] **Step 1: Tulis mock test panggilan API OpenAI-compatible & verifikasi format JSON terstruktur**
- [ ] **Step 2: Jalankan `cargo test ai_client_test` (harus FAIL)**
- [ ] **Step 3: Implementasikan client `reqwest` dengan system prompt pedagogis khusus mahasiswa**
- [ ] **Step 4: Jalankan `cargo test ai_client_test` (harus PASS)**
- [ ] **Step 5: Commit**
  ```bash
  git -c user.name="CS-Orion" -c user.email="codingsolver0@gmail.com" commit --author="CS-Orion <codingsolver0@gmail.com>" -m "feat(ai): add openai-compatible educational error analyzer"
  ```

---

### Task 6: Native System Notification & Window Trigger (Rust/Tauri)

**Files:**
- Create: `src-tauri/src/notification.rs`
- Modify: `src-tauri/src/main.rs`
- Test: `src-tauri/src/tests/notification_test.rs`

**Interfaces:**
- Consumes: `CodeError`, `FixExplanation`
- Produces:
  - Memancarkan notifikasi OS native ("Error di `UserController.php:42`").
  - Handler klik notifikasi membuka dan memfokuskan jendela melayang (*Floating HUD*).

- [ ] **Step 1: Tulis test format notifikasi dan payload passing ke frontend via Tauri Event**
- [ ] **Step 2: Jalankan `cargo test notification_test` (harus FAIL)**
- [ ] **Step 3: Implementasikan dispatch notifikasi via `tauri-plugin-notification` dan event `open-hud`**
- [ ] **Step 4: Jalankan `cargo test notification_test` (harus PASS)**
- [ ] **Step 5: Commit**
  ```bash
  git -c user.name="Lanvry" -c user.email="wardilanang46@gmail.com" commit --author="Lanvry <wardilanang46@gmail.com>" -m "feat(notify): link native notifications to floating hud trigger"
  ```

---

### Task 7: Floating HUD UI — Dark Glassmorphism Container (Frontend)

**Files:**
- Create: `src/components/FloatingHud.tsx`
- Create: `src/components/HeaderBar.tsx`
- Create: `src/styles/hud.css`
- Test: `src/components/__tests__/FloatingHud.test.tsx`

**Interfaces:**
- Produces: Komponen jendela melayang dengan styling rounded corner, backdrop blur gelap, tombol minimize/close `(X)`, dan tombol expand.

- [ ] **Step 1: Tulis unit test komponen `FloatingHud` (render header, close button, container classes)**
- [ ] **Step 2: Jalankan `npm test FloatingHud.test.tsx` (harus FAIL)**
- [ ] **Step 3: Implementasikan tampilan dark glass HUD sesuai gambar referensi**
- [ ] **Step 4: Jalankan `npm test FloatingHud.test.tsx` (harus PASS)**
- [ ] **Step 5: Commit**
  ```bash
  git -c user.name="Lanvry" -c user.email="wardilanang46@gmail.com" commit --author="Lanvry <wardilanang46@gmail.com>" -m "feat(ui): design sleek dark glass floating hud container"
  ```

---

### Task 8: Educational Step Cards & Interactive Chat Bar (Frontend)

**Files:**
- Create: `src/components/ErrorGuideCard.tsx`
- Create: `src/components/AskBar.tsx`
- Modify: `src/App.tsx`
- Test: `src/components/__tests__/ErrorGuideCard.test.tsx`

**Interfaces:**
- Consumes: `FixExplanation` dari Tauri Event
- Produces:
  - Tampilan kartu "Apa yang salah?", "Kenapa ini terjadi?", dan "Langkah perbaikan" (checklist).
  - Input bar melayang "Tanya FixIt..." untuk pertanyaan interaktif lanjutan mahasiswa.

- [ ] **Step 1: Tulis test render kartu edukatif dan interaksi pengiriman chat**
- [ ] **Step 2: Jalankan `npm test ErrorGuideCard.test.tsx` (harus FAIL)**
- [ ] **Step 3: Implementasikan `ErrorGuideCard` dan `AskBar` lengkap dengan state interaktif**
- [ ] **Step 4: Jalankan `npm test ErrorGuideCard.test.tsx` (harus PASS)**
- [ ] **Step 5: Commit**
  ```bash
  git -c user.name="CS-Orion" -c user.email="codingsolver0@gmail.com" commit --author="CS-Orion <codingsolver0@gmail.com>" -m "feat(ui): implement educational guide card and follow-up ask bar"
  ```

---

### Task 9: End-to-End Integration & Verification Loop

**Files:**
- Create: `e2e/workflow_test.rs` / `e2e/mock_project/broken_code.php`
- Modify: `docs/superpowers/specs/2026-11-11-fixit-design.md`

- [ ] **Step 1: Buat berkas kodingan tiruan yang mengandung error di direktori simulasi**
- [ ] **Step 2: Verifikasi alur menyeluruh: edit berkas -> jeda idle 2.5s -> notifikasi terpancing -> HUD menampilkan langkah perbaikan**
- [ ] **Step 3: Validasi penggunaan memori idle (< 35 MB RAM)**
- [ ] **Step 4: Final commit dan tagging**
  ```bash
  git -c user.name="Lanvry" -c user.email="wardilanang46@gmail.com" commit --author="Lanvry <wardilanang46@gmail.com>" -m "test(e2e): verify end-to-end idle detection and hud flow"
  ```

