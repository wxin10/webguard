import { cacheUserStrategies, getSettings, saveOfflineTrustedSite, savePausedHostFallback } from './storage.js';
import type { DetectionResult, UserStrategyOverview } from './storage.js';

export interface AnalyzeRequest {
  url: string;
  title: string;
  visible_text: string;
  button_texts: string[];
  input_labels: string[];
  form_action_domains: string[];
  has_password_input: boolean;
}

export interface FeedbackRequest {
  url: string;
  feedback_type: string;
  comment: string;
}

export async function analyzeCurrentPage(data: AnalyzeRequest): Promise<DetectionResult> {
  const settings = await getSettings();
  const response = await fetch(`${settings.apiBaseUrl}/api/v1/plugin/analyze-current`, {
    method: 'POST',
    headers: webGuardHeaders(),
    body: JSON.stringify(data),
  });

  if (!response.ok) throw new Error(`API request failed: ${response.status}`);
  const result = await response.json();
  return result.data;
}

export async function checkBackend(): Promise<boolean> {
  try {
    const settings = await getSettings();
    const response = await fetch(`${settings.apiBaseUrl}/health`, { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
}

export async function submitFeedback(data: FeedbackRequest): Promise<void> {
  const settings = await getSettings();
  const response = await fetch(`${settings.apiBaseUrl}/api/v1/plugin/feedback`, {
    method: 'POST',
    headers: webGuardHeaders(),
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(`API request failed: ${response.status}`);
}

export async function markReportFalsePositive(recordId: number, comment: string): Promise<void> {
  const settings = await getSettings();
  const response = await fetch(`${settings.apiBaseUrl}/api/v1/reports/${recordId}/mark-false-positive`, {
    method: 'POST',
    headers: webGuardHeaders(),
    body: JSON.stringify({
      note: comment || '浏览器助手误报反馈',
      status: 'pending_review',
    }),
  });
  if (!response.ok) throw new Error(`API request failed: ${response.status}`);
}

export async function getUserStrategies(): Promise<UserStrategyOverview> {
  const settings = await getSettings();
  const response = await fetch(`${settings.apiBaseUrl}/api/v1/user/strategies`, {
    method: 'GET',
    headers: webGuardHeaders(),
  });
  if (!response.ok) throw new Error(`Strategy request failed: ${response.status}`);
  const payload = await response.json();
  const data = payload.data as UserStrategyOverview;
  await cacheUserStrategies(data);
  return data;
}

export async function trustSite(host: string): Promise<'synced' | 'offline-cache'> {
  try {
    await postUserStrategy('/api/v1/user/trusted-sites', {
      domain: host,
      reason: '浏览器助手加入信任站点',
      source: 'plugin',
    });
    await getUserStrategies();
    return 'synced';
  } catch {
    await saveOfflineTrustedSite(host);
    return 'offline-cache';
  }
}

export async function pauseSite(host: string, minutes = 30): Promise<'synced' | 'offline-cache'> {
  try {
    await postUserStrategy('/api/v1/user/site-actions/pause', {
      domain: host,
      reason: `浏览器助手临时忽略 ${minutes} 分钟`,
      source: 'plugin',
      minutes,
    });
    await getUserStrategies();
    return 'synced';
  } catch {
    await savePausedHostFallback(host, minutes);
    return 'offline-cache';
  }
}

export async function resumeSite(host: string): Promise<void> {
  await postUserStrategy('/api/v1/user/site-actions/resume', {
    domain: host,
    reason: '浏览器助手恢复保护',
    source: 'plugin',
  });
  await getUserStrategies();
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
