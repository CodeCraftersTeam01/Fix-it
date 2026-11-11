import { useState, useEffect } from "react";
import { FloatingHud } from "./components/FloatingHud";
import { CodeError, FixExplanation, ChatMessage } from "./types";

export function App() {
  const [currentError, setCurrentError] = useState<CodeError | null>({
    file_path: "app/Http/Controllers/StudentController.php",
    line_number: 28,
    error_type: "ParseError",
    raw_message: "syntax error, unexpected token ';', expecting ')'",
    project_name: "Praktikum-Web",
  });

  const [explanation, setExplanation] = useState<FixExplanation | null>({
    summary: "Sintaks penutupan tanda kurung fungsi belum lengkap di baris 28.",
    why_it_happened:
      "PHP mengharapkan tanda kurung tutup ')' sebelum titik koma ';' saat mendeklarasikan parameter atau kondisi.",
    steps: [
      "Periksa pemanggilan method atau fungsi di baris 28.",
      "Pastikan setiap kurung buka '(' memiliki pasangan kurung tutup ')'.",
      "Simpan file kembali (Cmd + S) setelah menambahkan tanda kurung tutup.",
    ],
    code_hint: "$data = Student::where('nim', $nim)->first();",
  });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Listen to Tauri events if in Tauri environment
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

    setupTauriEvents();
  }, []);

  const handleClose = async () => {
    try {
      const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const appWindow = getCurrentWebviewWindow();
      await appWindow.hide();
    } catch {
      console.log("HUD closed in browser mode");
    }
  };

  const handleExpand = async () => {
    try {
      const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const appWindow = getCurrentWebviewWindow();
      const isMax = await appWindow.isMaximized();
      if (isMax) {
        await appWindow.unmaximize();
      } else {
        await appWindow.maximize();
      }
    } catch {
      console.log("HUD expanded in browser mode");
    }
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
      // In Tauri mode: call Rust command `ask_followup`
      // Fallback in web preview:
      setTimeout(() => {
        const replyMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          sender: "ai",
          text: `Di baris 28, pastikan kamu menutup parameter sebelum titik koma. Contohnya: \`->first()\` bukan \`->first;\`. Coba cek kembali kodenya ya!`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, replyMsg]);
        setIsLoading(false);
      }, 700);
    } catch {
      setIsLoading(false);
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
      isLoading={isLoading}
    />
  );
}

export default App;

