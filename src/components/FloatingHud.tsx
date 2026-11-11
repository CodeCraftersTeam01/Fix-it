import React, { useRef, useEffect } from "react";
import { HeaderBar } from "./HeaderBar";
import { ErrorGuideCard } from "./ErrorGuideCard";
import { AskBar } from "./AskBar";
import { AppSettings } from "./SettingsModal";
import { CodeError, FixExplanation, ChatMessage } from "../types";

interface FloatingHudProps {
  currentError?: CodeError | null;
  explanation?: FixExplanation | null;
  messages: ChatMessage[];
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
          /* Cozy Standby State (Zero AI Slop) */
          <div className="space-y-4 pt-1">
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.05] space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[12px] font-medium text-emerald-400/90 tracking-wide">
                  Standby Memantau
                </span>
              </div>
              <p className="text-[13px] text-white/70 leading-relaxed font-normal">
                Fokus ngoding aja. Kalau ada error sintaks atau runtime macet, solusinya langsung muncul di sini.
              </p>
              {settings?.watched_paths && settings.watched_paths.length > 0 && (
                <div className="text-[11px] font-mono text-white/35 truncate pt-1 border-t border-white/[0.04]">
                  📁 {settings.watched_paths[0]}
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
                className="w-full text-left flex items-center justify-between p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.04] transition text-[12.5px] text-white/80 group cursor-pointer"
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
