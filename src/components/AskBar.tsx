import React, { useState } from "react";
import { Plus, Mic, ArrowUp } from "lucide-react";

interface AskBarProps {
  onSendMessage: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export const AskBar: React.FC<AskBarProps> = ({
  onSendMessage,
  disabled = false,
  placeholder = "Ask FixIt",
}) => {
  const [input, setInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || disabled) return;
    onSendMessage(input.trim());
    setInput("");
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="px-4 pb-4 pt-2 select-none z-20 w-full"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 max-w-3xl mx-auto w-full">
        {/* Plus action pill */}
        <button
          type="button"
          title="Opsi"
          className="w-10 h-10 rounded-full apple-pill-btn flex items-center justify-center text-white/80 hover:text-white active:scale-95 transition shrink-0"
        >
          <Plus size={18} strokeWidth={2} />
        </button>

        {/* Capsule Input Bar */}
        <div className="flex-1 flex items-center h-10 px-4 rounded-full apple-input-capsule transition">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            className="w-full bg-transparent text-[13px] text-white placeholder-white/40 focus:outline-none font-normal"
          />
        </div>

        {/* Mic / Send Button */}
        <button
          type={input.trim() ? "submit" : "button"}
          title={input.trim() ? "Kirim" : "Gunakan Suara"}
          className="w-10 h-10 rounded-full apple-pill-btn flex items-center justify-center text-white/80 hover:text-white active:scale-95 transition shrink-0"
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
