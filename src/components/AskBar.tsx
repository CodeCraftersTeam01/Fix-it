import React, { useState } from "react";
import { Plus, Mic, Send } from "lucide-react";

interface AskBarProps {
  onSendMessage: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export const AskBar: React.FC<AskBarProps> = ({
  onSendMessage,
  disabled = false,
  placeholder = "Tanya FixIt apa saja...",
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
      className="flex items-center gap-2 px-4 py-3 select-none"
    >
      {/* Plus action button */}
      <button
        type="button"
        title="Opsi Tambahan"
        className="w-9 h-9 rounded-full hud-input flex items-center justify-center text-white/70 hover:text-white hover:bg-white/20 active:scale-95 transition"
      >
        <Plus size={16} />
      </button>

      {/* Center Input Pill */}
      <div className="flex-1 flex items-center h-10 px-4 rounded-full hud-input transition focus-within:ring-1 focus-within:ring-sky-500/50">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full bg-transparent text-xs text-white placeholder-white/35 focus:outline-none"
        />
      </div>

      {/* Mic or Send button */}
      <button
        type={input.trim() ? "submit" : "button"}
        title={input.trim() ? "Kirim" : "Gunakan Suara"}
        className="w-9 h-9 rounded-full hud-input flex items-center justify-center text-white/70 hover:text-white hover:bg-white/20 active:scale-95 transition"
      >
        {input.trim() ? (
          <Send size={15} className="text-sky-400" />
        ) : (
          <Mic size={16} />
        )}
      </button>
    </form>
  );
};

