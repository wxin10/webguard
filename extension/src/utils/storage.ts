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

export interface UserSiteStrategy {
  id: number;
  domain: string;
  strategy_type: 'trusted' | 'blocked' | 'paused';
  reason?: string;
  source?: string;
  expires_at?: string;
  is_active: boolean;
}

export interface UserStrategyOverview {
  trusted_sites: UserSiteStrategy[];
  blocked_sites: UserSiteStrategy[];
  paused_sites: UserSiteStrategy[];
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
  try {
    await postUserStrategy('/api/v1/user/trusted-sites', {
      domain: normalizedHost,
      reason: '浏览器助手加入信任站点',
      source: 'plugin',
    });
    await refreshStrategyCache();
    return;
  } catch {
    // 后端离线时保留本地兜底缓存，恢复连接后 Web 平台策略仍是主数据源。
  }
  const sites = await getTrustedSites();
  const next = sites.some((site) => site.host === normalizedHost)
    ? sites
    : [...sites, { host: normalizedHost, addedAt: Date.now() }];
  await chrome.storage.local.set({ trustedSites: next });
}

export async function getTrustedSites(): Promise<TrustedSite[]> {
  try {
    const strategies = await refreshStrategyCache();
    return strategies.trusted_sites.map((item) => ({ host: item.domain, addedAt: Date.now() }));
  } catch {
    // 使用本地缓存作为离线兜底。
  }
  const result = await chrome.storage.local.get('trustedSites');
  return Array.isArray(result.trustedSites) ? result.trustedSites : [];
}

export async function isTrustedHost(host: string): Promise<boolean> {
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost) return false;
  const strategy = await getStrategyForHost(normalizedHost);
  if (strategy === 'trusted') return true;
  const sites = await getTrustedSites();
  return sites.some((site) => site.host === normalizedHost);
}

export async function pauseHostProtection(host: string, minutes = 30): Promise<void> {
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost) return;
  try {
    await postUserStrategy('/api/v1/user/site-actions/pause', {
      domain: normalizedHost,
      reason: `浏览器助手临时忽略 ${minutes} 分钟`,
      source: 'plugin',
      minutes,
    });
    await refreshStrategyCache();
    return;
  } catch {
    // 后端离线时保留本地兜底缓存。
  }
  const result = await chrome.storage.local.get('pausedHosts');
  const pausedHosts = result.pausedHosts || {};
  pausedHosts[normalizedHost] = Date.now() + minutes * 60 * 1000;
  await chrome.storage.local.set({ pausedHosts });
}

export async function resumeHostProtection(host: string): Promise<void> {
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost) return;
  try {
    await postUserStrategy('/api/v1/user/site-actions/resume', {
      domain: normalizedHost,
      reason: '浏览器助手恢复保护',
      source: 'plugin',
    });
    await refreshStrategyCache();
  } finally {
    const result = await chrome.storage.local.get('pausedHosts');
    const pausedHosts = result.pausedHosts || {};
    delete pausedHosts[normalizedHost];
    await chrome.storage.local.set({ pausedHosts });
  }
}

export async function isHostPaused(host: string): Promise<boolean> {
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost) return false;
  const strategy = await getStrategyForHost(normalizedHost);
  if (strategy === 'paused') return true;
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

export async function getStrategyForHost(host: string): Promise<'trusted' | 'blocked' | 'paused' | null> {
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost) return null;
  try {
    const strategies = await refreshStrategyCache();
    if (strategies.trusted_sites.some((item) => normalizeHost(item.domain) === normalizedHost)) return 'trusted';
    if (strategies.blocked_sites.some((item) => normalizeHost(item.domain) === normalizedHost)) return 'blocked';
    if (strategies.paused_sites.some((item) => normalizeHost(item.domain) === normalizedHost)) return 'paused';
  } catch {
    const cache = await chrome.storage.local.get('userStrategyCache');
    const strategies = cache.userStrategyCache as UserStrategyOverview | undefined;
    if (strategies?.trusted_sites.some((item) => normalizeHost(item.domain) === normalizedHost)) return 'trusted';
    if (strategies?.blocked_sites.some((item) => normalizeHost(item.domain) === normalizedHost)) return 'blocked';
    if (strategies?.paused_sites.some((item) => normalizeHost(item.domain) === normalizedHost)) return 'paused';
  }
  return null;
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

async function refreshStrategyCache(): Promise<UserStrategyOverview> {
  const settings = await getSettings();
  const response = await fetch(`${settings.apiBaseUrl}/api/v1/user/strategies`, {
    method: 'GET',
    headers: webGuardHeaders(),
  });
  if (!response.ok) throw new Error(`Strategy request failed: ${response.status}`);
  const payload = await response.json();
  const data = payload.data as UserStrategyOverview;
  await chrome.storage.local.set({ userStrategyCache: data });
  return data;
}

async function postUserStrategy(path: string, body: Record<string, unknown>): Promise<void> {
  const settings = await getSettings();
  const response = await fetch(`${settings.apiBaseUrl}${path}`, {
    method: 'POST',
    headers: webGuardHeaders(),
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Strategy update failed: ${response.status}`);
}

function webGuardHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-WebGuard-User': 'platform-user',
    'X-WebGuard-Role': 'user',
  };
}
