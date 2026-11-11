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
  isExpanded?: boolean;
  onOpenSettings?: () => void;
  onSimulateError?: () => void;
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
  isExpanded = false,
  onOpenSettings,
  onSimulateError: _onSimulateError,
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
        isExpanded={isExpanded}
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
              <span className="flex items-center gap-1.5 font-medium text-white/80">
                <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
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
          /* Live IDE & File Activity Card (Minimized, sleek & compact Apple Obsidian) */
          <div className="pt-1">
            <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/[0.06] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      activeFileActivity?.status.includes("Menulis")
                        ? "bg-white animate-ping"
                        : "bg-white/70 animate-pulse"
                    }`}
                  />
                  <span className="text-[12px] font-medium text-white/90 truncate">
                    {activeFileActivity ? activeFileActivity.status : "Standby Memantau"}
                  </span>
                  {activeFileActivity && (
                    <span className="font-mono text-white/95 font-semibold text-[11px] bg-white/[0.08] px-1.5 py-0.5 rounded truncate">
                      {activeFileActivity.file_name}
                    </span>
                  )}
                </div>

                <span className="text-[9.5px] font-mono px-2 py-0.5 rounded-full bg-white/[0.06] text-white/50 shrink-0">
                  {activeFileActivity?.editor || "IDE Active"}
                </span>
              </div>

              {/* Sub-info bar */}
              <div className="text-[10px] font-mono text-white/35 pt-1.5 border-t border-white/[0.04] flex items-center justify-between gap-2">
                <span className="truncate" title={activeFileActivity?.file_path || "Menunggu penulisan berkas"}>
                  {activeFileActivity
                    ? `${activeFileActivity.project} • ${activeFileActivity.file_path}`
                    : "Fokus ngoding, error akan terdeteksi di sini"}
                </span>
                <span className="shrink-0 text-white/30">
                  📁 {settings?.watched_paths?.length || 1} Workspace
                </span>
              </div>
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
