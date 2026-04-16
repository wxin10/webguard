import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import { reportsApi } from '../services/api';
import { AnalysisReport } from '../types';

export default function LatestReport() {
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    reportsApi.getLatestReport()
      .then(setReport)
      .catch(() => setEmpty(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingBlock />;
  if (report) return <Navigate to={`/app/reports/${report.id}`} replace />;

  return (
    <div>
      <PageHeader
        title="最近报告"
        description="快速回到最近一次手动检测或插件扫描生成的正式报告。"
        action={<Link to="/app/scan" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">提交检测</Link>}
      />
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-slate-500">
        {empty ? '暂无检测报告，请先在网站检测页或插件中发起一次扫描。' : '暂无检测报告。'}
      </div>
    </div>
  );
}
