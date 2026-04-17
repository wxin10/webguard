import {
  addTrustedHost,
  getSettings,
  pauseHostProtection,
  resumeHostProtection,
  savePluginPolicySnapshot,
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
  plugin_default_config?: {
    api_base_url?: string;
    web_base_url?: string;
    auto_detect?: boolean;
    auto_block_malicious?: boolean;
    notify_suspicious?: boolean;
    event_upload_enabled?: boolean;
  };
  current_rule_version?: string;
  generated_at?: string;
}

interface RequestOptions {
  timeoutMs?: number;
  apiBaseUrl?: string;
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
    const payload = await requestApi<unknown>('/api/v1/plugin/bootstrap', {
      method: 'GET',
      headers: webGuardHeaders(),
    });
    const policy = normalizePluginBootstrap(unwrapData(payload));
    await savePluginPolicySnapshot(policy);
    return policy;
  } catch (error) {
    console.warn('[WebGuard] Bootstrap sync failed.', error);
    return null;
  }
}

export const syncPluginPolicy = syncPluginBootstrap;

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
  void syncPluginBootstrap();
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
        reason: `浏览器插件临时信任 ${minutes} 分钟`,
        source: 'plugin',
        minutes,
      }),
    });
    await pauseHostProtection(cleanHost, minutes);
    await syncPluginEvent({
      event_type: 'temporary_trust',
      action: 'pause_site',
      domain: cleanHost,
      summary: `用户在插件中临时信任 ${minutes} 分钟`,
      metadata: { minutes },
    });
    void syncPluginBootstrap();
    return 'synced';
  } catch (error) {
    console.warn('[WebGuard] Temporary trust sync failed, keeping a local runtime fallback.', error);
    await pauseHostProtection(cleanHost, minutes);
    await syncPluginEvent({
      event_type: 'temporary_trust',
      action: 'pause_site_offline_cached',
      domain: cleanHost,
      summary: `后端暂不可用，插件仅保留本地临时信任 ${minutes} 分钟`,
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
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`后端返回异常：HTTP ${response.status}`);
    }

    try {
      return await response.json() as T;
    } catch (error) {
      throw new Error(`后端响应不是有效 JSON：${errorMessage(error)}`);
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`请求超时：${timeoutMs}ms`);
    }
    throw error instanceof Error ? error : new Error('网络请求失败');
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

function normalizePluginBootstrap(value: unknown): PluginPolicySnapshot {
  if (!isRecord(value)) {
    throw new Error('后端 bootstrap 响应无效');
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
    username: 'platform-user',
    pluginVersion: PLUGIN_VERSION,
    ruleVersion: typeof bootstrap.current_rule_version === 'string' ? bootstrap.current_rule_version : 'unknown',
    userTrustedHosts: normalizeHostArray(bootstrap.trusted_hosts),
    userBlockedHosts: normalizeHostArray(bootstrap.blocked_hosts),
    userPausedHosts: normalizePausedPolicy(bootstrap.temp_bypass_records),
    globalTrustedHosts: [],
    globalBlockedHosts: [],
    defaultSettings,
    userPolicy: {
      autoDetect: userPolicy.auto_detect,
      autoBlockMalicious: userPolicy.auto_block_malicious,
      notifySuspicious: userPolicy.notify_suspicious,
      bypassDurationMinutes: userPolicy.bypass_duration_minutes,
      pluginEnabled: userPolicy.plugin_enabled,
    },
    syncedAt: Date.now(),
  };
}

function validateDetectionResult(value: unknown, fallbackUrl: string): DetectionResult {
  if (!isRecord(value)) {
    throw new Error('后端响应缺少检测结果对象');
  }

  const label = parseRiskLabel(value.label);
  if (!label) {
    throw new Error('后端响应缺少有效 label 字段');
  }

  const riskScore = parseRiskScore(value.risk_score);
  if (riskScore === null) {
    throw new Error('后端响应缺少有效 risk_score 字段');
  }

  const summary = firstNonEmptyString(value.summary, value.reason, value.explanation);
  if (!summary) {
    throw new Error('后端响应缺少 summary 或 reason 字段');
  }

  const recordId = parseOptionalNumber(value.record_id);
  const reportId = parseOptionalNumber(value.report_id);

  return {
    url: typeof value.url === 'string' && value.url ? value.url : fallbackUrl,
    label,
    risk_score: riskScore,
    summary,
    reason: firstNonEmptyString(value.reason),
    explanation: firstNonEmptyString(value.explanation),
    recommendation: firstNonEmptyString(value.recommendation),
    ...(typeof recordId === 'number' ? { record_id: recordId } : {}),
    ...(typeof reportId === 'number' ? { report_id: reportId } : {}),
    rule_score: parseOptionalNumber(value.rule_score),
    model_safe_prob: parseOptionalNumber(value.model_safe_prob),
    model_suspicious_prob: parseOptionalNumber(value.model_suspicious_prob),
    model_malicious_prob: parseOptionalNumber(value.model_malicious_prob),
    hit_rules: parseHitRules(value.hit_rules),
    timestamp: Date.now(),
  };
}

function unwrapData(payload: unknown): unknown {
  if (isRecord(payload) && 'data' in payload) return payload.data;
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

function parseRiskLabel(value: unknown): RiskLabel | null {
  if (value === 'safe' || value === 'suspicious' || value === 'malicious' || value === 'unknown') return value;
  return null;
}

function parseRiskScore(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return clampRiskScore(value);
  if (typeof value === 'string') {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) return clampRiskScore(numericValue);
  }
  return null;
}

function clampRiskScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function parseOptionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) return numericValue;
  }
  return undefined;
}

function parseHitRules(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(isRecord);
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim();
}

function webGuardHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-WebGuard-User': 'platform-user',
    'X-WebGuard-Role': 'user',
  };
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}
