import React, { useRef, useEffect, useState } from "react";
import { HeaderBar } from "./HeaderBar";
import { ErrorGuideCard } from "./ErrorGuideCard";
import { AskBar } from "./AskBar";
import { SettingsModal, AppSettings } from "./SettingsModal";
import { CodeError, FixExplanation, ChatMessage } from "../types";
import { Sparkles, Bot, FolderCode, ArrowRight, RefreshCw } from "lucide-react";

interface FloatingHudProps {
  currentError?: CodeError | null;
  explanation?: FixExplanation | null;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onClose: () => void;
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

  return (
    <div className="w-full h-full rounded-[28px] hud-glass flex flex-col overflow-hidden shadow-2xl relative border border-white/10 select-none">
      {/* Header */}
      <HeaderBar
        onClose={onClose}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={onSaveSettings}
      />

      {/* Scrollable Body */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-2 space-y-3"
      >
        {/* Active Error Guide */}
        {currentError && explanation ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-white/50 px-1">
              <span className="font-medium text-rose-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                Error Aktif Terdeteksi
              </span>
              <button
                onClick={onClearError}
                className="hover:text-white transition flex items-center gap-1 text-[10px]"
              >
                <RefreshCw size={10} />
                <span>Reset / Standby</span>
              </button>
            </div>
            <ErrorGuideCard error={currentError} explanation={explanation} />
          </div>
        ) : (
          /* Initial / Standby AI Agent View */
          <div className="flex flex-col items-center justify-center text-center px-2 py-4 text-white/70 space-y-3.5">
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center text-sky-400 shadow-inner">
                <Bot size={28} />
              </div>
              <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-black" />
            </div>

            <div className="space-y-1">
              <div className="text-sm font-semibold text-white flex items-center justify-center gap-1.5">
                <span>FixIt AI Agent Aktif</span>
                <Sparkles size={14} className="text-amber-400" />
              </div>
              <p className="text-[11px] text-white/50 max-w-[260px] leading-relaxed mx-auto">
                Aku otomatis memantau kodinganmu di VS Code, Kiro, atau Antigravity. Saat ada error sintaks atau runtime, panduan perbaikan akan muncul di sini.
              </p>
            </div>

            {/* Simulation test button */}
            <div className="w-full pt-1 space-y-2">
              <button
                onClick={onSimulateError}
                className="w-full py-2.5 px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] active:scale-95 border border-white/10 text-left flex items-center justify-between transition group"
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center">
                    <Sparkles size={14} />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-white group-hover:text-sky-300">
                      Coba Simulasi Error
                    </div>
                    <div className="text-[10px] text-white/40">
                      Lihat cara AI Agent menganalisis kode praktikum
                    </div>
                  </div>
                </div>
                <ArrowRight size={13} className="text-white/40 group-hover:text-sky-400" />
              </button>

              {/* Watched folder status */}
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.02] border border-white/5 text-[10px] text-white/50 text-left font-mono">
                <FolderCode size={12} className="text-purple-400 shrink-0" />
                <span className="truncate">
                  {settings.watched_paths[0] || "Memantau workspace aktif"}
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
              className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-xs leading-relaxed ${
                msg.sender === "user"
                  ? "bg-sky-500 text-white rounded-br-sm shadow-md"
                  : "bg-white/10 text-white/90 rounded-bl-sm border border-white/5"
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-white/5 text-xs text-white/60 animate-pulse">
            <div className="w-2 h-2 rounded-full bg-sky-400 animate-ping"></div>
            <span>FixIt AI sedang menganalisis...</span>
          </div>
        )}
      </div>

      {/* Footer Chat Input */}
      <AskBar
        onSendMessage={onSendMessage}
        disabled={isLoading}
        placeholder="Tanya FixIt apa saja..."
      />
    </div>
  );
};
