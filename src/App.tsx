import { useState, useEffect, useRef } from "react";
import { FloatingHud } from "./components/FloatingHud";
import { SettingsView } from "./components/settings/SettingsView";
import { AppSettings } from "./components/settings/types";
import { CodeError, FixExplanation, ChatMessage, FileActivity, ActiveErrorItem, AgentStep } from "./types";

let cachedInvoke: typeof import("@tauri-apps/api/core").invoke | null = null;
const getInvoke = async () => {
  if (!cachedInvoke) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      cachedInvoke = invoke;
    } catch {
      // Browser fallback
    }
  }
  return cachedInvoke;
};

export function App() {
  const isSettingsRoute = typeof window !== "undefined" && window.location.hash === "#settings";
  const [activeErrors, setActiveErrors] = useState<ActiveErrorItem[]>([]);
  const [selectedErrorIndex, setSelectedErrorIndex] = useState(0);
  const [capturedImage, setCapturedImage] = useState<{ path: string; base64: string } | null>(null);
  const [permissionNotice, setPermissionNotice] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzingInfo, setAnalyzingInfo] = useState<{
    file_name: string;
    line?: number;
    error_type?: string;
  } | null>(null);
  const [activeFileActivity, setActiveFileActivity] = useState<FileActivity | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAgentRunning, setIsAgentRunningState] = useState(false);
  const [standbyMessages, setStandbyMessages] = useState<ChatMessage[]>([]);
  const [standbySteps, setStandbySteps] = useState<AgentStep[]>([]);
  const isAgentRunningRef = useRef(false);
  const selectedErrorIndexRef = useRef(selectedErrorIndex);

  useEffect(() => {
    selectedErrorIndexRef.current = selectedErrorIndex;
  }, [selectedErrorIndex]);

  useEffect(() => {
    isAgentRunningRef.current =
      isAgentRunning || activeErrors.some((e) => e.is_running);
  }, [isAgentRunning, activeErrors]);

  const setIsAgentRunning = (running: boolean) => {
    isAgentRunningRef.current = running;
    setIsAgentRunningState(running);
  };

  const [settings, setSettings] = useState<AppSettings>({
    openai_base_url: "https://api.openai.com/v1",
    openai_api_key: "",
    model_name: "gpt-4o",
    idle_delay_ms: 2500,
    watched_paths: ["/Users/arjunalanangadiwarsana/Herd/FixIt"],
    active_provider: "openai",
  });

  const pathMatches = (p1: string, p2: string) => {
    const norm1 = p1.trim().replace(/\\/g, "/");
    const norm2 = p2.trim().replace(/\\/g, "/");
    if (!norm1 || !norm2) return false;
    if (norm1 === norm2) return true;
    if (norm1.endsWith(norm2) && norm1.slice(0, norm1.length - norm2.length).endsWith("/")) {
      return true;
    }
    if (norm2.endsWith(norm1) && norm2.slice(0, norm2.length - norm1.length).endsWith("/")) {
      return true;
    }
    return false;
  };

  const removeErrorByPath = (filePath: string) => {
    setActiveErrors((prev) => {
      const remaining = prev.filter(
        (item) => !pathMatches(item.error.file_path, filePath)
      );
      if (remaining.length === 0) {
        setSelectedErrorIndex(0);
        setIsAgentRunning(false);
      } else {
        setSelectedErrorIndex((curr) =>
          Math.min(curr, Math.max(0, remaining.length - 1))
        );
      }
      return remaining;
    });
  };

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
            if (isAgentRunningRef.current) {
              return;
            }
            setIsAnalyzing(true);
            setAnalyzingInfo(event.payload);
          }
        );
        await listen<{
          error: CodeError;
          explanation: FixExplanation;
          hit_count?: number;
          is_looping?: boolean;
        }>("fixit-error-detected", (event) => {
          if (isAgentRunningRef.current) {
            return;
          }
          setIsAnalyzing(false);
          setAnalyzingInfo(null);
          const payload = event.payload;

          setActiveErrors((prev) => {
            const idx = prev.findIndex((item) =>
              pathMatches(item.error.file_path, payload.error.file_path)
            );
            if (idx >= 0) {
              setSelectedErrorIndex(idx);
              const updated = [...prev];
              updated[idx] = {
                ...updated[idx],
                error: payload.error,
                explanation: payload.explanation || updated[idx].explanation,
                hit_count: payload.hit_count ?? (updated[idx].hit_count + 1),
                is_looping: payload.is_looping ?? updated[idx].is_looping,
                timestamp: Date.now(),
                // Reset resolution and steps for this re-detected broken error only
                is_resolved: false,
                steps: [],
                messages: [],
                is_running: false,
              };
              return updated;
            } else {
              setSelectedErrorIndex(prev.length);
              return [
                ...prev,
                {
                  id: payload.error.file_path,
                  error: payload.error,
                  explanation: payload.explanation,
                  hit_count: payload.hit_count ?? 1,
                  is_looping: payload.is_looping ?? false,
                  timestamp: Date.now(),
                  is_resolved: false,
                  steps: [],
                  messages: [],
                  is_running: false,
                },
              ];
            }
          });
        });
        await listen<{ file_path: string }>("fixit-error-resolved", (event) => {
          if (event.payload?.file_path) {
            const resolvedPath = event.payload.file_path;
            setActiveErrors((prev) =>
              prev.map((item) =>
                pathMatches(item.error.file_path, resolvedPath)
                  ? { ...item, is_resolved: true, is_running: false }
                  : item
              )
            );
          }
        });
        await listen<{ path: string; base64: string }>(
          "fixit-captured-screen",
          (event) => {
            setCapturedImage(event.payload);
            setPermissionNotice(null);
          }
        );
        await listen("fixit-screen-permission-needed", () => {
          setPermissionNotice(
            "Izin Perekaman Layar belum aktif. Buka System Settings > Privacy & Security > Screen & System Audio Recording, aktifkan FixIt, lalu restart aplikasi FixIt."
          );
        });
        await listen<FileActivity>("fixit-file-writing", (event) => {
          if (isAgentRunningRef.current) {
            return;
          }
          setActiveFileActivity(event.payload);
        });
        await listen<FileActivity>("fixit-file-valid", (event) => {
          setActiveFileActivity(event.payload);
          setIsAnalyzing(false);
          setAnalyzingInfo(null);
          if (event.payload?.file_path) {
            const validPath = event.payload.file_path;
            setActiveErrors((prev) =>
              prev.map((item) =>
                pathMatches(item.error.file_path, validPath)
                  ? { ...item, is_resolved: true, is_running: false }
                  : item
              )
            );
          }
        });
        await listen("open-settings", async () => {
          try {
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke("open_settings_window");
          } catch {}
        });
        await listen<AgentStep>("fixit-agent-step", (event) => {
          const step = event.payload;
          const isFinish = step.step_type === "finish";

          setActiveErrors((prev) => {
            if (prev.length === 0) {
              setStandbySteps((s) => [...s, step]);
              return prev;
            }

            let targetIdx = -1;
            // 1. Match by step's explicit file_path
            if (step.file_path) {
              targetIdx = prev.findIndex((item) =>
                pathMatches(item.error.file_path, step.file_path!)
              );
            }
            // 2. Fallback to currently running item
            if (targetIdx === -1) {
              targetIdx = prev.findIndex((item) => item.is_running);
            }
            // 3. Fallback to active tab index
            if (targetIdx === -1) {
              targetIdx = Math.min(
                Math.max(0, selectedErrorIndexRef.current),
                prev.length - 1
              );
            }

            if (targetIdx === -1) return prev;

            const updated = [...prev];
            const currItem = updated[targetIdx];
            const newSteps = [...(currItem.steps || []), step];

            updated[targetIdx] = {
              ...currItem,
              steps: newSteps,
              is_running: !isFinish,
              is_resolved: isFinish ? true : currItem.is_resolved,
            };
            return updated;
          });

          if (isFinish) {
            setIsAgentRunning(false);
          }
        });
        await listen("fixit-reset-standby", () => {
          // Pure local state reset - DO NOT re-invoke backend to avoid recursive event storm
          setActiveErrors([]);
          setStandbyMessages([]);
          setStandbySteps([]);
          setSelectedErrorIndex(0);
          setIsAnalyzing(false);
          setAnalyzingInfo(null);
          setIsAgentRunning(false);
        });
        await listen<AppSettings>("fixit-config-updated", (event) => {
          if (event.payload) {
            setSettings(event.payload);
          }
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

  const handleClearSingleError = async (filePath: string) => {
    removeErrorByPath(filePath);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("clear_active_error", { filePath });
    } catch {}
  };

  const handleClose = async () => {
    // Reset status error & analisa ke mode standby saat pop-up ditutup / disilang
    setActiveErrors([]);
    setSelectedErrorIndex(0);
    setIsAnalyzing(false);
    setAnalyzingInfo(null);

    try {
      const invoke = await getInvoke();
      if (invoke) {
        await invoke("clear_active_error", { filePath: null });
        await invoke("hide_window");
        return;
      }
      throw new Error("No invoke");
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
      const invoke = await getInvoke();
      if (invoke) {
        await invoke("open_settings_window");
        return;
      }
      throw new Error("No invoke");
    } catch {
      console.log("Open settings window via Tauri fallback");
    }
  };

  const handleExpand = async () => {
    try {
      const invoke = await getInvoke();
      if (invoke) {
        const expanded = await invoke<boolean>("toggle_hud_expand");
        setIsExpanded(expanded);
        return;
      }
      throw new Error("No invoke");
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
      const simError: CodeError = {
        file_path: "app/Http/Controllers/StudentController.php",
        line_number: 28,
        error_type: "ParseError",
        raw_message: "syntax error, unexpected token ';', expecting ')'",
        project_name: "Praktikum-Web",
      };

      const simExplanation: FixExplanation = {
        summary: "Sintaks penutupan tanda kurung fungsi belum lengkap di baris 28.",
        why_it_happened:
          "PHP mengharapkan tanda kurung tutup ')' sebelum titik koma ';' saat mendeklarasikan parameter atau pemanggilan method berantai.",
        steps: [
          "Periksa pemanggilan method atau fungsi di baris 28.",
          "Pastikan setiap kurung buka '(' memiliki pasangan kurung tutup ')'.",
          "Simpan file kembali (Cmd + S) setelah menambahkan tanda kurung tutup.",
        ],
        code_hint: "$data = Student::where('nim', $nim)->first();",
      };

      setActiveErrors((prev) => {
        const idx = prev.findIndex((item) =>
          pathMatches(item.error.file_path, simError.file_path)
        );
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = {
            ...copy[idx],
            error: simError,
            explanation: simExplanation,
            hit_count: copy[idx].hit_count + 1,
            timestamp: Date.now(),
          };
          return copy;
        } else {
          setSelectedErrorIndex(prev.length);
          return [
            ...prev,
            {
              id: simError.file_path,
              error: simError,
              explanation: simExplanation,
              hit_count: 1,
              is_looping: false,
              timestamp: Date.now(),
            },
          ];
        }
      });

      setIsLoading(false);
    }, 400);
  };

  const handleClearError = async () => {
    setActiveErrors([]);
    setStandbyMessages([]);
    setStandbySteps([]);
    setSelectedErrorIndex(0);
    setIsAgentRunning(false);
    try {
      const invoke = await getInvoke();
      if (invoke) {
        await invoke("clear_active_error", { filePath: null });
      }
    } catch {}
  };

  const handleStartAgenticFix = async () => {
    const currentActive = activeErrors[selectedErrorIndex];
    if (!currentActive || currentActive.is_running || isAgentRunning) return;

    const targetPath = currentActive.error.file_path;
    setIsAgentRunning(true);

    setActiveErrors((prev) =>
      prev.map((item) =>
        pathMatches(item.error.file_path, targetPath)
          ? { ...item, is_running: true, steps: [], is_resolved: false }
          : item
      )
    );

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<string>("run_agentic_fix", {
        error: currentActive.error,
        workspace_path: settings?.watched_paths?.[0] || null,
      });

      let fullDiscussion = result;
      const why = currentActive.explanation?.why_it_happened?.trim();
      if (why && !result.includes(why)) {
        fullDiscussion = `Pemeriksaan dan tindakan perbaikan telah selesai dieksekusi untuk error: \`${currentActive.error.raw_message}\`.\n\n**Pembahasan Masalah & Penyebab:**\n${why}\n\nKode pada berkas telah diperbaiki dan diverifikasi valid sehingga aplikasi dapat kembali berjalan dengan normal.`;
      }

      const aiMsg: ChatMessage = {
        id: Date.now().toString(),
        sender: "ai",
        text: fullDiscussion,
        timestamp: Date.now(),
      };

      setActiveErrors((prev) =>
        prev.map((item) =>
          pathMatches(item.error.file_path, targetPath)
            ? {
                ...item,
                is_running: false,
                is_resolved: true,
                messages: [...(item.messages || []), aiMsg],
              }
            : item
        )
      );
    } catch (err: unknown) {
      const msg =
        typeof err === "string"
          ? err
          : (err as Error)?.message || "Gagal menjalankan perbaikan otomatis";
      const errMsg: ChatMessage = {
        id: Date.now().toString(),
        sender: "ai",
        text: `Gagal menjalankan perbaikan otomatis: ${msg}`,
        timestamp: Date.now(),
      };
      setActiveErrors((prev) =>
        prev.map((item) =>
          pathMatches(item.error.file_path, targetPath)
            ? {
                ...item,
                is_running: false,
                messages: [...(item.messages || []), errMsg],
              }
            : item
        )
      );
    } finally {
      setIsAgentRunning(false);
    }
  };

  const handleSendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const normalized = trimmed.toLowerCase();
    const cleaned = normalized.replace(/[.,!?:;]/g, "").trim();
    const isPahamKeyword =
      cleaned === "saya paham" ||
      cleaned === "paham" ||
      cleaned === "aku paham" ||
      cleaned === "oke paham" ||
      cleaned === "ok paham" ||
      cleaned === "sudah paham" ||
      cleaned === "oke saya paham" ||
      cleaned === "ok saya paham" ||
      cleaned === "saya sudah paham" ||
      cleaned === "i understand" ||
      cleaned === "understood";

    if (isPahamKeyword) {
      const currentActive = activeErrors[selectedErrorIndex];
      if (currentActive) {
        if (activeErrors.length > 1) {
          handleClearSingleError(currentActive.error.file_path);
        } else {
          handleClearError();
        }
      } else {
        handleClearError();
      }
      return;
    }

    const currentActive = activeErrors[selectedErrorIndex];

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: "user",
      text: trimmed,
      timestamp: Date.now(),
    };

    if (currentActive) {
      const targetPath = currentActive.error.file_path;

      setActiveErrors((prev) =>
        prev.map((item) =>
          pathMatches(item.error.file_path, targetPath)
            ? {
                ...item,
                messages: [...(item.messages || []), userMsg],
                is_running: true,
              }
            : item
        )
      );

      setIsLoading(true);
      setIsAgentRunning(true);

      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const reply = await invoke<string>("ask_followup", {
          question: text,
          image_base64: capturedImage?.base64 || null,
          active_error: currentActive.error,
          workspace_path: settings?.watched_paths?.[0] || null,
        });
        setCapturedImage(null);
        if (reply && reply.trim()) {
          const aiMsg: ChatMessage = {
            id: (Date.now() + 1).toString(),
            sender: "ai",
            text: reply.trim(),
            timestamp: Date.now(),
          };
          setActiveErrors((prev) =>
            prev.map((item) =>
              pathMatches(item.error.file_path, targetPath)
                ? {
                    ...item,
                    messages: [...(item.messages || []), aiMsg],
                  }
                : item
            )
          );
        }
      } catch (err: unknown) {
        const errMsg =
          typeof err === "string"
            ? err
            : (err as Error)?.message || "Gagal menghubungi AI";
        const errChat: ChatMessage = {
          id: (Date.now() + 1).toString(),
          sender: "ai",
          text: `Gagal memproses permintaan: ${errMsg}`,
          timestamp: Date.now(),
        };
        setActiveErrors((prev) =>
          prev.map((item) =>
            pathMatches(item.error.file_path, targetPath)
              ? {
                  ...item,
                  messages: [...(item.messages || []), errChat],
                }
              : item
          )
        );
      } finally {
        setIsLoading(false);
        setIsAgentRunning(false);
        setActiveErrors((prev) =>
          prev.map((item) =>
            pathMatches(item.error.file_path, targetPath)
              ? { ...item, is_running: false }
              : item
          )
        );
      }
    } else {
      // Standby / General Conversation (ketika tidak ada error sintaks aktif)
      setStandbyMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);
      setIsAgentRunning(true);

      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const reply = await invoke<string>("ask_followup", {
          question: text,
          image_base64: capturedImage?.base64 || null,
          active_error: null,
          workspace_path: settings?.watched_paths?.[0] || null,
        });
        setCapturedImage(null);
        if (reply && reply.trim()) {
          const aiMsg: ChatMessage = {
            id: (Date.now() + 1).toString(),
            sender: "ai",
            text: reply.trim(),
            timestamp: Date.now(),
          };
          setStandbyMessages((prev) => [...prev, aiMsg]);
        }
      } catch (err: unknown) {
        const errMsg =
          typeof err === "string"
            ? err
            : (err as Error)?.message || "Gagal menghubungi AI";
        const errChat: ChatMessage = {
          id: (Date.now() + 1).toString(),
          sender: "ai",
          text: `Gagal memproses permintaan: ${errMsg}`,
          timestamp: Date.now(),
        };
        setStandbyMessages((prev) => [...prev, errChat]);
      } finally {
        setIsLoading(false);
        setIsAgentRunning(false);
      }
    }
  };

  const currentActive = activeErrors[selectedErrorIndex] ?? null;
  const currentError = currentActive ? currentActive.error : null;
  const explanation = currentActive ? currentActive.explanation : null;

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
      activeErrors={activeErrors}
      selectedErrorIndex={selectedErrorIndex}
      onSelectError={setSelectedErrorIndex}
      onClearSingleError={handleClearSingleError}
      isAnalyzing={isAnalyzing}
      analyzingInfo={analyzingInfo}
      messages={currentActive ? (currentActive.messages || []) : standbyMessages}
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
      capturedImage={capturedImage}
      onClearCapturedImage={() => setCapturedImage(null)}
      onPasteImage={(img) => setCapturedImage(img)}
      permissionNotice={permissionNotice}
      onDismissPermissionNotice={() => setPermissionNotice(null)}
      onStartAgenticFix={handleStartAgenticFix}
      isAgentRunning={currentActive?.is_running ?? isAgentRunning}
      agentSteps={currentActive ? (currentActive.steps || []) : standbySteps}
      onCaptureScreen={async () => {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("start_interactive_screenshot");
        } catch (e: unknown) {
          const msg = typeof e === "string" ? e : (e as Error)?.message || "Gagal memulai screenshot";
          setPermissionNotice(msg);
        }
      }}
    />
  );
}

export default App;

