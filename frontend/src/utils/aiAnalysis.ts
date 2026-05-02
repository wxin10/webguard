import type { AIAnalysis, ScoreBreakdown } from '../types';

export interface AIReportLike {
  ai_score?: number | null;
  ai_analysis?: AIAnalysis;
  ai_fusion_used?: boolean;
  score_breakdown?: ScoreBreakdown;
}

export function resolveAiAnalysis(report: AIReportLike): AIAnalysis {
  const candidates = [
    report.ai_analysis,
    report.score_breakdown?.ai_analysis,
  ].filter(Boolean) as AIAnalysis[];
  return candidates.find((item) => item.status === 'used') || candidates[0] || { status: 'unknown', provider: 'deepseek' };
}

export function resolveAiStatus(report: AIReportLike): string {
  return resolveAiAnalysis(report).status || 'unknown';
}

export function resolveAiScore(report: AIReportLike): number | null {
  const analysis = resolveAiAnalysis(report);
  if (analysis.status !== 'used') return null;
  const breakdownAnalysis = report.score_breakdown?.ai_analysis;
  const candidates = [
    report.ai_score,
    report.score_breakdown?.ai_score,
    analysis.risk_score,
    breakdownAnalysis?.risk_score,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
  }
  return null;
}

export function resolveAiFusionUsed(report: AIReportLike): boolean {
  if (typeof report.ai_fusion_used === 'boolean') return report.ai_fusion_used;
  if (typeof report.score_breakdown?.ai_fusion_used === 'boolean') return report.score_breakdown.ai_fusion_used;
  return resolveAiStatus(report) === 'used' && resolveAiScore(report) !== null;
}

export function aiStatusLabel(status?: string): string {
  const map: Record<string, string> = {
    used: '已触发',
    no_api_key: '未配置',
    not_triggered: '未触发',
    disabled: '已禁用',
    timeout: '超时',
    error: '异常',
  };
  return map[status || ''] || '未知';
}

export function aiStatusDescription(status?: string): string {
  const map: Record<string, string> = {
    used: 'DeepSeek 语义研判已触发，并参与本次风险分析。',
    no_api_key: 'DeepSeek 未配置，系统使用规则引擎兜底。',
    not_triggered: 'DeepSeek 未触发，系统使用规则引擎兜底。',
    disabled: 'DeepSeek 已禁用，系统使用规则引擎兜底。',
    timeout: 'DeepSeek 调用超时，系统使用规则引擎兜底。',
    error: 'DeepSeek 调用异常，系统使用规则引擎兜底。',
  };
  return map[status || ''] || 'DeepSeek 语义研判状态未知。';
}

export function fusionDescription(aiFusionUsed: boolean): string {
  return aiFusionUsed
    ? '最终风险分 = 行为规则分 × 45% + DeepSeek 语义分 × 55%'
    : 'DeepSeek 未触发或不可用，系统使用规则引擎兜底。';
}

export function missingStructuredAiDetailsText(): string {
  return '本报告未保存结构化 AI 分析详情，仅保留融合解释文本。';
}
