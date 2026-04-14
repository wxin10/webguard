import { useEffect, useState } from 'react';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import { statsApi } from '../services/api';
import { RiskDistributionResponse, StatsOverview, TrendPoint } from '../types';

export default function Stats() {
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [distribution, setDistribution] = useState<RiskDistributionResponse | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([statsApi.getOverview(), statsApi.getRiskDistribution(), statsApi.getTrend()])
      .then(([overviewData, distributionData, trendData]) => {
        setOverview(overviewData);
        setDistribution(distributionData);
        setTrend(trendData.trend || []);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingBlock />;
  const total = Math.max((distribution?.safe || 0) + (distribution?.suspicious || 0) + (distribution?.malicious || 0), 1);
  const maxTrend = Math.max(...trend.map((item) => item.count), 1);

  return (
    <div>
      <PageHeader title="风险统计" description="面向运营控制台的风险分布、检测趋势和检测成效概览。" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard title="总检测数" value={overview?.total_scans || 0} tone="blue" />
        <StatCard title="今日检测数" value={overview?.today_scans || 0} tone="slate" />
        <StatCard title="安全占比" value={`${Math.round(((distribution?.safe || 0) / total) * 100)}%`} tone="green" />
        <StatCard title="可疑占比" value={`${Math.round(((distribution?.suspicious || 0) / total) * 100)}%`} tone="amber" />
        <StatCard title="恶意占比" value={`${Math.round(((distribution?.malicious || 0) / total) * 100)}%`} tone="red" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">风险分布</h2>
          <div className="mt-6 space-y-5">
            <Distribution label="安全" value={distribution?.safe || 0} total={total} color="bg-emerald-500" />
            <Distribution label="可疑" value={distribution?.suspicious || 0} total={total} color="bg-amber-500" />
            <Distribution label="恶意" value={distribution?.malicious || 0} total={total} color="bg-red-500" />
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">检测趋势</h2>
          <div className="mt-6 flex h-72 items-end gap-3">
            {trend.map((item) => (
              <div key={item.date} className="flex flex-1 flex-col items-center gap-2">
                <div className="w-full rounded-t bg-blue-500" style={{ height: `${Math.max((item.count / maxTrend) * 240, 8)}px` }} />
                <span className="text-xs text-slate-400">{item.date.slice(5)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Distribution({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const percent = Math.round((value / total) * 100);
  return (
    <div>
      <div className="mb-2 flex justify-between text-sm">
        <span className="font-semibold text-slate-700">{label}</span>
        <span className="text-slate-500">{value} · {percent}%</span>
      </div>
      <div className="h-3 rounded-full bg-slate-100">
        <div className={`h-3 rounded-full ${color}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
