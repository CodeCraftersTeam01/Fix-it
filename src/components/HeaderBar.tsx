import React from "react";
import { X, Maximize2, Settings } from "lucide-react";

interface HeaderBarProps {
  onClose?: () => void;
  onOpenSettings?: () => void;
  onExpand?: () => void;
  onStartDrag?: (e: React.MouseEvent) => void;
  greeting?: string;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  onClose,
  onOpenSettings,
  onExpand,
  onStartDrag,
  greeting,
}) => {
  return (
    <div
      data-tauri-drag-region
      onMouseDown={onStartDrag}
      className="flex items-center justify-between px-4 pt-4 pb-1 select-none z-30 cursor-grab active:cursor-grabbing"
    >
      {/* Top Left Close Button */}
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onClose?.();
        }}
        aria-label="Close"
        title="Tutup FixIt"
        className="w-9 h-9 rounded-full apple-pill-btn flex items-center justify-center text-white/85 hover:text-white transition cursor-pointer"
      >
        <X size={16} strokeWidth={2.2} />
      </button>

      {/* Middle Drag Spacer */}
      <div
        data-tauri-drag-region
        className="flex-1 h-9 mx-2 flex items-center justify-center text-xs text-white/40 pointer-events-none"
      >
        {greeting && <span>{greeting}</span>}
      </div>

      {/* Top Right Expand & Settings */}
      <div className="flex items-center gap-1.5" onMouseDown={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenSettings?.();
          }}
          aria-label="Settings"
          title="Pengaturan"
          className="w-9 h-9 rounded-full apple-pill-btn flex items-center justify-center text-white/70 hover:text-white transition cursor-pointer"
        >
          <Settings size={15} strokeWidth={2} />
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onExpand?.();
          }}
          aria-label="Expand"
          title="Perbesar"
          className="w-9 h-9 rounded-full apple-pill-btn flex items-center justify-center text-white/85 hover:text-white transition cursor-pointer"
        >
          <Maximize2 size={14} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
};
