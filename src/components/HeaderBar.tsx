import React from "react";
import { X, Maximize2 } from "lucide-react";

interface HeaderBarProps {
  onClose?: () => void;
  onExpand?: () => void;
  greeting?: string;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  onClose,
  onExpand,
  greeting,
}) => {
  const getGreeting = () => {
    if (greeting) return greeting;
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning.";
    if (hour < 18) return "Good afternoon.";
    return "Good evening.";
  };

  return (
    <div
      data-tauri-drag-region
      className="flex items-center justify-between px-5 pt-4 pb-2 cursor-grab active:cursor-grabbing select-none"
    >
      {/* Close button pill */}
      <button
        onClick={onClose}
        aria-label="Close"
        className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 flex items-center justify-center text-white/80 transition"
      >
        <X size={16} />
      </button>

      {/* Greeting Title */}
      <div className="text-sm font-medium text-white/70 tracking-wide">
        {getGreeting()}
      </div>

      {/* Expand button pill */}
      <button
        onClick={onExpand}
        aria-label="Expand"
        className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 flex items-center justify-center text-white/80 transition"
      >
        <Maximize2 size={14} />
      </button>
    </div>
  );
};

