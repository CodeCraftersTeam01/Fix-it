import React, { useState } from "react";
import { X, Key, Globe, Cpu, FolderOpen, Save, Check } from "lucide-react";

export interface AppSettings {
  openai_base_url: string;
  openai_api_key: string;
  model_name: string;
  idle_delay_ms: number;
  watched_paths: string[];
}

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
  const [formData, setFormData] = useState<AppSettings>(settings);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 800);
  };

  return (
    <div className="absolute inset-0 z-50 bg-black/75 backdrop-blur-md rounded-[28px] p-5 flex flex-col text-xs text-white/90">
      <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
        <div className="font-semibold text-sm text-sky-400">Pengaturan FixIt AI</div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
        >
          <X size={14} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-3.5 pr-1">
        {/* Base URL */}
        <div className="space-y-1">
          <label className="flex items-center gap-1.5 text-white/60 font-medium text-[11px]">
            <Globe size={12} className="text-sky-400" />
            <span>OpenAI Base URL</span>
          </label>
          <input
            type="text"
            value={formData.openai_base_url}
            onChange={(e) =>
              setFormData({ ...formData, openai_base_url: e.target.value })
            }
            placeholder="https://api.openai.com/v1"
            className="w-full px-3 py-2 rounded-xl hud-input text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <div className="text-[10px] text-white/40">
            Dukung OpenAI, Groq, Ollama (http://localhost:11434/v1), dll.
          </div>
        </div>

        {/* API Key */}
        <div className="space-y-1">
          <label className="flex items-center gap-1.5 text-white/60 font-medium text-[11px]">
            <Key size={12} className="text-amber-400" />
            <span>API Key</span>
          </label>
          <input
            type="password"
            value={formData.openai_api_key}
            onChange={(e) =>
              setFormData({ ...formData, openai_api_key: e.target.value })
            }
            placeholder="sk-..."
            className="w-full px-3 py-2 rounded-xl hud-input text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        {/* Model Name */}
        <div className="space-y-1">
          <label className="flex items-center gap-1.5 text-white/60 font-medium text-[11px]">
            <Cpu size={12} className="text-emerald-400" />
            <span>Nama Model AI</span>
          </label>
          <input
            type="text"
            value={formData.model_name}
            onChange={(e) =>
              setFormData({ ...formData, model_name: e.target.value })
            }
            placeholder="gpt-4o-mini / llama-3.3-70b-versatile"
            className="w-full px-3 py-2 rounded-xl hud-input text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        {/* Project Folder */}
        <div className="space-y-1">
          <label className="flex items-center gap-1.5 text-white/60 font-medium text-[11px]">
            <FolderOpen size={12} className="text-purple-400" />
            <span>Folder Proyek Praktikum</span>
          </label>
          <input
            type="text"
            value={formData.watched_paths.join(", ")}
            onChange={(e) =>
              setFormData({
                ...formData,
                watched_paths: e.target.value
                  .split(",")
                  .map((p) => p.trim())
                  .filter(Boolean),
              })
            }
            placeholder="/Users/nama/Herd/ProyekPraktikum"
            className="w-full px-3 py-2 rounded-xl hud-input text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        {/* Submit button */}
        <button
          type="submit"
          className="w-full mt-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 active:scale-95 text-white font-medium flex items-center justify-center gap-1.5 transition shadow-lg"
        >
          {savedSuccess ? (
            <>
              <Check size={14} className="text-emerald-200" />
              <span>Tersimpan!</span>
            </>
          ) : (
            <>
              <Save size={14} />
              <span>Simpan Pengaturan</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};

