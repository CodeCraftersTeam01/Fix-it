import React, { useState } from "react";
import { AlertCircle, HelpCircle, CheckSquare, Square, Code, FileText } from "lucide-react";
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
    <div className="flex flex-col gap-3 p-4 rounded-2xl hud-card text-sm text-gray-200">
      {/* File & Line Badge */}
      <div className="flex items-center justify-between pb-2 border-b border-white/10 text-xs text-white/60">
        <div className="flex items-center gap-1.5 font-mono text-sky-400">
          <FileText size={14} />
          <span>{fileName}</span>
          {error.line_number && (
            <span className="bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded text-[10px]">
              Line {error.line_number}
            </span>
          )}
        </div>
        {error.project_name && (
          <span className="text-[11px] text-white/40">{error.project_name}</span>
        )}
      </div>

      {/* 1. Summary */}
      <div className="flex items-start gap-2 text-rose-300">
        <AlertCircle size={16} className="mt-0.5 shrink-0 text-rose-400" />
        <div className="font-medium text-xs leading-relaxed">
          {explanation.summary || error.raw_message}
        </div>
      </div>

      {/* 2. Why it happened (Educational concept) */}
      <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 space-y-1">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300/90">
          <HelpCircle size={13} />
          <span>Kenapa error ini terjadi?</span>
        </div>
        <p className="text-xs text-white/70 leading-relaxed">
          {explanation.why_it_happened}
        </p>
      </div>

      {/* 3. Step-by-step checklist */}
      {explanation.steps && explanation.steps.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
            Langkah Penyelesaian
          </div>
          <div className="space-y-1">
            {explanation.steps.map((step, idx) => {
              const isChecked = !!completedSteps[idx];
              return (
                <button
                  key={idx}
                  onClick={() => toggleStep(idx)}
                  className={`w-full text-left flex items-start gap-2 p-2 rounded-lg transition text-xs ${
                    isChecked
                      ? "bg-emerald-500/10 text-white/40 line-through"
                      : "bg-white/[0.02] hover:bg-white/[0.05] text-white/80"
                  }`}
                >
                  {isChecked ? (
                    <CheckSquare size={14} className="mt-0.5 shrink-0 text-emerald-400" />
                  ) : (
                    <Square size={14} className="mt-0.5 shrink-0 text-white/30" />
                  )}
                  <span className="leading-snug">{step}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Code hint */}
      {explanation.code_hint && (
        <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 space-y-1 font-mono text-xs">
          <div className="flex items-center gap-1 text-[10px] text-white/40">
            <Code size={11} />
            <span>Rekomendasi Kode:</span>
          </div>
          <pre className="text-emerald-400 overflow-x-auto text-[11px] leading-relaxed">
            {explanation.code_hint}
          </pre>
        </div>
      )}
    </div>
  );
};

