import React, { useState } from "react";
import { FileCode, Copy, Check, ChevronDown, ChevronRight } from "lucide-react";

export interface DiffLine {
  type: "ctx" | "add" | "del";
  num: number;
  marker?: string;
  text: string;
}

export interface DiffPayload {
  type: "diff";
  file: string;
  add_count?: number;
  del_count?: number;
  lines: DiffLine[];
  raw_replacement?: string;
  message?: string;
}

interface DiffViewerProps {
  data: DiffPayload | string;
  defaultExpanded?: boolean;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  data,
  defaultExpanded = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);

  // Parse structured data or unified diff string
  const parsedDiff: DiffPayload | null = React.useMemo(() => {
    if (typeof data === "object" && data !== null && data.type === "diff") {
      return data;
    }
    if (typeof data === "string") {
      try {
        const json = JSON.parse(data);
        if (json && json.type === "diff" && Array.isArray(json.lines)) {
          return json as DiffPayload;
        }
      } catch {
        // Fallback: parse unified diff text if present
        const lines = data.split("\n");
        let lineNum = 1;
        const diffLines: DiffLine[] = [];
        let addCount = 0;
        let delCount = 0;

        for (const rawLine of lines) {
          if (rawLine.startsWith("+++ ") || rawLine.startsWith("--- ")) continue;
          if (rawLine.startsWith("@@")) {
            const match = rawLine.match(/\+(\d+)/);
            if (match) lineNum = parseInt(match[1], 10);
            continue;
          }
          if (rawLine.startsWith("+")) {
            addCount++;
            diffLines.push({
              type: "add",
              num: lineNum++,
              marker: "+",
              text: rawLine.substring(1),
            });
          } else if (rawLine.startsWith("-")) {
            delCount++;
            diffLines.push({
              type: "del",
              num: lineNum,
              marker: "-",
              text: rawLine.substring(1),
            });
          } else {
            diffLines.push({
              type: "ctx",
              num: lineNum++,
              marker: " ",
              text: rawLine.startsWith(" ") ? rawLine.substring(1) : rawLine,
            });
          }
        }

        if (diffLines.length > 0) {
          return {
            type: "diff",
            file: "file",
            add_count: addCount,
            del_count: delCount,
            lines: diffLines,
          };
        }
      }
    }
    return null;
  }, [data]);

  const fileName = React.useMemo(() => {
    if (!parsedDiff?.file) return "file";
    const parts = parsedDiff.file.replace(/\\/g, "/").split("/");
    return parts[parts.length - 1] || parsedDiff.file;
  }, [parsedDiff]);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!parsedDiff) return;

    let textToCopy = "";
    if (parsedDiff.raw_replacement) {
      textToCopy = parsedDiff.raw_replacement;
    } else {
      textToCopy = parsedDiff.lines
        .filter((l) => l.type === "add" || l.type === "ctx")
        .map((l) => l.text)
        .join("\n");
    }

    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!parsedDiff) {
    // If not a parseable diff, render clean fallback text
    return (
      <div className="my-1.5 p-2.5 rounded-xl bg-black/60 border border-white/[0.06] text-[11.5px] font-mono text-white/75 overflow-x-auto whitespace-pre-wrap leading-relaxed">
        {typeof data === "string" ? data : JSON.stringify(data, null, 2)}
      </div>
    );
  }

  const addCount = parsedDiff.add_count ?? parsedDiff.lines.filter((l) => l.type === "add").length;
  const delCount = parsedDiff.del_count ?? parsedDiff.lines.filter((l) => l.type === "del").length;

  return (
    <div className="w-full my-1.5 rounded-2xl bg-[#121316] border border-white/10 shadow-lg overflow-hidden select-none">
      {/* Header Pill matching exact user mockup */}
      <div
        onClick={() => setIsExpanded((prev) => !prev)}
        className="w-full px-3.5 py-2.5 bg-[#18191e] border-b border-white/[0.06] flex items-center justify-between cursor-pointer hover:bg-white/[0.04] transition group"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
          <FileCode size={14} className="text-white/60 shrink-0" />
          <span className="text-[12.5px] text-white/60 font-sans">Edited</span>
          <span className="text-[12.5px] text-white font-mono font-medium truncate max-w-[200px]">
            {fileName}
          </span>
          <div className="flex items-center gap-1.5 font-mono text-[11.5px] font-semibold shrink-0">
            {addCount > 0 && <span className="text-emerald-400">+{addCount}</span>}
            {delCount > 0 && <span className="text-rose-400">-{delCount}</span>}
          </div>
          {isExpanded ? (
            <ChevronDown size={14} className="text-white/40 group-hover:text-white/70 transition shrink-0 ml-0.5" />
          ) : (
            <ChevronRight size={14} className="text-white/40 group-hover:text-white/70 transition shrink-0 ml-0.5" />
          )}
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="p-1 rounded-md text-white/40 hover:text-white hover:bg-white/[0.08] transition shrink-0 cursor-pointer"
          title="Salin perubahan kode"
        >
          {copied ? (
            <Check size={14} className="text-emerald-400" />
          ) : (
            <Copy size={14} />
          )}
        </button>
      </div>

      {/* Code Diff Body */}
      {isExpanded && (
        <div className="py-2.5 bg-[#0f1013] overflow-x-auto text-[12px] font-mono leading-[22px] scrollbar-thin">
          <div className="min-w-full inline-block">
            {parsedDiff.lines.map((line, idx) => {
              const isAdd = line.type === "add";
              const isDel = line.type === "del";

              let rowBg = "bg-transparent hover:bg-white/[0.02]";
              if (isAdd) rowBg = "bg-emerald-500/[0.13]";
              if (isDel) rowBg = "bg-rose-500/[0.13]";

              // Clean text if it was prefixed
              let displayText = line.text;
              if (isAdd && displayText.startsWith("+ ")) displayText = displayText.slice(2);
              if (isDel && displayText.startsWith("- ")) displayText = displayText.slice(2);

              return (
                <div
                  key={idx}
                  className={`flex items-stretch min-w-full transition-colors ${rowBg}`}
                >
                  {/* Line Number Column (Gutter) */}
                  <div
                    className={`w-12 sm:w-14 shrink-0 text-right pr-2.5 select-none font-mono text-[11.5px] ${
                      isAdd
                        ? "text-emerald-400/80 font-medium"
                        : isDel
                        ? "text-rose-400/80 font-medium"
                        : "text-white/25"
                    }`}
                  >
                    {line.num}
                  </div>

                  {/* Marker Column (+ / - / space) */}
                  <div
                    className={`w-4 shrink-0 select-none text-center font-mono font-bold text-[12px] ${
                      isAdd
                        ? "text-emerald-400"
                        : isDel
                        ? "text-rose-400"
                        : "text-transparent"
                    }`}
                  >
                    {isAdd ? "+" : isDel ? "-" : " "}
                  </div>

                  {/* Code Line Body */}
                  <div
                    className={`flex-1 pl-1.5 pr-4 whitespace-pre font-mono text-[12px] ${
                      isAdd
                        ? "text-white font-medium"
                        : isDel
                        ? "text-rose-200/70 line-through"
                        : "text-white/80"
                    }`}
                  >
                    {displayText}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
