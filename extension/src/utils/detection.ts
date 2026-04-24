import type { DetectionAction, DetectionResult, RiskLabel } from './storage.js';

export interface DetectionDecision {
  action: DetectionAction;
  shouldWarn: boolean;
  shouldBlock: boolean;
}

export function parseDetectionResult(value: unknown, fallbackUrl: string): DetectionResult {
  if (!isRecord(value)) {
    throw new Error('Backend response is missing a detection result object.');
  }

  const label = parseRiskLabel(value.label);
  if (!label) {
    throw new Error('Backend response is missing a valid label field.');
  }

  const riskScore = parseRiskScore(value.risk_score);
  if (riskScore === null) {
    throw new Error('Backend response is missing a valid risk_score field.');
  }

  const summary = firstNonEmptyString(value.summary, value.reason, value.explanation);
  if (!summary) {
    throw new Error('Backend response is missing summary information.');
  }

  const decision = resolveDetectionDecision({
    label,
    action: parseDetectionAction(value.action),
    should_warn: parseOptionalBoolean(value.should_warn),
    should_block: parseOptionalBoolean(value.should_block),
  });

  const recordId = parseOptionalNumber(value.record_id);
  const reportId = parseOptionalNumber(value.report_id);

  return {
    url: typeof value.url === 'string' && value.url ? value.url : fallbackUrl,
    ...(typeof value.domain === 'string' && value.domain ? { domain: value.domain } : {}),
    label,
    risk_score: riskScore,
    summary,
    ...(Array.isArray(value.reason_summary) ? { reason_summary: value.reason_summary.filter(isNonEmptyString) } : {}),
    action: decision.action,
    should_warn: decision.shouldWarn,
    should_block: decision.shouldBlock,
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

export function resolveDetectionDecision(value: {
  label: RiskLabel;
  action?: DetectionAction | null;
  should_warn?: boolean;
  should_block?: boolean;
}): DetectionDecision {
  const action = value.action ?? defaultActionForLabel(value.label);
  const shouldWarn = typeof value.should_warn === 'boolean' ? value.should_warn : action !== 'ALLOW';
  const shouldBlock = typeof value.should_block === 'boolean' ? value.should_block : action === 'BLOCK';
  return { action, shouldWarn, shouldBlock };
}

function defaultActionForLabel(label: RiskLabel): DetectionAction {
  if (label === 'malicious') return 'BLOCK';
  if (label === 'suspicious') return 'WARN';
  return 'ALLOW';
}

function parseDetectionAction(value: unknown): DetectionAction | null {
  if (value === 'ALLOW' || value === 'WARN' || value === 'BLOCK') return value;
  return null;
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

function parseOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function parseHitRules(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(isRecord);
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  return values.find(isNonEmptyString)?.trim();
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
