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

export interface TrustedSite {
  host: string;
  addedAt: number;
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

export async function addTrustedSite(host: string): Promise<void> {
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost) return;
  const sites = await getTrustedSites();
  const next = sites.some((site) => site.host === normalizedHost)
    ? sites
    : [...sites, { host: normalizedHost, addedAt: Date.now() }];
  await chrome.storage.local.set({ trustedSites: next });
}

export async function getTrustedSites(): Promise<TrustedSite[]> {
  const result = await chrome.storage.local.get('trustedSites');
  return Array.isArray(result.trustedSites) ? result.trustedSites : [];
}

export async function isTrustedHost(host: string): Promise<boolean> {
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost) return false;
  const sites = await getTrustedSites();
  return sites.some((site) => site.host === normalizedHost);
}

export async function pauseHostProtection(host: string, minutes = 30): Promise<void> {
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost) return;
  const result = await chrome.storage.local.get('pausedHosts');
  const pausedHosts = result.pausedHosts || {};
  pausedHosts[normalizedHost] = Date.now() + minutes * 60 * 1000;
  await chrome.storage.local.set({ pausedHosts });
}

export async function isHostPaused(host: string): Promise<boolean> {
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost) return false;
  const result = await chrome.storage.local.get('pausedHosts');
  const pausedHosts = result.pausedHosts || {};
  const expiresAt = pausedHosts[normalizedHost];
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    delete pausedHosts[normalizedHost];
    await chrome.storage.local.set({ pausedHosts });
    return false;
  }
  return true;
}

export function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^www\./, '');
}
