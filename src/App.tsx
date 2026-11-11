import { useState, useEffect } from "react";
import { FloatingHud } from "./components/FloatingHud";
import { AppSettings } from "./components/SettingsModal";
import { CodeError, FixExplanation, ChatMessage } from "./types";

export function App() {
  const [currentError, setCurrentError] = useState<CodeError | null>(null);
  const [explanation, setExplanation] = useState<FixExplanation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [settings, setSettings] = useState<AppSettings>({
    openai_base_url: "https://api.openai.com/v1",
    openai_api_key: "",
    model_name: "gpt-4o-mini",
    idle_delay_ms: 2500,
    watched_paths: ["/Users/arjunalanangadiwarsana/Herd/FixIt"],
  });

  useEffect(() => {
    // 1. Try to load config from Tauri backend
    const loadConfig = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const conf = await invoke<AppSettings>("get_config");
        if (conf) {
          setSettings(conf);
        }
      } catch {
        // Fallback in browser
      }
    };

    // 2. Listen to live error events from Tauri background watcher
    const setupTauriEvents = async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        await listen<{ error: CodeError; explanation: FixExplanation }>(
          "fixit-error-detected",
          (event) => {
            setCurrentError(event.payload.error);
            setExplanation(event.payload.explanation);
          }
        );
      } catch {
        // Running in standard browser preview
      }
    };

    loadConfig();
    setupTauriEvents();
  }, []);

  const handleClose = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("hide_window");
    } catch {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const appWindow = getCurrentWindow();
        await appWindow.hide();
      } catch (err) {
        console.log("HUD hidden in browser mode", err);
      }
    }
  };

  const handleExpand = async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const appWindow = getCurrentWindow();
      const isMax = await appWindow.isMaximized();
      if (isMax) {
        await appWindow.unmaximize();
      } else {
        await appWindow.maximize();
      }
    } catch (err) {
      console.log("HUD expand error", err);
    }
  };

  const handleSaveSettings = async (newSettings: AppSettings) => {
    setSettings(newSettings);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("save_config", { newConfig: newSettings });
    } catch {
      console.log("Settings saved in local state");
    }
  };

  const handleSimulateError = () => {
    setIsLoading(true);
    setTimeout(() => {
      setCurrentError({
        file_path: "app/Http/Controllers/StudentController.php",
        line_number: 28,
        error_type: "ParseError",
        raw_message: "syntax error, unexpected token ';', expecting ')'",
        project_name: "Praktikum-Web",
      });

      setExplanation({
        summary: "Sintaks penutupan tanda kurung fungsi belum lengkap di baris 28.",
        why_it_happened:
          "PHP mengharapkan tanda kurung tutup ')' sebelum titik koma ';' saat mendeklarasikan parameter atau pemanggilan method berantai.",
        steps: [
          "Periksa pemanggilan method atau fungsi di baris 28.",
          "Pastikan setiap kurung buka '(' memiliki pasangan kurung tutup ')'.",
          "Simpan file kembali (Cmd + S) setelah menambahkan tanda kurung tutup.",
        ],
        code_hint: "$data = Student::where('nim', $nim)->first();",
      });

      setIsLoading(false);
    }, 400);
  };

  const handleClearError = () => {
    setCurrentError(null);
    setExplanation(null);
  };

  const handleSendMessage = async (text: string) => {
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: "user",
      text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const reply = await invoke<string>("ask_followup", { question: text });
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: "ai",
          text: reply,
          timestamp: Date.now(),
        },
      ]);
      setIsLoading(false);
    } catch {
      setTimeout(() => {
        let replyText = "Halo! ";
        const lower = text.toLowerCase();
        if (lower.includes("cara kerja") || lower.includes("gimana")) {
          replyText +=
            "FixIt memantau folder kodinganmu secara pasif. Saat kamu berhenti mengetik (jeda ~2.5s) dan ada error, FixIt akan memunculkan penjelasan dan langkah solusinya di sini.";
        } else if (lower.includes("error") || lower.includes("fix")) {
          replyText +=
            "Jika ada kode yang error, simpan berkas di editor (Cmd + S). FixIt akan mendeteksi barisnya dan menyajikan checklist perbaikan.";
        } else {
          replyText +=
            "Ada yang ingin kamu tanyakan seputar kode praktikummu?";
        }

        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            sender: "ai",
            text: replyText,
            timestamp: Date.now(),
          },
        ]);
        setIsLoading(false);
      }, 400);
    }
  };

  return (
    <FloatingHud
      currentError={currentError}
      explanation={explanation}
      messages={messages}
      onSendMessage={handleSendMessage}
      onClose={handleClose}
      onExpand={handleExpand}
      onSimulateError={handleSimulateError}
      onClearError={handleClearError}
      isLoading={isLoading}
      settings={settings}
      onSaveSettings={handleSaveSettings}
    />
  );
}

export default App;
