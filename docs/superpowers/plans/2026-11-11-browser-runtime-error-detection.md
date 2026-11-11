# Browser & Universal Runtime Error Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable FixIt to automatically detect backend runtime crashes (HTTP 500, unhandled exceptions) while developers test applications in the browser without any browser extension, locating the exact workspace file and line number.

**Architecture:** Zero-privilege dual pipeline in Tauri/Rust. Pipeline 1 (Universal Log Tailer) monitors framework log files (`storage/logs/laravel.log`, `*.log`, dev server logs) via byte-offset tailing. Pipeline 2 (Local Loopback Ingestion) runs an unprivileged local listener on `127.0.0.1:45678/report` for direct crash reporting. Detected errors are normalized to `CodeError` and emitted to the Floating HUD for AI explanation.

**Tech Stack:** Rust (Tauri v2, notify, regex, std::net), React/TypeScript (Floating HUD).

**Spec:** `docs/superpowers/specs/2026-11-11-browser-runtime-error-detection-design.md`

## Global Constraints
- Zero browser extensions required. Pure desktop app.
- Zero root/elevated privileges (never request `sudo` or `/dev/bpf`).
- Idle CPU usage must remain `< 0.2%` by reading only newly appended bytes via tracked file offsets.
- Deduplication debounce window of 1500ms to prevent duplicate AI calls.
- Preserves all existing git commit identity distribution rules (60% Lanvry / 40% CS-Orion).

## Review Focus
1. Giant log file (>50MB): Tailer must start from the end of the file or current offset, never reading the whole file into RAM.
2. Log file rotation/clearing (`php artisan log:clear` or logrotate): File truncation must be detected without panic, resetting offset to 0.
3. Path outside workspace (e.g. vendor/laravel/framework): Parser must find the first application frame inside the workspace, not a deep framework internal line.
4. Non-UTF8 bytes in binary or malformed logs: Must read lossily without crashing the background thread.
5. Port conflict on loopback listener: If `45678` is in use, log a warning and fall back gracefully to Pipeline 1 without app crash.

---

### Task 1: Runtime Stack Trace Parser (`src-tauri/src/runtime_parser.rs`)

**Files:**
- Create: `src-tauri/src/runtime_parser.rs`
- Modify: `src-tauri/src/lib.rs` (register module)
- Test: unit tests within `src-tauri/src/runtime_parser.rs`

**Interfaces:**
- Produces:
  ```rust
  pub struct RuntimeCrashInfo {
      pub error_type: String,
      pub message: String,
      pub file_path: String,
      pub line_number: u32,
      pub snippet: Option<String>,
  }

  pub fn parse_runtime_log_entry(raw_entry: &str, workspace_root: Option<&str>) -> Option<RuntimeCrashInfo>;
  ```

- [ ] **Step 1: Write failing unit tests for Laravel, Node, and Python crash parsing**
  Include tests for:
  - Laravel/PHP: `[2026-11-11 16:30:00] local.ERROR: Call to undefined method App\Models\User::authentikasi() in /path/to/app/Http/Controllers/AuthController.php:42`
  - Node.js: `ReferenceError: token is not defined\n at login (/path/to/server.js:25:9)`
  - Framework stack trace filtering: Skips `/vendor/` or `node_modules` frames to prioritize the user's workspace file frame.

- [ ] **Step 2: Run test to verify it fails**
  Run: `cargo test --manifest-path src-tauri/Cargo.toml runtime_parser`
  Expected: FAIL (module/function not found).

- [ ] **Step 3: Implement `runtime_parser.rs`**
  Implement regex patterns and frame filtering prioritizing user application source files over framework internals.

- [ ] **Step 4: Run test to verify it passes**
  Run: `cargo test --manifest-path src-tauri/Cargo.toml runtime_parser`
  Expected: PASS (all tests pass).

- [ ] **Step 5: Commit**
  ```bash
  git -c user.name="CS-Orion" -c user.email="codingsolver0@gmail.com" commit --author="CS-Orion <codingsolver0@gmail.com>" -m "feat(runtime): add regex stack trace parser for PHP, Node, and Python"
  ```

---

### Task 2: Universal Log Tailer Engine (`src-tauri/src/runtime_log_watcher.rs`)

**Files:**
- Create: `src-tauri/src/runtime_log_watcher.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: unit tests in `src-tauri/src/runtime_log_watcher.rs`

**Interfaces:**
- Consumes: `parse_runtime_log_entry` from `runtime_parser.rs`.
- Produces:
  ```rust
  pub struct LogTailer {
      pub file_offsets: std::collections::HashMap<std::path::PathBuf, u64>,
  }

  impl LogTailer {
      pub fn new() -> Self;
      pub fn read_new_entries(&mut self, path: &std::path::Path) -> std::io::Result<Vec<String>>;
  }
  ```

- [ ] **Step 1: Write unit tests for incremental log reading and file truncation**
  Tests:
  - Reading appended lines updates byte offset.
  - When file size shrinks (truncation/cleared), offset resets to 0.
  - Large file (>10MB) starts at end of file on initial discovery.

- [ ] **Step 2: Run test to verify it fails**
  Run: `cargo test --manifest-path src-tauri/Cargo.toml runtime_log_watcher`
  Expected: FAIL.

- [ ] **Step 3: Implement `LogTailer` in `runtime_log_watcher.rs`**
  Use `std::fs::File`, `std::io::Seek`, and `Read` to extract only appended UTF-8 lines.

- [ ] **Step 4: Run test to verify it passes**
  Run: `cargo test --manifest-path src-tauri/Cargo.toml runtime_log_watcher`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git -c user.name="Lanvry" -c user.email="wardilanang46@gmail.com" commit --author="Lanvry <wardilanang46@gmail.com>" -m "feat(runtime): implement incremental byte-offset log tailer"
  ```

---

### Task 3: Local Loopback Ingestion Endpoint (`src-tauri/src/runtime_endpoint.rs`)

**Files:**
- Create: `src-tauri/src/runtime_endpoint.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces:
  ```rust
  pub fn start_loopback_reporter<F>(port: u16, on_crash: F)
  where
      F: Fn(RuntimeCrashInfo) + Send + Sync + 'static;
  ```

- [ ] **Step 1: Write test for loopback HTTP request parsing**
  Send a mock HTTP POST `{"message": "QueryException", "file": "index.php", "line": 10}` to loopback listener and verify callback receives `RuntimeCrashInfo`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `cargo test --manifest-path src-tauri/Cargo.toml runtime_endpoint`
  Expected: FAIL.

- [ ] **Step 3: Implement non-blocking loopback listener with `std::net::TcpListener`**
  Handle `POST /report` with JSON payload, return HTTP 200 `{"status": "ok"}` with CORS headers for local dev testing.

- [ ] **Step 4: Run test to verify it passes**
  Run: `cargo test --manifest-path src-tauri/Cargo.toml runtime_endpoint`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git -c user.name="Lanvry" -c user.email="wardilanang46@gmail.com" commit --author="Lanvry <wardilanang46@gmail.com>" -m "feat(runtime): add lightweight unprivileged loopback crash endpoint"
  ```

---

### Task 4: Integrate Dual Runtime Engine into Tauri Core & HUD (`src-tauri/src/lib.rs`)

**Files:**
- Modify: `src-tauri/src/lib.rs:430-580`
- Test: `src/components/__tests__/FloatingHud.test.tsx`

**Interfaces:**
- Consumes: `runtime_log_watcher`, `runtime_parser`, `runtime_endpoint`.
- Produces: Emits `fixit-error-detected` event to `main` webview with AI diagnosis.

- [ ] **Step 1: Connect `LogTailer` to background file watcher loop in `src-tauri/src/lib.rs`**
  When file watcher notices modification in `*.log` (e.g. `storage/logs/laravel.log` or PHP logs):
  - Read new lines via `LogTailer`.
  - Parse crash via `runtime_parser`.
  - If a crash frame is inside the monitored workspace, trigger AI error analysis and emit `fixit-error-detected`.
  - Apply 1500ms debounce to prevent duplicates.

- [ ] **Step 2: Start background loopback listener in `setup()`**
  Launch `runtime_endpoint` on thread with graceful port-binding failure fallback.

- [ ] **Step 3: Verify with vitest & cargo test**
  Run: `npm test -- --run && cargo test --manifest-path src-tauri/Cargo.toml`
  Expected: ALL PASS.

- [ ] **Step 4: Build release bundle and test live**
  Run: `npx tauri build --bundles app && cp -R src-tauri/target/release/bundle/macos/FixIt.app /Applications/FixIt.app`

- [ ] **Step 5: Commit**
  ```bash
  git -c user.name="CS-Orion" -c user.email="codingsolver0@gmail.com" commit --author="CS-Orion <codingsolver0@gmail.com>" -m "feat(runtime): wire dual runtime crash detection engine to HUD event pipeline"
  ```
