import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import { pluginApi, rulesApi, statsApi } from '../services/api';
import { FeedbackTrendPoint, PluginEventStats, RiskDistributionResponse, RuleConfig, SourceDistributionResponse, StatsOverview, TrendPoint } from '../types';

export default function Stats() {
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [distribution, setDistribution] = useState<RiskDistributionResponse | null>(null);
  const [sourceDistribution, setSourceDistribution] = useState<SourceDistributionResponse | null>(null);
  const [pluginStats, setPluginStats] = useState<PluginEventStats | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [feedbackTrend, setFeedbackTrend] = useState<FeedbackTrendPoint[]>([]);
  const [rules, setRules] = useState<RuleConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      statsApi.getOverview(),
      statsApi.getRiskDistribution(),
      statsApi.getSourceDistribution(),
      statsApi.getTrend(),
      statsApi.getFeedbackTrend(),
      pluginApi.getStats(),
      rulesApi.getRules(),
    ])
      .then(([overviewData, distributionData, sourceData, trendData, feedbackData, pluginData, ruleData]) => {
        setOverview(overviewData);
        setDistribution(distributionData);
        setSourceDistribution(sourceData);
        setTrend(trendData.trend || []);
        setFeedbackTrend(feedbackData.trend || []);
        setPluginStats(pluginData);
        setRules(ruleData.rules || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const hotRules = useMemo(() => [...rules].sort((a, b) => (b.stats?.recent_hits_7d || 0) - (a.stats?.recent_hits_7d || 0)).slice(0, 8), [rules]);

  if (loading) return <LoadingBlock />;

  const riskTotal = Math.max((distribution?.safe || 0) + (distribution?.suspicious || 0) + (distribution?.malicious || 0), 1);
  const maxTrend = Math.max(...trend.map((item) => item.count), 1);
  const maxFeedback = Math.max(...feedbackTrend.map((item) => item.count), 1);

  return (
    <div>
      <PageHeader
        title="风险统计"
        description="管理员从这里查看检测趋势、插件事件、来源分布和误报处理趋势，辅助规则和策略运营。"
        action={<Link to="/app/admin/rules" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">管理规则</Link>}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <StatCard title="总检测数" value={overview?.total_scans || 0} tone="blue" />
        <StatCard title="今日检测" value={overview?.today_scans || 0} tone="slate" />
        <StatCard title="恶意占比" value={`${Math.round(((distribution?.malicious || 0) / riskTotal) * 100)}%`} tone="red" />
        <StatCard title="可疑占比" value={`${Math.round(((distribution?.suspicious || 0) / riskTotal) * 100)}%`} tone="amber" />
        <StatCard title="插件事件" value={pluginStats?.total_events || 0} tone="green" />
        <StatCard title="误报反馈" value={pluginStats?.feedback_events || 0} tone="amber" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">风险趋势</h2>
          <div className="mt-6 flex h-72 items-end gap-3">
            {trend.map((item) => (
              <Bar key={item.date} value={item.count} max={maxTrend} label={item.date.slice(5)} color="bg-blue-500" />
            ))}
          </div>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">误报处理趋势</h2>
          <div className="mt-6 flex h-72 items-end gap-3">
            {feedbackTrend.map((item) => (
              <Bar key={item.date} value={item.count} max={maxFeedback} label={item.date.slice(5)} color="bg-amber-500" subValue={item.resolved_count} />
            ))}
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">风险分布</h2>
          <div className="mt-6 space-y-5">
            <Distribution label="安全" value={distribution?.safe || 0} total={riskTotal} color="bg-emerald-500" />
            <Distribution label="可疑" value={distribution?.suspicious || 0} total={riskTotal} color="bg-amber-500" />
            <Distribution label="恶意" value={distribution?.malicious || 0} total={riskTotal} color="bg-red-500" />
          </div>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">检测来源分布</h2>
          <div className="mt-6 space-y-5">
            <Distribution label="网站手动检测" value={sourceDistribution?.manual || 0} total={overview?.total_scans || 1} color="bg-blue-500" />
            <Distribution label="插件上传" value={sourceDistribution?.plugin || 0} total={overview?.total_scans || 1} color="bg-emerald-500" />
            <Distribution label="重新检测" value={sourceDistribution?.recheck || 0} total={overview?.total_scans || 1} color="bg-slate-500" />
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-950">规则命中运营视角</h2>
            <p className="mt-1 text-sm text-slate-500">高频命中和误报反馈共同决定下一步规则调优优先级。</p>
          </div>
          <Link to="/app/admin/rules" className="text-sm font-semibold text-emerald-700">调整规则</Link>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">规则</th>
                <th className="px-4 py-3">7 天命中</th>
                <th className="px-4 py-3">风险命中</th>
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
  const percent = Math.round((value / Math.max(total, 1)) * 100);
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

function Bar({ value, max, label, color, subValue }: { value: number; max: number; label: string; color: string; subValue?: number }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-2">
      <div className={`w-full rounded-t ${color}`} title={subValue === undefined ? String(value) : `提交 ${value} / 已处理 ${subValue}`} style={{ height: `${Math.max((value / max) * 240, 8)}px` }} />
      <span className="text-xs text-slate-400">{label}</span>
    </div>
  );
}
