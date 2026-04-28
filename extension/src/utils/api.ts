import { parseDetectionResult } from './detection.js';
import {
  addTrustedHost,
  ensurePluginInstanceId,
  getPluginPolicySnapshot,
  getSettings,
  isPluginPolicySnapshotStale,
  pauseHostProtection,
  resumeHostProtection,
  savePluginPolicySnapshot,
  saveSettings,
} from './storage.js';
import type { DetectionResult, ExtensionSettings, PageInfo, PausedHostRecord, PluginPolicySnapshot, RiskLabel } from './storage.js';

export interface BackendHealth {
  ok: boolean;
  message: string;
  latencyMs?: number;
}

export type UserDecisionSyncStatus = 'synced' | 'offline-cache';

export interface PluginSyncEventRequest {
  event_type: 'scan' | 'warning' | 'bypass' | 'trust' | 'temporary_trust' | 'feedback' | 'error';
  action?: string;
  url?: string;
  host?: string;
  domain?: string;
  risk_level?: RiskLabel;
  risk_label?: RiskLabel;
  risk_score?: number;
  summary?: string;
  scan_record_id?: number;
  plugin_version?: string;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface FeedbackRequest {
  url: string;
  feedback_type: 'false_positive' | 'false_negative' | 'other';
  comment: string;
  report_id?: number;
}

export interface PluginBindingChallengeResponse {
  challenge_id: string;
  binding_code: string;
  verification_url: string;
  expires_at: string;
}

export interface PluginTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  plugin_instance_id: string;
}

interface PluginBootstrapResponse {
  user_policy?: {
    auto_detect?: boolean;
    auto_block_malicious?: boolean;
    notify_suspicious?: boolean;
    bypass_duration_minutes?: number;
    plugin_enabled?: boolean;
  };
  trusted_hosts?: string[];
  blocked_hosts?: string[];
  temp_bypass_records?: Array<{ domain?: string; host?: string; expires_at?: string | null; reason?: string | null }>;
  whitelist_domains?: {
    user?: string[];
    global?: string[];
    all?: string[];
  };
  blacklist_domains?: {
    user?: string[];
    global?: string[];
    all?: string[];
  };
  temporary_trusted_domains?: Array<{ domain?: string; host?: string; expires_at?: string | null; reason?: string | null }>;
  plugin_default_config?: {
    api_base_url?: string;
    web_base_url?: string;
    auto_detect?: boolean;
    auto_block_malicious?: boolean;
    notify_suspicious?: boolean;
    event_upload_enabled?: boolean;
  };
  policy_version?: string;
  config_version?: string;
  current_rule_version?: string;
  updated_at?: string;
  generated_at?: string;
}

interface RequestOptions {
  timeoutMs?: number;
  apiBaseUrl?: string;
  skipTokenRefresh?: boolean;
}

interface ApiEnvelope<T> {
  code?: number;
  message?: string;
  data?: T | null;
  success?: boolean;
}

const DEFAULT_TIMEOUT_MS = 5000;
const PLUGIN_VERSION = chrome.runtime.getManifest().version || '1.0.0';

export async function analyzeCurrentPage(data: PageInfo): Promise<DetectionResult> {
  const payload = await requestApi<unknown>('/api/v1/plugin/analyze-current', {
    method: 'POST',
    headers: webGuardHeaders(),
    body: JSON.stringify(data),
  });
  return validateDetectionResult(unwrapData(payload), data.url);
}

export async function testBackendConnection(apiBaseUrl?: string): Promise<BackendHealth> {
  const startedAt = Date.now();
  try {
    await requestApi<unknown>('/health', { method: 'GET' }, { timeoutMs: DEFAULT_TIMEOUT_MS, apiBaseUrl });
    return {
      ok: true,
      message: '后端连接正常',
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error),
    };
  }
}

export async function syncPluginBootstrap(): Promise<PluginPolicySnapshot | null> {
  try {
    return await fetchAndSavePluginBootstrap();
  } catch (error) {
    console.warn('[WebGuard] Bootstrap sync failed.', error);
    return null;
  }
}

export const syncPluginPolicy = syncPluginBootstrap;

export async function ensurePluginBootstrapFresh(force = false): Promise<PluginPolicySnapshot | null> {
  const snapshot = await getPluginPolicySnapshot();
  if (!force && !isPluginPolicySnapshotStale(snapshot)) {
    return snapshot;
  }
  return syncPluginBootstrap();
}

export async function testPluginBootstrapConnection(): Promise<PluginPolicySnapshot> {
  return fetchAndSavePluginBootstrap();
}

export async function createPluginBindingChallenge(): Promise<PluginBindingChallengeResponse> {
  const settings = await getSettings();
  const pluginInstanceId = await ensurePluginInstanceId();
  const payload = await requestApi<unknown>('/api/v1/plugin/binding-challenges', {
    method: 'POST',
    headers: webGuardHeaders(),
    body: JSON.stringify({ web_base_url: settings.webBaseUrl }),
  });
  const data = unwrapData(payload) as PluginBindingChallengeResponse;
  await saveSettings({
    pluginInstanceId,
    pendingBindingChallengeId: data.challenge_id,
    pendingBindingCode: data.binding_code,
    pendingBindingVerificationUrl: data.verification_url,
  });
  return data;
}

export async function exchangePluginBindingToken(challengeId?: string, bindingCode?: string): Promise<PluginTokenResponse> {
  const settings = await getSettings();
  const pluginInstanceId = await ensurePluginInstanceId();
  const resolvedChallengeId = challengeId || settings.pendingBindingChallengeId || '';
  const resolvedBindingCode = bindingCode || settings.pendingBindingCode || '';
  if (!resolvedChallengeId || !resolvedBindingCode) {
    throw new Error('Missing pending binding challenge or binding code.');
  }
  const payload = await requestApi<unknown>('/api/v1/plugin/token', {
    method: 'POST',
    headers: webGuardHeaders(),
    body: JSON.stringify({
      challenge_id: resolvedChallengeId,
      binding_code: resolvedBindingCode,
    }),
  }, { skipTokenRefresh: true });
  const data = unwrapData(payload) as PluginTokenResponse;
  await saveSettings({
    pluginInstanceId,
    pluginAccessToken: data.access_token,
    pluginRefreshToken: data.refresh_token,
    pluginTokenExpiresAt: Date.now() + Math.max(data.expires_in, 1) * 1000,
    pendingBindingChallengeId: undefined,
    pendingBindingCode: undefined,
    pendingBindingVerificationUrl: undefined,
  });
  return data;
}

export async function syncPluginEvent(data: PluginSyncEventRequest): Promise<void> {
  const settings = await getSettings();
  if (settings.eventUploadEnabled === false) return;

  try {
    await requestApi<unknown>('/api/v1/plugin/events', {
      method: 'POST',
      headers: webGuardHeaders(),
      body: JSON.stringify({
        ...data,
        domain: data.domain || data.host,
        risk_level: data.risk_level || data.risk_label,
        risk_label: data.risk_label || data.risk_level,
        plugin_version: data.plugin_version || PLUGIN_VERSION,
        payload: data.payload || data.metadata || {},
        metadata: data.metadata || data.payload || {},
      }),
    });
  } catch (error) {
    console.warn('[WebGuard] Plugin event upload failed.', error);
  }
}

export async function submitFeedback(data: FeedbackRequest): Promise<void> {
  await requestApi<unknown>('/api/v1/plugin/feedback', {
    method: 'POST',
    headers: webGuardHeaders(),
    body: JSON.stringify(data),
  });

  await syncPluginEvent({
    event_type: 'feedback',
    action: data.feedback_type,
    url: data.url,
    domain: hostFromUrl(data.url),
    summary: data.comment,
    scan_record_id: data.report_id,
  });
}

export async function trustSite(host: string): Promise<UserDecisionSyncStatus> {
  const cleanHost = normalizeHost(host);
  if (!cleanHost) throw new Error('无法识别当前站点域名。');

  await requestApi<unknown>('/api/v1/my/domains', {
    method: 'POST',
    headers: webGuardHeaders(),
    body: JSON.stringify({
      host: cleanHost,
      list_type: 'trusted',
      reason: '浏览器插件永久信任当前站点',
      source: 'plugin',
    }),
  });

  await addTrustedHost(cleanHost);
  await syncPluginEvent({
    event_type: 'trust',
    action: 'permanent_trust',
    domain: cleanHost,
    summary: '用户在插件中永久信任当前站点',
  });
  await syncPluginBootstrap();
  return 'synced';
}

export async function pauseSite(host: string, minutes = 30): Promise<UserDecisionSyncStatus> {
  const cleanHost = normalizeHost(host);
  if (!cleanHost) throw new Error('无法识别当前站点域名。');

  try {
    await requestApi<unknown>('/api/v1/my/domains', {
      method: 'POST',
      headers: webGuardHeaders(),
      body: JSON.stringify({
        host: cleanHost,
        list_type: 'temp_bypass',
        reason: `浏览器助手暂时信任此网站 ${minutes} 分钟`,
        source: 'plugin',
        minutes,
      }),
    });
    await pauseHostProtection(cleanHost, minutes);
    await syncPluginEvent({
      event_type: 'temporary_trust',
      action: 'pause_site',
      domain: cleanHost,
      summary: `用户在浏览器助手中暂时信任此网站 ${minutes} 分钟`,
      metadata: { minutes },
    });
    await syncPluginBootstrap();
    return 'synced';
  } catch (error) {
    console.warn('[WebGuard] Temporary trust sync failed, keeping a local runtime cache.', error);
    await pauseHostProtection(cleanHost, minutes);
    await syncPluginEvent({
      event_type: 'temporary_trust',
      action: 'pause_site_offline_cached',
      domain: cleanHost,
      summary: `平台暂不可用，浏览器助手已暂时信任此网站 ${minutes} 分钟`,
      metadata: { minutes },
    });
    return 'offline-cache';
  }
}

export async function resumeSite(host: string): Promise<UserDecisionSyncStatus> {
  const cleanHost = normalizeHost(host);
  await resumeHostProtection(cleanHost);
  return 'synced';
}

async function requestApi<T>(path: string, init: RequestInit, options: RequestOptions = {}): Promise<T> {
  const settings = await getSettings();
  const apiBaseUrl = (options.apiBaseUrl || settings.apiBaseUrl).replace(/\/+$/, '');
  const url = new URL(path, `${apiBaseUrl}/`).toString();
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = withAuthHeaders(init.headers, settings);
    const response = await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
    });

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new Error(`后端响应不是有效 JSON: ${errorMessage(error)}`);
    }

    if (isApiEnvelope(payload)) {
      if (response.status === 401 && !options.skipTokenRefresh && await refreshPluginAccessTokenIfPossible()) {
        return requestApi<T>(path, init, { ...options, skipTokenRefresh: true });
      }
      if (payload.code !== undefined && payload.code !== 0) {
        throw new Error(payload.message || `后端返回异常: HTTP ${response.status}`);
      }
      if (!response.ok) {
        throw new Error(payload.message || `后端返回异常: HTTP ${response.status}`);
      }
      return payload as T;
    }

    if (response.status === 401 && !options.skipTokenRefresh && await refreshPluginAccessTokenIfPossible()) {
      return requestApi<T>(path, init, { ...options, skipTokenRefresh: true });
    }

    if (!response.ok) {
      throw new Error(`后端返回异常: HTTP ${response.status}`);
    }

    return payload as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`请求超时: ${timeoutMs}ms`);
    }
    throw error instanceof Error ? error : new Error('网络请求失败');
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export function parsePluginBootstrapSnapshot(value: unknown): PluginPolicySnapshot {
  if (!isRecord(value)) {
    throw new Error('平台策略同步响应无效');
  }

  const bootstrap = value as PluginBootstrapResponse;
  const defaults = bootstrap.plugin_default_config || {};
  const userPolicy = bootstrap.user_policy || {};
  const defaultSettings: Partial<ExtensionSettings> = {
    ...(typeof defaults.api_base_url === 'string' ? { apiBaseUrl: defaults.api_base_url } : {}),
    ...(typeof defaults.web_base_url === 'string' ? { webBaseUrl: defaults.web_base_url } : {}),
    ...(typeof defaults.auto_detect === 'boolean' ? { autoDetect: defaults.auto_detect } : {}),
    ...(typeof defaults.auto_block_malicious === 'boolean' ? { autoBlockMalicious: defaults.auto_block_malicious } : {}),
    ...(typeof defaults.notify_suspicious === 'boolean' ? { notifySuspicious: defaults.notify_suspicious } : {}),
    ...(typeof defaults.event_upload_enabled === 'boolean' ? { eventUploadEnabled: defaults.event_upload_enabled } : {}),
  };

  return {
    username: typeof (bootstrap.user_policy as { username?: unknown } | undefined)?.username === 'string'
      ? (bootstrap.user_policy as { username: string }).username
      : 'platform-user',
    pluginVersion: PLUGIN_VERSION,
    ruleVersion: typeof bootstrap.current_rule_version === 'string' ? bootstrap.current_rule_version : 'unknown',
    ...(typeof bootstrap.policy_version === 'string' ? { policyVersion: bootstrap.policy_version } : {}),
    ...(typeof bootstrap.config_version === 'string' ? { configVersion: bootstrap.config_version } : {}),
    userTrustedHosts: normalizeHostArray(bootstrap.whitelist_domains?.user ?? bootstrap.trusted_hosts),
    userBlockedHosts: normalizeHostArray(bootstrap.blacklist_domains?.user ?? bootstrap.blocked_hosts),
    userPausedHosts: normalizePausedPolicy(bootstrap.temporary_trusted_domains ?? bootstrap.temp_bypass_records),
    globalTrustedHosts: normalizeHostArray(bootstrap.whitelist_domains?.global),
    globalBlockedHosts: normalizeHostArray(bootstrap.blacklist_domains?.global),
    defaultSettings,
    userPolicy: {
      autoDetect: userPolicy.auto_detect,
      autoBlockMalicious: userPolicy.auto_block_malicious,
      notifySuspicious: userPolicy.notify_suspicious,
      bypassDurationMinutes: userPolicy.bypass_duration_minutes,
      pluginEnabled: userPolicy.plugin_enabled,
    },
    ...(typeof bootstrap.updated_at === 'string' && Number.isFinite(Date.parse(bootstrap.updated_at))
      ? { updatedAt: Date.parse(bootstrap.updated_at) }
      : {}),
    syncedAt: Date.now(),
  };
}

async function fetchAndSavePluginBootstrap(): Promise<PluginPolicySnapshot> {
  const payload = await requestApi<unknown>('/api/v1/plugin/bootstrap', {
    method: 'GET',
    headers: webGuardHeaders(),
  });
  const policy = parsePluginBootstrapSnapshot(unwrapData(payload));
  await savePluginPolicySnapshot(policy);
  return policy;
}

function validateDetectionResult(value: unknown, fallbackUrl: string): DetectionResult {
  return parseDetectionResult(value, fallbackUrl);
}

function unwrapData(payload: unknown): unknown {
  if (isApiEnvelope(payload)) return payload.data;
  return payload;
}

function normalizeHostArray(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => typeof item === 'string' ? normalizeHost(item) : '').filter(Boolean))]
    : [];
}

function normalizePausedPolicy(value: unknown): PausedHostRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!isRecord(item)) return null;
      const rawHost = typeof item.domain === 'string' ? item.domain : typeof item.host === 'string' ? item.host : '';
      const host = normalizeHost(rawHost);
      const expiresAt = typeof item.expires_at === 'string' ? Date.parse(item.expires_at) : 0;
      if (!host || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
      return { host, addedAt: Date.now(), expiresAt };
    })
    .filter((item): item is PausedHostRecord => Boolean(item));
}

function webGuardHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-WebGuard-User': 'platform-user',
    'X-WebGuard-Role': 'user',
  };
}

function withAuthHeaders(headers: HeadersInit | undefined, settings: ExtensionSettings): Headers {
  const next = new Headers(headers);
  if (!next.has('Content-Type')) next.set('Content-Type', 'application/json');
  next.set('X-Plugin-Version', PLUGIN_VERSION);
  if (settings.pluginInstanceId) {
    next.set('X-Plugin-Instance-Id', settings.pluginInstanceId);
  }
  const token = settings.pluginAccessToken || settings.accessToken;
  if (token) {
    next.set('Authorization', `Bearer ${token}`);
  }
  return next;
}

async function refreshPluginAccessTokenIfPossible(): Promise<boolean> {
  const settings = await getSettings();
  if (!settings.pluginRefreshToken || !settings.pluginInstanceId) return false;
  try {
    const payload = await requestApi<unknown>('/api/v1/plugin/token/refresh', {
      method: 'POST',
      headers: webGuardHeaders(),
      body: JSON.stringify({ refresh_token: settings.pluginRefreshToken }),
    }, { skipTokenRefresh: true });
    const data = unwrapData(payload) as PluginTokenResponse;
    await saveSettings({
      pluginAccessToken: data.access_token,
      pluginRefreshToken: data.refresh_token,
      pluginTokenExpiresAt: Date.now() + Math.max(data.expires_in, 1) * 1000,
    });
    return true;
  } catch (error) {
    console.warn('[WebGuard] Plugin token refresh failed.', error);
    await saveSettings({
      pluginAccessToken: undefined,
      pluginRefreshToken: undefined,
      pluginTokenExpiresAt: undefined,
    });
    return false;
  }
}

function hostFromUrl(url: string): string {
  try {
    return normalizeHost(new URL(url).hostname);
  } catch {
    return '';
  }
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^www\./, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isApiEnvelope(value: unknown): value is ApiEnvelope<unknown> {
  return isRecord(value) && ('code' in value || 'message' in value || 'data' in value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}
