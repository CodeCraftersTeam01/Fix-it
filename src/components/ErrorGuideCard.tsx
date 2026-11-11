import React, { useState } from "react";
import { Check, Code2, Copy } from "lucide-react";
import { CodeError, FixExplanation } from "../types";

interface ErrorGuideCardProps {
  error: CodeError;
  explanation: FixExplanation;
}

export const ErrorGuideCard: React.FC<ErrorGuideCardProps> = ({
  error,
  explanation,
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

  return (
    <div className="space-y-3.5 text-white/90">
      {/* File & Line Badge */}
      <div className="flex items-center gap-2 text-[12px] font-mono text-white/45 pb-1">
        <span className="px-2 py-0.5 rounded-md bg-white/[0.05] border border-white/[0.06] text-white/70">
          {fileName}
        </span>
        {error.line_number && (
          <span className="text-white/50">Line {error.line_number}</span>
        )}
        {error.project_name && (
          <span className="ml-auto text-[11px] text-white/30 truncate max-w-[120px]">
            {error.project_name}
          </span>
        )}
      </div>

      {/* 1. Problem Statement */}
      <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
        <div className="text-[11px] font-mono font-medium text-white/45 uppercase tracking-wider mb-1">
          {error.error_type || "Sintaks Error"}
        </div>
        <div className="text-[13.5px] font-medium text-white/95 leading-relaxed">
          {explanation.summary || error.raw_message}
        </div>
      </div>

      {/* 2. Educational Concept */}
      <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.05] space-y-1">
        <div className="text-[11px] font-mono font-medium uppercase tracking-wider text-white/45">
          Kenapa ini terjadi?
        </div>
        <p className="text-[13px] text-white/70 leading-relaxed font-normal">
          {explanation.why_it_happened}
        </p>
      </div>

      {/* 3. Steps Checklist */}
      {explanation.steps && explanation.steps.length > 0 && (
        <div className="space-y-2 pt-0.5">
          <div className="text-[11px] font-medium uppercase tracking-wider text-white/35 px-1">
            Langkah Perbaikan
          </div>
          <div className="space-y-1.5">
            {explanation.steps.map((step, idx) => {
              const isChecked = !!completedSteps[idx];
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => toggleStep(idx)}
                  className={`w-full text-left flex items-start gap-2.5 p-2.5 rounded-xl transition text-[12.5px] ${
                    isChecked
                      ? "text-white/30 line-through bg-transparent"
                      : "text-white/85 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.04]"
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
                  <span className="leading-snug">{step}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Code hint */}
      {explanation.code_hint && (
        <div className="rounded-2xl bg-black/60 border border-white/[0.08] p-3 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-white/40">
            <div className="flex items-center gap-1.5 font-medium uppercase tracking-wider">
              <Code2 size={13} />
              <span>Rekomendasi Kode</span>
            </div>
            <button
              type="button"
              onClick={handleCopyCode}
              className="flex items-center gap-1 text-[11px] text-white/50 hover:text-white transition px-2 py-0.5 rounded-md hover:bg-white/[0.06]"
            >
              {copied ? (
                <>
                  <Check size={12} className="text-white" />
                  <span className="text-white">Tersalin</span>
                </>
              ) : (
                <>
                  <Copy size={12} />
                  <span>Salin</span>
                </>
              )}
            </button>
          </div>
          <pre className="text-white/90 font-mono text-[12px] leading-relaxed overflow-x-auto p-1">
            {explanation.code_hint}
          </pre>
        </div>
      )}
    </div>
  );
};
