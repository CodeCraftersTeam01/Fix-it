import React from "react";
import { SettingsView } from "./settings/SettingsView";
import { AppSettings } from "./settings/types";

export type { AppSettings } from "./settings/types";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
}) => {
  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-50 bg-black/85 backdrop-blur-md rounded-[30px] p-2 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
      <SettingsView
        isWindow={false}
        onClose={onClose}
        config={settings}
        onSave={onSave}
      />
    </div>
  );
};
