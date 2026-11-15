import React, { useState } from "react";
import { Plus, Mic, ArrowUp } from "lucide-react";

interface AskBarProps {
  onSendMessage: (text: string) => void;
  onActionClick?: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export const AskBar: React.FC<AskBarProps> = ({
  onSendMessage,
  onActionClick,
  disabled = false,
  placeholder = "Ask FixIt",
}) => {
  const [input, setInput] = useState("");

  const handleSubmit = (e?: React.FormEvent | React.MouseEvent | React.KeyboardEvent) => {
    if (e) {
      e.preventDefault();
    }
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    setInput("");
    onSendMessage(trimmed);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="px-4 pb-4 pt-2 z-20 w-full"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 max-w-3xl mx-auto w-full">
        {/* Plus action pill (Screen capture / Attach) */}
        <button
          type="button"
          onClick={onActionClick}
          title="Tangkapan Layar / Opsi"
          className="w-10 h-10 rounded-full apple-pill-btn flex items-center justify-center text-white/80 hover:text-white active:scale-95 transition shrink-0 cursor-pointer"
        >
          <Plus size={18} strokeWidth={2} />
        </button>

        {/* Capsule Input Bar */}
        <div className="flex-1 flex items-center h-10 px-4 rounded-full apple-input-capsule transition">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder={placeholder}
            disabled={disabled}
            className="w-full bg-transparent text-[13px] text-white placeholder-white/40 focus:outline-none font-normal"
          />
        </div>

        {/* Mic / Send Button */}
        <button
          type="submit"
          onClick={handleSubmit}
          disabled={disabled || !input.trim()}
          title={input.trim() ? "Kirim" : "Gunakan Suara"}
          className={`w-10 h-10 rounded-full apple-pill-btn flex items-center justify-center active:scale-95 transition shrink-0 ${
            input.trim() && !disabled
              ? "text-white bg-white/20 hover:bg-white/30 cursor-pointer"
              : "text-white/40 cursor-default"
          }`}
        >
          {input.trim() ? (
            <ArrowUp size={18} strokeWidth={2.4} className="text-white" />
          ) : (
            <Mic size={17} strokeWidth={2} />
          )}
        </button>
      </div>
    </form>
  );
};
