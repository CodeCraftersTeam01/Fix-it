import React, { useRef, useEffect, useMemo, useState } from "react";
import {
  X,
  AlertCircle,
  Wand2,
  ChevronRight,
  Brain,
  ArrowDown,
} from "lucide-react";
import { HeaderBar } from "./HeaderBar";
import { ErrorGuideCard } from "./ErrorGuideCard";
import { DiffViewer } from "./DiffViewer";
import { AskBar } from "./AskBar";
import { AppSettings } from "./SettingsModal";
import { CodeError, FixExplanation, ChatMessage, FileActivity, ActiveErrorItem, AgentStep } from "../types";

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
  capturedImage?: { path: string; base64: string } | null;
  onClearCapturedImage?: () => void;
  onCaptureScreen?: () => void;
  onPasteImage?: (image: { path: string; base64: string }) => void;
  permissionNotice?: string | null;
  onDismissPermissionNotice?: () => void;
  onStartAgenticFix?: () => void;
  isAgentRunning?: boolean;
  agentSteps?: AgentStep[];
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
  settings,
  onSaveSettings: _onSaveSettings,
  capturedImage = null,
  onClearCapturedImage,
  onCaptureScreen,
  onPasteImage,
  permissionNotice = null,
  onDismissPermissionNotice,
  onStartAgenticFix,
  isAgentRunning = false,
  agentSteps = [],
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [localPermissionNotice, setLocalPermissionNotice] = useState<string | null>(null);
  const effectivePermissionNotice = permissionNotice || localPermissionNotice;
  const [expandedStepIndices, setExpandedStepIndices] = useState<Record<number, boolean>>({});

  const toggleStepExpand = (index: number) => {
    setExpandedStepIndices((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const finishStep = useMemo(() => {
    return agentSteps.find((s) => s.step_type === "finish") || null;
  }, [agentSteps]);

  const finishSummary = finishStep?.output?.trim();

  const displayMessages = useMemo(() => {
    const list = [...messages];
    if (finishSummary && !list.some((m) => m.text.trim() === finishSummary)) {
      list.push({
        id: "finish-summary",
        sender: "ai",
        text: finishSummary,
        timestamp: finishStep?.timestamp || Date.now(),
      });
    }
    return list;
  }, [messages, finishSummary, finishStep]);

  const parsedSteps = useMemo(() => {
    const thinkingSteps = agentSteps.filter((s) => s.step_type === "thinking");
    const results = agentSteps.filter(
      (s) => s.step_type === "tool_result" || s.step_type === "finish"
    );
    const inProgressCalls = agentSteps.filter(
      (s) => s.step_type === "tool_call" && !results.some((r) => r.step === s.step)
    );

    const all = [...thinkingSteps, ...results, ...inProgressCalls].sort(
      (a, b) => a.timestamp - b.timestamp
    );

    return all.map((step) => {
      const rawMsg = step.message || step.result_summary || "";
      let verb = "";
      let target = "";
      let isDoc = false;
      let isDir = false;
      let isReasoning = false;
      let diff: { plus: string; minus: string } | null = null;

      if (step.step_type === "thinking") {
        verb = "Reasoning";
        isReasoning = true;
        target = "";
      } else if (step.tool_name === "read_file" || rawMsg.startsWith("Analyzed")) {
        verb = "Analyzed";
        isDoc = true;
        target = rawMsg.replace(/^Analyzed\s+📄\s*/, "").replace(/^Membaca berkas\s*/, "");
      } else if (step.tool_name === "edit_file" || rawMsg.startsWith("Edited")) {
        verb = "Edited";
        isDoc = true;
        const diffMatch = rawMsg.match(/(\+\d+)?\s*(-\d+)?$/);
        const plus = diffMatch && diffMatch[1] ? diffMatch[1] : "+1";
        const minus = diffMatch && diffMatch[2] ? diffMatch[2] : "";
        diff = { plus, minus };
        target = rawMsg
          .replace(/^Edited\s+📄\s*/, "")
          .replace(/^Mengedit berkas\s*/, "")
          .replace(/\s*(\+\d+)?\s*(-\d+)?$/, "")
          .trim();
      } else if (step.tool_name === "write_file" || rawMsg.startsWith("Created")) {
        verb = "Created";
        isDoc = true;
        target = rawMsg.replace(/^Created\s+📄\s*/, "").replace(/^Menulis berkas\s*/, "");
        diff = { plus: "+all", minus: "-0" };
      } else if (step.tool_name === "list_dir" || rawMsg.startsWith("Checked")) {
        verb = "Checked";
        isDir = true;
        target = rawMsg.replace(/^Checked\s+📁\s*/, "").replace(/^Melihat struktur\s*/, "");
      } else if (step.step_type === "finish") {
        verb = "Resolved";
        target = "Perbaikan Selesai";
      } else {
        target = rawMsg.replace(/^Ran\s+`?/, "").replace(/`?$/, "");
      }

      return {
        verb,
        target: target.trim(),
        isDoc,
        isDir,
        isReasoning,
        diff,
        output: step.output || step.message || step.result_summary,
        isRunning: step.step_type === "tool_call",
      };
    });
  }, [agentSteps]);

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

  const isRepairMode = isAgentRunning || parsedSteps.length > 0;
  const isAtBottomRef = useRef(true);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    // Pinned to bottom if within 45px
    isAtBottomRef.current = distanceToBottom <= 45;
    setShowJumpToBottom(distanceToBottom > 80);
  };

  // Scroll to top when a fresh error is loaded so student sees the problem first
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
      isAtBottomRef.current = false;
    }
  }, [activeError?.file_path, activeError?.line_number]);

  // When agentic repair starts, pin to bottom and scroll down to monitor
  useEffect(() => {
    if (isAgentRunning) {
      isAtBottomRef.current = true;
      if (scrollRef.current) {
        scrollRef.current.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth",
        });
      }
    }
  }, [isAgentRunning]);

  // Smart sticky auto-scroll: only scrolls down if user is already at the bottom
  useEffect(() => {
    if (isAtBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [agentSteps, messages]);

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

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = () => {
              const res = reader.result as string;
              const base64 = res.split(",")[1];
              if (base64) {
                onPasteImage?.({ path: "clipboard.png", base64 });
              }
            };
            reader.readAsDataURL(file);
          }
          break;
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [onPasteImage]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Shortcut Cmd+I or Ctrl+I to trigger screen capture
      if ((e.metaKey || e.ctrlKey) && (e.key === "i" || e.key === "I")) {
        e.preventDefault();
        if (onCaptureScreen) {
          onCaptureScreen();
        } else {
          import("@tauri-apps/api/core").then(({ invoke }) => {
            invoke("start_interactive_screenshot").catch((err) => {
              const msg = typeof err === "string" ? err : err?.message || "Gagal screenshot";
              setLocalPermissionNotice(msg);
            });
          });
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCaptureScreen]);

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
        onCapture={async () => {
          if (onCaptureScreen) {
            onCaptureScreen();
            return;
          }
          try {
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke("start_interactive_screenshot");
          } catch (e: unknown) {
            const msg = typeof e === "string" ? e : (e as Error)?.message || "Gagal membuka tangkapan layar";
            setLocalPermissionNotice(msg);
          }
        }}
      />

      {/* Greeting Title */}
      <div className="px-6 pt-2 pb-1 select-none pointer-events-none flex items-center justify-between gap-3">
        <div className="text-[26px] font-medium text-white tracking-tight">
          {getGreeting()}
        </div>
        {settings?.model_name && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] border border-white/10 text-white/60 text-[11px] font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
            <span className="truncate max-w-[140px] sm:max-w-[220px]">{settings.model_name}</span>
          </div>
        )}
      </div>

      {/* Scrollable Content Body (Not draggable) */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-6 py-2 space-y-4 cursor-default"
      >
        {/* Thinking State when AI is actively analyzing the error */}
        {isAnalyzing ? (
          <div className="pt-1 max-w-3xl mx-auto w-full">
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
          <div className="max-w-4xl mx-auto w-full space-y-3">
            <div className="flex items-center justify-between text-[11px] text-white/40 pb-0.5">
              <span className="flex items-center gap-1.5 font-medium text-white/80">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
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

            {isRepairMode ? (
              /* Mode Perbaikan: Minimalist, Cozy, Clean - Zero Card Soup (Sesuai Antislop & Design Taste) */
              <div className="space-y-1.5 pb-1 select-none">
                <div className="flex items-center gap-2 py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                  <span className="px-2 py-0.5 rounded-md bg-white/[0.06] font-mono text-[11.5px] text-white/80 font-medium">
                    {getFileName(activeError.file_path)}{activeError.line_number ? `:${activeError.line_number}` : ""}
                  </span>
                  <span className="text-[12.5px] text-white/75 font-medium truncate flex-1">
                    {activeExplanation?.summary || activeError.raw_message}
                  </span>
                  <button
                    type="button"
                    onClick={onClearError}
                    className="text-[11px] text-white/35 hover:text-white/70 transition cursor-pointer shrink-0"
                    title="Tutup error"
                  >
                    Tutup
                  </button>
                </div>

                {/* Penjelasan tanpa container card (clean typography) */}
                {activeExplanation?.why_it_happened && (
                  <p className="text-[12px] text-white/45 leading-relaxed font-sans pl-3.5 pr-1">
                    {activeExplanation.why_it_happened}
                  </p>
                )}
              </div>
            ) : (
              /* Mode Normal: Error Guide Card Lengkap Sebelum Perbaikan */
              <ErrorGuideCard
                error={activeError}
                explanation={activeExplanation}
                isExpanded={isExpanded}
              />
            )}

            {/* Tool Call Activity Stream (Antigravity Timeline with Inline Reasoning & DiffViewer) */}
            {parsedSteps.length > 0 && (
              <div className="pt-0.5 pb-1 space-y-1.5 select-none font-sans">
                <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-1.5 divide-y divide-white/[0.025] space-y-1">
                  {parsedSteps.map((item, idx) => {
                    if (item.isReasoning) {
                      const isReasoningOpen =
                        expandedStepIndices[idx] ?? (item.isRunning || idx === parsedSteps.length - 1);

                      return (
                        <div key={idx} className="group py-0.5">
                          <button
                            type="button"
                            onClick={() => toggleStepExpand(idx)}
                            className="w-full py-1.5 px-2 rounded-lg hover:bg-white/[0.04] flex items-center justify-between text-left text-[12.5px] transition cursor-pointer select-none"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1 truncate pr-2">
                              <Brain size={14} className="text-white/60 shrink-0" />
                              <span className="text-white/85 font-sans font-medium text-[12.5px]">Reasoning</span>
                              {item.isRunning && (
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping shrink-0 ml-1" />
                              )}
                            </div>
                            <ChevronRight
                              size={13}
                              className={`text-white/30 group-hover:text-white/60 transition-transform shrink-0 ${
                                isReasoningOpen ? "rotate-90 text-white/70" : ""
                              }`}
                            />
                          </button>
                          {isReasoningOpen && item.output && (
                            <div className="my-1.5 mx-1 p-3.5 rounded-xl bg-[#121316] border border-white/10 text-[12px] font-sans text-white/75 leading-relaxed overflow-y-auto max-h-48 whitespace-pre-wrap select-text scrollbar-thin">
                              {item.output}
                            </div>
                          )}
                        </div>
                      );
                    }

                    const isDiff =
                      item.verb === "Edited" ||
                      (typeof item.output === "string" && item.output.includes('"type":"diff"'));

                    if (isDiff && item.output && !item.isRunning) {
                      return (
                        <div key={idx} className="pt-1 first:pt-0">
                          <DiffViewer data={item.output} defaultExpanded={true} />
                        </div>
                      );
                    }

                    return (
                      <div key={idx} className="group">
                        <button
                          type="button"
                          onClick={() => toggleStepExpand(idx)}
                          className="w-full py-1.5 px-2 rounded-lg hover:bg-white/[0.04] flex items-center justify-between text-left text-[12.5px] transition cursor-pointer"
                        >
                          <div className="flex items-center gap-1.5 min-w-0 flex-1 truncate pr-2">
                            {item.verb && (
                              <span className="text-white/45 font-normal shrink-0">
                                {item.verb}
                              </span>
                            )}
                            {item.isDoc && (
                              <span className="text-[11.5px] opacity-75 shrink-0">📄</span>
                            )}
                            {item.isDir && (
                              <span className="text-[11.5px] opacity-75 shrink-0">📁</span>
                            )}
                            <span className="text-white/95 font-medium truncate font-mono text-[12px]">
                              {item.target}
                            </span>
                            {item.diff && (
                              <span className="inline-flex items-center gap-1 shrink-0 font-mono text-[10.5px]">
                                {item.diff.plus && (
                                  <span className="text-emerald-400 font-medium">
                                    {item.diff.plus}
                                  </span>
                                )}
                                {item.diff.minus && (
                                  <span className="text-rose-400 font-medium">
                                    {item.diff.minus}
                                  </span>
                                )}
                              </span>
                            )}
                            {item.isRunning && (
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping shrink-0 ml-1" />
                            )}
                          </div>
                          <ChevronRight
                            size={13}
                            className={`text-white/30 group-hover:text-white/60 transition-transform shrink-0 ${
                              expandedStepIndices[idx] ? "rotate-90 text-white/70" : ""
                            }`}
                          />
                        </button>
                        {expandedStepIndices[idx] && item.output && (
                          <div className="my-1.5 mx-1 p-2.5 rounded-xl bg-black/60 border border-white/[0.06] text-[11px] font-mono text-white/75 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-48">
                            {item.output}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {!isAgentRunning && (
                  <div className="flex items-center justify-between pt-1 px-1 text-[11px] text-white/35">
                    <span>Perbaikan otomatis selesai</span>
                    <button
                      type="button"
                      onClick={onStartAgenticFix}
                      className="text-white/60 hover:text-white transition cursor-pointer underline underline-offset-2"
                    >
                      Jalankan Ulang Perbaikan
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Tombol Perbaiki Otomatis (Hanya muncul jika belum dijalankan) */}
            {!isAgentRunning && parsedSteps.length === 0 && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onStartAgenticFix}
                  className="w-full py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 text-[13px] font-medium transition cursor-pointer select-none bg-white/[0.08] hover:bg-white/[0.13] active:scale-[0.99] border border-white/[0.12] text-white shadow-sm"
                >
                  <Wand2 size={14} className="text-white/75" />
                  <span>Perbaiki Otomatis</span>
                </button>
              </div>
            )}

            {/* Respon AI / Ringkasan Hasil Perbaikan */}
            {displayMessages.length > 0 && (
              <div className="pt-2.5 space-y-3 font-sans select-text">
                {displayMessages.map((msg) => (
                  msg.text.trim() ? (
                    <div key={msg.id} className="text-left">
                      {msg.sender === "user" ? (
                        <div className="flex justify-end my-1">
                          <div className="px-3 py-1.5 rounded-2xl bg-white/15 text-white text-[12.5px] leading-relaxed max-w-[85%] font-medium">
                            {msg.text}
                          </div>
                        </div>
                      ) : (
                        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[13px] text-white/90 leading-relaxed whitespace-pre-wrap selection:bg-white/20 font-normal">
                          {msg.text}
                        </div>
                      )}
                    </div>
                  ) : null
                ))}
              </div>
            )}

            {/* Status Agent: Working saat ada aksi/tool call, Thinking saat analisis awal (tanpa spinner berputar) */}
            {isAgentRunning && (
              <div className="pt-2 pb-1 text-[12.5px] font-mono select-none">
                <span className="text-white/50 font-medium tracking-tight animate-text-shine">
                  {parsedSteps.length > 0 ? "Working" : "Thinking"}
                </span>
              </div>
            )}
          </div>
        ) : messages.length === 0 ? (
          /* Empty Standby Dashboard: clean Apple glass card, centered and proportional */
          <div className="pt-1 max-w-2xl mx-auto w-full">
            <div className="p-4 rounded-2xl bg-white/[0.035] border border-white/[0.06] shadow-sm">
              <div className="flex items-center gap-3">
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    activeFileActivity?.status.includes("Menulis")
                      ? "bg-amber-400 animate-ping"
                      : activeFileActivity?.status.includes("Valid")
                      ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]"
                      : "bg-white/60"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[14.5px] font-medium text-white/95 tracking-tight">
                      {activeFileActivity
                        ? activeFileActivity.status.includes("Valid")
                          ? "Sintaks Valid"
                          : activeFileActivity.status
                        : "Standby Memantau"}
                    </h3>
                    {activeFileActivity?.status.includes("Valid") && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[10.5px] font-medium">
                        Normal
                      </span>
                    )}
                  </div>
                  <div className="text-[12px] text-white/40 pt-0.5 font-sans truncate">
                    {activeFileActivity?.file_name
                      ? activeFileActivity.file_name
                      : "Menunggu aktivitas koding..."}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Live Status & Active Conversation Flow */
          <div className="max-w-3xl mx-auto w-full space-y-4">
            <div className="pt-1">
              <div className="p-3.5 rounded-2xl bg-white/[0.035] border border-white/[0.05]">
                <div className="flex items-center gap-3">
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      activeFileActivity?.status.includes("Menulis")
                        ? "bg-amber-400 animate-ping"
                        : activeFileActivity?.status.includes("Valid")
                        ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]"
                        : "bg-white/70"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[14.5px] font-medium text-white/95 tracking-tight">
                        {activeFileActivity
                          ? activeFileActivity.status.includes("Valid")
                            ? "Sintaks Valid"
                            : activeFileActivity.status
                          : "Standby Memantau"}
                      </h3>
                      {activeFileActivity?.status.includes("Valid") && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[10.5px] font-medium">
                          Normal
                        </span>
                      )}
                    </div>
                    <div className="text-[12px] text-white/40 pt-0.5 font-sans truncate">
                      {activeFileActivity?.file_name
                        ? activeFileActivity.file_name
                        : "Menunggu aktivitas koding..."}
                    </div>
                  </div>
                </div>
              </div>
            </div>

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
                      : "bg-white/[0.08] text-white/90 rounded-bl-sm border border-white/[0.04]"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="text-[12px] text-white/40 animate-pulse max-w-3xl mx-auto w-full">
            Menganalisis...
          </div>
        )}
      </div>

      {/* Permission Notice Alert Bar */}
      {effectivePermissionNotice && (
        <div className="mx-4 mb-2 max-w-3xl mx-auto w-full p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-white select-none">
          <div className="flex items-start gap-2.5">
            <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 text-[11.5px] leading-relaxed text-amber-200/90 font-sans">
              {effectivePermissionNotice}
            </div>
          </div>
          <div className="mt-2.5 flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={async () => {
                try {
                  const { invoke } = await import("@tauri-apps/api/core");
                  await invoke("open_screen_capture_settings");
                } catch {}
              }}
              className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-[11px] font-medium transition cursor-pointer"
            >
              Buka Pengaturan
            </button>
            <button
              type="button"
              onClick={() => {
                setLocalPermissionNotice(null);
                onDismissPermissionNotice?.();
              }}
              className="px-2 py-1 rounded-lg text-white/50 hover:text-white/80 text-[11px] transition cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* Captured Image Preview Bar */}
      {capturedImage && (
        <div
          data-testid="captured-image-preview"
          className="mx-4 mb-1 max-w-3xl mx-auto w-full p-2 rounded-2xl bg-white/[0.06] border border-white/10 flex items-center justify-between gap-2.5 shadow-lg select-none backdrop-blur-md"
        >
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="relative w-12 h-12 rounded-xl overflow-hidden border border-white/15 bg-black/40 shrink-0 flex items-center justify-center">
              <img
                src={`data:image/png;base64,${capturedImage.base64}`}
                alt="Captured screen"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[12px] font-medium text-white/95 truncate">
                Tangkapan Layar
              </span>
              <span className="text-[10.5px] text-white/45 truncate">
                Siap dikirim ke AI
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() =>
                onSendMessage(
                  "Tolong jelaskan dan berikan solusi untuk kode/error pada tangkapan layar ini."
                )
              }
              disabled={isLoading}
              className="px-2.5 py-1 rounded-xl bg-white/15 hover:bg-white/25 active:scale-95 text-white text-[11px] font-medium transition cursor-pointer"
              title="Kirim ke AI untuk dianalisis"
            >
              Analisis AI
            </button>
            <button
              type="button"
              onClick={onClearCapturedImage}
              aria-label="Hapus screenshot"
              className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 active:scale-90 text-white/70 hover:text-white transition flex items-center justify-center cursor-pointer"
              title="Hapus tangkapan layar"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {showJumpToBottom && (
        <div className="absolute bottom-[72px] left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
          <button
            type="button"
            onClick={() => {
              if (scrollRef.current) {
                scrollRef.current.scrollTo({
                  top: scrollRef.current.scrollHeight,
                  behavior: "smooth",
                });
                setShowJumpToBottom(false);
              }
            }}
            className="px-3.5 py-1.5 rounded-full bg-[#18181b]/90 hover:bg-[#27272a] border border-white/15 text-white/90 hover:text-white text-[12px] font-sans font-medium flex items-center gap-1.5 shadow-2xl transition cursor-pointer backdrop-blur-md active:scale-95"
          >
            <ArrowDown size={13} className="text-white/80" />
            <span>Jump to latest</span>
          </button>
        </div>
      )}

      {/* Bottom Capsule Bar (Exact match to "Ask Siri" pill in screenshot) */}
      <AskBar
        onSendMessage={onSendMessage}
        disabled={isLoading}
        placeholder="Tanya FixIt apa saja..."
      />
    </div>
  );
};
