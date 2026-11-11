# FixIt 🛠️

**FixIt** adalah asisten desktop cerdas lintas platform (macOS, Windows, Linux) yang dirancang khusus untuk mahasiswa yang sedang praktikum pemrograman. 

Aplikasi ini mendeteksi error kode secara pasif dan cerdas (*smart idle debounce*), memunculkan notifikasi sistem, dan menampilkan jendela melayang (*floating dark glass HUD*) yang menjelaskan akar masalah serta langkah-langkah perbaikan bertahap berbasis AI (OpenAI-compatible endpoint).

---

## ✨ Fitur Utama

- **🚀 Sangat Hemat RAM (< 30 MB)**: Dibangun di atas arsitektur **Tauri v2 (Rust + System Webview)**, tidak membebani laptop mahasiswa.
- **⏱️ Smart Idle Typing Detection**: Tidak memotong alur pengetikan. Pengecekan baru dilakukan setelah mahasiswa berhenti mengetik atau menyimpan kode (jeda debounce 2.5s).
- **🪟 Floating Dark Glass HUD**: Tampilan jendela melayang elegan khas macOS dengan efek blur, rounded corner, header status, dan input chat di bagian bawah (sesuai referensi).
- **🧠 Analisis Edukatif Step-by-Step**:
  - **Ringkasan Masalah**: Penjelasan apa yang salah dengan bahasa Indonesia yang mudah dipahami.
  - **Kenapa Terjadi?**: Edukasi konsep di balik error tersebut agar mahasiswa belajar.
  - **Langkah Penyelesaian**: Checklist interaktif langkah demi langkah untuk memperbaiki kode.
- **💬 Interaktif ("Tanya FixIt...")**: Bar chat untuk mahasiswa yang ingin bertanya lebih lanjut tentang error tersebut.
- **🔌 OpenAI-Compatible API Support**: Mendukung berbagai endpoint LLM (OpenAI, Groq, Ollama lokal, OpenRouter, DeepSeek) hanya dengan mengatur `openai_base_url` dan `openai_api_key`.

---

## 🏗️ Struktur Proyek

```
FixIt/
├── src-tauri/                 # Backend Rust (Tauri v2)
│   ├── src/
│   │   ├── config.rs          # Manajemen konfigurasi & persistensi (~/.config/fixit)
│   │   ├── watcher.rs         # File watcher & smart debounce idle engine
│   │   ├── diagnostics.rs     # Parser error sintaks & log multi-bahasa (PHP, Python, JS)
│   │   ├── ai_client.rs       # Client REST OpenAI-compatible dengan prompt pedagogis
│   │   ├── lib.rs             # Tauri commands, background services & event emitter
│   │   └── main.rs            # Entry point aplikasi desktop
│   └── tauri.conf.json        # Konfigurasi jendela melayang (frameless, transparent, always-on-top)
├── src/                       # Frontend UI (React + Tailwind CSS)
│   ├── components/
│   │   ├── FloatingHud.tsx    # Wadah utama jendela melayang
│   │   ├── HeaderBar.tsx      # Header dengan greeting, close (X), dan expand
│   │   ├── ErrorGuideCard.tsx # Kartu penjelasan & checklist langkah perbaikan
│   │   └── AskBar.tsx         # Input bar bergaya Siri ("Tanya FixIt apa saja...")
│   ├── types/                 # Definisi tipe data TypeScript
│   └── styles/hud.css         # Styling glassmorphism & backdrop blur
└── tests/                     # Mock project & script verifikasi E2E
```

---

## 🚀 Menjalankan Aplikasi

### 1. Menjalankan Mode Pengembangan (Frontend Preview)
```bash
npm run dev
```

### 2. Menjalankan Mode Desktop (Tauri v2 Desktop App)
```bash
npm run tauri dev
```

### 3. Menjalankan Pengujian (Testing)
```bash
# Pengujian Frontend UI (Vitest)
npm test

# Pengujian Modul Rust Core
cd src-tauri && cargo test
```

