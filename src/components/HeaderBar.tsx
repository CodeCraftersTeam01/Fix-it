import React from "react";
import { X, Maximize2, Minimize2, Settings, Crop } from "lucide-react";

interface HeaderBarProps {
  onClose?: () => void;
  onOpenSettings?: () => void;
  onExpand?: () => void;
  onCapture?: () => void;
  isExpanded?: boolean;
  onStartDrag?: (e: React.MouseEvent) => void;
  greeting?: string;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  onClose,
  onOpenSettings,
  onExpand,
  onCapture,
  isExpanded = false,
  onStartDrag,
  greeting,
}) => {
  return (
    <div
      className="flex items-center justify-between px-4 pt-4 pb-1 select-none z-30 cursor-default"
    >
      {/* Top Left Close Button */}
      <button
        type="button"
        data-tauri-drag-region="false"
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onClose?.();
        }}
        aria-label="Close"
        title="Sembunyikan ke Background"
        className="w-9 h-9 rounded-full apple-pill-btn flex items-center justify-center text-white/85 hover:text-white active:scale-90 transition-transform duration-75 cursor-pointer select-none"
      >
        <X size={16} strokeWidth={2.2} />
      </button>

      {/* Middle Drag Spacer - ONLY this central region triggers window dragging */}
      <div
        data-tauri-drag-region
        onMouseDown={onStartDrag}
        className="flex-1 h-9 mx-2 flex items-center justify-center text-xs text-white/40 cursor-grab active:cursor-grabbing select-none"
      >
        {greeting && <span>{greeting}</span>}
      </div>

      {/* Top Right Expand & Settings */}
      <div
        data-tauri-drag-region="false"
        className="flex items-center gap-1.5"
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {onCapture && (
          <button
            type="button"
            data-tauri-drag-region="false"
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onCapture?.();
            }}
            aria-label="Capture Screen"
            title="Tangkapan Layar (Cmd+I / Ctrl+I)"
            className="w-9 h-9 rounded-full apple-pill-btn flex items-center justify-center text-white/70 hover:text-white active:scale-90 transition-transform duration-75 cursor-pointer select-none"
          >
            <Crop size={15} strokeWidth={2} />
          </button>
        )}

        <button
          type="button"
          data-tauri-drag-region="false"
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onOpenSettings?.();
          }}
          aria-label="Settings"
          title="Pengaturan"
          className="w-9 h-9 rounded-full apple-pill-btn flex items-center justify-center text-white/70 hover:text-white active:scale-90 transition-transform duration-75 cursor-pointer select-none"
        >
          <Settings size={15} strokeWidth={2} />
        </button>

        <button
          type="button"
          data-tauri-drag-region="false"
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onExpand?.();
          }}
          aria-label={isExpanded ? "Minimize" : "Expand"}
          title={isExpanded ? "Perkecil (Ukuran Normal)" : "Perbesar (Mode Lebar)"}
          className="w-9 h-9 rounded-full apple-pill-btn flex items-center justify-center text-white/85 hover:text-white active:scale-90 transition-transform duration-75 cursor-pointer select-none"
        >
          {isExpanded ? (
            <Minimize2 size={14} strokeWidth={2.2} />
          ) : (
            <Maximize2 size={14} strokeWidth={2.2} />
          )}
        </button>
      </div>
    </div>
  );
};
