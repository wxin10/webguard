import { Link } from 'react-router-dom';
import { ScanResult } from '../types';
import { riskBar } from '../utils';
import RiskBadge from './RiskBadge';
import RuleHitList from './RuleHitList';

interface ScanResultCardProps {
  url: string;
  result: ScanResult;
}

export default function ScanResultCard({ url, result }: ScanResultCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <h3 className="text-xl font-bold text-slate-950">检测结果</h3>
          <p className="mt-1 break-all text-sm text-slate-500">{url}</p>
          <p className="mt-1 text-xs text-slate-400">报告编号: {result.record_id}</p>
        </div>
        <RiskBadge label={result.label} size="lg" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm text-slate-500">风险评分</p>
          <div className="mt-2 text-3xl font-bold text-slate-950">{result.risk_score.toFixed(2)}</div>
          <div className="mt-4 h-2 rounded-full bg-slate-200">
            <div className={`h-2 rounded-full ${riskBar(result.label)}`} style={{ width: `${Math.min(result.risk_score, 100)}%` }} />
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm text-slate-500">规则评分</p>
          <div className="mt-2 text-3xl font-bold text-slate-950">{result.rule_score.toFixed(2)}</div>
          <p className="mt-3 text-sm text-slate-500">规则命中用于解释风险来源。</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm text-slate-500">模型概率</p>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><span>安全</span><span className="font-semibold text-emerald-600">{result.model_safe_prob.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>可疑</span><span className="font-semibold text-amber-600">{result.model_suspicious_prob.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>恶意</span><span className="font-semibold text-red-600">{result.model_malicious_prob.toFixed(2)}</span></div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <section>
          <h4 className="mb-3 font-semibold text-slate-900">规则命中</h4>
          <RuleHitList rules={result.hit_rules || []} />
        </section>
        <section className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h4 className="font-semibold text-slate-900">检测解释</h4>
            <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{result.explanation}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h4 className="font-semibold text-slate-900">处理建议</h4>
            <p className="mt-2 text-sm text-slate-600">{result.recommendation}</p>
          </div>
        </section>
      </div>

      <div className="mt-6 flex justify-end">
        <Link className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700" to={`/app/reports/${result.record_id}`}>
          查看完整报告
        </Link>
      </div>
    </div>
  );
}
