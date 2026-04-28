import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import RiskBadge from '../components/RiskBadge';
import StatusNotice from '../components/StatusNotice';
import { reportsService } from '../services/reportsService';
import type { AnalysisReport } from '../types';
import { formatDate, riskBar, scanSourceText } from '../utils';

export default function LatestReport() {
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    reportsService.getLatestReport()
      .then(setReport)
      .catch((err) => setError(err instanceof Error ? err.message : '暂时没有可展示的检测报告。'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="最近报告"
        description="快速查看最近一次网站检测或浏览器助手扫描生成的正式报告摘要，并进入完整报告页追踪证据和处置动作。"
        action={
          <Link to="/app/scan" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            提交检测
          </Link>
        }
      />

      {error && !report && <StatusNotice>{error}</StatusNotice>}

      {report && (
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <RiskBadge label={report.risk_level || report.label} size="lg" />
                <span className="text-sm text-slate-500">{scanSourceText(report.source)} · {formatDate(report.created_at)}</span>
              </div>
              <h2 className="mt-4 break-all text-2xl font-bold text-slate-950">{report.url}</h2>
              <p className="mt-2 text-sm text-slate-500">host: {report.host || report.domain}</p>
              <p className="mt-5 max-w-4xl whitespace-pre-line text-sm leading-6 text-slate-700">{report.summary || report.explanation || report.conclusion || '暂无摘要。'}</p>
            </div>
            <div className="w-full rounded-lg border border-slate-200 bg-slate-50 p-5 lg:w-80">
              <p className="text-sm font-semibold text-slate-500">风险分数</p>
              <div className="mt-2 text-5xl font-bold text-slate-950">{Number(report.risk_score || 0).toFixed(1)}</div>
              <div className="mt-5 h-3 rounded-full bg-slate-200">
                <div className={`h-3 rounded-full ${riskBar(report.risk_level || report.label)}`} style={{ width: `${Math.min(Number(report.risk_score || 0), 100)}%` }} />
              </div>
              <Link to={`/app/reports/${report.id}`} className="mt-5 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                查看完整报告
              </Link>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
