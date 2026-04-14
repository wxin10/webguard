import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
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
      <PageHeader title="最近报告" description="查看最近一次插件或手动检测生成的分析报告。" />
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-500">
        {empty ? '暂无检测报告，请先在插件或单网址检测页发起一次扫描。' : '暂无检测报告。'}
      </div>
    </div>
  );
}
