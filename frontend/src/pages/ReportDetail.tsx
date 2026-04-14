import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import RiskBadge from '../components/RiskBadge';
import RuleHitList from '../components/RuleHitList';
import { reportsApi } from '../services/api';
import { AnalysisReport } from '../types';
import { formatDate, riskBar, sourceText } from '../utils';

export default function ReportDetail() {
  const { id } = useParams();
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    reportsApi.getReport(id)
      .then(setReport)
      .catch(() => setError('报告不存在或后端服务未启动'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <LoadingBlock />;
  if (error || !report) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">{error || '报告不存在'}</div>;

  return (
    <div>
      <PageHeader title={`分析报告 #${report.id}`} description="结构化展示最终结论、风险评分、规则命中、模型概率、检测解释与处理建议。" />

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-5 lg:flex-row">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <RiskBadge label={report.label} size="lg" />
              <span className="text-sm text-slate-500">{sourceText(report.source)} · {formatDate(report.created_at)}</span>
            </div>
            <h2 className="mt-4 break-all text-2xl font-bold text-slate-950">{report.url}</h2>
            <p className="mt-2 text-sm text-slate-500">域名: {report.domain} · 标题: {report.title || '未采集'}</p>
            <p className="mt-5 max-w-4xl text-slate-700">{report.conclusion}</p>
          </div>
          <div className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-5 lg:w-80">
            <p className="text-sm font-semibold text-slate-500">风险评分</p>
            <div className="mt-2 text-5xl font-bold text-slate-950">{report.risk_score.toFixed(1)}</div>
            <div className="mt-5 h-3 rounded-full bg-slate-200">
              <div className={`h-3 rounded-full ${riskBar(report.label)}`} style={{ width: `${Math.min(report.risk_score, 100)}%` }} />
            </div>
            <p className="mt-3 text-sm text-slate-500">规则评分 {report.rule_score.toFixed(2)}</p>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">模型概率</h3>
          <Probability label="安全" value={report.model_probs.safe} color="bg-emerald-500" />
          <Probability label="可疑" value={report.model_probs.suspicious} color="bg-amber-500" />
          <Probability label="恶意" value={report.model_probs.malicious} color="bg-red-500" />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">规则命中</h3>
          <div className="mt-4">
            <RuleHitList rules={report.hit_rules || []} />
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">检测解释</h3>
          <p className="mt-4 whitespace-pre-line text-sm leading-6 text-slate-700">{report.explanation || '暂无解释'}</p>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">处理建议</h3>
          <p className="mt-4 text-sm leading-6 text-slate-700">{report.recommendation || '暂无建议'}</p>
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-bold text-slate-950">分析证据</h3>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {report.evidence.map((item) => (
            <div key={item.title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h4 className="font-semibold text-slate-900">{item.title}</h4>
              <p className="mt-2 text-sm text-slate-600">{item.summary}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-6">
        <Link to="/app" className="text-sm font-semibold text-blue-600">返回工作区</Link>
      </div>
    </div>
  );
}

function Probability({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="mt-5">
      <div className="flex justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="font-semibold text-slate-950">{value.toFixed(2)}</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-slate-200">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.min(value * 100, 100)}%` }} />
      </div>
    </div>
  );
}
