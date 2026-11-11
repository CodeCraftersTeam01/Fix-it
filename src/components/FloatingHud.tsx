import React, { useRef, useEffect } from "react";
import { HeaderBar } from "./HeaderBar";
import { ErrorGuideCard } from "./ErrorGuideCard";
import { AskBar } from "./AskBar";
import { AppSettings } from "./SettingsModal";
import { CodeError, FixExplanation, ChatMessage, FileActivity } from "../types";

interface FloatingHudProps {
  currentError?: CodeError | null;
  explanation?: FixExplanation | null;
  messages: ChatMessage[];
  activeFileActivity?: FileActivity | null;
  onSendMessage: (text: string) => void;
  onClose: () => void;
  onExpand?: () => void;
  onOpenSettings?: () => void;
  onSimulateError: () => void;
  onClearError: () => void;
  isLoading?: boolean;
  settings?: AppSettings;
  onSaveSettings?: (settings: AppSettings) => void;
}

export const FloatingHud: React.FC<FloatingHudProps> = ({
  currentError,
  explanation,
  messages,
  activeFileActivity,
  onSendMessage,
  onClose,
  onExpand,
  onOpenSettings,
  onSimulateError,
  onClearError,
  isLoading = false,
  settings,
  onSaveSettings: _onSaveSettings,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, explanation, currentError]);

  const handleStartDrag = async (e: React.MouseEvent) => {
    // Only drag on left click and not on interactive buttons/inputs
    if (e.button === 0) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("start_dragging");
      } catch {
        try {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          await getCurrentWindow().startDragging();
        } catch {
          // In standard browser
        }
      }
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning.";
    if (hour < 18) return "Good afternoon.";
    return "Good evening.";
  };

  return (
    <div
      className="w-full h-full rounded-[32px] apple-hud-glass flex flex-col overflow-hidden relative select-none cursor-default"
    >
      {/* Top Header Bar (Only region allowed for dragging) */}
      <HeaderBar
        onClose={onClose}
        onExpand={onExpand}
        onOpenSettings={onOpenSettings}
        onStartDrag={handleStartDrag}
      />

      {/* Greeting Title */}
      <div className="px-6 pt-2 pb-1 select-none pointer-events-none">
        <div className="text-[26px] font-medium text-white tracking-tight">
          {getGreeting()}
        </div>
      </div>

      {/* Scrollable Content Body (Not draggable) */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 py-2 space-y-4 cursor-default"
      >
        {/* Active Error Guide */}
        {currentError && explanation ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-[11px] text-white/40 pb-0.5">
              <span className="flex items-center gap-1.5 font-medium text-amber-300/80">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                Error Terdeteksi
              </span>
              <button
                type="button"
                onClick={onClearError}
                className="hover:text-white transition text-[11px] px-2 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08]"
              >
                Kembali standby
              </button>
            </div>
            <ErrorGuideCard error={currentError} explanation={explanation} />
          </div>
        ) : (
          /* Live IDE & File Activity Card (Clean Apple Obsidian) */
          <div className="space-y-4 pt-1">
            <div className="p-4 rounded-2xl bg-white/[0.035] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      activeFileActivity?.status.includes("Menulis")
                        ? "bg-amber-400 animate-ping"
                        : "bg-emerald-400 animate-pulse"
                    }`}
                  />
                  <span className="text-[12px] font-medium text-white/90 tracking-wide">
                    {activeFileActivity ? activeFileActivity.status : "Standby Memantau IDE"}
                  </span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.06] text-white/60">
                  {activeFileActivity?.editor || "Antigravity / VS Code / Cursor"}
                </span>
              </div>

              {activeFileActivity ? (
                <div className="space-y-1 pt-0.5">
                  <div className="text-[13.5px] font-mono font-medium text-white/95 flex items-center gap-1.5 truncate">
                    <span>📄</span>
                    <span className="truncate">{activeFileActivity.file_name}</span>
                  </div>
                  <div className="text-[11px] font-mono text-white/40 truncate">
                    {activeFileActivity.project} • {activeFileActivity.file_path}
                  </div>
                </div>
              ) : (
                <p className="text-[12.5px] text-white/65 leading-relaxed font-normal">
                  Fokus ngoding di <strong className="text-white/85 font-medium">Antigravity IDE, VS Code, Cursor, atau Kiro</strong>. Berkas yang sedang kamu ketik akan otomatis terdeteksi di sini.
                </p>
              )}

              {settings?.watched_paths && settings.watched_paths.length > 0 && (
                <div className="text-[10.5px] font-mono text-white/35 truncate pt-2 border-t border-white/[0.04] flex items-center justify-between">
                  <span className="truncate">📁 {settings.watched_paths.length} workspace aktif dipantau</span>
                  <span className="text-white/25 shrink-0 ml-1">Auto-Sync</span>
                </div>
              )}
            </div>

            <div className="space-y-2 pt-1">
              <div className="text-[11px] font-medium uppercase tracking-wider text-white/30 px-1">
                Uji Coba Asisten
              </div>
              <button
                type="button"
                onClick={onSimulateError}
                className="w-full text-left flex items-center justify-between p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] transition text-[12.5px] text-white/80 group cursor-pointer"
              >
                <span>Simulasikan deteksi error PHP</span>
                <span className="text-white/30 group-hover:text-white/70 transition">→</span>
              </button>
            </div>
          </div>
        )}

        {/* Chat Messages */}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${
              msg.sender === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-[13px] leading-relaxed ${
                msg.sender === "user"
                  ? "bg-white/20 text-white rounded-br-sm"
                  : "bg-white/[0.08] text-white/90 rounded-bl-sm"
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}

        {/* Loading state */}
        {isLoading && (
          <div className="text-[12px] text-white/40 animate-pulse">
            Menganalisis...
          </div>
        )}
      </div>

      {/* Bottom Capsule Bar (Exact match to "Ask Siri" pill in screenshot) */}
      <AskBar
        onSendMessage={onSendMessage}
        disabled={isLoading}
        placeholder="Tanya FixIt apa saja..."
      />
    </div>
  );
};
