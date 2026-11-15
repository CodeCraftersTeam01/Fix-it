<p align="center">
  <a href="https://github.com/CodeCraftersTeam01/Fix-it">
    <img src="./public/logo_white.png" alt="FixIt Logo" width="160" />
  </a>
</p>

<h1 align="center">FixIt</h1>

<p align="center">
  <strong>Autonomous AI Desktop Companion & Real-Time Code Repair Engine</strong><br />
  <em>Surgical syntax diagnostics, live inline diffs, and step-by-step reasoning for students and modern developers.</em>
</p>

<p align="center">
  <a href="https://github.com/CodeCraftersTeam01/Fix-it/releases/latest">
    <img src="https://img.shields.io/github/v/release/CodeCraftersTeam01/Fix-it?style=for-the-badge&color=10b981&label=Release" alt="Latest Release" />
  </a>
  <a href="https://github.com/CodeCraftersTeam01/Fix-it/actions/workflows/build.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/CodeCraftersTeam01/Fix-it/build.yml?branch=main&style=for-the-badge&label=Build%20Status" alt="Build Status" />
  </a>
  <a href="#-platforms">
    <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows-blue?style=for-the-badge&logo=apple&logoColor=white" alt="Platforms" />
  </a>
  <a href="#-memory-efficiency">
    <img src="https://img.shields.io/badge/RAM%20Footprint-%3C%2035%20MB-purple?style=for-the-badge&logo=speedtest&logoColor=white" alt="Memory Footprint" />
  </a>
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-orange?style=for-the-badge" alt="License" />
  </a>
</p>

<p align="center">
  <a href="#-key-features">Key Features</a> •
  <a href="#-download--installation">Download</a> •
  <a href="#-agentic-workflow">Agentic Workflow</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-getting-started">Getting Started</a> •
  <a href="#-roadmap">Roadmap</a>
</p>

---

## 💡 What is FixIt?

**FixIt** is a lightweight, zero-latency desktop companion built specifically to solve the frustration of debugging coding errors. It runs silently in the background, non-intrusively monitors student or developer project directories, catches syntax breaks the moment you pause typing (*Smart Idle Debounce*), and delivers a native **Pitch Dark Glass Floating HUD**.

Unlike standard chat interfaces that force you to copy-paste code back and forth, FixIt works as an **Autonomous AI Agent**:
1. **Reads** your project context and broken files.
2. **Reasons** over the exact cause of failure with step-by-step explanations.
3. **Applies surgical edits** via automated tool calling.
4. **Verifies syntax validity** immediately with embedded AST parsers.
5. **Presents inline side-by-side Diffs** right inside the HUD.

---

## ✨ Key Features

### 🤖 1. Autonomous Agentic Code Repair
- **Automated Tool Calling**: Executes structured tool invocations (`read_file`, `edit_file`, `write_file`, `list_dir`) directly on the local project workspace.
- **Self-Verifying Loop**: Automatically re-inspects modified files using native diagnostics to confirm syntax correctness before completing the session.
- **Zero-Latency Finish**: Instantly concludes and renders verified results as soon as the AST parser detects a green state without wasteful extra LLM roundtrips.

### 📑 2. Multi-Error Tab Management & Session Isolation
- **Per-File Session Isolation**: Steps, tool activities, diffs, and follow-up chat histories are completely separated per broken file. Switching between tabs preserves exact state without bleeding steps.
- **Visual Completion Checkmarks (`✓`)**: Resolved files receive a cozy emerald checkmark badge on the tab pill row, giving you real-time visual clarity on what has been fixed.

### 🔍 3. Real-Time Syntax Diagnostics (Multi-Language)
- **Built-in AST Parsers**: Embedded support for JavaScript, JSX, TypeScript, TSX, PHP, and Python.
- **Runtime Log & Trace Parser**: Catches Laravel stack traces, Node.js uncaught exceptions, and Python tracebacks directly from monitored runtime log files.
- **Smart Idle Debounce (2.5s)**: Listens passively while you write code without interrupting your focus. Analysis only fires when you pause typing or save.

### 🛡️ 4. FloodGuard™ & Loop Protection
- **Burst Throttling**: Normalizes fingerprints to prevent repetitive error storms or runaway `setInterval` loops from spamming notifications or draining API tokens.
- **Active Repair Window**: Temporarily silences file-watcher feedback while FixIt's AI agent applies code modifications to eliminate false-positive recursive triggers.

### 🪟 5. Pitch Dark Glass Floating HUD
- **Sleek Glassmorphic Design**: Frameless transparent window with background blur, subtle borders, and smooth transitions tailored to macOS and modern Windows desktops.
- **Interactive Reasoning Dropdowns**: Real-time collapsibles display the agent's thought chain, tools executed, and line-level diff viewers.
- **AskBar ("Tanya FixIt apa saja...")**: Follow-up chat input equipped with interactive screen region capture and prompt history.

### 🚀 6. Ultra-Lightweight Footprint (< 35 MB RAM)
- Built on **Tauri v2 (Rust + System Native WebView)** instead of bloated Chromium/Electron wrappers, consuming up to **10x less RAM** than traditional desktop assistants.

---

## 📥 Download & Installation

Visit the [**Latest Releases**](https://github.com/CodeCraftersTeam01/Fix-it/releases/latest) page to grab precompiled standalone installers:

| Operating System | Format | Architecture | Download |
| :--- | :--- | :--- | :--- |
| **macOS** | `.dmg` (Disk Image) | Apple Silicon (M1/M2/M3/M4) & Intel | [Download FixIt.dmg](https://github.com/CodeCraftersTeam01/Fix-it/releases/latest) |
| **Windows** | `.exe` (NSIS Setup) | x64 (Windows 10 / 11) | [Download FixIt-Setup.exe](https://github.com/CodeCraftersTeam01/Fix-it/releases/latest) |
| **Windows** | `.msi` (MSI Package) | x64 (Windows 10 / 11) | [Download FixIt.msi](https://github.com/CodeCraftersTeam01/Fix-it/releases/latest) |

### macOS Quick Install
1. Open the downloaded `.dmg` file.
2. Drag `FixIt.app` into your **Applications** folder.
3. Open FixIt from Spotlight or Launchpad.

---

## 🔄 Agentic Workflow

```
       [ Student / Developer edits code ]
                       │
                       ▼
         [ Smart Idle Watcher (2.5s) ]
                       │ (Debounced syntax change)
                       ▼
       [ Native AST Diagnostics Parser ]
                       │
            ┌──────────┴──────────┐
            ▼                     ▼
      [ Syntax Valid ]      [ Error Detected ]
            │                     │
      (Keep standby)       [ FloodGuard Check ]
                                  │
                                  ▼
                         [ Trigger Floating HUD ]
                                  │
                                  ▼
                    [ User clicks "Perbaiki Otomatis" ]
                                  │
                                  ▼
                     [ Agentic Engine Loop ]
                       ├── read_file
                       ├── thinking & reasoning
                       ├── edit_file (Surgical Diff)
                       └── AST Verification
                                  │
                                  ▼
                     [ Verified Green Check ✓ ]
                     (Instantly renders Diff & UI)
```

---

## 🛠️ Tech Stack & Architecture

```
FixIt/
├── src-tauri/                 # High-performance Core Engine (Rust + Tauri v2)
│   ├── src/
│   │   ├── agent_engine.rs    # Autonomous Agentic Loop & Tool Calling Driver
│   │   ├── ai_client.rs       # Multi-Provider OpenAI-Compatible REST Client
│   │   ├── diagnostics.rs     # Multi-Language AST Syntax & Parse Diagnostics
│   │   ├── flood_guard.rs     # Fingerprint Deduplication & Anti-Loop Engine
│   │   ├── runtime_parser.rs  # Stacktrace & Framework Runtime Log Aggregator
│   │   ├── watcher.rs         # Non-blocking Smart Idle Directory Watcher
│   │   └── lib.rs             # Tauri IPC Commands, State Management & Event Stream
│   └── Cargo.toml             # Rust Dependencies (Tokio, Tauri v2, Reqwest, Regex)
├── src/                       # Desktop HUD Frontend (React + TypeScript)
│   ├── components/
│   │   ├── FloatingHud.tsx    # Glassmorphic Main Interface & Activity Stream
│   │   ├── DiffViewer.tsx     # Syntax Highlighted Side-by-Side Diff Component
│   │   ├── ErrorGuideCard.tsx # Pedagogical Error Diagnosis & Checklist
│   │   └── AskBar.tsx         # Contextual Chat Bar with Screen Snapshot Tool
│   ├── types/                 # Universal TypeScript Contracts
│   └── styles/hud.css         # Custom Glassmorphism, Vibrancy & Scrollbars
└── .github/workflows/         # Multi-Platform CI/CD (Windows .exe + macOS .dmg)
```

### Supported AI Providers

FixIt connects out-of-the-box to industry-leading AI providers and any OpenAI-compatible API:

| Provider | Endpoint | Default Model | Highlights |
| :--- | :--- | :--- | :--- |
| **OpenAI** | `api.openai.com` | `gpt-4o` | Primary flagship reasoning (`gpt-4o`, `gpt-4o-mini`, `o3-mini`, `o1`) |
| **Anthropic Claude** | `api.anthropic.com` | `claude-3-7-sonnet` | Hybrid reasoning & software architecture (`claude-3-7-sonnet`, `claude-3-5-sonnet`) |
| **Google Gemini** | `generativelanguage.googleapis.com` | `gemini-2.0-flash` | High-speed multimodal & precise diagnostics (`gemini-2.0-flash`, `gemini-1.5-pro`) |
| **DeepSeek AI** | `api.deepseek.com` | `deepseek-chat` | Coding benchmark specialist & chain-of-thought (`deepseek-chat`, `deepseek-reasoner`) |
| **Groq LPU** | `api.groq.com` | `llama-3.3-70b-versatile` | Ultra-low latency 500+ tokens/sec inference (`llama-3.3-70b-versatile`, `deepseek-r1-distill-llama-70b`) |
| **OpenRouter** | `openrouter.ai` | `deepseek/deepseek-r1:free` | Free community model hub & multi-provider fallback hub |

*Also supports local models via **Ollama** (`http://localhost:11434/v1`), **LM Studio**, and custom private OpenAI-compatible endpoints.*

---

## 💻 Getting Started (Development)

### Prerequisites
- [Node.js](https://nodejs.org/) (v20+ recommended)
- [Rust](https://rustup.rs/) (v1.78+ stable)
- Build tools:
  - macOS: `xcode-select --install`
  - Windows: Visual Studio C++ Build Tools

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/CodeCraftersTeam01/Fix-it.git
cd Fix-it

# Install Frontend dependencies
npm install
```

### 2. Run in Development Mode
```bash
# Launch interactive Tauri Desktop App with Hot-Module-Replacement
npm run tauri dev
```

### 3. Run Automated Tests
```bash
# Run Vitest Frontend Unit Tests
npm test -- --run

# Run Rust Core Engine Tests (50 test suites)
cargo test --manifest-path src-tauri/Cargo.toml
```

### 4. Build Production Installers
```bash
# Compiles optimized desktop release for your current OS
npm run tauri build
```

---

## 🤝 Contributing

Contributions, feedback, and pull requests are warmly welcome!

1. Fork the repository.
2. Create your feature branch (`git checkout -b feat/my-new-feature`).
3. Commit your changes (`git commit -m 'feat: add awesome new capability'`).
4. Push to the branch (`git push origin feat/my-new-feature`).
5. Open a Pull Request.

---

## 📄 License

This project is open-sourced under the [MIT License](./LICENSE).

<p align="center">
  Crafted with ❤️ by <strong>CodeCrafters Team</strong> • Built with <strong>Rust</strong> & <strong>Tauri</strong>
</p>
