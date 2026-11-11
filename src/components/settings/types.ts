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

export interface DefaultProviderInfo {
  id: string;
  name: string;
  connections: number;
  badge: string;
  badgeType?: 'primary' | 'rpm' | 'chat' | 'lpu';
  iconType: 'sparkle' | 'cpu' | 'alert' | 'cube';
  defaultModel: string;
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

