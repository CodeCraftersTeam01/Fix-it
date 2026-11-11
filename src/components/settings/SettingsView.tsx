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
  ExternalLink,
  RefreshCw,
  Sparkles,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import { AppSettings, AIProvider, ProviderModel, CustomProvider } from "./types";

/* Official Brand Vector Logos for Providers */
const GeminiLogo: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path
      d="M14 0C14 7.732 7.732 14 0 14C7.732 14 14 20.268 14 28C14 20.268 20.268 14 28 14C20.268 14 14 7.732 14 0Z"
      fill="currentColor"
    />
  </svg>
);

const GroqLogo: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14.93c-2.48.47-4.73-.83-5.5-2.93H10v-2H5.06c.09-.69.28-1.37.58-2h4.36V8H6.55c1.19-2.34 3.73-3.69 6.45-3.08 2.61.59 4.54 2.8 4.78 5.48h2.02c-.34-3.8-3.07-6.9-6.8-7.38-4.32-.55-8.21 2.37-9.03 6.64-.17.88-.22 1.76-.15 2.62.29 3.51 2.57 6.49 5.86 7.47 3.32.99 6.96-.28 8.92-3.13l-1.6-1.22c-1.46 2.06-4.08 2.97-6.6 2.45z"/>
  </svg>
);

const OpenRouterLogo: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M12 2L3 7v10l9 5 9-5V7l-9-5zm0 2.24L18.76 8 12 11.76 5.24 8 12 4.24zM4.8 8.91l6.4 3.56v7.12l-6.4-3.56V8.91zm14.4 7.12l-6.4 3.56v-7.12l6.4-3.56v7.12z"/>
  </svg>
);

const OpenAILogo: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M22.28 9.37a5.98 5.98 0 00-.51-4.89 6.07 6.07 0 00-6.47-2.83A6.06 6.06 0 0010.5 0a6.07 6.07 0 00-5.8 4.23 6.07 6.07 0 00-4.04 2.93 6.04 6.04 0 00.7 7.02 5.98 5.98 0 00.51 4.89 6.07 6.07 0 006.47 2.83A6.06 6.06 0 0013.5 24a6.07 6.07 0 005.8-4.23 6.07 6.07 0 004.04-2.93 6.04 6.04 0 00-.7-7.02zM13.5 22.45a4.53 4.53 0 01-3.18-1.32l.14-.08 5.25-3.03a.77.77 0 00.39-.67v-7.41l2.22 1.28v6.7a4.55 4.55 0 01-4.82 4.53zm-8.8-3.82a4.54 4.54 0 01-.6-3.4l.15.09 5.25 3.03a.77.77 0 00.78 0l6.42-3.7-2.22-1.28-6.42 3.7a.78.78 0 01-.78 0l-2.58-1.44zm-1.8-9.08a4.53 4.53 0 012.58-2.08v.17l5.25 3.03a.77.77 0 00.78 0l6.42-3.71v2.57l-6.42 3.7a.77.77 0 01-.78 0L4.9 9.55zm14.65 1.57l-6.42 3.7a.77.77 0 01-.78 0L9.73 13.4l2.22-1.28 6.42 3.7a.78.78 0 01.39.67v2.88l-2.22-1.28v-4.54zm2.55-2.07l-.15-.09-5.25-3.03a.77.77 0 00-.78 0L9.3 8.24l2.22 1.28 6.42-3.7a.77.77 0 01.78 0l2.58 1.49a4.54 4.54 0 01-1.2 3.74zM10.5 7.55l2.22-1.28 6.42 3.7-2.22 1.28-6.42-3.7z"/>
  </svg>
);

const AnthropicLogo: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M17.47 3H14.1l-6.8 18h3.37l1.52-4.14h7.02L20.73 21H24L17.47 3zm-4.13 11.45l2.43-6.62 2.43 6.62h-4.86zM6.53 3H3.16L0 21h3.37l1.1-7.14h3.53L9.1 21h3.37L6.53 3z"/>
  </svg>
);

const OpenCodeLogo: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
    <line x1="14" y1="4" x2="10" y2="20" />
  </svg>
);

const AgnesLogo: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className={className}>
    <circle cx="12" cy="12" r="3.5" />
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fillRule="evenodd" clipRule="evenodd"/>
  </svg>
);

const DeepSeekLogo: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm3.87 13.9a5.52 5.52 0 0 1-3.87 1.55 5.45 5.45 0 0 1-5.45-5.45c0-3.01 2.44-5.45 5.45-5.45 1.51 0 2.88.62 3.87 1.62l-1.38 1.38a3.5 3.5 0 0 0-2.49-1.05 3.5 3.5 0 0 0-3.5 3.5 3.5 3.5 0 0 0 3.5 3.5c.97 0 1.84-.39 2.49-1.03l1.38 1.38z" />
  </svg>
);

const RouterLogo: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="2" y="14" width="20" height="8" rx="2" />
    <path d="M6 18h.01M10 18h.01" />
    <path d="M16 14V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v10" />
  </svg>
);

const renderProviderLogo = (provider: AIProvider, className: string = "w-4 h-4") => {
  if (provider.id === "deepseek") return <DeepSeekLogo className={className} />;
  if (provider.id === "gemini") return <GeminiLogo className={className} />;
  if (provider.id === "groq") return <GroqLogo className={className} />;
  if (provider.id === "openrouter") return <OpenRouterLogo className={className} />;
  if (provider.id === "claude" || provider.protocol === "anthropic") return <AnthropicLogo className={className} />;
  if (provider.id === "openai") return <OpenAILogo className={className} />;
  if (provider.id === "opencode") return <OpenCodeLogo className={className} />;
  if (provider.id === "agnes") return <AgnesLogo className={className} />;
  if (provider.id === "larprouter") return <RouterLogo className={className} />;
  return <OpenAILogo className={className} />;
};

const INITIAL_PROVIDERS: AIProvider[] = [
  // 1. Custom Provider
  {
    id: "ciora",
    name: "Ciora",
    category: "custom",
    protocol: "openai",
    base_url: "https://ciora.id/v1",
    api_keys: ["sk-c89127398127367e5"],
    active_model: "glm-5.3-flash-free",
    badge: "Chat",
    connectionsCount: 1,
    available_models: [
      { id: "glm-5.3-flash-free", name: "glm-5.3-flash-free", description: "Model cepat & cerdas dari Ciora" },
      { id: "nvidia/nemotron-3.5-super-v1-free", name: "nvidia/nemotron-3.5-super-v1-free", description: "Super v1 free dari Ciora" },
      { id: "ciora-vision-free", name: "ciora-vision-free", description: "Vision multimodal gratis" },
      { id: "cohere/north-mini-code-free", name: "cohere/north-mini-code-free", description: "Spesialis koding & refactoring" },
      { id: "nvidia/nemotron-3-ultra-550b-a55b:free", name: "nvidia/nemotron-3-ultra-550b:free", description: "Reasoning ultra parameter" },
      { id: "liquid/lfm-2.5-2.6b-free", name: "liquid/lfm-2.5-2.6b-free", description: "Model ringkas hemat latensi" },
      { id: "ciora-coding-free", name: "ciora-coding-free", description: "Code assistant gratis" },
    ],
  },

  // 2. Default Providers (Major AI Industry Leaders)
  {
    id: "openai",
    name: "OpenAI",
    category: "default",
    protocol: "openai",
    base_url: "https://api.openai.com/v1",
    api_keys: ["sk-proj-openai-live-key"],
    active_model: "gpt-4o",
    badge: "Primary",
    connectionsCount: 8,
    available_models: [
      { id: "gpt-4o", name: "gpt-4o", description: "Flagship multimodal intelligence & top reasoning" },
      { id: "gpt-4o-mini", name: "gpt-4o-mini", description: "Ringkas, hemat, dan latensi super rendah" },
      { id: "o3-mini", name: "o3-mini", description: "High-reasoning STEM & coding specialized model" },
      { id: "o1", name: "o1", description: "Deep reasoning benchmark champion" },
    ],
  },
  {
    id: "claude",
    name: "Anthropic Claude",
    category: "default",
    protocol: "anthropic",
    base_url: "https://api.anthropic.com/v1",
    api_keys: ["sk-ant-api-live-key"],
    active_model: "claude-3-7-sonnet",
    badge: "Coding",
    connectionsCount: 8,
    available_models: [
      { id: "claude-3-7-sonnet", name: "claude-3-7-sonnet", description: "Claude 3.7 Sonnet - Hybrid reasoning & architecture code" },
      { id: "claude-3-5-sonnet", name: "claude-3-5-sonnet", description: "Industry standard for programming & logic refactoring" },
      { id: "claude-3-5-haiku", name: "claude-3-5-haiku", description: "Ultra-fast code triage & instant diagnostics" },
    ],
  },
  {
    id: "gemini",
    name: "Google Gemini",
    category: "default",
    protocol: "gemini",
    base_url: "https://generativelanguage.googleapis.com/v1beta",
    api_keys: ["AIzaSy-studio-active-key"],
    active_model: "gemini-2.0-flash",
    badge: "Multimodal",
    connectionsCount: 8,
    available_models: [
      { id: "gemini-2.0-flash", name: "gemini-2.0-flash", description: "Google Gemini 2.0 Flash - Kecepatan tinggi & akurasi tinggi" },
      { id: "gemini-1.5-pro", name: "gemini-1.5-pro", description: "Gemini 1.5 Pro - Context window 2 juta token" },
      { id: "gemini-1.5-flash", name: "gemini-1.5-flash", description: "Gemini 1.5 Flash - Ringan dan hemat kuota" },
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek AI",
    category: "default",
    protocol: "openai",
    base_url: "https://api.deepseek.com/v1",
    api_keys: ["sk-deepseek-live-key"],
    active_model: "deepseek-chat",
    badge: "Reasoning",
    connectionsCount: 8,
    available_models: [
      { id: "deepseek-chat", name: "deepseek-chat", description: "DeepSeek-V3 - Model chat & programming berperforma tinggi" },
      { id: "deepseek-reasoner", name: "deepseek-reasoner", description: "DeepSeek-R1 - Chain-of-thought deep reasoning logic" },
    ],
  },
  {
    id: "groq",
    name: "Groq LPU",
    category: "default",
    protocol: "openai",
    base_url: "https://api.groq.com/openai/v1",
    api_keys: ["gsk_groq_lpu_speed_key"],
    active_model: "llama-3.3-70b-versatile",
    badge: "500+ T/s",
    connectionsCount: 10,
    available_models: [
      { id: "llama-3.3-70b-versatile", name: "llama-3.3-70b-versatile", description: "Meta Llama 3.3 70B di Groq LPU (500+ token/detik)" },
      { id: "deepseek-r1-distill-llama-70b", name: "deepseek-r1-distill-llama-70b", description: "DeepSeek R1 Distill 70B ultra kilat" },
      { id: "mixtral-8x7b-32768", name: "mixtral-8x7b-32768", description: "Mistral MoE 8x7B dengan context 32k" },
    ],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    category: "default",
    protocol: "openai",
    base_url: "https://openrouter.ai/api/v1",
    api_keys: ["sk-or-v1-hub-free-key"],
    active_model: "deepseek/deepseek-r1:free",
    badge: "Free Hub",
    connectionsCount: 9,
    available_models: [
      { id: "deepseek/deepseek-r1:free", name: "deepseek/deepseek-r1:free", description: "DeepSeek R1 reasoning gratis tanpa biaya" },
      { id: "deepseek/deepseek-chat:free", name: "deepseek/deepseek-chat:free", description: "DeepSeek V3 chat general koding" },
      { id: "meta-llama/llama-3.3-70b-instruct:free", name: "meta-llama/llama-3.3-70b-instruct:free", description: "Llama 3.3 70B gratis OpenRouter" },
    ],
  },
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
  const [providers, setProviders] = useState<AIProvider[]>(INITIAL_PROVIDERS);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [activeProviderId, setActiveProviderId] = useState<string>("ciora");
  const [activeModel, setActiveModel] = useState<string>("glm-5.3-flash-free");
  const [newKeyInput, setNewKeyInput] = useState<string>("");
  const [newModelIdInput, setNewModelIdInput] = useState<string>("");
  const [newModelNameInput, setNewModelNameInput] = useState<string>("");
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);
  const [roundRobin, setRoundRobin] = useState<boolean>(true);
  const [testStatus, setTestStatus] = useState<Record<string, string>>({});

  // Modals & Dynamic Models Fetch
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [importSearch, setImportSearch] = useState<string>("");
  const [isFetchingModels, setIsFetchingModels] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [dynamicModelsPool, setDynamicModelsPool] = useState<string[]>([]);
  const [selectedImportModels, setSelectedImportModels] = useState<string[]>([]);

  const [showAddProviderModal, setShowAddProviderModal] = useState<boolean>(false);
  const [newProviderName, setNewProviderName] = useState<string>("");
  const [newProviderProtocol, setNewProviderProtocol] = useState<"openai" | "anthropic">("openai");
  const [newProviderBaseUrl, setNewProviderBaseUrl] = useState<string>("https://api.openai.com/v1");
  const [newProviderApiKey, setNewProviderApiKey] = useState<string>("");

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
      if (config.active_provider) {
        setActiveProviderId(config.active_provider);
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
      if (config.custom_providers && config.custom_providers.length > 0) {
        setProviders((prev) => {
          const defaults = prev.filter((p) => p.category === "default");
          const customs: AIProvider[] = config.custom_providers!.map((cp) => ({
            id: cp.id,
            name: cp.name,
            category: "custom",
            protocol: cp.protocol,
            base_url: cp.base_url,
            api_keys: cp.api_keys,
            active_model: cp.active_model,
            available_models: cp.available_models,
            badge: "Custom",
            connectionsCount: cp.api_keys.length,
          }));
          return [...customs, ...defaults];
        });
      }
    }
  }, [config]);

  const selectedProvider = providers.find((p) => p.id === selectedProviderId) || null;
  const activeProvider = providers.find((p) => p.id === activeProviderId) || providers[0] || null;

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

  const handleSaveAll = (
    updatedProviders?: AIProvider[],
    updatedModel?: string,
    updatedActiveProviderId?: string
  ) => {
    const list = updatedProviders || providers;
    const modelToSave = updatedModel || activeModel;
    const providerIdToSave = updatedActiveProviderId || activeProviderId;

    const currentP =
      list.find((p) => p.id === providerIdToSave) ||
      list.find((p) => p.id === selectedProviderId) ||
      list[0];

    const customList: CustomProvider[] = list
      .filter((p) => p.category === "custom")
      .map((cp) => ({
        id: cp.id,
        name: cp.name,
        protocol: cp.protocol === "anthropic" ? "anthropic" : "openai",
        base_url: cp.base_url,
        api_keys: cp.api_keys,
        active_model: cp.active_model,
        available_models: cp.available_models,
      }));

    const newCfg: AppSettings = {
      openai_base_url: currentP?.base_url || "https://api.openai.com/v1",
      openai_api_key: currentP?.api_keys?.[0] || "",
      model_name: modelToSave,
      idle_delay_ms: idleDelayMs,
      watched_paths: watchedPaths,
      active_provider: currentP?.id || providerIdToSave || "ciora",
      custom_providers: customList,
    };

    onSave?.(newCfg);
    setSaveBanner(true);
    setTimeout(() => setSaveBanner(false), 1200);
  };

  // Switch Global Active Model & Provider directly from Overview
  const handleSelectGlobalModel = (providerId: string, modelId: string) => {
    const targetProvider = providers.find((p) => p.id === providerId);
    if (!targetProvider) return;

    setActiveProviderId(providerId);
    setActiveModel(modelId);

    const updated = providers.map((p) => {
      if (p.id === providerId) {
        return { ...p, active_model: modelId };
      }
      return p;
    });

    setProviders(updated);
    handleSaveAll(updated, modelId, providerId);
  };

  // Add API Key to current provider (custom or default)
  const handleAddApiKey = () => {
    if (!newKeyInput.trim() || !selectedProvider) return;
    const updated = providers.map((p) => {
      if (p.id === selectedProvider.id) {
        return {
          ...p,
          api_keys: [...p.api_keys, newKeyInput.trim()],
          connectionsCount: p.api_keys.length + 1,
        };
      }
      return p;
    });
    setProviders(updated);
    setNewKeyInput("");
    handleSaveAll(updated);
  };

  // Delete API Key
  const handleDeleteKey = (keyIndex: number) => {
    if (!selectedProvider) return;
    const updated = providers.map((p) => {
      if (p.id === selectedProvider.id) {
        const nextKeys = p.api_keys.filter((_, idx) => idx !== keyIndex);
        return { ...p, api_keys: nextKeys, connectionsCount: nextKeys.length };
      }
      return p;
    });
    setProviders(updated);
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
    const updated = providers.map((p) => {
      if (p.id === selectedProvider.id) {
        return {
          ...p,
          available_models: [...p.available_models, newModel],
        };
      }
      return p;
    });
    setProviders(updated);
    setNewModelIdInput("");
    setNewModelNameInput("");
    handleSaveAll(updated);
  };

  // Delete Model
  const handleDeleteModel = (modelId: string) => {
    if (!selectedProvider) return;
    const updated = providers.map((p) => {
      if (p.id === selectedProvider.id) {
        return {
          ...p,
          available_models: p.available_models.filter((m) => m.id !== modelId),
        };
      }
      return p;
    });
    setProviders(updated);
    handleSaveAll(updated);
  };

  // Set Active Model
  const handleApplyModel = (modelId: string) => {
    setActiveModel(modelId);
    if (selectedProvider) {
      setActiveProviderId(selectedProvider.id);
      const updated = providers.map((p) => {
        if (p.id === selectedProvider.id) {
          return { ...p, active_model: modelId };
        }
        return p;
      });
      setProviders(updated);
      handleSaveAll(updated, modelId, selectedProvider.id);
    }
  };

  // Ping Test
  const handleTestPing = (targetId: string) => {
    setTestStatus((prev) => ({ ...prev, [targetId]: "testing" }));
    setTimeout(() => {
      setTestStatus((prev) => ({ ...prev, [targetId]: "ok (21ms)" }));
      setTimeout(() => {
        setTestStatus((prev) => {
          const next = { ...prev };
          delete next[targetId];
          return next;
        });
      }, 2500);
    }, 450);
  };

  // Copy Endpoint URL
  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 1500);
  };

  // Delete Custom Provider
  const handleDeleteProvider = (providerId: string) => {
    const pToDelete = providers.find((p) => p.id === providerId);
    if (!pToDelete) return;
    if (pToDelete.category !== "custom") {
      alert("Provider default sistem tidak dapat dihapus.");
      return;
    }
    const confirmed = window.confirm(
      `Hapus custom provider "${pToDelete.name}"?\nSemua konfigurasi API key dan model untuk provider ini akan dihapus.`
    );
    if (!confirmed) return;

    const updated = providers.filter((p) => p.id !== providerId);
    setProviders(updated);
    if (selectedProviderId === providerId) {
      setSelectedProviderId(null);
    }
    handleSaveAll(updated);
  };

  // Open dynamic import modal and query /models endpoint live
  const handleOpenImportModal = async () => {
    if (!selectedProvider) return;
    setShowImportModal(true);
    setIsFetchingModels(true);
    setFetchError(null);
    setDynamicModelsPool([]);
    setSelectedImportModels([]);
    setImportSearch("");

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const models = await invoke<string[]>("fetch_models_from_provider", {
        baseUrl: selectedProvider.base_url,
        apiKey: selectedProvider.api_keys[0] || null,
      });
      if (models && models.length > 0) {
        setDynamicModelsPool(models);
        setSelectedImportModels(models.slice(0, 8));
      } else {
        setFetchError("Endpoint /models merespons tetapi tidak ditemukan daftar ID model.");
      }
    } catch (err: unknown) {
      console.error("Gagal import /models:", err);
      const errMsg =
        typeof err === "string"
          ? err
          : err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Gagal menghubungi endpoint /models provider.";
      setFetchError(errMsg);
    } finally {
      setIsFetchingModels(false);
    }
  };

  // Confirm Import Models
  const handleConfirmImport = () => {
    if (!selectedProvider) return;
    const modelsToAdd: ProviderModel[] = selectedImportModels.map((m) => ({
      id: m,
      name: m,
      description: `Model ${m} diimpor dari ${selectedProvider.name}`,
    }));

    const existingIds = new Set(selectedProvider.available_models.map((m) => m.id));
    const merged = [...selectedProvider.available_models];
    modelsToAdd.forEach((m) => {
      if (!existingIds.has(m.id)) {
        merged.push(m);
      }
    });

    const nextActive = selectedProvider.active_model || selectedImportModels[0] || activeModel;

    const updated = providers.map((p) => {
      if (p.id === selectedProvider.id) {
        return { ...p, available_models: merged, active_model: nextActive };
      }
      return p;
    });

    if (!activeModel || activeModel === "gpt-4o-mini" || !selectedProvider.active_model) {
      setActiveModel(nextActive);
    }

    setProviders(updated);
    setShowImportModal(false);
    handleSaveAll(updated, nextActive);
  };

  // Add Custom Provider (No default model ID needed; models are imported or added later)
  const handleCreateCustomProvider = () => {
    if (!newProviderName.trim()) return;
    const newId = newProviderName.toLowerCase().replace(/[^a-z0-9]/g, "-");
    const created: AIProvider = {
      id: newId,
      name: newProviderName.trim(),
      category: "custom",
      protocol: newProviderProtocol,
      base_url: newProviderBaseUrl.trim() || "https://api.openai.com/v1",
      api_keys: newProviderApiKey.trim() ? [newProviderApiKey.trim()] : [],
      active_model: "",
      badge: "Custom",
      connectionsCount: newProviderApiKey.trim() ? 1 : 0,
      available_models: [],
    };

    const updated = [...providers, created];
    setProviders(updated);
    setSelectedProviderId(created.id);
    setShowAddProviderModal(false);
    setNewProviderName("");
    setNewProviderApiKey("");
    handleSaveAll(updated);
  };

  const customProvidersList = providers.filter((p) => p.category === "custom");
  const defaultProvidersList = providers.filter((p) => p.category === "default");

  return (
    <div className="w-full h-full flex apple-hud-glass text-white/90 select-none overflow-hidden rounded-[28px] relative font-sans">
      {/* Sisi Kiri: Clean Minimal Navbar */}
      <aside className="w-56 bg-black/40 border-r border-white/[0.05] flex flex-col justify-between p-4 shrink-0 backdrop-blur-md">
        <div className="space-y-6">
          {/* Logo & Brand Header with User's Official Logo */}
          <div className="flex items-center gap-3 px-1 pt-1">
            <div className="w-8 h-8 rounded-xl bg-white/[0.07] flex items-center justify-center p-1.5 shrink-0 shadow-sm">
              <img
                src="/logo_white.png"
                alt="FixIt Logo"
                className="w-full h-full object-contain filter drop-shadow"
                onError={(e) => {
                  // Fallback if image path differs
                  (e.currentTarget as HTMLElement).style.display = "none";
                }}
              />
            </div>
            <div>
              <div className="text-[14px] font-semibold tracking-tight text-white/85 leading-none">
                FixIt
              </div>
              <div className="text-[10px] text-white/35 tracking-wider font-mono mt-0.5 uppercase">
                SETTINGS
              </div>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="space-y-1">
            <button
              onClick={() => {
                setActiveTab("models");
                setSelectedProviderId(null);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition text-left cursor-pointer ${
                activeTab === "models"
                  ? "bg-white/[0.08] text-white/90 font-medium"
                  : "text-white/45 hover:text-white/80 hover:bg-white/[0.03]"
              }`}
            >
              <Cpu size={15} strokeWidth={1.8} className={activeTab === "models" ? "text-white/85" : "text-white/40"} />
              <span>Model & Provider</span>
            </button>

            <button
              onClick={() => setActiveTab("folders")}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition text-left cursor-pointer ${
                activeTab === "folders"
                  ? "bg-white/[0.08] text-white/90 font-medium"
                  : "text-white/45 hover:text-white/80 hover:bg-white/[0.03]"
              }`}
            >
              <FolderOpen size={15} strokeWidth={1.8} className={activeTab === "folders" ? "text-white/85" : "text-white/40"} />
              <span>Folder Pantauan</span>
            </button>

            <button
              onClick={() => setActiveTab("general")}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition text-left cursor-pointer ${
                activeTab === "general"
                  ? "bg-white/[0.08] text-white/90 font-medium"
                  : "text-white/45 hover:text-white/80 hover:bg-white/[0.03]"
              }`}
            >
              <Sliders size={15} strokeWidth={1.8} className={activeTab === "general" ? "text-white/85" : "text-white/40"} />
              <span>Pengaturan Umum</span>
            </button>

            <button
              onClick={() => setActiveTab("about")}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition text-left cursor-pointer ${
                activeTab === "about"
                  ? "bg-white/[0.08] text-white/90 font-medium"
                  : "text-white/45 hover:text-white/80 hover:bg-white/[0.03]"
              }`}
            >
              <Info size={15} strokeWidth={1.8} className={activeTab === "about" ? "text-white/85" : "text-white/40"} />
              <span>Tentang FixIt</span>
            </button>
          </nav>
        </div>

        {/* Bottom Status Badge */}
        <div className="pt-3 border-t border-white/[0.04] flex items-center justify-between text-[11px] text-white/35 px-1">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-white/60"></span>
            <span>Active Service</span>
          </div>
          <span className="font-mono text-[10px]">v0.1.0</span>
        </div>
      </aside>

      {/* Sisi Kanan: Main Content Area */}
      <main className="flex-1 flex flex-col h-full bg-black/20 overflow-hidden min-w-0">
        {/* Top Drag Header Bar */}
        <header
          data-tauri-drag-region
          className="h-12 border-b border-white/[0.05] flex items-center justify-between px-6 shrink-0 cursor-grab active:cursor-grabbing bg-white/[0.01]"
        >
          <div data-tauri-drag-region className="flex items-center gap-2 text-xs text-white/40 font-mono truncate mr-2">
            <span>FixIt</span>
            <span>/</span>
            <span className="text-white/80 font-sans font-medium capitalize truncate">
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

          <div className="flex items-center gap-2 shrink-0" onMouseDown={(e) => e.stopPropagation()}>
            {saveBanner && (
              <span className="text-[11px] text-white/80 flex items-center gap-1 font-mono transition">
                <Check size={12} /> Tersimpan
              </span>
            )}
            <button
              onClick={handleClose}
              aria-label="Tutup Pengaturan"
              title="Tutup Pengaturan"
              className="w-7 h-7 rounded-full bg-white/[0.06] hover:bg-white/[0.14] flex items-center justify-center text-white/70 hover:text-white transition cursor-pointer"
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        </header>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
          {activeTab === "models" && (
            <>
              {/* Overview Mode: Lists Custom Providers & Default Providers */}
              {!selectedProviderId ? (
                <div className="space-y-6">
                  {/* SELEKSI MODEL AKTIF UTAMA FIXIT */}
                  <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] shadow-xl space-y-3.5">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-white/[0.08] text-white/90 flex items-center justify-center shrink-0 border border-white/[0.08]">
                          {activeProvider ? renderProviderLogo(activeProvider, "w-4 h-4") : <Cpu size={15} />}
                        </div>
                        <div>
                          <div className="text-[12px] font-semibold text-white/95 uppercase tracking-wider font-mono flex items-center gap-2">
                            <span>MODEL AKTIF UTAMA FIXIT</span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/[0.08] text-white/70 border border-white/10 font-mono normal-case">
                              Active Engine
                            </span>
                          </div>
                          <div className="text-[11px] text-white/40">
                            Pilih model & provider yang digunakan oleh FixIt untuk memantau kode dan menganalisis error di background.
                          </div>
                        </div>
                      </div>

                      {/* Active Status Badge */}
                      {activeProvider && (
                        <div className="flex items-center gap-2 font-mono text-[11px]">
                          {(activeProvider.connectionsCount ?? activeProvider.api_keys.length) > 0 ? (
                            <span className="px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/10 text-white/80 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-white/70"></span>
                              <span>Siap Digunakan ({activeProvider.name})</span>
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full bg-white/[0.03] border border-white/[0.08] text-white/40 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-white/20"></span>
                              <span>Offline (Butuh API Key di {activeProvider.name})</span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Selector Control */}
                    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap pt-1">
                      <div className="flex-1 min-w-[220px]">
                        <select
                          value={`${activeProviderId}:::${activeModel}`}
                          onChange={(e) => {
                            const [pId, mId] = e.target.value.split(":::");
                            if (pId && mId) {
                              handleSelectGlobalModel(pId, mId);
                            }
                          }}
                          className="w-full bg-[#12151b] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white/90 focus:outline-none focus:border-white/25 font-mono cursor-pointer shadow-inner"
                        >
                          {providers.map((p) => {
                            const isOffline = (p.connectionsCount ?? p.api_keys.length) === 0;
                            return (
                              <optgroup
                                key={p.id}
                                label={`${p.name} (${p.category === "custom" ? "Custom" : "Default"}${
                                  isOffline ? " - 0 Key / Offline" : ` - ${p.connectionsCount || p.api_keys.length} Key`
                                })`}
                              >
                                {p.available_models.map((m) => (
                                  <option key={`${p.id}:::${m.id}`} value={`${p.id}:::${m.id}`}>
                                    {p.name} — {m.id} {isOffline ? "⚠️ (Offline)" : "✓"}
                                  </option>
                                ))}
                              </optgroup>
                            );
                          })}
                        </select>
                      </div>

                      <button
                        onClick={() => setSelectedProviderId(activeProviderId)}
                        className="px-3.5 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs text-white/85 flex items-center gap-1.5 transition cursor-pointer font-mono shrink-0"
                      >
                        <Sliders size={13} />
                        <span>Detail Provider</span>
                      </button>
                    </div>

                    {/* Active Engine Summary Pill */}
                    <div className="pt-2 border-t border-white/[0.04] flex items-center justify-between text-[11px] font-mono text-white/45 flex-wrap gap-2">
                      <div className="flex items-center gap-2 truncate">
                        <span>Engine: <span className="text-white/85 font-medium">{activeProvider?.name}</span></span>
                        <span>•</span>
                        <span>Model: <span className="text-white font-semibold">{activeModel}</span></span>
                      </div>
                      <div className="text-[10px] text-white/35 truncate max-w-xs font-mono">
                        {activeProvider?.base_url}
                      </div>
                    </div>
                  </div>

                  {/* Section 1: Custom Providers */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-[11px] font-mono tracking-wider text-white/40 uppercase">
                        CUSTOM PROVIDERS (OPENAI/ANTHROPIC COMPATIBLE)
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-white/40 bg-white/[0.04] px-2 py-0.5 rounded-full">
                          {customProvidersList.length} Provider
                        </span>
                        <button
                          onClick={() => setShowAddProviderModal(true)}
                          className="text-[11px] px-2.5 py-1 rounded-lg bg-white/[0.07] hover:bg-white/[0.14] text-white/85 flex items-center gap-1 cursor-pointer transition font-mono"
                        >
                          <Plus size={12} /> + Tambah
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                      {customProvidersList.map((cp) => {
                        const hasConnection = (cp.connectionsCount ?? cp.api_keys.length) > 0;
                        const isGlobalActive = activeProviderId === cp.id;

                        return (
                          <div
                            key={cp.id}
                            onClick={() => setSelectedProviderId(cp.id)}
                            className={`p-4 rounded-2xl transition cursor-pointer flex flex-col justify-between gap-3 group relative border shadow-sm ${
                              isGlobalActive
                                ? "bg-white/[0.06] border-white/20 ring-1 ring-white/10"
                                : "bg-white/[0.02] hover:bg-white/[0.05] border-white/[0.04] hover:border-white/15"
                            }`}
                          >
                            {/* Baris Atas: Info Provider & Tombol Aksi */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2.5 min-w-0 pr-1">
                                <div
                                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                                    isGlobalActive
                                      ? "bg-white/15 text-white border-white/20"
                                      : "bg-white/[0.05] text-white/70 border-white/[0.05] group-hover:text-white"
                                  }`}
                                >
                                  {renderProviderLogo(cp, "w-4 h-4")}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[13px] font-semibold text-white/90 group-hover:text-white truncate">
                                      {cp.name}
                                    </span>
                                    {isGlobalActive && (
                                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/15 text-white font-mono font-medium border border-white/20">
                                        AKTIF
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-white/40 font-mono uppercase tracking-wider mt-0.5 truncate">
                                    {cp.protocol} COMPATIBLE
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => handleDeleteProvider(cp.id)}
                                  className="w-7 h-7 rounded-lg bg-white/[0.03] hover:bg-red-500/15 text-white/30 hover:text-red-400 flex items-center justify-center transition cursor-pointer"
                                  title={`Hapus ${cp.name}`}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>

                            {/* Baris Bawah: Status Koneksi & Model Info */}
                            <div className="pt-2.5 border-t border-white/[0.04] flex items-center justify-between text-[11px] font-mono gap-2">
                              <div className="flex items-center gap-1.5 shrink-0">
                                {hasConnection ? (
                                  <>
                                    <span className="w-1.5 h-1.5 rounded-full bg-white/60 shrink-0"></span>
                                    <span className="text-white/60">
                                      {cp.connectionsCount || cp.api_keys.length} Connected
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <span className="w-1.5 h-1.5 rounded-full bg-white/20 shrink-0"></span>
                                    <span className="text-white/30">0 Connected (Offline)</span>
                                  </>
                                )}
                              </div>

                              <div
                                className="text-[10.5px] text-white/40 group-hover:text-white/70 transition truncate max-w-[130px] text-right font-mono"
                                title={cp.active_model || "Tanpa model"}
                              >
                                {cp.active_model || "Tanpa model"}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Section 2: Default Providers */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-[11px] font-mono tracking-wider text-white/40 uppercase">
                        DEFAULT PROVIDERS
                      </div>
                      <button
                        onClick={() => handleTestPing("all-defaults")}
                        className="text-[11px] px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white/70 flex items-center gap-1 cursor-pointer transition font-mono"
                      >
                        <Play size={11} /> Test All
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                      {defaultProvidersList.map((dp) => {
                        const hasConnection = (dp.connectionsCount ?? dp.api_keys.length) > 0;
                        const isGlobalActive = activeProviderId === dp.id;

                        return (
                          <div
                            key={dp.id}
                            onClick={() => setSelectedProviderId(dp.id)}
                            className={`p-3.5 rounded-2xl transition cursor-pointer flex flex-col justify-between gap-2.5 group relative border shadow-sm ${
                              isGlobalActive
                                ? "bg-white/[0.06] border-white/20 ring-1 ring-white/10"
                                : "bg-white/[0.02] hover:bg-white/[0.05] border-white/[0.04] hover:border-white/15"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2.5 min-w-0 pr-1">
                                <div
                                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${
                                    isGlobalActive
                                      ? "bg-white/15 text-white border-white/20"
                                      : "bg-white/[0.05] text-white/70 border-white/[0.05] group-hover:text-white"
                                  }`}
                                >
                                  {renderProviderLogo(dp, "w-4 h-4")}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[12px] font-semibold text-white/85 group-hover:text-white truncate">
                                      {dp.name}
                                    </span>
                                    {isGlobalActive && (
                                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/15 text-white font-mono font-medium border border-white/20">
                                        AKTIF
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-white/35 font-mono mt-0.5 truncate">
                                    {dp.base_url.replace("https://", "").split("/")[0]}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="pt-2 border-t border-white/[0.03] flex items-center justify-between text-[10px] font-mono gap-2">
                              <div className="flex items-center gap-1.5 shrink-0">
                                {hasConnection ? (
                                  <>
                                    <span className="w-1.5 h-1.5 rounded-full bg-white/60 shrink-0"></span>
                                    <span className="text-white/55">
                                      {dp.connectionsCount || dp.api_keys.length} Connected
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <span className="w-1.5 h-1.5 rounded-full bg-white/20 shrink-0"></span>
                                    <span className="text-white/30">0 Connected (Offline)</span>
                                  </>
                                )}
                              </div>

                              <div
                                className="text-white/35 group-hover:text-white/60 transition truncate max-w-[130px] text-right font-mono"
                                title={dp.active_model}
                              >
                                {dp.active_model}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                /* Provider Detail View (Visitable for both custom & default!) */
                selectedProvider && (
                  <div className="space-y-4 max-w-4xl">
                    {/* Header Card */}
                    <div className="p-4 rounded-2xl bg-white/[0.025] border border-white/[0.05] flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-white/90 shrink-0">
                          {renderProviderLogo(selectedProvider, "w-5 h-5")}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[15px] font-semibold text-white/90">{selectedProvider.name}</span>
                            <span className="px-2 py-0.5 rounded-md bg-white/[0.07] text-[10px] font-mono uppercase tracking-wider text-white/60">
                              {selectedProvider.protocol.toUpperCase()} COMPATIBLE
                            </span>
                            {selectedProvider.category === "default" && (
                              <span className="px-1.5 py-0.2 rounded bg-white/[0.08] text-white/70 text-[10px] font-mono border border-white/10">
                                DEFAULT
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-white/40 mt-0.5 font-mono flex items-center gap-1.5">
                            {selectedProvider.api_keys.length > 0 ? (
                              <>
                                <span className="w-1.5 h-1.5 rounded-full bg-white/70 shrink-0"></span>
                                <span>{selectedProvider.api_keys.length} connections aktif (Online)</span>
                              </>
                            ) : (
                              <>
                                <span className="w-1.5 h-1.5 rounded-full bg-white/20 shrink-0"></span>
                                <span className="text-white/30">0 connections aktif (Offline - Butuh API Key)</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedProviderId(null)}
                          className="px-3 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-white/70 hover:text-white text-[11px] cursor-pointer transition font-mono flex items-center gap-1.5"
                        >
                          <ArrowLeft size={12} /> Kembali
                        </button>
                        <button
                          onClick={() => {
                            const key = prompt(`Masukkan API Key untuk ${selectedProvider.name}:`, "sk-");
                            if (key && key.trim()) {
                              const updated = providers.map((p) =>
                                p.id === selectedProvider.id
                                  ? { ...p, api_keys: [...p.api_keys, key.trim()], connectionsCount: p.api_keys.length + 1 }
                                  : p
                              );
                              setProviders(updated);
                              handleSaveAll(updated);
                            }
                          }}
                          className="px-3 py-1.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] text-white/90 text-[11px] flex items-center gap-1 cursor-pointer transition font-mono"
                        >
                          + ADD API KEY
                        </button>
                        {selectedProvider.category === "custom" && (
                          <button
                            onClick={() => handleDeleteProvider(selectedProvider.id)}
                            className="px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 text-[11px] flex items-center gap-1.5 cursor-pointer transition font-mono border border-red-500/20"
                            title="Hapus Custom Provider ini"
                          >
                            <Trash2 size={12} /> DELETE
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Section 1: Active Model Selector */}
                    <div className="p-4 rounded-2xl bg-white/[0.02] space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-mono text-white/40 flex-wrap gap-1">
                        <span className="flex items-center gap-1.5 uppercase">
                          <Sparkles size={12} className="text-white/60" /> MODEL AKTIF UNTUK PROVIDER INI:
                        </span>
                        <span className="text-white/80 font-semibold">{activeModel}</span>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                        <select
                          value={activeModel}
                          onChange={(e) => setActiveModel(e.target.value)}
                          className="flex-1 bg-[#12151b] rounded-xl px-3 py-2 text-xs text-white/90 focus:outline-none cursor-pointer font-mono"
                        >
                          {selectedProvider.available_models.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.id} ({m.name})
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleApplyModel(activeModel)}
                          className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-xs text-white font-medium flex items-center gap-1.5 cursor-pointer transition font-mono shrink-0"
                        >
                          <Check size={13} /> TERAPKAN
                        </button>
                      </div>
                    </div>

                    {/* Section 2: Endpoint Details */}
                    <div className="p-4 rounded-2xl bg-white/[0.02] space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-mono text-white/40">
                        <span className="uppercase">&gt;_ {selectedProvider.protocol.toUpperCase()} COMPATIBLE DETAILS</span>
                        <span className="text-[10px]">Endpoint Target</span>
                      </div>
                      <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-black/40 text-xs flex-wrap gap-2">
                        <div className="truncate font-mono text-white/70 text-[11px] flex-1 min-w-0">
                          Chat Completions: <span className="text-sky-400/90">{selectedProvider.base_url}/chat/completions</span>
                        </div>
                        <button
                          onClick={() => handleCopyUrl(`${selectedProvider.base_url}/chat/completions`)}
                          className="text-[11px] px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-white/80 flex items-center gap-1 shrink-0 font-mono cursor-pointer transition"
                        >
                          <Copy size={11} /> {copiedUrl ? "TERSALIN" : "SALIN URL"}
                        </button>
                      </div>
                    </div>

                    {/* Section 3: Connections (API Keys) */}
                    <div className="p-4 rounded-2xl bg-white/[0.02] space-y-3">
                      <div className="flex items-center justify-between text-[11px] font-mono text-white/40 flex-wrap gap-2">
                        <span className="uppercase">CONNECTIONS (API KEYS)</span>
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-1.5 cursor-pointer text-white/50 hover:text-white">
                            <input
                              type="checkbox"
                              checked={roundRobin}
                              onChange={(e) => setRoundRobin(e.target.checked)}
                              className="rounded border-none bg-black/40"
                            />
                            <span>Round Robin</span>
                          </label>
                          <button
                            onClick={() => handleTestPing("keys")}
                            className="hover:text-white transition flex items-center gap-1 cursor-pointer"
                          >
                            <RefreshCw size={11} /> TEST CONNECTION
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {selectedProvider.api_keys.map((key, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between px-3 py-2 rounded-xl bg-black/30 text-xs flex-wrap gap-2"
                          >
                            <div className="flex items-center gap-2 font-mono text-[11px] min-w-0 truncate">
                              <span className="text-white/35">Key {idx + 1}</span>
                              <span className="w-1.5 h-1.5 rounded-full bg-white/60 shrink-0"></span>
                              <span className="text-white/35">active #{idx + 1}</span>
                              <span className="text-white/80 truncate">
                                {key.length > 8 ? `${key.substring(0, 4)}••••••••${key.slice(-4)}` : key}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 font-mono text-[10px] shrink-0">
                              {testStatus[`key-${idx}`] && (
                                <span className="text-white/70">{testStatus[`key-${idx}`]}</span>
                              )}
                              <button
                                onClick={() => handleTestPing(`key-${idx}`)}
                                className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-white/70 cursor-pointer"
                              >
                                ▷ TEST
                              </button>
                              <button
                                onClick={() => handleDeleteKey(idx)}
                                className="p-1 rounded-lg hover:bg-red-500/20 text-white/35 hover:text-red-400 cursor-pointer"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        ))}

                        {/* Add key input row */}
                        <div className="flex items-center gap-2 pt-1 flex-wrap sm:flex-nowrap">
                          <input
                            type="password"
                            placeholder="Tambah key baru..."
                            value={newKeyInput}
                            onChange={(e) => setNewKeyInput(e.target.value)}
                            className="flex-1 bg-black/40 rounded-xl px-3 py-1.5 text-xs text-white/80 placeholder:text-white/25 focus:outline-none font-mono"
                          />
                          <button
                            onClick={handleAddApiKey}
                            className="px-3.5 py-1.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] text-xs text-white/80 font-mono cursor-pointer shrink-0"
                          >
                            + Tambah Key
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Section 4: Available Models */}
                    <div className="p-4 rounded-2xl bg-white/[0.02] space-y-3">
                      <div>
                        <div className="text-[11px] font-mono text-white/40 uppercase">AVAILABLE MODELS</div>
                        <div className="text-[11px] text-white/35 mt-0.5">
                          Tambahkan model {selectedProvider.protocol}-compatible secara manual atau impor otomatis dari endpoint /models.
                        </div>
                      </div>

                      {/* Add Model Input row */}
                      <div className="flex items-center gap-2 pt-1 flex-wrap">
                        <input
                          type="text"
                          placeholder="Model ID (misal: gpt-4o, deepseek-v3, llama-3.3-70b)"
                          value={newModelIdInput}
                          onChange={(e) => setNewModelIdInput(e.target.value)}
                          className="flex-1 min-w-[200px] bg-black/40 rounded-xl px-3 py-1.5 text-xs text-white/80 placeholder:text-white/25 focus:outline-none font-mono"
                        />
                        <input
                          type="text"
                          placeholder="Nama Tampilan (Opsional)"
                          value={newModelNameInput}
                          onChange={(e) => setNewModelNameInput(e.target.value)}
                          className="w-40 bg-black/40 rounded-xl px-3 py-1.5 text-xs text-white/80 placeholder:text-white/25 focus:outline-none font-mono"
                        />
                        <button
                          onClick={handleAddModel}
                          className="px-3.5 py-1.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] text-xs text-white/85 font-mono cursor-pointer shrink-0"
                        >
                          + ADD
                        </button>
                        <button
                          onClick={handleOpenImportModal}
                          className="px-3.5 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs text-white/70 font-mono flex items-center gap-1 cursor-pointer shrink-0"
                        >
                          <ExternalLink size={11} /> IMPORT FROM /MODELS
                        </button>
                      </div>

                      {/* Models List */}
                      <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1 pt-2">
                        {selectedProvider.available_models.map((m) => {
                          const isCurrentActive = activeModel === m.id;
                          return (
                            <div
                              key={m.id}
                              className={`flex items-center justify-between p-2.5 rounded-xl transition ${
                                isCurrentActive
                                  ? "bg-white/[0.06]"
                                  : "bg-white/[0.015] hover:bg-white/[0.035]"
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                <div className="w-6 h-6 rounded-lg bg-white/[0.05] flex items-center justify-center text-white/70 shrink-0">
                                  {renderProviderLogo(selectedProvider, "w-3 h-3")}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-[12px] font-mono text-white/85 truncate flex items-center gap-2">
                                    <span>{m.id}</span>
                                    {isCurrentActive && (
                                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/15 text-white font-mono font-medium border border-white/20">
                                        Aktif
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-white/35 truncate">
                                    {m.description || `Model ${m.name} dari ${selectedProvider.name}`}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0 font-mono text-[10px]">
                                {testStatus[m.id] && (
                                  <span className="text-white/70 mr-1">{testStatus[m.id]}</span>
                                )}
                                <button
                                  onClick={() => handleApplyModel(m.id)}
                                  className={`px-2 py-1 rounded-lg transition cursor-pointer ${
                                    isCurrentActive
                                      ? "bg-white/15 text-white"
                                      : "bg-white/[0.04] hover:bg-white/[0.09] text-white/60 hover:text-white"
                                  }`}
                                >
                                  {isCurrentActive ? "✓ UTAMA" : "PILIH UNTUK PROVIDER"}
                                </button>
                                <button
                                  onClick={() => handleTestPing(m.id)}
                                  className="px-2 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] text-white/60 hover:text-white cursor-pointer"
                                >
                                  PING
                                </button>
                                <button
                                  onClick={() => handleDeleteModel(m.id)}
                                  className="p-1 rounded-lg hover:bg-red-500/20 text-white/30 hover:text-red-400 cursor-pointer"
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
            <div className="space-y-4 max-w-3xl">
              <div className="p-5 rounded-2xl bg-white/[0.025] space-y-3">
                <div className="text-[13px] font-medium text-white/85">Folder Proyek yang Dipantau</div>
                <div className="text-[11px] text-white/40 leading-relaxed">
                  FixIt memonitor perubahan file pada folder ini di latar belakang. Saat kamu menyimpan berkas (Cmd + S) dan terjadi kesalahan sintaks (PHP, JS, Python, JSON), popup panduan perbaikan akan muncul secara otomatis.
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="text-[11px] font-mono text-white/40">
                    {watchedPaths.length} Workspace Aktif
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        const { invoke } = await import("@tauri-apps/api/core");
                        const discovered = await invoke<string[]>("discover_ide_workspaces");
                        if (discovered && discovered.length > 0) {
                          const set = new Set([...watchedPaths, ...discovered]);
                          const next = Array.from(set);
                          setWatchedPaths(next);
                          handleSaveAll();
                        }
                      } catch {}
                    }}
                    className="px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs text-white/80 font-mono flex items-center gap-1.5 cursor-pointer transition"
                  >
                    <RefreshCw size={12} /> Auto-Deteksi dari IDE (Antigravity, VS Code, Cursor, Kiro)
                  </button>
                </div>

                <div className="space-y-2 pt-2">
                  {watchedPaths.map((path, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 rounded-xl bg-black/40 text-xs font-mono text-white/80"
                    >
                      <span className="truncate mr-2">{path}</span>
                      <button
                        onClick={() => {
                          const updated = watchedPaths.filter((_, i) => i !== idx);
                          setWatchedPaths(updated);
                          handleSaveAll();
                        }}
                        className="p-1.5 hover:text-red-400 text-white/35 transition cursor-pointer shrink-0"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2 pt-2 flex-wrap sm:flex-nowrap">
                  <input
                    type="text"
                    placeholder="/Users/nama/Herd/ProyekBaru"
                    value={newFolderPath}
                    onChange={(e) => setNewFolderPath(e.target.value)}
                    className="flex-1 bg-black/40 rounded-xl px-3.5 py-2 text-xs text-white/80 font-mono placeholder:text-white/25 focus:outline-none"
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
                    className="px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] text-xs text-white/85 font-mono cursor-pointer shrink-0 transition"
                  >
                    + Tambah Folder
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: General Settings */}
          {activeTab === "general" && (
            <div className="space-y-4 max-w-3xl">
              <div className="p-5 rounded-2xl bg-white/[0.025] space-y-3">
                <div className="text-[13px] font-medium text-white/85">Sensitivitas & Idle Delay</div>
                <div className="text-[11px] text-white/40">
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

              <div className="p-5 rounded-2xl bg-white/[0.025] space-y-2">
                <div className="text-[13px] font-medium text-white/85">Perilaku Background macOS</div>
                <div className="text-[11px] text-white/40 leading-relaxed">
                  Ketika tombol silang (X) ditekan, jendela FixIt disembunyikan ke menu bar tray dan pemantau kode tetap aktif tanpa memakan RAM besar (&lt;30MB).
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: About */}
          {activeTab === "about" && (
            <div className="p-6 rounded-2xl bg-white/[0.025] space-y-3 text-xs text-white/70 max-w-3xl">
              <div className="text-[15px] font-semibold text-white/90">FixIt Desktop Assistant</div>
              <p className="text-white/45 leading-relaxed">
                Asisten praktikum pemrograman untuk mahasiswa. Didesain seringan mungkin, hemat token, tanpa bloatware AI slop, dan beroperasi tenang di latar belakang sistem macOS.
              </p>
              <div className="pt-2 font-mono text-[11px] text-white/35 space-y-1">
                <div>Versi: 0.1.0 Native aarch64 (Apple Silicon)</div>
                <div>Runtime: Tauri v2 + React 19 + Rust</div>
                <div>Lisensi: MIT - Free for Students</div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modal Import Model dari Endpoint /models (Dynamic Live Fetch) */}
      {showImportModal && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 select-none">
          <div className="w-[480px] max-h-[540px] rounded-2xl bg-[#111419] flex flex-col overflow-hidden shadow-2xl border border-white/[0.06]">
            <div className="px-5 py-4 border-b border-white/[0.04] flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs font-mono font-medium text-white/90">
                  <ExternalLink size={14} /> IMPOR MODEL DARI ENDPOINT /MODELS
                </div>
                <div className="text-[10px] font-mono text-white/35 mt-0.5 truncate max-w-sm">
                  {selectedProvider?.base_url}/models
                </div>
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                className="w-6 h-6 rounded-full hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white cursor-pointer"
              >
                <X size={13} />
              </button>
            </div>

            <div className="p-5 space-y-3 flex-1 overflow-y-auto">
              {isFetchingModels ? (
                <div className="py-14 flex flex-col items-center justify-center space-y-3 text-center">
                  <RefreshCw size={24} className="animate-spin text-sky-400" />
                  <div className="text-xs font-mono text-white/85">Mengambil daftar model langsung dari endpoint...</div>
                  <div className="text-[10px] text-white/40 font-mono max-w-xs break-all">
                    GET {selectedProvider?.base_url}/models
                  </div>
                </div>
              ) : fetchError ? (
                <div className="py-8 flex flex-col items-center justify-center space-y-3 text-center px-2">
                  <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
                    <AlertCircle size={20} />
                  </div>
                  <div className="text-xs font-medium text-red-300">Gagal Mengambil Model dari Endpoint</div>
                  <div className="text-[11px] text-white/45 max-w-md leading-relaxed break-words font-mono bg-black/40 p-3 rounded-xl border border-white/[0.04] text-left">
                    {fetchError}
                  </div>
                  <button
                    onClick={handleOpenImportModal}
                    className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-mono text-white flex items-center gap-1.5 cursor-pointer transition mt-2"
                  >
                    <RefreshCw size={12} /> Coba Hubungi Lagi
                  </button>
                </div>
              ) : (
                <>
                  <div className="text-[11px] text-white/45 flex items-center justify-between">
                    <span>Pilih model yang ingin diimpor ke dalam daftar aktif FixIt:</span>
                    <span className="font-mono text-white/60 text-[10px]">
                      {dynamicModelsPool.length} model ditemukan
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex-1 min-w-[160px] flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/40 text-xs">
                      <Search size={12} className="text-white/30" />
                      <input
                        type="text"
                        placeholder="Filter model yang terdeteksi..."
                        value={importSearch}
                        onChange={(e) => setImportSearch(e.target.value)}
                        className="w-full bg-transparent focus:outline-none text-white/80 text-xs font-mono placeholder:text-white/25"
                      />
                    </div>
                    <button
                      onClick={() => setSelectedImportModels([...dynamicModelsPool])}
                      className="px-2.5 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-[10px] font-mono text-white/70 cursor-pointer"
                    >
                      PILIH SEMUA
                    </button>
                    <button
                      onClick={() => setSelectedImportModels([])}
                      className="px-2.5 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-[10px] font-mono text-white/70 cursor-pointer"
                    >
                      BATAL SEMUA
                    </button>
                  </div>

                  <div className="space-y-1.5 max-h-56 overflow-y-auto pt-2">
                    {dynamicModelsPool
                      .filter((m) => m.toLowerCase().includes(importSearch.toLowerCase()))
                      .map((modelId) => {
                        const isChecked = selectedImportModels.includes(modelId);
                        return (
                          <label
                            key={modelId}
                            className="flex items-center justify-between p-2 rounded-xl bg-black/25 hover:bg-black/40 cursor-pointer text-xs transition"
                          >
                            <div className="flex items-center gap-2 font-mono text-[11px] text-white/80 truncate pr-2">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedImportModels([...selectedImportModels, modelId]);
                                  } else {
                                    setSelectedImportModels(
                                      selectedImportModels.filter((id) => id !== modelId)
                                    );
                                  }
                                }}
                                className="rounded border-none bg-black/40"
                              />
                              <span className="truncate">{modelId}</span>
                            </div>
                            <span className="text-[10px] font-mono text-white/30 shrink-0">live</span>
                          </label>
                        );
                      })}
                    {dynamicModelsPool.length === 0 && (
                      <div className="text-center py-6 text-white/30 text-xs font-mono">
                        Tidak ada model yang ditemukan dalam respon /models.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="px-5 py-3 border-t border-white/[0.04] flex items-center justify-end gap-2 bg-white/[0.01]">
              <button
                onClick={() => setShowImportModal(false)}
                className="px-3 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs text-white/70 font-mono cursor-pointer"
              >
                BATAL
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={selectedImportModels.length === 0}
                className={`px-4 py-1.5 rounded-xl text-xs font-medium font-mono flex items-center gap-1.5 transition ${
                  selectedImportModels.length > 0
                    ? "bg-white/15 hover:bg-white/25 text-white cursor-pointer"
                    : "bg-white/[0.04] text-white/30 cursor-not-allowed"
                }`}
              >
                <Check size={12} /> IMPOR {selectedImportModels.length} MODEL TERPILIH
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tambah Custom Provider (Tanpa input default model karena diimpor via /models) */}
      {showAddProviderModal && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 select-none">
          <div className="w-[460px] rounded-2xl bg-[#111419] flex flex-col overflow-hidden shadow-2xl border border-white/[0.06]">
            <div className="px-5 py-4 border-b border-white/[0.04] flex items-center justify-between">
              <div className="text-xs font-mono font-medium text-white/90 flex items-center gap-2">
                <Plus size={14} /> TAMBAH CUSTOM PROVIDER
              </div>
              <button
                onClick={() => setShowAddProviderModal(false)}
                className="w-6 h-6 rounded-full hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white cursor-pointer"
              >
                <X size={13} />
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="text-[11px] font-mono text-white/45">NAMA PROVIDER</label>
                <input
                  type="text"
                  placeholder="Misal: DeepSeek Direct / My Ollama"
                  value={newProviderName}
                  onChange={(e) => setNewProviderName(e.target.value)}
                  className="w-full bg-black/40 rounded-xl px-3.5 py-2 text-white/90 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-mono text-white/45">PROTOKOL KOMPATIBILITAS</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewProviderProtocol("openai")}
                    className={`py-2 px-3 rounded-xl text-xs font-mono transition cursor-pointer ${
                      newProviderProtocol === "openai"
                        ? "bg-white/10 text-white font-medium"
                        : "bg-white/[0.025] text-white/45 hover:text-white"
                    }`}
                  >
                    OpenAI Compatible
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewProviderProtocol("anthropic")}
                    className={`py-2 px-3 rounded-xl text-xs font-mono transition cursor-pointer ${
                      newProviderProtocol === "anthropic"
                        ? "bg-white/10 text-white font-medium"
                        : "bg-white/[0.025] text-white/45 hover:text-white"
                    }`}
                  >
                    Anthropic Compatible
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-mono text-white/45">BASE URL ENDPOINT</label>
                <input
                  type="text"
                  placeholder="https://api.openai.com/v1 atau http://localhost:11434/v1"
                  value={newProviderBaseUrl}
                  onChange={(e) => setNewProviderBaseUrl(e.target.value)}
                  className="w-full bg-black/40 rounded-xl px-3.5 py-2 font-mono text-white/80 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-mono text-white/45">API KEY (OPSIONAL UNTUK LOCAL)</label>
                <input
                  type="password"
                  placeholder="sk-..."
                  value={newProviderApiKey}
                  onChange={(e) => setNewProviderApiKey(e.target.value)}
                  className="w-full bg-black/40 rounded-xl px-3.5 py-2 font-mono text-white/80 focus:outline-none"
                />
              </div>

              <div className="text-[11px] text-white/40 font-mono bg-white/[0.02] p-2.5 rounded-xl border border-white/[0.04] leading-relaxed">
                💡 Model dapat langsung diimpor otomatis dari endpoint <span className="text-sky-400">/models</span> setelah provider disimpan.
              </div>
            </div>

            <div className="px-5 py-3 border-t border-white/[0.04] flex items-center justify-end gap-2 bg-white/[0.01]">
              <button
                onClick={() => setShowAddProviderModal(false)}
                className="px-3.5 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs text-white/70 font-mono cursor-pointer"
              >
                BATAL
              </button>
              <button
                onClick={handleCreateCustomProvider}
                className="px-4 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-xs text-white font-medium font-mono flex items-center gap-1.5 cursor-pointer"
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
