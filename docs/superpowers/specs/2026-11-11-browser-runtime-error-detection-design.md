# Design Document: Browser & Universal Runtime Error Detection

**Status:** Proposed  
**Date:** 2026-11-11  
**Author:** Antigravity Team  
**Target:** FixIt Desktop Application (Tauri v2 + Rust + React)

---

## 1. Intent and The Why

FixIt currently functions as a passive static syntax watcher (detecting parse/syntax errors when files are saved in the workspace). However, developer workflows heavily involve testing applications live in the browser (e.g., submitting login forms, navigating routes, executing database queries). 

When a runtime crash occurs (such as an `HTTP 500 Internal Server Error`, unhandled exception, or database query error), the developer sees a crash page or generic 500 error in the browser. 

The goal of this feature is to enable FixIt to **automatically capture runtime errors during browser testing**, extract the root cause exception, identify the exact source file and line number in the workspace, and immediately present a plain-language AI explanation and actionable checklist in the Floating HUD—**without requiring the user to install any browser extension**.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Zero-Extension Experience:** The user only needs to install the FixIt desktop application. No browser extension, no browser developer mode toggle, and no certificate installation.
- **Universal Framework Support:** Works seamlessly across any backend framework (Laravel, Symfony, Django, Flask, Express, NestJS, Next.js, Go/Gin, Spring Boot, PHP Native).
- **Accurate Code Localization:** Extracts the top application frame from the stack trace and highlights the exact file path and line number within the monitored workspace.
- **Seamless HUD Transition:** Feeds detected runtime errors directly into the existing `fixit-error-detected` pipeline so the user gets the same cozy, non-intrusive HUD card with AI diagnosis.

### Non-Goals
- Modifying browser internal binaries or browser configuration.
- Intercepting external internet/public HTTPS traffic (strictly focused on local development servers, e.g., `localhost:*`, `127.0.0.1:*`, `*.test`).
- Acting as a full APM or production monitoring agent.

### Anti-Goals
- Annoying the user with firewall prompts or self-signed root certificate warnings.
- Slowing down local network latency during web browsing.
- Crashing or hanging when massive log files exist (must read logs incrementally / tailed).

---

## 3. Approaches Considered & Selected

### Option A: Universal Workspace Log Watcher (Zero Network Overhead)
- Monitor project log files (`storage/logs/laravel.log`, `*.log`, server logs) using native OS filesystem notifications (`notify` crate).
- **Pros:** 100% reliable, zero network interference, instant stack trace resolution with line numbers.
- **Cons:** Dependent on the framework writing errors to disk.

### Option B: Local Network Loopback Proxy / Port Sniffer
- Sniff HTTP responses on standard local development ports (`8000`, `3000`, `5173`, `8080`, `80`, `443`).
- **Pros:** Catches HTTP 500 directly as the browser receives it.
- **Cons:** Local HTTPS requires SSL termination or proxy config.

### Chosen Strategy: Zero-Privilege Universal Log & Runtime Crash Engine
Following the builder check review, passive raw network packet capture (`pcap`/`bpf`) on macOS/Windows requires elevated `root`/`sudo` privileges, which violates our **zero-config and non-intrusive** anti-goal.

Therefore, the system uses a **Zero-Privilege Dual Pipeline**:
1. **Pipeline 1 (Universal Log & Crash File Tailer):**
   - Continuously watches framework log directories (`storage/logs/*.log`, `*.log`, system dev server error logs like Herd/XAMPP PHP logs) using non-blocking file tailing with byte-offset tracking.
   - Extracts stack traces, maps file path and line number in the workspace, and triggers AI diagnosis instantly (< 50ms).
2. **Pipeline 2 (Local Loopback Ingestion Endpoint):**
   - FixIt exposes an optional, local-only unprivileged loopback HTTP endpoint (`http://127.0.0.1:45678/report`).
   - Any framework error handler (or 1-line middleware) can push unhandled crash payloads to it directly if desired, without proxying all web traffic or requiring root access.

---

## 4. System Architecture

```
[ Developer in Browser ]
        |
   (HTTP 500 Error / Crash)
        |
   +----+-----------------------------+
   |                                  |
[Tier 1: Dev Port Sniffer]    [Tier 2: Universal Log Tailer]
(Parses HTTP 500 HTML/JSON)   (Tails storage/logs/*.log, php.log)
   |                                  |
   +----+-----------------------------+
        |
[ Runtime Crash Normalizer (Rust) ]
  - Extracts exception type & message
  - Parses stack trace frames (regex: file_path:line)
  - Maps file path to active Workspace folder
        |
[ Codebase Context Enricher ]
  - Reads surrounding lines of code from workspace
        |
[ AI Diagnostics Engine (LLM) ]
  - Generates summary, why_it_happened, and step-by-step fix
        |
[ Floating HUD (Tauri Frontend) ]
  - Displays ErrorGuideCard with file, line, and solution
```

---

## 5. Technical Specification

### 5.1 Universal Log Tailer (`src-tauri/src/runtime_watcher.rs`)
1. **Monitored Patterns:**
   - Laravel: `storage/logs/laravel.log`, `storage/logs/laravel-*.log`
   - Django: `debug.log`, `django.log`
   - Node / Express: `*.log`, `error.log`, `logs/*.log`
   - PHP Native / Herd: `~/Library/Application Support/Herd/config/php/*/php-fpm.log`, `/var/log/php-fpm.log`
2. **Log Tailing Strategy:**
   - Keep a byte-offset bookmark per file.
   - On filesystem change event, read only newly appended bytes (never re-read megabytes of old logs).
   - Use regex pattern matchers:
     - PHP/Laravel: `\[\d{4}-\d{2}-\d{2} .*?\] \w+\.ERROR: (.*?) in (.*?):(\d+)`
     - Node/JS: `([A-Za-z0-9_]+Error: .*?)\n\s+at .*? \((.*?):(\d+):(\d+)\)`
     - Python: `Traceback \(most recent call last\):[\s\S]*?File "(.*?)", line (\d+), in (.*?)\n(.*?Error: .*)`

### 5.2 Local Dev Port Sniffer (`src-tauri/src/port_sniffer.rs`)
1. Monitors local HTTP responses on common dev ports (`8000`, `3000`, `5173`, `8080`, `80`).
2. When status code is `500..=599`:
   - Inspect response body for known error signatures:
     - Laravel Ignition / Whoops HTML: `<div class="exception-message">(.*?)</div>`
     - Django Debug Page: `<th>Exception Value:</th><td><pre>(.*?)</pre></td>`
     - JSON error envelopes: `{"message": "...", "exception": "...", "file": "...", "line": ...}`
   - If successfully parsed, emit normalized error immediately.

### 5.3 Error Deduplication
- Debounce window of 1500ms: If Tier 1 and Tier 2 detect the same crash event (matching file and line number), only emit a single notification to the HUD.

---

## 6. Verification and Acceptance Criteria
1. **Laravel HTTP 500 Test:** Throwing an unhandled exception or calling an undefined method in a controller displays the error with the correct controller file name and line number in FixIt HUD.
2. **Node/Express Crash Test:** Throwing a `ReferenceError` during route handling triggers the HUD with the exact JS file and line.
3. **Zero Configuration:** Works automatically out-of-the-box upon selecting the workspace folder in FixIt.
4. **Performance:** Idle CPU usage must remain `< 0.2%` with instantaneous detection latency (`< 300ms`).

