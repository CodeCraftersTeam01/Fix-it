import React, { useRef, useEffect, useMemo } from "react";
import { X } from "lucide-react";
import { HeaderBar } from "./HeaderBar";
import { ErrorGuideCard } from "./ErrorGuideCard";
import { AskBar } from "./AskBar";
import { AppSettings } from "./SettingsModal";
import { CodeError, FixExplanation, ChatMessage, FileActivity, ActiveErrorItem } from "../types";

interface FloatingHudProps {
  currentError?: CodeError | null;
  explanation?: FixExplanation | null;
  activeErrors?: ActiveErrorItem[];
  selectedErrorIndex?: number;
  onSelectError?: (index: number) => void;
  onClearSingleError?: (filePath: string) => void;
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
  activeErrors = [],
  selectedErrorIndex = 0,
  onSelectError,
  onClearSingleError: _onClearSingleError,
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

  const effectiveActiveErrors: ActiveErrorItem[] = useMemo(() => {
    if (activeErrors && activeErrors.length > 0) {
      return activeErrors;
    }
    if (currentError && explanation) {
      return [
        {
          id: currentError.file_path,
          error: currentError,
          explanation: explanation,
          hit_count: 1,
          is_looping: false,
          timestamp: Date.now(),
        },
      ];
    }
    return [];
  }, [activeErrors, currentError, explanation]);

  const activeIndex = Math.min(
    Math.max(0, selectedErrorIndex),
    Math.max(0, effectiveActiveErrors.length - 1)
  );
  const activeItem = effectiveActiveErrors[activeIndex] ?? null;
  const activeError = activeItem ? activeItem.error : (currentError ?? null);
  const activeExplanation = activeItem ? activeItem.explanation : (explanation ?? null);

  const getFileName = (filePath: string) => {
    const parts = filePath.replace(/\\/g, "/").split("/");
    return parts[parts.length - 1] || filePath;
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, activeExplanation, activeError, activeIndex]);

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
        onClose={() => {
          if (activeError) {
            onClearError();
          }
          onClose();
        }}
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
        ) : activeError && activeExplanation ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-[11px] text-white/40 pb-0.5">
              <span className="flex items-center gap-1.5 font-medium text-white/80">
                <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
                {effectiveActiveErrors.length > 1
                  ? `${effectiveActiveErrors.length} Error Terdeteksi`
                  : "Error Terdeteksi"}
              </span>
              <button
                type="button"
                onClick={onClearError}
                className="hover:text-white transition text-[11px] px-2 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] flex items-center gap-1.5 cursor-pointer text-white/70 hover:text-white"
                title="Tutup error dan kembali ke mode standby"
              >
                <span>Kembali standby</span>
                <X size={12} className="opacity-70" />
              </button>
            </div>

            {/* Horizontal scrollable cozy pill tabs when multiple errors exist */}
            {effectiveActiveErrors.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none no-scrollbar">
                {effectiveActiveErrors.map((item, idx) => {
                  const isActive = idx === activeIndex;
                  const fileName = getFileName(item.error.file_path);
                  return (
                    <button
                      key={item.id || item.error.file_path || idx}
                      type="button"
                      onClick={() => onSelectError?.(idx)}
                      className={`shrink-0 px-2.5 py-1 rounded-xl text-[11px] font-sans flex items-center gap-1.5 transition border ${
                        isActive
                          ? "bg-white/15 text-white border-white/20 shadow-sm"
                          : "bg-white/[0.04] text-white/50 hover:text-white/80 border-transparent hover:border-white/10"
                      }`}
                    >
                      <span className="truncate max-w-[120px] font-medium">{fileName}</span>
                      {item.error.line_number && (
                        <span className="text-[10px] opacity-60 font-mono">
                          Line {item.error.line_number}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Warning badge when loop / setInterval detected */}
            {activeItem && (activeItem.is_looping || activeItem.hit_count > 1) && (
              <div className="bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono text-[11px] px-2.5 py-1 rounded-xl flex items-center gap-1.5">
                <span>⚡</span>
                <span>
                  Loop / setInterval Terdeteksi (Terjadi {activeItem.hit_count}x)
                </span>
              </div>
            )}

            <ErrorGuideCard error={activeError} explanation={activeExplanation} />
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
