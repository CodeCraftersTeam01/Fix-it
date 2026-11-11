import React, { useRef, useEffect } from "react";
import { HeaderBar } from "./HeaderBar";
import { ErrorGuideCard } from "./ErrorGuideCard";
import { AskBar } from "./AskBar";
import { AppSettings } from "./SettingsModal";
import { CodeError, FixExplanation, ChatMessage, FileActivity } from "../types";

interface FloatingHudProps {
  currentError?: CodeError | null;
  explanation?: FixExplanation | null;
  isAnalyzing?: boolean;
  analyzingInfo?: { file_name: string; line?: number; error_type?: string } | null;
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
  isAnalyzing = false,
  analyzingInfo = null,
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
  settings: _settings,
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
        {/* Thinking State when AI is actively analyzing the error */}
        {isAnalyzing ? (
          <div className="pt-1">
            <div className="p-3.5 rounded-2xl bg-white/[0.035] border border-white/[0.05]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-white animate-ping shrink-0" />
                <h3 className="text-[15px] font-medium text-white/95 tracking-tight animate-text-shine">
                  Menganalisis Error...
                </h3>
              </div>
              {analyzingInfo?.file_name && (
                <div className="text-[12.5px] text-white/45 pl-4 pt-0.5 truncate font-sans">
                  {analyzingInfo.file_name}{analyzingInfo.line ? ` • baris ${analyzingInfo.line}` : ""}
                </div>
              )}
            </div>
          </div>
        ) : currentError && explanation ? (
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
          /* Live IDE & File Activity Card (Clean, Cozy H3 with filename below, Zero Slop) */
          <div className="pt-1">
            <div className="p-3.5 rounded-2xl bg-white/[0.035] border border-white/[0.05]">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    activeFileActivity?.status.includes("Menulis")
                      ? "bg-white animate-ping"
                      : "bg-white/70"
                  }`}
                />
                <h3 className="text-[15.5px] font-medium text-white/95 tracking-tight">
                  {activeFileActivity
                    ? (activeFileActivity.status.includes("Valid") ? "Sintaks Valid" : activeFileActivity.status)
                    : "Standby Memantau"}
                </h3>
              </div>

              {activeFileActivity?.file_name ? (
                <div className="text-[12.5px] text-white/45 pl-4 pt-0.5 truncate font-sans">
                  {activeFileActivity.file_name}
                </div>
              ) : (
                <div className="text-[12.5px] text-white/40 pl-4 pt-0.5 font-sans">
                  Menunggu aktivitas koding...
                </div>
              )}
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
