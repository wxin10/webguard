import type { DetectionResult, RiskLabel } from './storage.js';
import { DEFAULT_SETTINGS, normalizeBaseUrl } from './storage.js';

export interface WarningPageParams {
  url: string;
  label: RiskLabel;
  riskScore: number;
  summary: string;
  detectedAt: number;
  recordId?: number;
}

export function buildWarningPageUrl(result: DetectionResult): string {
  const warningUrl = new URL(chrome.runtime.getURL('dist/warning/warning.html'));
  warningUrl.searchParams.set('url', result.url);
  warningUrl.searchParams.set('label', result.label);
  warningUrl.searchParams.set('risk_score', String(result.risk_score));
  warningUrl.searchParams.set('summary', result.summary || result.reason || result.explanation || '检测到高风险页面。');
  warningUrl.searchParams.set('detected_at', String(result.timestamp));
  const reportId = result.report_id || result.record_id;
  if (typeof reportId === 'number') {
    warningUrl.searchParams.set('record_id', String(reportId));
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
  const recordIdValue = Number(params.get('record_id'));

  if (!url || !label || !Number.isFinite(riskScore) || !Number.isFinite(detectedAt)) return null;

  return {
    url,
    label,
    riskScore,
    summary: summary || '检测到高风险页面。',
    detectedAt,
    ...(Number.isFinite(recordIdValue) && recordIdValue > 0 ? { recordId: recordIdValue } : {}),
  };
}

export function buildReportUrl(webBaseUrl: string, recordId?: number): string {
  const base = normalizeBaseUrl(webBaseUrl, DEFAULT_SETTINGS.webBaseUrl);
  const path = typeof recordId === 'number' && recordId > 0
    ? `/app/reports/${encodeURIComponent(String(recordId))}`
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
