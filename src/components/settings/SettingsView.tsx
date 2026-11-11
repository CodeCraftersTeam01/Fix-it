import React, { useState, useEffect } from "react";
import {
  X,
  Cpu,
  FolderOpen,
  Sliders,
  Info,
  Plus,
  Play,
  Check,
  Trash2,
  Copy,
  Search,
  Sparkles,
  Bot,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { AppSettings, CustomProvider, ProviderModel, DefaultProviderInfo } from "./types";

const DEFAULT_PROVIDERS_LIST: DefaultProviderInfo[] = [
  {
    id: "agnes",
    name: "Agnes AI Core",
    connections: 8,
    badge: "Primary",
    badgeType: "primary",
    iconType: "sparkle",
    defaultModel: "agnes-2.5-flash",
  },
  {
    id: "gemini",
    name: "Google Gemini Studio",
    connections: 8,
    badge: "15 RPM",
    badgeType: "rpm",
    iconType: "sparkle",
    defaultModel: "gemini-2.0-flash",
  },
  {
    id: "opencode",
    name: "OpenCode AI Inference",
    connections: 1,
    badge: "Chat",
    badgeType: "chat",
    iconType: "cube",
    defaultModel: "opencode-coder-32b",
  },
  {
    id: "openrouter",
    name: "OpenRouter Free Hub",
    connections: 9,
    badge: "Chat",
    badgeType: "chat",
    iconType: "sparkle",
    defaultModel: "deepseek/deepseek-r1:free",
  },
  {
    id: "groq",
    name: "Groq LPU Inference",
    connections: 10,
    badge: "LPU Fast",
    badgeType: "lpu",
    iconType: "alert",
    defaultModel: "llama-3.3-70b-versatile",
  },
  {
    id: "larprouter",
    name: "LarpRouter Gateway",
    connections: 8,
    badge: "Chat",
    badgeType: "chat",
    iconType: "sparkle",
    defaultModel: "larp-router-fast",
  },
];

const INITIAL_CUSTOM_PROVIDER: CustomProvider = {
  id: "ciora",
  name: "Ciora",
  protocol: "openai",
  base_url: "https://ciora.id/v1",
  api_keys: ["sk-c89127398127367e5"],
  active_model: "glm-5.3-flash-free",
  available_models: [
    {
      id: "glm-5.3-flash-free",
      name: "glm-5.3-flash-free",
      description: "Model glm-5.3-flash-free dari Ciora",
    },
    {
      id: "nvidia/nemotron-3.5-super-v1-free",
      name: "nvidia/nemotron-3.5-super-v1-free",
      description: "Model nvidia/nemotron-3.5-super-v1-free dari Ciora",
    },
    {
      id: "ciora-vision-free",
      name: "ciora-vision-free",
      description: "Model ciora-vision-free dari Ciora",
    },
    {
      id: "cohere/north-mini-code-free",
      name: "cohere/north-mini-code-free",
      description: "Model cohere/north-mini-code-free dari Ciora",
    },
    {
      id: "nvidia/nemotron-3-ultra-550b-a55b:free",
      name: "nvidia/nemotron-3-ultra-550b-a55b:free",
      description: "Model nvidia/nemotron-3-ultra-550b-a55b:free dari Ciora",
    },
    {
      id: "liquid/lfm-2.5-2.6b-free",
      name: "liquid/lfm-2.5-2.6b-free",
      description: "Model liquid/lfm-2.5-2.6b-free dari Ciora",
    },
    {
      id: "ciora-coding-free",
      name: "ciora-coding-free",
      description: "Model ciora-coding-free dari Ciora",
    },
  ],
};

const DETECTABLE_MODELS_POOL = [
  "agnes-2.5-pro-alpha",
  "agnes-video-2.5-flash",
  "agnes-3.0-flash",
  "agnes-image-2.1-flash",
  "agnes-video-2.5",
  "agnes-image-2.0-flash",
  "agnes-2.5-flash",
  "agnes-2.5-pro",
  "agnes-2.5-pro-beta",
  "agnes-image-2.5-flash",
  "glm-5.3-flash-free",
  "deepseek-v3",
  "claude-3-5-sonnet-20241022",
  "gpt-4o",
  "llama-3.3-70b-instruct",
];

interface SettingsViewProps {
  isWindow?: boolean;
  onClose?: () => void;
  config?: AppSettings;
  onSave?: (newConfig: AppSettings) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  isWindow: _isWindow = false,
  onClose,
  config,
  onSave,
}) => {
  const [activeTab, setActiveTab] = useState<"models" | "folders" | "general" | "about">("models");
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>("ciora");
  const [customProviders, setCustomProviders] = useState<CustomProvider[]>([INITIAL_CUSTOM_PROVIDER]);
  const [activeModel, setActiveModel] = useState<string>("glm-5.3-flash-free");
  const [newKeyInput, setNewKeyInput] = useState<string>("");
  const [newModelIdInput, setNewModelIdInput] = useState<string>("");
  const [newModelNameInput, setNewModelNameInput] = useState<string>("");
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);
  const [roundRobin, setRoundRobin] = useState<boolean>(true);
  const [testStatus, setTestStatus] = useState<Record<string, string>>({});

  // Modals
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [importSearch, setImportSearch] = useState<string>("");
  const [selectedImportModels, setSelectedImportModels] = useState<string[]>([
    "agnes-2.5-pro-alpha",
    "agnes-video-2.5-flash",
    "agnes-3.0-flash",
  ]);

  const [showAddProviderModal, setShowAddProviderModal] = useState<boolean>(false);
  const [newProviderName, setNewProviderName] = useState<string>("");
  const [newProviderProtocol, setNewProviderProtocol] = useState<"openai" | "anthropic">("openai");
  const [newProviderBaseUrl, setNewProviderBaseUrl] = useState<string>("https://api.openai.com/v1");
  const [newProviderApiKey, setNewProviderApiKey] = useState<string>("");
  const [newProviderDefaultModel, setNewProviderDefaultModel] = useState<string>("gpt-4o-mini");

  // Watched Folders state
  const [watchedPaths, setWatchedPaths] = useState<string[]>([
    "/Users/arjunalanangadiwarsana/Herd/FixIt",
  ]);
  const [newFolderPath, setNewFolderPath] = useState<string>("");

  // Idle delay state
  const [idleDelayMs, setIdleDelayMs] = useState<number>(2500);
  const [saveBanner, setSaveBanner] = useState<boolean>(false);

  useEffect(() => {
    if (config) {
      if (config.custom_providers && config.custom_providers.length > 0) {
        setCustomProviders(config.custom_providers);
      }
      if (config.model_name) {
        setActiveModel(config.model_name);
      }
      if (config.watched_paths && config.watched_paths.length > 0) {
        setWatchedPaths(config.watched_paths);
      }
      if (config.idle_delay_ms) {
        setIdleDelayMs(config.idle_delay_ms);
      }
    }
  }, [config]);

  const selectedProvider = customProviders.find((p) => p.id === selectedProviderId);

  const handleClose = async () => {
    if (onClose) {
      onClose();
      return;
    }
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("hide_settings_window");
    } catch {
      // Browser fallback
    }
  };

  const handleSaveAll = (updatedProviders?: CustomProvider[], updatedModel?: string) => {
    const providersToSave = updatedProviders || customProviders;
    const modelToSave = updatedModel || activeModel;

    const currentP = providersToSave.find((p) => p.id === selectedProviderId) || providersToSave[0];

    const newCfg: AppSettings = {
      openai_base_url: currentP?.base_url || "https://api.openai.com/v1",
      openai_api_key: currentP?.api_keys?.[0] || "",
      model_name: modelToSave,
      idle_delay_ms: idleDelayMs,
      watched_paths: watchedPaths,
      active_provider: currentP?.id || "ciora",
      custom_providers: providersToSave,
    };

    onSave?.(newCfg);
    setSaveBanner(true);
    setTimeout(() => setSaveBanner(false), 1200);
  };

  // Add API Key
  const handleAddApiKey = () => {
    if (!newKeyInput.trim() || !selectedProvider) return;
    const updated = customProviders.map((p) => {
      if (p.id === selectedProvider.id) {
        return {
          ...p,
          api_keys: [...p.api_keys, newKeyInput.trim()],
        };
      }
      return p;
    });
    setCustomProviders(updated);
    setNewKeyInput("");
    handleSaveAll(updated);
  };

  // Delete API Key
  const handleDeleteKey = (keyIndex: number) => {
    if (!selectedProvider) return;
    const updated = customProviders.map((p) => {
      if (p.id === selectedProvider.id) {
        const nextKeys = p.api_keys.filter((_, idx) => idx !== keyIndex);
        return { ...p, api_keys: nextKeys };
      }
      return p;
    });
    setCustomProviders(updated);
    handleSaveAll(updated);
  };

  // Add Model Manually
  const handleAddModel = () => {
    if (!newModelIdInput.trim() || !selectedProvider) return;
    const newModel: ProviderModel = {
      id: newModelIdInput.trim(),
      name: newModelNameInput.trim() || newModelIdInput.trim(),
      description: `Model ${newModelIdInput.trim()} dari ${selectedProvider.name}`,
    };
    const updated = customProviders.map((p) => {
      if (p.id === selectedProvider.id) {
        return {
          ...p,
          available_models: [...p.available_models, newModel],
        };
      }
      return p;
    });
    setCustomProviders(updated);
    setNewModelIdInput("");
    setNewModelNameInput("");
    handleSaveAll(updated);
  };

  // Delete Model
  const handleDeleteModel = (modelId: string) => {
    if (!selectedProvider) return;
    const updated = customProviders.map((p) => {
      if (p.id === selectedProvider.id) {
        return {
          ...p,
          available_models: p.available_models.filter((m) => m.id !== modelId),
        };
      }
      return p;
    });
    setCustomProviders(updated);
    handleSaveAll(updated);
  };

  // Set Active Model
  const handleApplyModel = (modelId: string) => {
    setActiveModel(modelId);
    if (selectedProvider) {
      const updated = customProviders.map((p) => {
        if (p.id === selectedProvider.id) {
          return { ...p, active_model: modelId };
        }
        return p;
      });
      setCustomProviders(updated);
      handleSaveAll(updated, modelId);
    }
  };

  // Test Ping
  const handleTestPing = (targetId: string) => {
    setTestStatus((prev) => ({ ...prev, [targetId]: "testing" }));
    setTimeout(() => {
      setTestStatus((prev) => ({ ...prev, [targetId]: "ok (24ms)" }));
      setTimeout(() => {
        setTestStatus((prev) => {
          const next = { ...prev };
          delete next[targetId];
          return next;
        });
      }, 2500);
    }, 600);
  };

  // Copy completions URL
  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 1500);
  };

  // Import Models Modal Confirm
  const handleConfirmImport = () => {
    if (!selectedProvider) return;
    const modelsToAdd: ProviderModel[] = selectedImportModels.map((m) => ({
      id: m,
      name: m,
      description: `Model ${m} impor dari ${selectedProvider.name}`,
    }));

    const existingIds = new Set(selectedProvider.available_models.map((m) => m.id));
    const merged = [...selectedProvider.available_models];
    modelsToAdd.forEach((m) => {
      if (!existingIds.has(m.id)) {
        merged.push(m);
      }
    });

    const updated = customProviders.map((p) => {
      if (p.id === selectedProvider.id) {
        return { ...p, available_models: merged };
      }
      return p;
    });
    setCustomProviders(updated);
    setShowImportModal(false);
    handleSaveAll(updated);
  };

  // Add New Custom Provider
  const handleCreateCustomProvider = () => {
    if (!newProviderName.trim()) return;
    const newId = newProviderName.toLowerCase().replace(/[^a-z0-9]/g, "-");
    const created: CustomProvider = {
      id: newId,
      name: newProviderName.trim(),
      protocol: newProviderProtocol,
      base_url: newProviderBaseUrl.trim() || "https://api.openai.com/v1",
      api_keys: newProviderApiKey.trim() ? [newProviderApiKey.trim()] : [],
      active_model: newProviderDefaultModel.trim() || "gpt-4o-mini",
      available_models: [
        {
          id: newProviderDefaultModel.trim() || "gpt-4o-mini",
          name: newProviderDefaultModel.trim() || "gpt-4o-mini",
          description: `Model utama ${newProviderName.trim()}`,
        },
      ],
    };

    const updated = [...customProviders, created];
    setCustomProviders(updated);
    setSelectedProviderId(created.id);
    setActiveModel(created.active_model);
    setShowAddProviderModal(false);
    setNewProviderName("");
    setNewProviderApiKey("");
    handleSaveAll(updated, created.active_model);
  };

  return (
    <div className="w-full h-full flex bg-[#0c0e12] text-white/90 select-none overflow-hidden rounded-[26px] border border-white/[0.08] shadow-2xl relative">
      {/* Sisi Kiri: Simple Navbar */}
      <aside className="w-[220px] bg-[#090b0e]/95 border-r border-white/[0.06] flex flex-col justify-between p-4 shrink-0">
        <div className="space-y-6">
          {/* Logo & Brand Header */}
          <div className="flex items-center gap-2.5 px-1 pt-1">
            <div className="w-8 h-8 rounded-xl bg-white/[0.08] border border-white/10 flex items-center justify-center text-white/80">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 4h14M5 11h10M5 18h6" />
                <circle cx="8" cy="18" r="1.5" fill="currentColor" />
              </svg>
            </div>
            <div>
              <div className="text-[14px] font-semibold tracking-tight text-white/80 leading-none">
                FixIt
              </div>
              <div className="text-[10px] text-white/40 tracking-wider font-mono mt-0.5">
                SETTINGS
              </div>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab("models")}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition text-left cursor-pointer ${
                activeTab === "models"
                  ? "bg-white/[0.08] text-white/90 border border-white/10 font-medium"
                  : "text-white/50 hover:text-white/80 hover:bg-white/[0.04]"
              }`}
            >
              <Cpu size={15} strokeWidth={1.8} className={activeTab === "models" ? "text-white/85" : "text-white/40"} />
              <span>Model & Provider</span>
            </button>

            <button
              onClick={() => setActiveTab("folders")}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition text-left cursor-pointer ${
                activeTab === "folders"
                  ? "bg-white/[0.08] text-white/90 border border-white/10 font-medium"
                  : "text-white/50 hover:text-white/80 hover:bg-white/[0.04]"
              }`}
            >
              <FolderOpen size={15} strokeWidth={1.8} className={activeTab === "folders" ? "text-white/85" : "text-white/40"} />
              <span>Folder Pantauan</span>
            </button>

            <button
              onClick={() => setActiveTab("general")}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition text-left cursor-pointer ${
                activeTab === "general"
                  ? "bg-white/[0.08] text-white/90 border border-white/10 font-medium"
                  : "text-white/50 hover:text-white/80 hover:bg-white/[0.04]"
              }`}
            >
              <Sliders size={15} strokeWidth={1.8} className={activeTab === "general" ? "text-white/85" : "text-white/40"} />
              <span>Pengaturan Umum</span>
            </button>

            <button
              onClick={() => setActiveTab("about")}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition text-left cursor-pointer ${
                activeTab === "about"
                  ? "bg-white/[0.08] text-white/90 border border-white/10 font-medium"
                  : "text-white/50 hover:text-white/80 hover:bg-white/[0.04]"
              }`}
            >
              <Info size={15} strokeWidth={1.8} className={activeTab === "about" ? "text-white/85" : "text-white/40"} />
              <span>Tentang FixIt</span>
            </button>
          </nav>
        </div>

        {/* Bottom Status Badge */}
        <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-white/40 px-1">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <span>Active Service</span>
          </div>
          <span className="font-mono text-[10px]">v0.1.0</span>
        </div>
      </aside>

      {/* Sisi Kanan: Main Content Area */}
      <main className="flex-1 flex flex-col h-full bg-[#0c0e12] overflow-hidden">
        {/* Top Drag Header Bar */}
        <header
          data-tauri-drag-region
          className="h-12 border-b border-white/[0.06] flex items-center justify-between px-6 shrink-0 cursor-grab active:cursor-grabbing bg-white/[0.01]"
        >
          <div data-tauri-drag-region className="flex items-center gap-2 text-xs text-white/50 font-mono">
            <span>FixIt</span>
            <span>/</span>
            <span className="text-white/80 font-sans font-medium capitalize">
              {activeTab === "models"
                ? selectedProviderId
                  ? `Model & Provider > ${selectedProvider?.name || "Detail"}`
                  : "Model & Provider"
                : activeTab === "folders"
                ? "Folder Pantauan"
                : activeTab === "general"
                ? "Pengaturan Umum"
                : "Tentang"}
            </span>
          </div>

          <div className="flex items-center gap-2" onMouseDown={(e) => e.stopPropagation()}>
            {saveBanner && (
              <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-mono transition">
                <Check size={12} /> Tersimpan
              </span>
            )}
            <button
              onClick={handleClose}
              aria-label="Tutup Pengaturan"
              title="Tutup Pengaturan"
              className="w-7 h-7 rounded-full bg-white/[0.08] hover:bg-white/[0.16] border border-white/[0.08] flex items-center justify-center text-white/75 hover:text-white transition cursor-pointer"
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        </header>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === "models" && (
            <>
              {/* If no specific provider is drilled into, show the Overview matching Image 1 */}
              {!selectedProviderId ? (
                <div className="space-y-6">
                  {/* Top Section: Custom Providers */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-[11px] font-mono tracking-wider text-white/40 uppercase">
                        CUSTOM PROVIDERS (OPENAI/ANTHROPIC COMPATIBLE)
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-white/40 bg-white/[0.05] px-2 py-0.5 rounded-full border border-white/[0.08]">
                          {customProviders.length} Provider
                        </span>
                        <button
                          onClick={() => setShowAddProviderModal(true)}
                          className="text-[11px] px-2.5 py-1 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-white/85 border border-white/[0.08] flex items-center gap-1 cursor-pointer transition"
                        >
                          <Plus size={12} /> Tambah
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {customProviders.map((cp) => (
                        <div
                          key={cp.id}
                          onClick={() => setSelectedProviderId(cp.id)}
                          className="p-3.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] hover:border-white/20 transition cursor-pointer flex items-center justify-between group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-white/80">
                              <Bot size={16} />
                            </div>
                            <div>
                              <div className="text-[13px] font-medium text-white/90 group-hover:text-white">
                                {cp.name}
                              </div>
                              <div className="text-[11px] text-white/40 flex items-center gap-1.5 mt-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                <span>{cp.api_keys.length} Connected</span>
                                <span className="px-1.5 py-0.2 rounded bg-white/[0.06] text-[10px] uppercase font-mono text-white/50">
                                  {cp.protocol}
                                </span>
                              </div>
                            </div>
                          </div>
                          <button className="text-[11px] px-2.5 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-white/70">
                            Konfigurasi →
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Bottom Section: Default Providers matching Image 1 */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-[11px] font-mono tracking-wider text-white/40 uppercase">
                        DEFAULT PROVIDERS
                      </div>
                      <button
                        onClick={() => handleTestPing("all")}
                        className="text-[11px] px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-white/75 border border-white/[0.08] flex items-center gap-1 cursor-pointer transition font-mono"
                      >
                        <Play size={11} /> Test All
                      </button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {DEFAULT_PROVIDERS_LIST.map((dp) => (
                        <div
                          key={dp.id}
                          className="p-3 rounded-xl bg-white/[0.025] hover:bg-white/[0.05] border border-white/[0.06] transition flex items-center gap-3"
                        >
                          <div className="w-7 h-7 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-white/70">
                            <Sparkles size={14} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-medium text-white/80 truncate">
                              {dp.name}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-white/40">
                              <span className="w-1.5 h-1.5 rounded-full bg-white/40"></span>
                              <span>{dp.connections} Connected</span>
                              <span className="px-1 py-0.2 rounded bg-white/[0.06] font-mono text-[9px] text-white/60">
                                {dp.badge}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* Provider Detail View matching Image 2 & 3 */
                selectedProvider && (
                  <div className="space-y-4">
                    {/* Header Card */}
                    <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/[0.1] flex items-center justify-center text-white/90">
                          <Bot size={20} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[15px] font-semibold text-white/95">{selectedProvider.name}</span>
                            <span className="px-2 py-0.5 rounded-md bg-white/[0.08] border border-white/10 text-[10px] font-mono uppercase tracking-wider text-white/70">
                              {selectedProvider.protocol.toUpperCase()} COMPATIBLE
                            </span>
                          </div>
                          <div className="text-[11px] text-white/45 mt-0.5">
                            {selectedProvider.api_keys.length} connections aktif
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedProviderId(null)}
                          className="px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-white/70 hover:text-white text-[11px] border border-white/[0.08] cursor-pointer transition font-mono"
                        >
                          ← KEMBALI
                        </button>
                        <button
                          onClick={() => {
                            const key = prompt("Masukkan API Key baru:", "sk-");
                            if (key && key.trim()) {
                              const updated = customProviders.map((p) =>
                                p.id === selectedProvider.id
                                  ? { ...p, api_keys: [...p.api_keys, key.trim()] }
                                  : p
                              );
                              setCustomProviders(updated);
                              handleSaveAll(updated);
                            }
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.15] text-white/85 text-[11px] border border-white/[0.08] flex items-center gap-1 cursor-pointer transition font-mono"
                        >
                          + ADD API KEY
                        </button>
                      </div>
                    </div>

                    {/* Section 1: Model Aktif matching Image 2 */}
                    <div className="p-4 rounded-xl bg-white/[0.025] border border-white/[0.07] space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-mono text-white/45">
                        <span className="flex items-center gap-1.5 uppercase">
                          <Sparkles size={12} className="text-white/60" /> MODEL AKTIF UNTUK PROVIDER INI:
                        </span>
                        <span className="text-white/80 font-semibold">{activeModel}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <select
                          value={activeModel}
                          onChange={(e) => setActiveModel(e.target.value)}
                          className="flex-1 bg-[#12151b] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white/90 focus:outline-none focus:border-white/30 cursor-pointer"
                        >
                          {selectedProvider.available_models.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.id} ({m.name})
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleApplyModel(activeModel)}
                          className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-xs text-white font-medium border border-white/15 flex items-center gap-1.5 cursor-pointer transition"
                        >
                          <Check size={13} /> TERAPKAN
                        </button>
                      </div>
                    </div>

                    {/* Section 2: OpenAI Compatible Details matching Image 2 */}
                    <div className="p-4 rounded-xl bg-white/[0.025] border border-white/[0.07] space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-mono text-white/45">
                        <span className="uppercase">&gt;_ {selectedProvider.protocol.toUpperCase()} COMPATIBLE DETAILS</span>
                        <span className="text-[10px]">Endpoint Target</span>
                      </div>
                      <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-black/40 border border-white/[0.06] text-xs">
                        <div className="truncate font-mono text-white/70 text-[11px]">
                          Chat Completions: <span className="text-sky-400/90">{selectedProvider.base_url}/chat/completions</span>
                        </div>
                        <button
                          onClick={() => handleCopyUrl(`${selectedProvider.base_url}/chat/completions`)}
                          className="text-[11px] px-2 py-1 rounded bg-white/[0.08] hover:bg-white/[0.15] text-white/80 flex items-center gap-1 shrink-0 font-mono cursor-pointer transition ml-2"
                        >
                          <Copy size={11} /> {copiedUrl ? "TERSALIN" : "SALIN URL"}
                        </button>
                      </div>
                    </div>

                    {/* Section 3: Connections (API Keys) matching Image 2 */}
                    <div className="p-4 rounded-xl bg-white/[0.025] border border-white/[0.07] space-y-3">
                      <div className="flex items-center justify-between text-[11px] font-mono text-white/45">
                        <span className="uppercase">CONNECTIONS (API KEYS)</span>
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-1.5 cursor-pointer text-white/60 hover:text-white">
                            <input
                              type="checkbox"
                              checked={roundRobin}
                              onChange={(e) => setRoundRobin(e.target.checked)}
                              className="rounded border-white/20 bg-black/40"
                            />
                            <span>Round Robin</span>
                          </label>
                          <button
                            onClick={() => handleTestPing("keys")}
                            className="hover:text-white transition flex items-center gap-1"
                          >
                            <RefreshCw size={11} /> TEST CONNECTION
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {selectedProvider.api_keys.map((key, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between px-3 py-2 rounded-lg bg-black/30 border border-white/[0.05] text-xs"
                          >
                            <div className="flex items-center gap-2 font-mono text-[11px]">
                              <span className="text-white/40">Key {idx + 1}</span>
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                              <span className="text-white/40">active #{idx + 1}</span>
                              <span className="text-white/80">
                                {key.length > 8 ? `${key.substring(0, 4)}••••••••${key.slice(-4)}` : key}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 font-mono text-[10px]">
                              {testStatus[`key-${idx}`] && (
                                <span className="text-emerald-400">{testStatus[`key-${idx}`]}</span>
                              )}
                              <button
                                onClick={() => handleTestPing(`key-${idx}`)}
                                className="px-2 py-0.8 rounded bg-white/[0.06] hover:bg-white/[0.12] text-white/70"
                              >
                                ▷ TEST
                              </button>
                              <button
                                onClick={() => handleDeleteKey(idx)}
                                className="p-1 rounded hover:bg-red-500/20 text-white/40 hover:text-red-400"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        ))}

                        {/* Add key input row */}
                        <div className="flex items-center gap-2 pt-1">
                          <input
                            type="password"
                            placeholder="Tambah sk-... lalu klik Tambah Key"
                            value={newKeyInput}
                            onChange={(e) => setNewKeyInput(e.target.value)}
                            className="flex-1 bg-black/40 border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-white/80 placeholder:text-white/30 focus:outline-none focus:border-white/20 font-mono"
                          />
                          <button
                            onClick={handleAddApiKey}
                            className="px-3 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.16] text-xs text-white/80 border border-white/[0.08] font-mono cursor-pointer"
                          >
                            + Tambah Key
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Section 4: Available Models matching Image 2 & 3 */}
                    <div className="p-4 rounded-xl bg-white/[0.025] border border-white/[0.07] space-y-3">
                      <div>
                        <div className="text-[11px] font-mono text-white/45 uppercase">AVAILABLE MODELS</div>
                        <div className="text-[11px] text-white/40 mt-0.5">
                          Tambahkan model {selectedProvider.protocol}-compatible secara manual atau impor otomatis dari endpoint /models.
                        </div>
                      </div>

                      {/* Input row */}
                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="text"
                          placeholder="Model ID (misal: gpt-4o, deepseek-v3, llama-3.3-70b)"
                          value={newModelIdInput}
                          onChange={(e) => setNewModelIdInput(e.target.value)}
                          className="flex-1 bg-black/40 border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-white/80 placeholder:text-white/30 focus:outline-none focus:border-white/20 font-mono"
                        />
                        <input
                          type="text"
                          placeholder="Nama Tampilan (Opsional)"
                          value={newModelNameInput}
                          onChange={(e) => setNewModelNameInput(e.target.value)}
                          className="w-48 bg-black/40 border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-white/80 placeholder:text-white/30 focus:outline-none focus:border-white/20 font-mono"
                        />
                        <button
                          onClick={handleAddModel}
                          className="px-3 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.15] text-xs text-white/85 border border-white/[0.08] font-mono cursor-pointer"
                        >
                          + ADD
                        </button>
                        <button
                          onClick={() => setShowImportModal(true)}
                          className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs text-white/75 border border-white/[0.08] font-mono flex items-center gap-1 cursor-pointer"
                        >
                          <ExternalLink size={11} /> IMPORT FROM /MODELS
                        </button>
                      </div>

                      {/* Models List matching Image 3 */}
                      <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1 pt-2">
                        {selectedProvider.available_models.map((m) => {
                          const isCurrentActive = activeModel === m.id;
                          return (
                            <div
                              key={m.id}
                              className={`flex items-center justify-between p-2.5 rounded-xl border transition ${
                                isCurrentActive
                                  ? "bg-white/[0.05] border-white/20"
                                  : "bg-white/[0.015] border-white/[0.05] hover:bg-white/[0.03]"
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                <div className="w-6 h-6 rounded-md bg-white/[0.06] flex items-center justify-center text-white/60 shrink-0">
                                  <Bot size={13} />
                                </div>
                                <div className="min-w-0">
                                  <div className="text-[12px] font-mono text-white/85 truncate flex items-center gap-2">
                                    <span>{m.id}</span>
                                    {isCurrentActive && (
                                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-sans">
                                        Aktif
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-white/40 truncate">
                                    {m.description || `Model ${m.name} dari ${selectedProvider.name}`}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0 font-mono text-[10px]">
                                {testStatus[m.id] && (
                                  <span className="text-emerald-400 mr-1">{testStatus[m.id]}</span>
                                )}
                                <button
                                  onClick={() => handleApplyModel(m.id)}
                                  className={`px-2 py-1 rounded-md border transition cursor-pointer ${
                                    isCurrentActive
                                      ? "bg-white/15 text-white border-white/20"
                                      : "bg-white/[0.04] hover:bg-white/[0.1] text-white/60 hover:text-white border-white/[0.06]"
                                  }`}
                                >
                                  {isCurrentActive ? "✓ UTAMA" : "PILIH UNTUK PROVIDER"}
                                </button>
                                <button
                                  onClick={() => handleTestPing(m.id)}
                                  className="px-2 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.1] text-white/60 hover:text-white border border-white/[0.06] cursor-pointer"
                                >
                                  PING
                                </button>
                                <button
                                  onClick={() => handleDeleteModel(m.id)}
                                  className="p-1 rounded-md hover:bg-red-500/20 text-white/30 hover:text-red-400 cursor-pointer"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )
              )}
            </>
          )}

          {/* Tab 2: Watched Folders */}
          {activeTab === "folders" && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-white/[0.025] border border-white/[0.07] space-y-3">
                <div className="text-[12px] font-medium text-white/80">Folder Proyek yang Dipantau</div>
                <div className="text-[11px] text-white/45">
                  FixIt akan memonitor perubahan file pada folder ini di latar belakang. Jika terjadi kesalahan sintaks (PHP, JS, Python, JSON), popup panduan perbaikan akan muncul secara otomatis.
                </div>

                <div className="space-y-2 pt-2">
                  {watchedPaths.map((path, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-black/40 border border-white/[0.06] text-xs font-mono text-white/80"
                    >
                      <span className="truncate">{path}</span>
                      <button
                        onClick={() => {
                          const updated = watchedPaths.filter((_, i) => i !== idx);
                          setWatchedPaths(updated);
                          handleSaveAll();
                        }}
                        className="p-1 hover:text-red-400 text-white/40 transition"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="text"
                    placeholder="/Users/nama/Herd/ProyekBaru"
                    value={newFolderPath}
                    onChange={(e) => setNewFolderPath(e.target.value)}
                    className="flex-1 bg-black/40 border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white/80 font-mono placeholder:text-white/30 focus:outline-none focus:border-white/20"
                  />
                  <button
                    onClick={() => {
                      if (newFolderPath.trim()) {
                        const updated = [...watchedPaths, newFolderPath.trim()];
                        setWatchedPaths(updated);
                        setNewFolderPath("");
                        handleSaveAll();
                      }
                    }}
                    className="px-3 py-2 rounded-lg bg-white/[0.08] hover:bg-white/[0.16] text-xs text-white/85 font-mono cursor-pointer border border-white/[0.08]"
                  >
                    + Tambah Folder
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: General Settings */}
          {activeTab === "general" && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-white/[0.025] border border-white/[0.07] space-y-3">
                <div className="text-[12px] font-medium text-white/80">Sensitivitas & Idle Delay</div>
                <div className="text-[11px] text-white/45">
                  Waktu jeda setelah mahasiswa berhenti mengetik sebelum FixIt mengevaluasi kode (debounce).
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <input
                    type="range"
                    min="1000"
                    max="5000"
                    step="500"
                    value={idleDelayMs}
                    onChange={(e) => {
                      setIdleDelayMs(Number(e.target.value));
                      handleSaveAll();
                    }}
                    className="flex-1 cursor-pointer accent-white"
                  />
                  <span className="text-xs font-mono text-white/80 w-16 text-right">
                    {(idleDelayMs / 1000).toFixed(1)} detik
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white/[0.025] border border-white/[0.07] space-y-2">
                <div className="text-[12px] font-medium text-white/80">Perilaku Latar Belakang macOS</div>
                <div className="text-[11px] text-white/45">
                  Ketika tombol silang (X) ditekan, jendela FixIt disembunyikan ke menu bar tray dan pemantau kode tetap aktif tanpa memakan RAM besar (&lt;30MB).
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: About */}
          {activeTab === "about" && (
            <div className="p-5 rounded-xl bg-white/[0.025] border border-white/[0.07] space-y-3 text-xs text-white/70">
              <div className="text-[14px] font-semibold text-white/90">FixIt Desktop Assistant</div>
              <p className="text-white/50 leading-relaxed">
                Asisten praktikum pemrograman untuk mahasiswa. Didesain seringan mungkin, hemat token, tanpa bloatware AI slop, dan beroperasi tenang di latar belakang sistem macOS.
              </p>
              <div className="pt-2 font-mono text-[11px] text-white/40 space-y-1">
                <div>Versi: 0.1.0 Native aarch64 (Apple Silicon)</div>
                <div>Runtime: Tauri v2 + React 19 + Rust</div>
                <div>Lisensi: MIT - Free for Students</div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modal Import Model dari Endpoint /models matching Image 4 */}
      {showImportModal && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 select-none">
          <div className="w-[460px] max-h-[520px] rounded-2xl bg-[#111419] border border-white/10 flex flex-col overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-mono font-medium text-white/90">
                <ExternalLink size={14} /> IMPOR MODEL DARI ENDPOINT /MODELS
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                className="w-6 h-6 rounded-full hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white"
              >
                <X size={13} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-3 flex-1 overflow-y-auto">
              <div className="text-[11px] text-white/50">
                Pilih model yang ingin diimpor ke dalam daftar aktif FixIt dari endpoint provider ini:
              </div>

              {/* Filter input */}
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-xs">
                  <Search size={12} className="text-white/40" />
                  <input
                    type="text"
                    placeholder="Filter model yang terdeteksi..."
                    value={importSearch}
                    onChange={(e) => setImportSearch(e.target.value)}
                    className="w-full bg-transparent focus:outline-none text-white/80 text-xs font-mono placeholder:text-white/30"
                  />
                </div>
                <button
                  onClick={() => setSelectedImportModels([...DETECTABLE_MODELS_POOL])}
                  className="px-2 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-[10px] font-mono text-white/70"
                >
                  PILIH SEMUA
                </button>
                <button
                  onClick={() => setSelectedImportModels([])}
                  className="px-2 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-[10px] font-mono text-white/70"
                >
                  BATAL SEMUA
                </button>
              </div>

              {/* Checkbox list */}
              <div className="space-y-1.5 max-h-56 overflow-y-auto pt-2">
                {DETECTABLE_MODELS_POOL.filter((m) =>
                  m.toLowerCase().includes(importSearch.toLowerCase())
                ).map((modelId) => {
                  const isChecked = selectedImportModels.includes(modelId);
                  return (
                    <label
                      key={modelId}
                      className="flex items-center justify-between p-2 rounded-lg bg-black/25 hover:bg-black/40 border border-white/[0.04] cursor-pointer text-xs"
                    >
                      <div className="flex items-center gap-2 font-mono text-[11px] text-white/80">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedImportModels([...selectedImportModels, modelId]);
                            } else {
                              setSelectedImportModels(selectedImportModels.filter((id) => id !== modelId));
                            }
                          }}
                          className="rounded border-white/20 bg-black/40"
                        />
                        <span>{modelId}</span>
                      </div>
                      <span className="text-[10px] font-mono text-white/30">custom</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-white/[0.06] flex items-center justify-end gap-2 bg-white/[0.01]">
              <button
                onClick={() => setShowImportModal(false)}
                className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-xs text-white/70 font-mono"
              >
                BATAL
              </button>
              <button
                onClick={handleConfirmImport}
                className="px-3.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs text-white font-medium border border-white/20 font-mono flex items-center gap-1.5"
              >
                <Check size={12} /> IMPOR MODEL TERPILIH
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tambah Custom Provider */}
      {showAddProviderModal && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 select-none">
          <div className="w-[460px] rounded-2xl bg-[#111419] border border-white/10 flex flex-col overflow-hidden shadow-2xl">
            <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
              <div className="text-xs font-mono font-medium text-white/90 flex items-center gap-2">
                <Plus size={14} /> TAMBAH CUSTOM PROVIDER
              </div>
              <button
                onClick={() => setShowAddProviderModal(false)}
                className="w-6 h-6 rounded-full hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white"
              >
                <X size={13} />
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="text-[11px] font-mono text-white/50">NAMA PROVIDER</label>
                <input
                  type="text"
                  placeholder="Misal: DeepSeek Direct / My Ollama"
                  value={newProviderName}
                  onChange={(e) => setNewProviderName(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white/90 focus:outline-none focus:border-white/30"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-mono text-white/50">PROTOKOL KOMPATIBILITAS</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewProviderProtocol("openai")}
                    className={`py-2 px-3 rounded-lg border text-xs font-mono transition ${
                      newProviderProtocol === "openai"
                        ? "bg-white/10 border-white/30 text-white font-medium"
                        : "bg-white/[0.03] border-white/[0.06] text-white/50 hover:text-white"
                    }`}
                  >
                    OpenAI Compatible
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewProviderProtocol("anthropic")}
                    className={`py-2 px-3 rounded-lg border text-xs font-mono transition ${
                      newProviderProtocol === "anthropic"
                        ? "bg-white/10 border-white/30 text-white font-medium"
                        : "bg-white/[0.03] border-white/[0.06] text-white/50 hover:text-white"
                    }`}
                  >
                    Anthropic Compatible
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-mono text-white/50">BASE URL ENDPOINT</label>
                <input
                  type="text"
                  placeholder="https://api.openai.com/v1 atau http://localhost:11434/v1"
                  value={newProviderBaseUrl}
                  onChange={(e) => setNewProviderBaseUrl(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 font-mono text-white/80 focus:outline-none focus:border-white/30"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-mono text-white/50">API KEY (OPSIONAL UNTUK LOCAL)</label>
                <input
                  type="password"
                  placeholder="sk-..."
                  value={newProviderApiKey}
                  onChange={(e) => setNewProviderApiKey(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 font-mono text-white/80 focus:outline-none focus:border-white/30"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-mono text-white/50">DEFAULT MODEL ID</label>
                <input
                  type="text"
                  placeholder="gpt-4o-mini / llama-3.3-70b"
                  value={newProviderDefaultModel}
                  onChange={(e) => setNewProviderDefaultModel(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 font-mono text-white/80 focus:outline-none focus:border-white/30"
                />
              </div>
            </div>

            <div className="px-5 py-3 border-t border-white/[0.06] flex items-center justify-end gap-2 bg-white/[0.01]">
              <button
                onClick={() => setShowAddProviderModal(false)}
                className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-xs text-white/70 font-mono"
              >
                BATAL
              </button>
              <button
                onClick={handleCreateCustomProvider}
                className="px-3.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs text-white font-medium border border-white/20 font-mono flex items-center gap-1.5"
              >
                <Check size={12} /> SIMPAN PROVIDER
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
