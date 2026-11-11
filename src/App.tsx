import { useState, useEffect } from "react";
import { FloatingHud } from "./components/FloatingHud";
import { SettingsView } from "./components/settings/SettingsView";
import { AppSettings } from "./components/settings/types";
import { CodeError, FixExplanation, ChatMessage, FileActivity } from "./types";

export function App() {
  const isSettingsRoute = typeof window !== "undefined" && window.location.hash === "#settings";
  const [currentError, setCurrentError] = useState<CodeError | null>(null);
  const [explanation, setExplanation] = useState<FixExplanation | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzingInfo, setAnalyzingInfo] = useState<{
    file_name: string;
    line?: number;
    error_type?: string;
  } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeFileActivity, setActiveFileActivity] = useState<FileActivity | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const [settings, setSettings] = useState<AppSettings>({
    openai_base_url: "https://api.openai.com/v1",
    openai_api_key: "",
    model_name: "glm-5.3-flash-free",
    idle_delay_ms: 2500,
    watched_paths: ["/Users/arjunalanangadiwarsana/Herd/FixIt"],
    active_provider: "ciora",
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

    // 2. Listen to live error events & file activities from Tauri background watcher
    const setupTauriEvents = async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        await listen<{ file_name: string; line?: number; error_type?: string }>(
          "fixit-error-analyzing",
          (event) => {
            setIsAnalyzing(true);
            setAnalyzingInfo(event.payload);
          }
        );
        await listen<{ error: CodeError; explanation: FixExplanation }>(
          "fixit-error-detected",
          (event) => {
            setIsAnalyzing(false);
            setAnalyzingInfo(null);
            setCurrentError(event.payload.error);
            setExplanation(event.payload.explanation);
          }
        );
        await listen<FileActivity>("fixit-file-writing", (event) => {
          setActiveFileActivity(event.payload);
        });
        await listen<FileActivity>("fixit-file-valid", (event) => {
          setActiveFileActivity(event.payload);
          setIsAnalyzing(false);
          setAnalyzingInfo(null);
          // Auto-clear active error if student fixed the broken file
          setCurrentError((prev) => {
            if (prev && prev.file_path === event.payload.file_path) {
              return null;
            }
            return prev;
          });
        });
        await listen("open-settings", async () => {
          try {
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke("open_settings_window");
          } catch {}
        });
        await listen("fixit-reset-standby", () => {
          handleClearError();
          setIsAnalyzing(false);
          setAnalyzingInfo(null);
        });
      } catch {
        // Running in standard browser preview
      }
    };

    loadConfig();
    setupTauriEvents();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleClose = async () => {
    // Reset status error & analisa ke mode standby saat pop-up ditutup / disilang
    handleClearError();
    setIsAnalyzing(false);
    setAnalyzingInfo(null);

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

  const handleOpenSettings = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_settings_window");
    } catch {
      console.log("Open settings window via Tauri fallback");
    }
  };

  const handleExpand = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const expanded = await invoke<boolean>("toggle_hud_expand");
      setIsExpanded(expanded);
    } catch {
      try {
        const { getCurrentWindow, LogicalSize } = await import("@tauri-apps/api/window");
        const appWindow = getCurrentWindow();
        const size = await appWindow.innerSize();
        const scaleFactor = await appWindow.scaleFactor();
        const logicalWidth = size.width / scaleFactor;

        if (logicalWidth > 450) {
          await appWindow.setSize(new LogicalSize(380, 640));
          setIsExpanded(false);
        } else {
          await appWindow.setSize(new LogicalSize(540, 740));
          setIsExpanded(true);
        }
      } catch {
        setIsExpanded((prev) => !prev);
      }
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

  if (isSettingsRoute) {
    return (
      <div className="w-screen h-screen p-2 bg-transparent select-none">
        <SettingsView
          isWindow={true}
          config={settings}
          onSave={handleSaveSettings}
        />
      </div>
    );
  }

  return (
    <FloatingHud
      currentError={currentError}
      explanation={explanation}
      isAnalyzing={isAnalyzing}
      analyzingInfo={analyzingInfo}
      messages={messages}
      activeFileActivity={activeFileActivity}
      onSendMessage={handleSendMessage}
      onClose={handleClose}
      onExpand={handleExpand}
      isExpanded={isExpanded}
      onOpenSettings={handleOpenSettings}
      onSimulateError={handleSimulateError}
      onClearError={handleClearError}
      isLoading={isLoading}
      settings={settings}
      onSaveSettings={handleSaveSettings}
    />
  );
}

export default App;
