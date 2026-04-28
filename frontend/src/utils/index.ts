import type { RiskLabel } from '../types';

export function formatDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatRuleVersion(value?: string) {
  if (!value) return '-';
  const ruleSetMatch = value.match(/rules?[-_\s]*(\d+)/i);
  if (ruleSetMatch?.[1]) return `规则集 ${ruleSetMatch[1]}`;
  const numericSuffix = value.match(/(\d+)(?!.*\d)/)?.[1];
  if (numericSuffix) return `规则集 ${numericSuffix}`;
  if (value.length <= 12) return value;
  return `${value.slice(0, 10)}...`;
}

export function getRiskText(label?: string) {
  const textMap: Record<string, string> = {
    safe: '安全',
    suspicious: '可疑',
    malicious: '恶意',
    unknown: '未知',
  };
  return textMap[label || 'unknown'] || '未知';
}

export function getRiskColor(label?: string) {
  const colorMap: Record<string, string> = {
    safe: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    suspicious: 'bg-amber-50 text-amber-700 border-amber-200',
    malicious: 'bg-red-50 text-red-700 border-red-200',
    unknown: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  return colorMap[label || 'unknown'] || colorMap.unknown;
}

export function riskAccent(label?: RiskLabel | string) {
  if (label === 'malicious') return 'text-red-600';
  if (label === 'suspicious') return 'text-amber-600';
  if (label === 'safe') return 'text-emerald-600';
  return 'text-slate-600';
}

export function riskBar(label?: RiskLabel | string) {
  if (label === 'malicious') return 'bg-red-600';
  if (label === 'suspicious') return 'bg-amber-500';
  if (label === 'safe') return 'bg-emerald-600';
  return 'bg-slate-400';
}

export function sourceText(source?: string) {
  const sourceMap: Record<string, string> = {
    manual: '手动添加',
    plugin: '浏览器助手同步',
    web: '网站平台',
    report: '报告处置',
    recheck: '重新检测',
    system: '系统同步',
  };
  return sourceMap[source || ''] || source || '-';
}

export function scanSourceText(source?: string) {
  const sourceMap: Record<string, string> = {
    manual: '网站检测',
    web: '网站检测',
    plugin: '浏览器助手扫描',
    recheck: '重新检测',
  };
  return sourceMap[source || ''] || source || '-';
}

export function pluginEventText(eventType?: string, action?: string) {
  const eventMap: Record<string, string> = {
    scan: '扫描',
    warning: '安全预警',
    bypass: '本次继续访问',
    trust: '永久信任',
    temporary_trust: '暂时信任此网站',
    feedback: '反馈',
    error: '错误',
  };
  return eventMap[eventType || ''] || action || eventType || '-';
}

export function strategyText(value?: string) {
  const strategyMap: Record<string, string> = {
    trusted: '信任',
    blocked: '阻止',
    paused: '本次继续访问',
    temp_bypass: '本次继续访问',
  };
  return strategyMap[value || ''] || value || '-';
}

export function feedbackStatusText(value?: string) {
  const textMap: Record<string, string> = {
    pending_review: '待处理',
    confirmed_false_positive: '确认误报',
    confirmed_risk: '确认风险',
    resolved: '已处理',
    closed: '已关闭',
  };
  return textMap[value || ''] || value || '-';
}
