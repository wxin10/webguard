import type { BehaviorSignal, HitRule } from '../types';

type DisplayRule = HitRule | BehaviorSignal;

export default function RuleHitList({ rules }: { rules: DisplayRule[] }) {
  const matched = rules.filter((rule) => rule.matched !== false);

  if (!matched.length) {
    return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">未发现需要展示的页面行为风险信号。</div>;
  }

  return (
    <div className="space-y-3">
      {matched.map((rule, index) => (
        <div key={`${rule.rule_key || rule.rule_name || 'signal'}-${index}`} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h4 className="font-semibold text-slate-900">{rule.rule_name || rule.rule_key || '页面行为风险信号'}</h4>
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                {rule.category && <span>{ruleCategoryText(rule.category)}</span>}
                {rule.severity && <span>{ruleSeverityText(rule.severity)}</span>}
                {rule.rule_key && <span>{rule.rule_key}</span>}
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              +{signalScore(rule).toFixed(2)}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{rule.reason || ('detail' in rule ? rule.detail : '') || '该风险信号已命中，建议结合其他信号和最终结论判断。'}</p>
          {rule.caution && (
            <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
              该信号本身不代表恶意，需要结合其他风险信号判断。
            </p>
          )}
          {rule.false_positive_note && (
            <p className="mt-2 text-xs leading-5 text-slate-500">{rule.false_positive_note}</p>
          )}
          {rule.evidence && (
            <p className="mt-2 break-all text-xs leading-5 text-slate-500">证据摘要：{summarizeEvidence(rule.evidence)}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function signalScore(rule: DisplayRule): number {
  if ('score' in rule && typeof rule.score === 'number') return rule.score;
  if ('weighted_score' in rule && typeof rule.weighted_score === 'number') return rule.weighted_score;
  if ('contribution' in rule && typeof rule.contribution === 'number') return rule.contribution;
  return 0;
}

function ruleCategoryText(value: string | null) {
  const map: Record<string, string> = {
    url: 'URL 特征',
    domain: '域名特征',
    form: '表单行为',
    content: '页面内容',
    behavior: '页面行为',
    combo: '组合风险',
    heuristic: '平台规则',
    local: '平台规则',
  };
  return value ? map[value] || value : '';
}

function ruleSeverityText(value: string | null) {
  const map: Record<string, string> = {
    low: '低风险信号',
    medium: '中风险信号',
    high: '高风险信号',
    critical: '严重风险信号',
  };
  return value ? map[value] || value : '';
}

function summarizeEvidence(evidence: Record<string, unknown>): string {
  const entries = Object.entries(evidence)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${formatEvidenceValue(value)}`);
  return entries.length ? entries.join('；') : '已采集到相关证据';
}

function formatEvidenceValue(value: unknown): string {
  if (Array.isArray(value)) return value.slice(0, 4).map(String).join(', ');
  if (typeof value === 'object' && value !== null) return JSON.stringify(value).slice(0, 120);
  return String(value).slice(0, 120);
}
