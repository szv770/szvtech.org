
export type PlatformType = 
  | 'WhatsApp' 
  | 'Instagram' 
  | 'Email' 
  | 'Telegram' 
  | 'Facebook' 
  | 'X' 
  | 'Discord' 
  | 'TikTok'
  | 'Signal';

export interface LogEntry {
  text: string;
  category: 'system' | 'network' | 'exploit' | 'decryption' | 'success';
  timestamp: string;
}

export interface AppState {
  view: 'HUB' | 'CONFIG' | 'VERIFYING' | 'PROCESS' | 'SUCCESS';
  platform: PlatformType | null;
  identity: string;
  progress: number;
  stageIndex: number;
  logs: LogEntry[];
  isTerminalOpen: boolean;
  resultData: any;
}

export interface PlatformConfig {
  id: PlatformType;
  label: string;
  actionLabel: string;
  placeholder: string;
  pattern: RegExp;
  hint: string;
  color: string;
  iconPath: string;
}

export interface Vulnerability {
  id: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
}

export interface PortInfo {
  port: number;
  protocol: string;
  state: string;
  service: string;
  version: string;
}

export interface ScanResult {
  target: string;
  ports: PortInfo[];
  vulnerabilities: Vulnerability[];
}
