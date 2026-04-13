import type { RiskLabel } from '../types';

export function formatDate(value?: string) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
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
  return colorMap[label || 'unknown'] || 'bg-slate-100 text-slate-600 border-slate-200';
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
    manual: '手动检测',
    plugin: '浏览器插件',
    web: 'Web 页面',
  };
  return sourceMap[source || ''] || source || '-';
}
