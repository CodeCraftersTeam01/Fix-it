import React, { useState } from "react";
import { Check, Code2, Copy } from "lucide-react";
import { CodeError, FixExplanation } from "../types";

interface ErrorGuideCardProps {
  error: CodeError;
  explanation: FixExplanation;
  isExpanded?: boolean;
  hideStepsAndCode?: boolean;
}

interface WordBlurRevealProps {
  text: string;
  baseDelayMs?: number;
  wordDelayMs?: number;
}

export const WordBlurReveal: React.FC<WordBlurRevealProps> = ({
  text,
  baseDelayMs = 0,
  wordDelayMs = 24,
}) => {
  if (!text) return null;
  const tokens = text.split(/(\s+)/);

  let wordCount = 0;
  return (
    <>
      {tokens.map((token, idx) => {
        if (/^\s+$/.test(token)) {
          return token;
        }
        const delay = baseDelayMs + wordCount * wordDelayMs;
        wordCount++;
        return (
          <span
            key={idx}
            className="animate-word-blur break-words [overflow-wrap:anywhere]"
            style={{
              animationDelay: `${delay}ms`,
            }}
          >
            {token}
          </span>
        );
      })}
    </>
  );
};

export const ErrorGuideCard: React.FC<ErrorGuideCardProps> = ({
  error,
  explanation,
  isExpanded = false,
  hideStepsAndCode = false,
}) => {
  const [completedSteps, setCompletedSteps] = useState<Record<number, boolean>>({});
  const [copied, setCopied] = useState(false);

  const toggleStep = (index: number) => {
    setCompletedSteps((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const handleCopyCode = async () => {
    if (explanation.code_hint) {
      try {
        await navigator.clipboard.writeText(explanation.code_hint);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (e) {
        console.error("Failed to copy", e);
      }
    }
  };

  const fileName = error.file_path.split("/").pop() || error.file_path;

  // Shorten long absolute paths to clean relative paths in steps
  const formatStepText = (text: string) => {
    if (!text) return "";
    let formatted = text;
    if (error.file_path && error.file_path.includes("/")) {
      const parts = error.file_path.split("/");
      const appIdx = parts.findIndex((p) =>
        ["app", "src", "routes", "controllers", "models", "resources"].includes(p.toLowerCase())
      );
      if (appIdx !== -1) {
        const relPath = parts.slice(appIdx).join("/");
        formatted = formatted.split(error.file_path).join(relPath);
      } else {
        formatted = formatted.split(error.file_path).join(fileName);
      }
    }
    return formatted.replace(/\/Users\/[^\s/]+(?:\/[^\s/]+)*?\/(app\/|src\/|routes\/|models\/|controllers\/)/gi, "$1");
  };

  const showCodeHint = Boolean(explanation.code_hint) && !hideStepsAndCode;
  const showSteps = Boolean(explanation.steps && explanation.steps.length > 0) && !hideStepsAndCode;

  return (
    <div className="space-y-3.5 text-white/90">
      {/* File & Line Badge */}
      <div className="flex items-center gap-2 text-[12px] font-mono text-white/45 pb-0.5">
        <span className="px-2.5 py-1 rounded-xl bg-white/[0.06] border border-white/[0.08] text-white/80 font-medium">
          {fileName}
        </span>
        {error.line_number && (
          <span className="px-2 py-0.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300/90 text-[11px]">
            Line {error.line_number}
          </span>
        )}
        {error.project_name && (
          <span className="ml-auto text-[11px] text-white/30 truncate max-w-[140px]">
            {error.project_name}
          </span>
        )}
      </div>

      {/* Main Grid: Responsive 2-column in mode besar / expanded, clean stack in mode minimize */}
      <div
        className={
          isExpanded && showCodeHint
            ? "grid grid-cols-1 md:grid-cols-12 gap-3.5 items-start"
            : "space-y-3"
        }
      >
        {/* Left Column (Diagnosis & Steps) */}
        <div
          className={
            isExpanded && showCodeHint
              ? "md:col-span-7 space-y-3"
              : "space-y-3"
          }
        >
          {/* 1. Problem Statement */}
          <div className="p-3.5 rounded-2xl bg-red-500/[0.06] border border-red-500/20 shadow-sm">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
              <div className="text-[11px] font-mono font-medium text-red-300 uppercase tracking-wider">
                {error.error_type || "Sintaks Error"}
              </div>
            </div>
            <div className="text-[13.5px] font-medium text-white/95 leading-relaxed break-words [overflow-wrap:anywhere]">
              <WordBlurReveal
                key={`summary-${explanation.summary || error.raw_message}`}
                text={explanation.summary || error.raw_message}
                baseDelayMs={40}
                wordDelayMs={24}
              />
            </div>
          </div>

          {/* 2. Educational Concept */}
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-1.5">
            <div className="text-[11px] font-mono font-medium uppercase tracking-wider text-white/45">
              Kenapa ini terjadi?
            </div>
            <p className="text-[13px] text-white/75 leading-relaxed font-normal break-words [overflow-wrap:anywhere]">
              <WordBlurReveal
                key={`why-${explanation.why_it_happened}`}
                text={explanation.why_it_happened}
                baseDelayMs={180}
                wordDelayMs={20}
              />
            </p>
          </div>

          {/* 3. Steps Checklist */}
          {showSteps && (
            <div className="space-y-2 pt-0.5">
              <div className="text-[11px] font-medium uppercase tracking-wider text-white/40 px-1">
                Langkah Perbaikan
              </div>
              <div className="space-y-1.5">
                {explanation.steps.map((step, idx) => {
                  const isChecked = !!completedSteps[idx];
                  const cleanedStep = formatStepText(step);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleStep(idx)}
                      className={`w-full text-left flex items-start gap-2.5 p-2.5 rounded-xl transition text-[12.5px] min-w-0 overflow-hidden cursor-pointer ${
                        isChecked
                          ? "text-white/30 line-through bg-transparent"
                          : "text-white/85 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.05]"
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition ${
                          isChecked
                            ? "bg-white text-black border-white"
                            : "border-white/20 bg-white/[0.03]"
                        }`}
                      >
                        {isChecked && <Check size={11} strokeWidth={3} />}
                      </div>
                      <span className="leading-snug min-w-0 break-words [overflow-wrap:anywhere] flex-1">
                        <WordBlurReveal
                          key={`step-${idx}-${cleanedStep}`}
                          text={cleanedStep}
                          baseDelayMs={300 + idx * 80}
                          wordDelayMs={18}
                        />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Column (Code Hint) */}
        {showCodeHint && (
          <div
            className={
              isExpanded
                ? "md:col-span-5 rounded-2xl bg-black/60 border border-white/[0.08] p-3.5 space-y-2.5 sticky top-1"
                : "rounded-2xl bg-black/60 border border-white/[0.08] p-3.5 space-y-2.5"
            }
          >
            <div className="flex items-center justify-between text-[11px] text-white/45 pb-1 border-b border-white/[0.06]">
              <div className="flex items-center gap-1.5 font-medium uppercase tracking-wider text-white/70">
                <Code2 size={13} className="text-white/80" />
                <span>Rekomendasi Kode</span>
              </div>
              <button
                type="button"
                onClick={handleCopyCode}
                className="flex items-center gap-1.5 text-[11px] text-white/60 hover:text-white transition px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check size={12} className="text-emerald-400" />
                    <span className="text-emerald-300 font-medium">Tersalin</span>
                  </>
                ) : (
                  <>
                    <Copy size={12} />
                    <span>Salin</span>
                  </>
                )}
              </button>
            </div>
            <pre className="text-emerald-300/95 font-mono text-[12px] leading-relaxed overflow-x-auto whitespace-pre-wrap break-all p-2 rounded-xl bg-white/[0.02] border border-white/[0.04]">
              {explanation.code_hint}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
