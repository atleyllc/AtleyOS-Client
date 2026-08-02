export type PairPayload = {
  v: number;
  product: string;
  kind: string;
  code: string;
  pair_secret: string;
  expires_at: number;
  host_public_key?: string;
  host_overlay_ip?: string;
  listen_port?: number;
  lan_api_base: string;
  overlay_api_base?: string;
  relay_url?: string;
  pin?: string;
};

export type Session = {
  deviceId: string;
  apiToken: string;
  refreshToken: string;
  lanApiBase: string;
  overlayApiBase: string;
  hostPublicKey?: string;
  pin?: string;
  overlayIp?: string;
  wgClientConf?: string | null;
  relayUrl?: string;
  deviceLabel: string;
  platform: string;
  learningConsentAt?: number;
};

export type HomeApp = {
  id: string;
  title: string;
  app: string;
  native_schemes?: string[];
  store?: { ios?: string; android?: string };
  overlay_url: string;
  lan_url: string;
};

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type SyncStatus = {
  lastSyncAt?: number;
  pending: number;
  lastError?: string;
  sources: Record<string, { granted: boolean; lastCount?: number }>;
};
