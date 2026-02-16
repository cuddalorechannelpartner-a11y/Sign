
export interface SignatureData {
  id: string;
  type: 'consumer' | 'witness' | 'seal';
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface DocumentLog {
  id: string;
  timestamp: string;
  userName: string;
  fileName: string;
}

export interface AdminSettings {
  companySealUrl: string | null;
}

export enum ViewMode {
  EDITOR = 'EDITOR',
  ADMIN_LOGIN = 'ADMIN_LOGIN',
  ADMIN_DASHBOARD = 'ADMIN_DASHBOARD'
}
