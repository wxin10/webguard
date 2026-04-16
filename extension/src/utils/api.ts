import {
  addTrustedHost,
  getSettings,
  pauseHostProtection,
  resumeHostProtection,
} from './storage.js';
import type { DetectionResult, PageInfo, RiskLabel } from './storage.js';

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
    await requestApi<unknown>('/api/v1/user/trusted-sites', {
      method: 'POST',
      headers: webGuardHeaders(),
      body: JSON.stringify({
        domain: host,
        reason: '浏览器插件加入信任站点',
        source: 'plugin',
      }),
    });
    await addTrustedHost(host);
    return 'synced';
  } catch (error) {
    console.warn('[WebGuard] Trust-site sync failed, using local decision.', error);
    await addTrustedHost(host);
    return 'offline-cache';
  }
}

export async function pauseSite(host: string, minutes = 30): Promise<UserDecisionSyncStatus> {
  try {
    await requestApi<unknown>('/api/v1/user/site-actions/pause', {
      method: 'POST',
      headers: webGuardHeaders(),
      body: JSON.stringify({
        domain: host,
        reason: `浏览器插件临时忽略 ${minutes} 分钟`,
        source: 'plugin',
        minutes,
      }),
    });
    await pauseHostProtection(host, minutes);
    return 'synced';
  } catch (error) {
    console.warn('[WebGuard] Pause-site sync failed, using local decision.', error);
    await pauseHostProtection(host, minutes);
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

  return {
    url: typeof value.url === 'string' && value.url ? value.url : fallbackUrl,
    label,
    risk_score: riskScore,
    summary,
    reason: firstNonEmptyString(value.reason),
    explanation: firstNonEmptyString(value.explanation),
    recommendation: firstNonEmptyString(value.recommendation),
    ...(typeof recordId === 'number' ? { record_id: recordId } : {}),
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
