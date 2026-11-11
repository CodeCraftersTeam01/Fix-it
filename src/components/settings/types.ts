export interface ProviderModel {
  id: string;
  name: string;
  description?: string;
}

export interface CustomProvider {
  id: string;
  name: string;
  protocol: 'openai' | 'anthropic';
  base_url: string;
  api_keys: string[];
  active_model: string;
  available_models: ProviderModel[];
}

export interface AIProvider {
  id: string;
  name: string;
  category: 'custom' | 'default';
  protocol: 'openai' | 'anthropic' | 'gemini';
  base_url: string;
  api_keys: string[];
  active_model: string;
  available_models: ProviderModel[];
  badge?: string;
  connectionsCount?: number;
}

export interface AppSettings {
  openai_base_url: string;
  openai_api_key: string;
  model_name: string;
  idle_delay_ms: number;
  watched_paths: string[];
  active_provider?: string;
  custom_providers?: CustomProvider[];
}
