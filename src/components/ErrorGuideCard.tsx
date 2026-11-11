import React, { useState } from "react";
import { Check, Code2 } from "lucide-react";
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

  const toggleStep = (index: number) => {
    setCompletedSteps((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const fileName = error.file_path.split("/").pop() || error.file_path;

  return (
    <div className="space-y-4 text-white/90">
      {/* File & Line Subtitle */}
      <div className="flex items-center gap-2 text-[12px] font-mono text-white/40 border-b border-white/[0.07] pb-2">
        <span>{fileName}</span>
        {error.line_number && (
          <span className="text-white/60">Line {error.line_number}</span>
        )}
        {error.project_name && (
          <span className="ml-auto text-[11px] text-white/30">{error.project_name}</span>
        )}
      </div>

      {/* 1. Problem Statement */}
      <div className="text-[14px] font-medium text-rose-300/95 leading-snug">
        {explanation.summary || error.raw_message}
      </div>

      {/* 2. Educational Concept */}
      <div className="text-[13px] text-white/70 font-normal leading-relaxed">
        {explanation.why_it_happened}
      </div>

      {/* 3. Steps Checklist */}
      {explanation.steps && explanation.steps.length > 0 && (
        <div className="space-y-2 pt-1">
          <div className="text-[11px] font-medium uppercase tracking-wider text-white/40">
            Langkah Penyelesaian
          </div>
          <div className="space-y-1.5">
            {explanation.steps.map((step, idx) => {
              const isChecked = !!completedSteps[idx];
              return (
                <button
                  key={idx}
                  onClick={() => toggleStep(idx)}
                  className={`w-full text-left flex items-start gap-2.5 p-2 rounded-xl transition text-[12.5px] ${
                    isChecked
                      ? "text-white/30 line-through bg-transparent"
                      : "text-white/85 bg-white/[0.04] hover:bg-white/[0.08]"
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition ${
                      isChecked
                        ? "bg-emerald-500/80 border-emerald-500 text-white"
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
        <div className="rounded-xl bg-black/40 border border-white/[0.06] p-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-white/40">
            <Code2 size={12} />
            <span>Rekomendasi</span>
          </div>
          <pre className="text-emerald-300/90 font-mono text-[11.5px] leading-relaxed overflow-x-auto">
            {explanation.code_hint}
          </pre>
        </div>
      )}
    </div>
  );
};
