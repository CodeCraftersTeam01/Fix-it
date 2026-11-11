import React from "react";
import { X, Settings2, Maximize2 } from "lucide-react";

interface HeaderBarProps {
  onClose?: () => void;
  onOpenSettings?: () => void;
  onExpand?: () => void;
  greeting?: string;
  isAgentActive?: boolean;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  onClose,
  onOpenSettings,
  onExpand,
  greeting,
  isAgentActive = true,
}) => {
  const getGreeting = () => {
    if (greeting) return greeting;
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning.";
    if (hour < 18) return "Good afternoon.";
    return "Good evening.";
  };

  return (
    <div className="flex items-center justify-between px-4 pt-3.5 pb-2 select-none z-50 relative">
      {/* Close button with onMouseDown and onClick propagation stopped */}
      <button
        type="button"
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onClose?.();
        }}
        aria-label="Close"
        title="Tutup FixIt"
        className="w-8 h-8 rounded-full bg-white/10 hover:bg-rose-500/80 active:scale-90 flex items-center justify-center text-white/80 hover:text-white transition cursor-pointer z-50 pointer-events-auto"
      >
        <X size={15} />
      </button>

      {/* Drag region - strictly inside the center greeting text only */}
      <div
        data-tauri-drag-region
        className="flex-1 flex items-center justify-center gap-1.5 py-1 px-3 cursor-grab active:cursor-grabbing mx-2"
      >
        {isAgentActive && (
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse pointer-events-none" />
        )}
        <span className="text-xs font-medium text-white/75 tracking-wide pointer-events-none select-none">
          {getGreeting()}
        </span>
      </div>

      {/* Settings & Expand buttons */}
      <div className="flex items-center gap-1.5 z-50">
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onOpenSettings?.();
          }}
          aria-label="Settings"
          title="Pengaturan AI & Proyek"
          className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 active:scale-90 flex items-center justify-center text-white/80 hover:text-white transition cursor-pointer z-50 pointer-events-auto"
        >
          <Settings2 size={14} />
        </button>

        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onExpand?.();
          }}
          aria-label="Expand"
          title="Perbesar / Perkecil"
          className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 active:scale-90 flex items-center justify-center text-white/80 hover:text-white transition cursor-pointer z-50 pointer-events-auto"
        >
          <Maximize2 size={13} />
        </button>
      </div>
    </div>
  );
};
