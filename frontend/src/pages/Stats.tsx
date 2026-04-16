import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import { rulesApi, statsApi } from '../services/api';
import { RiskDistributionResponse, RuleConfig, StatsOverview, TrendPoint } from '../types';

export default function Stats() {
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [distribution, setDistribution] = useState<RiskDistributionResponse | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [rules, setRules] = useState<RuleConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([statsApi.getOverview(), statsApi.getRiskDistribution(), statsApi.getTrend(), rulesApi.getRules()])
      .then(([overviewData, distributionData, trendData, ruleData]) => {
        setOverview(overviewData);
        setDistribution(distributionData);
        setTrend(trendData.trend || []);
        setRules(ruleData.rules || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const hotRules = useMemo(() => [...rules].sort((a, b) => (b.stats?.recent_hits_7d || 0) - (a.stats?.recent_hits_7d || 0)).slice(0, 8), [rules]);
  const fpRules = rules.filter((rule) => (rule.stats?.false_positive_feedback_7d || 0) > 0);

  if (loading) return <LoadingBlock />;

  const total = Math.max((distribution?.safe || 0) + (distribution?.suspicious || 0) + (distribution?.malicious || 0), 1);
  const maxTrend = Math.max(...trend.map((item) => item.count), 1);

  return (
    <div>
      <PageHeader
        title="风险统计"
        description="把平台风险分布和规则命中频率放在一起看，方便运营调整规则。"
        action={<Link to="/app/admin/rules" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">管理规则</Link>}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <StatCard title="总检测数" value={overview?.total_scans || 0} tone="blue" />
        <StatCard title="今日检测数" value={overview?.today_scans || 0} tone="slate" />
        <StatCard title="安全占比" value={`${Math.round(((distribution?.safe || 0) / total) * 100)}%`} tone="green" />
        <StatCard title="可疑占比" value={`${Math.round(((distribution?.suspicious || 0) / total) * 100)}%`} tone="amber" />
        <StatCard title="恶意占比" value={`${Math.round(((distribution?.malicious || 0) / total) * 100)}%`} tone="red" />
        <StatCard title="误报关注规则" value={fpRules.length} tone="amber" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">风险分布</h2>
          <div className="mt-6 space-y-5">
            <Distribution label="安全" value={distribution?.safe || 0} total={total} color="bg-emerald-500" />
            <Distribution label="可疑" value={distribution?.suspicious || 0} total={total} color="bg-amber-500" />
            <Distribution label="恶意" value={distribution?.malicious || 0} total={total} color="bg-red-500" />
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
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

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-950">规则命中运营视角</h2>
            <p className="mt-1 text-sm text-slate-500">最近 7 天哪些规则命中多，哪些规则带有误报反馈。</p>
          </div>
          <Link to="/app/admin/rules" className="text-sm font-semibold text-emerald-700">调整权重与阈值</Link>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">规则</th>
                <th className="px-4 py-3">7 天命中</th>
                <th className="px-4 py-3">命中占比</th>
                <th className="px-4 py-3">可疑/恶意</th>
                <th className="px-4 py-3">误报反馈</th>
                <th className="px-4 py-3">建议</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {hotRules.map((rule) => (
                <tr key={rule.rule_key}>
                  <td className="px-4 py-4">
                    <p className="font-semibold text-slate-950">{rule.name || rule.rule_name}</p>
                    <p className="text-xs text-slate-500">{rule.rule_key}</p>
                  </td>
                  <td className="px-4 py-4 text-sm">{rule.stats?.recent_hits_7d || 0}</td>
                  <td className="px-4 py-4 text-sm">{(((rule.stats?.recent_hit_rate_7d || 0) * 100)).toFixed(1)}%</td>
                  <td className="px-4 py-4 text-sm">{rule.stats?.risk_hits_7d || 0}</td>
                  <td className="px-4 py-4 text-sm">{rule.stats?.false_positive_feedback_7d || 0}</td>
                  <td className="px-4 py-4 text-sm text-slate-700">{rule.stats?.false_positive_tendency || '继续观察'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
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
