export interface CodeError {
  file_path: string;
  line_number?: number;
  error_type: string;
  raw_message: string;
  snippet?: string;
  project_name?: string;
}

export interface FixExplanation {
  summary: string;
  why_it_happened: string;
  steps: string[];
  code_hint?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  timestamp: number;
}

export interface FileActivity {
  file_path: string;
  file_name: string;
  project: string;
  editor: string;
  status: string;
  timestamp: number;
}

export interface ActiveErrorItem {
  id: string; // file_path
  error: CodeError;
  explanation: FixExplanation;
  hit_count: number;
  is_looping: boolean;
  timestamp: number;
}

