import type { DetectionResult, RiskLabel } from './storage.js';
import { DEFAULT_SETTINGS, normalizeBaseUrl } from './storage.js';

export interface WarningPageParams {
  url: string;
  label: RiskLabel;
  riskScore: number;
  summary: string;
  detectedAt: number;
  reportId?: number;
  sourceBadges: string[];
  aiStatus?: string;
  threatIntelHit: boolean;
}

export function buildWarningPageUrl(result: DetectionResult): string {
  const warningUrl = new URL(chrome.runtime.getURL('dist/warning/warning.html'));
  warningUrl.searchParams.set('url', result.url);
  warningUrl.searchParams.set('label', result.label);
  warningUrl.searchParams.set('risk_score', String(result.risk_score));
  warningUrl.searchParams.set('summary', result.summary || result.reason || result.explanation || '检测到高风险页面。');
  warningUrl.searchParams.set('detected_at', String(result.timestamp));
  const sourceBadges = buildSourceBadges(result);
  if (sourceBadges.length) {
    warningUrl.searchParams.set('source_badges', sourceBadges.join(','));
  }
  if (result.ai_analysis?.status) {
    warningUrl.searchParams.set('ai_status', result.ai_analysis.status);
  }
  warningUrl.searchParams.set('threat_intel_hit', result.threat_intel_hit ? '1' : '0');
  const reportId = result.report_id || result.record_id;
  if (typeof reportId === 'number') {
    warningUrl.searchParams.set('report_id', String(reportId));
  }
  return warningUrl.toString();
}

export function parseWarningPageParams(search: string): WarningPageParams | null {
  const params = new URLSearchParams(search);
  const url = params.get('url') ?? '';
  const label = parseRiskLabel(params.get('label'));
  const riskScore = Number(params.get('risk_score'));
  const detectedAt = Number(params.get('detected_at'));
  const summary = params.get('summary') ?? '';
  const reportIdValue = Number(params.get('report_id') ?? params.get('record_id'));
  const sourceBadges = (params.get('source_badges') || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);
  const aiStatus = params.get('ai_status') || undefined;
  const threatIntelHit = params.get('threat_intel_hit') === '1';

  if (!url || !label || !Number.isFinite(riskScore) || !Number.isFinite(detectedAt)) return null;

  return {
    url,
    label,
    riskScore,
    summary: summary || '检测到高风险页面。',
    detectedAt,
    sourceBadges,
    aiStatus,
    threatIntelHit,
    ...(Number.isFinite(reportIdValue) && reportIdValue > 0 ? { reportId: reportIdValue } : {}),
  };
}

export function buildReportUrl(webBaseUrl: string, reportId?: number): string {
  const base = normalizeBaseUrl(webBaseUrl, DEFAULT_SETTINGS.webBaseUrl);
  const path = typeof reportId === 'number' && reportId > 0
    ? `/app/reports/${encodeURIComponent(String(reportId))}`
    : '/app/report/latest';
  return new URL(path, `${base}/`).toString();
}

export function buildDomainSettingsUrl(webBaseUrl: string, host: string): string {
  const base = normalizeBaseUrl(webBaseUrl, DEFAULT_SETTINGS.webBaseUrl);
  const url = new URL('/app/my-domains', `${base}/`);
  url.searchParams.set('domain', host);
  return url.toString();
}

function parseRiskLabel(value: string | null): RiskLabel | null {
  if (value === 'safe' || value === 'suspicious' || value === 'malicious' || value === 'unknown') return value;
  return null;
}

function buildSourceBadges(result: DetectionResult): string[] {
  const badges: string[] = [];
  if (result.policy_hit?.hit) badges.push('policy');
  if (result.threat_intel_hit) badges.push('threat_intel');
  if ((result.behavior_signals?.length || 0) > 0 || typeof result.behavior_score === 'number' || (result.hit_rules?.length || 0) > 0) badges.push('behavior');
  if (result.ai_analysis?.status) badges.push('ai');
  return badges.slice(0, 4);
}
