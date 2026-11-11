import React, { useRef, useEffect, useState } from "react";
import { HeaderBar } from "./HeaderBar";
import { ErrorGuideCard } from "./ErrorGuideCard";
import { AskBar } from "./AskBar";
import { SettingsModal, AppSettings } from "./SettingsModal";
import { CodeError, FixExplanation, ChatMessage } from "../types";

interface FloatingHudProps {
  currentError?: CodeError | null;
  explanation?: FixExplanation | null;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onClose: () => void;
  onExpand?: () => void;
  onSimulateError: () => void;
  onClearError: () => void;
  isLoading?: boolean;
  settings: AppSettings;
  onSaveSettings: (settings: AppSettings) => void;
}

export const FloatingHud: React.FC<FloatingHudProps> = ({
  currentError,
  explanation,
  messages,
  onSendMessage,
  onClose,
  onExpand,
  onSimulateError,
  onClearError,
  isLoading = false,
  settings,
  onSaveSettings,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

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
      onMouseDown={handleStartDrag}
      data-tauri-drag-region
      className="w-full h-full rounded-[34px] apple-hud-glass flex flex-col overflow-hidden relative select-none cursor-grab active:cursor-grabbing"
    >
      {/* Top Header Buttons */}
      <HeaderBar
        onClose={onClose}
        onExpand={onExpand}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onStartDrag={handleStartDrag}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={onSaveSettings}
      />

      {/* Greeting Title (Exact Apple layout: Left-aligned bold title right below header) */}
      <div
        data-tauri-drag-region
        onMouseDown={handleStartDrag}
        className="px-6 pt-2 pb-1"
      >
        <div className="text-[26px] font-medium text-white tracking-tight pointer-events-none">
          {getGreeting()}
        </div>
      </div>

      {/* Scrollable Content Body */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 py-2 space-y-4 cursor-default"
        onMouseDown={(e) => {
          // If clicked directly on the background (not a child text/button), allow dragging
          if (e.target === e.currentTarget) {
            handleStartDrag(e);
          }
        }}
      >
        {/* Active Error Guide */}
        {currentError && explanation ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-[11px] text-white/40">
              <span>Error aktif</span>
              <button
                onClick={onClearError}
                className="hover:text-white transition text-[11px] underline underline-offset-2"
              >
                Kembali standby
              </button>
            </div>
            <ErrorGuideCard error={currentError} explanation={explanation} />
          </div>
        ) : (
          /* Clean Standby State - Zero Slop */
          <div className="space-y-3 pt-1">
            <p className="text-[13.5px] text-white/50 leading-relaxed font-normal">
              FixIt memantau folder kodinganmu di latar belakang. Jika terjadi error, langkah perbaikannya akan muncul di sini.
            </p>

            <button
              onClick={onSimulateError}
              className="text-[12px] text-white/40 hover:text-white/80 transition underline underline-offset-4"
            >
              Simulasikan deteksi error
            </button>
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
        placeholder="Ask FixIt"
      />
    </div>
  );
};
