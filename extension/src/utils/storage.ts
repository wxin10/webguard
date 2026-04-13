export interface DetectionResult {
  url: string;
  label: 'safe' | 'suspicious' | 'malicious' | 'unknown';
  risk_score: number;
  rule_score?: number;
  model_safe_prob?: number;
  model_suspicious_prob?: number;
  model_malicious_prob?: number;
  hit_rules?: Array<Record<string, unknown>>;
  explanation: string;
  recommendation: string;
  record_id?: number;
  timestamp: number;
}

export interface ExtensionSettings {
  apiBaseUrl: string;
  frontendBaseUrl: string;
  autoDetect: boolean;
  autoBlockMalicious: boolean;
}

const defaultSettings: ExtensionSettings = {
  apiBaseUrl: 'http://127.0.0.1:8000',
  frontendBaseUrl: 'http://127.0.0.1:5173',
  autoDetect: true,
  autoBlockMalicious: true,
};

export async function saveDetectionResult(result: DetectionResult): Promise<void> {
  await chrome.storage.local.set({ lastDetectionResult: result });
}

export async function getLastDetectionResult(): Promise<DetectionResult | null> {
  const result = await chrome.storage.local.get('lastDetectionResult');
  return result.lastDetectionResult || null;
}

export async function saveSettings(settings: Partial<ExtensionSettings>): Promise<void> {
  const currentSettings = await getSettings();
  await chrome.storage.local.set({ settings: { ...currentSettings, ...settings } });
}

export async function getSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.local.get(['settings', 'apiBaseUrl']);
  return {
    ...defaultSettings,
    ...(result.settings || {}),
    ...(result.apiBaseUrl ? { apiBaseUrl: result.apiBaseUrl } : {}),
  };
}
