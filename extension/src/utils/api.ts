import {
  addTrustedHost,
  getSettings,
  pauseHostProtection,
  resumeHostProtection,
  savePluginPolicySnapshot,
} from './storage.js';
import type { DetectionResult, PageInfo, PausedHostRecord, PluginPolicySnapshot, RiskLabel } from './storage.js';

export interface FeedbackRequest {
  url: string;
  feedback_type: 'false_positive' | 'unsafe' | 'other';
  comment: string;
}

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
  domain?: string;
  risk_label?: RiskLabel;
  risk_score?: number;
  summary?: string;
  scan_record_id?: number;
  plugin_version?: string;
  metadata?: Record<string, unknown>;
}

interface PluginPolicyResponse {
  username: string;
  plugin_version: string;
  rule_version: string;
  user_trusted_hosts: string[];
  user_blocked_hosts: string[];
  user_paused_hosts: Array<{ domain: string; expires_at?: string | null; reason?: string | null }>;
  global_trusted_hosts: string[];
  global_blocked_hosts: string[];
}

interface PluginBootstrapResponse {
  trusted_hosts?: string[];
  blocked_hosts?: string[];
  temp_bypass_records?: Array<{ domain: string; expires_at?: string | null; reason?: string | null }>;
  current_rule_version?: string;
}

interface RequestOptions {
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5000;

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
    await requestApi<unknown>('/health', { method: 'GET' }, { timeoutMs: DEFAULT_TIMEOUT_MS }, apiBaseUrl);
    return {
      ok: true,
      message: '后端连接正常',
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : '后端连接失败',
    };
  }
}

export async function syncPluginPolicy(): Promise<PluginPolicySnapshot | null> {
  try {
    const payload = await requestApi<unknown>('/api/v1/plugin/bootstrap', {
      method: 'GET',
      headers: webGuardHeaders(),
    });
    const data = unwrapData(payload);
    const policy = normalizePluginPolicy(data);
    await savePluginPolicySnapshot(policy);
    return policy;
  } catch (error) {
    console.warn('[WebGuard] Plugin policy sync failed.', error);
    return null;
  }
}

export async function syncPluginEvent(data: PluginSyncEventRequest): Promise<void> {
  try {
    await requestApi<unknown>('/api/v1/plugin/events', {
      method: 'POST',
      headers: webGuardHeaders(),
      body: JSON.stringify({
        ...data,
        plugin_version: data.plugin_version || '1.0.0',
        metadata: data.metadata || {},
      }),
    });
  } catch (error) {
    console.warn('[WebGuard] Plugin event sync failed.', error);
  }
}

export async function checkBackend(): Promise<boolean> {
  const health = await testBackendConnection();
  return health.ok;
}

export async function submitFeedback(data: FeedbackRequest): Promise<void> {
  await requestApi<unknown>('/api/v1/plugin/feedback', {
    method: 'POST',
    headers: webGuardHeaders(),
    body: JSON.stringify(data),
  });
}

export async function markReportFalsePositive(recordId: number, comment: string): Promise<void> {
  await requestApi<unknown>(`/api/v1/reports/${encodeURIComponent(String(recordId))}/mark-false-positive`, {
    method: 'POST',
    headers: webGuardHeaders(),
    body: JSON.stringify({
      note: comment || '浏览器插件提交误报反馈',
      status: 'pending_review',
    }),
  });
}

export async function trustSite(host: string): Promise<UserDecisionSyncStatus> {
  try {
    await requestApi<unknown>('/api/v1/my/domains', {
      method: 'POST',
      headers: webGuardHeaders(),
      body: JSON.stringify({
        host,
        list_type: 'trusted',
        reason: '浏览器插件加入信任站点',
        source: 'plugin',
      }),
    });
    await addTrustedHost(host);
    await syncPluginEvent({
      event_type: 'trust',
      action: 'permanent_trust',
      domain: host,
      summary: '用户在插件中永久信任当前站点',
    });
    return 'synced';
  } catch (error) {
    console.warn('[WebGuard] Trust-site sync failed, using local decision.', error);
    await addTrustedHost(host);
    await syncPluginEvent({
      event_type: 'trust',
      action: 'permanent_trust_offline_cached',
      domain: host,
      summary: '后端策略同步失败，插件已写入本地永久信任缓存',
    });
    return 'offline-cache';
  }
}

export async function pauseSite(host: string, minutes = 30): Promise<UserDecisionSyncStatus> {
  try {
    await requestApi<unknown>('/api/v1/my/domains', {
      method: 'POST',
      headers: webGuardHeaders(),
      body: JSON.stringify({
        host,
        list_type: 'temp_bypass',
        reason: `浏览器插件临时忽略 ${minutes} 分钟`,
        source: 'plugin',
        minutes,
      }),
    });
    await pauseHostProtection(host, minutes);
    await syncPluginEvent({
      event_type: 'temporary_trust',
      action: 'pause_site',
      domain: host,
      summary: `用户在插件中临时信任 ${minutes} 分钟`,
      metadata: { minutes },
    });
    return 'synced';
  } catch (error) {
    console.warn('[WebGuard] Pause-site sync failed, using local decision.', error);
    await pauseHostProtection(host, minutes);
    await syncPluginEvent({
      event_type: 'temporary_trust',
      action: 'pause_site_offline_cached',
      domain: host,
      summary: `后端策略同步失败，插件已写入本地临时信任 ${minutes} 分钟`,
      metadata: { minutes },
    });
    return 'offline-cache';
  }
}

export async function resumeSite(host: string): Promise<UserDecisionSyncStatus> {
  await resumeHostProtection(host);
  try {
    await requestApi<unknown>('/api/v1/user/site-actions/resume', {
      method: 'POST',
      headers: webGuardHeaders(),
      body: JSON.stringify({
        domain: host,
        reason: '浏览器插件恢复保护',
        source: 'plugin',
      }),
    });
    return 'synced';
  } catch (error) {
    console.warn('[WebGuard] Resume-site sync failed, local decision was updated.', error);
    return 'offline-cache';
  }
}

async function requestApi<T>(
  path: string,
  init: RequestInit,
  options: RequestOptions = {},
  apiBaseUrlOverride?: string,
): Promise<T> {
  const settings = await getSettings();
  const apiBaseUrl = (apiBaseUrlOverride || settings.apiBaseUrl).replace(/\/+$/, '');
  const url = new URL(path, `${apiBaseUrl}/`).toString();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
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

function unwrapData(payload: unknown): unknown {
  if (isRecord(payload) && 'data' in payload) return payload.data;
  return payload;
}

function normalizePluginPolicy(value: unknown): PluginPolicySnapshot {
  if (!isRecord(value)) {
    throw new Error('后端策略响应无效');
  }
  if ('current_rule_version' in value || 'trusted_hosts' in value || 'plugin_default_config' in value) {
    const bootstrap = value as unknown as PluginBootstrapResponse;
    return {
      username: 'platform-user',
      pluginVersion: '1.0.0',
      ruleVersion: typeof bootstrap.current_rule_version === 'string' ? bootstrap.current_rule_version : 'unknown',
      userTrustedHosts: normalizeHostArray(bootstrap.trusted_hosts),
      userBlockedHosts: normalizeHostArray(bootstrap.blocked_hosts),
      userPausedHosts: normalizePausedPolicy(bootstrap.temp_bypass_records),
      globalTrustedHosts: [],
      globalBlockedHosts: [],
      syncedAt: Date.now(),
    };
  }
  const policy = value as unknown as PluginPolicyResponse;
  return {
    username: typeof policy.username === 'string' ? policy.username : 'platform-user',
    pluginVersion: typeof policy.plugin_version === 'string' ? policy.plugin_version : '1.0.0',
    ruleVersion: typeof policy.rule_version === 'string' ? policy.rule_version : 'unknown',
    userTrustedHosts: normalizeHostArray(policy.user_trusted_hosts),
    userBlockedHosts: normalizeHostArray(policy.user_blocked_hosts),
    userPausedHosts: normalizePausedPolicy(policy.user_paused_hosts),
    globalTrustedHosts: normalizeHostArray(policy.global_trusted_hosts),
    globalBlockedHosts: normalizeHostArray(policy.global_blocked_hosts),
    syncedAt: Date.now(),
  };
}

function normalizeHostArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function normalizePausedPolicy(value: unknown): PausedHostRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!isRecord(item) || typeof item.domain !== 'string') return null;
      const expiresAt = typeof item.expires_at === 'string' ? Date.parse(item.expires_at) : 0;
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
      return {
        host: item.domain.trim().toLowerCase().replace(/^www\./, ''),
        addedAt: Date.now(),
        expiresAt,
      };
    })
    .filter((item): item is PausedHostRecord => Boolean(item));
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}
