import { HitRule } from '../types';

export default function RuleHitList({ rules }: { rules: HitRule[] }) {
  const matched = rules.filter((rule) => rule.matched);

  if (!matched.length) {
    return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">未命中高风险规则。</div>;
  }

  return (
    <div className="space-y-3">
      {matched.map((rule) => (
        <div key={rule.rule_key} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="font-semibold text-slate-900">{rule.rule_name}</h4>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              +{Number(rule.weighted_score || 0).toFixed(2)}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-600">{rule.detail || '规则命中，建议进一步核验。'}</p>
        </div>
      ))}
    </div>
  );
}
