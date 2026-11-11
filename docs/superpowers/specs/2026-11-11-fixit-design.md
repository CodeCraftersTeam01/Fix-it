# FixIt: Smart Desktop Assistant for Programming Students
## Design Specification

**Date:** 2026-11-11  
**Status:** Approved for Implementation Planning  
**Target Platform:** macOS (primary focus, styled with native dark glass HUD), Windows, Linux  
**Target Audience:** Mahasiswa yang sedang praktikum / belajar pemrograman (baik bahasa pemrograman dasar maupun framework).

---

## 1. Intent & The "Why"
Mahasiswa yang sedang menjalani praktikum sering kali kebingungan saat menghadapi error kompilasi, sintaks, atau *runtime crash*. Pesan error standar dari terminal atau editor sering kali terlalu abstrak atau berbahasa teknis tingkat lanjut, sehingga mahasiswa sering *stuck* atau sekadar *copy-paste* solusi tanpa memahami akar permasalahannya.

**FixIt** hadir sebagai asisten cerdas yang menemani mahasiswa secara pasif di latar belakang:
1. Mendeteksi adanya error tanpa mengganggu proses mengetik mahasiswa (*smart debounce/idle analysis*).
2. Mengirimkan notifikasi sistem yang jelas (nama file, nomor baris, dan project).
3. Membuka jendela melayang (*floating HUD overlay*) bergaya dark mode minimalis khas macOS saat notifikasi diklik.
4. Menjelaskan akar masalah dan langkah-langkah solusinya secara edukatif menggunakan LLM berbasis OpenAI-compatible endpoint.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Sangat Hemat RAM (< 30–40 MB idle)**: Mahasiswa dengan RAM 8 GB harus tetap lancar membuka IDE, browser, dan server lokal (seperti Laravel Herd/Docker).
- **Cross-Platform Ready**: Arsitektur mendukung macOS, Windows, dan Linux.
- **Smart Idle Typing Detection**: Tidak memunculkan notifikasi bising saat mahasiswa masih di tengah-tengah mengetik (`debounce` ~2–3 detik).
- **Jendela Melayang Minimalis (HUD Overlay)**: Desain persis seperti referensi visual (dark glass blur, rounded corner, always-on-top, header dengan tombol close & expand, chat bar interaktif di bawah).
- **Dukungan OpenAI-Compatible API**: Fleksibel menghubungkan berbagai provider AI (OpenAI, Groq, Ollama lokal, OpenRouter, DeepSeek) hanya dengan mengatur `base_url`, `api_key`, dan `model`.
- **Eksplanasi Edukatif**: Prompt AI diarahkan untuk membimbing mahasiswa agar mengerti konsep kesalahannya, bukan sekadar memuntahkan kode jadi.

### Non-Goals
- Tidak menggantikan IDE mahasiswa (mahasiswa tetap menggunakan VS Code, Kiro, Antigravity, dsb.).
- Tidak melakukan *auto-overwrite* kode mahasiswa tanpa persetujuan (mahasiswa yang menerapkan perbaikan agar belajar).

### Anti-Goals
- **Bukan Bloatware**: Tidak menggunakan Electron yang memakan ratusan MB RAM.
- **Bukan Notification Spam**: Dilarang memunculkan notifikasi setiap ada tombol keyboard ditekan.

---

## 3. Evaluated Approaches & Decision

| Pendekatan | Kelebihan | Kekurangan | Putusan |
|---|---|---|---|
| **A. Native Swift/SwiftUI** | Performa maksimal di macOS, animasi sangat halus, RAM <25MB. | Tidak bisa dijalankan di Windows atau Linux (harus rewrite total). | *Ditolak demi portabilitas multi-OS.* |
| **B. Electron (Node.js + Chromium)** | Cepat dibuat, cross-platform. | RAM boros (150–350 MB), membebani laptop mahasiswa. | *Ditolak karena anti-goals.* |
| **C. Tauri v2 (Rust + System Webview)** | Sangat hemat RAM (15–30 MB), backend Rust sangat cepat dan aman, UI web modern (Tailwind + React/Svelte), cross-platform penuh (macOS, Windows, Linux). | Membutuhkan setup toolchain Rust & Tauri. | **DIPILIH (Pendekatan Resmi)** |

---

## 4. System Architecture

```
+--------------------------------------------------------------+
|                     FixIt Desktop Client                     |
|                                                              |
|  [ Rust Core (Tauri Backend) ]                               |
|   +-- Project Directory Watcher (FSEvents / notify crate)     |
|   +-- Smart Idle Detector (Debounce 2.5s after typing/save)  |
|   +-- Error Parser (Syntax, Language Diagnostics, App Logs)  |
|   +-- Native OS Notification Dispatcher                      |
|   +-- OpenAI-Compatible Client (reqwest async)               |
|                                                              |
|  [ Floating HUD Window (Webview Frontend) ]                  |
|   +-- Dark Blur Glassmorphism Container (Frameless)          |
|   +-- Header (Status / Good Afternoon + [X] + [Expand])      |
|   +-- Educational Explanation Cards:                         |
|       - Ringkasan Masalah & File/Line info                   |
|       - "Mengapa Ini Terjadi?" (Analisis Konsep)             |
|       - Langkah Perbaikan Bertahap (Step-by-step checklist)  |
|   +-- Follow-up Chat Bar ("Ask FixIt..." + Attachment/Mic)   |
+--------------------------------------------------------------+
```

---

## 5. Security & Configuration
- **API Key Storage**: Disimpan secara aman di OS keychain / local app config terenkripsi, bukan hardcoded.
- **Configurable Settings**:
  - `openai_base_url`: default `https://api.openai.com/v1` (bisa diubah ke Ollama `http://localhost:11434/v1`, Groq, dll.)
  - `openai_api_key`: string
  - `model_name`: default `gpt-4o-mini` atau model pilihan mahasiswa
  - `idle_delay_seconds`: default `2.5` detik.

