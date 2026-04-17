import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import StatusNotice from '../components/StatusNotice';
import { adminRulesService } from '../services/adminRulesService';
import { adminStatsService } from '../services/adminStatsService';
import { pluginService } from '../services/pluginService';
import type { AdminRuleItem, FeedbackTrendPoint, PluginEventStats, RiskDistributionResponse, SourceDistributionResponse, StatsOverview, TrendPoint } from '../types';

export default function Stats() {
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [distribution, setDistribution] = useState<RiskDistributionResponse | null>(null);
  const [sourceDistribution, setSourceDistribution] = useState<SourceDistributionResponse | null>(null);
  const [pluginStats, setPluginStats] = useState<PluginEventStats | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [feedbackTrend, setFeedbackTrend] = useState<FeedbackTrendPoint[]>([]);
  const [rules, setRules] = useState<AdminRuleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [overviewData, distributionData, sourceData, trendData, feedbackData, pluginData, ruleData] = await Promise.all([
          adminStatsService.getOverview(),
          adminStatsService.getRiskDistribution().catch(() => null),
          adminStatsService.getSourceDistribution().catch(() => null),
          adminStatsService.getTrend().catch(() => ({ trend: [] })),
          adminStatsService.getFeedbackTrend().catch(() => ({ trend: [] })),
          pluginService.getStats().catch(() => null),
          adminRulesService.getRules().catch(() => ({ rules: [] })),
        ]);
        setOverview(overviewData);
        setDistribution(distributionData);
        setSourceDistribution(sourceData);
        setTrend(trendData.trend || []);
        setFeedbackTrend(feedbackData.trend || []);
        setPluginStats(pluginData);
        setRules(ruleData.rules || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : '统计数据加载失败。');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const hotRules = useMemo(() => rules.slice(0, 8), [rules]);

  if (loading) return <LoadingBlock />;

  const safe = distribution?.safe ?? overview?.safe_count ?? 0;
  const suspicious = distribution?.suspicious ?? overview?.suspicious_count ?? 0;
  const malicious = distribution?.malicious ?? overview?.malicious_count ?? 0;
  const riskTotal = Math.max(safe + suspicious + malicious, 1);
  const maxTrend = Math.max(...trend.map((item) => item.count), 1);
  const maxFeedback = Math.max(...feedbackTrend.map((item) => item.count), 1);

  return (
    <div>
      <PageHeader
        title="风险统计"
        description="管理员从这里查看检测趋势、插件事件、来源分布和误报处理趋势，辅助规则与策略运营。"
        action={
          <Link to="/app/admin/rules" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            管理规则
          </Link>
        }
      />

      {error && <StatusNotice tone="error">{error}</StatusNotice>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <StatCard title="总检测数" value={overview?.total_scans || 0} tone="blue" />
        <StatCard title="今日检测" value={overview?.today_scans || 0} tone="slate" />
        <StatCard title="高风险数" value={overview?.high_risk_count ?? malicious} tone="red" />
        <StatCard title="可疑数" value={suspicious} tone="amber" />
        <StatCard title="插件事件" value={pluginStats?.total_events ?? overview?.plugin_event_count ?? 0} tone="green" />
        <StatCard title="误报反馈" value={overview?.feedback_count ?? pluginStats?.feedback_events ?? 0} tone="amber" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">风险趋势</h2>
          <div className="mt-6 flex h-72 items-end gap-3">
            {trend.length ? trend.map((item) => (
              <Bar key={item.date} value={item.count} max={maxTrend} label={item.date.slice(5)} color="bg-blue-500" />
            )) : <EmptyChart text="暂无趋势数据" />}
          </div>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">误报处理趋势</h2>
          <div className="mt-6 flex h-72 items-end gap-3">
            {feedbackTrend.length ? feedbackTrend.map((item) => (
              <Bar key={item.date} value={item.count} max={maxFeedback} label={item.date.slice(5)} color="bg-amber-500" subValue={item.resolved_count} />
            )) : <EmptyChart text="暂无反馈趋势数据" />}
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">风险等级分布</h2>
          <div className="mt-6 space-y-5">
            <Distribution label="安全" value={safe} total={riskTotal} color="bg-emerald-500" />
            <Distribution label="可疑" value={suspicious} total={riskTotal} color="bg-amber-500" />
            <Distribution label="恶意" value={malicious} total={riskTotal} color="bg-red-500" />
          </div>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">检测来源分布</h2>
          <div className="mt-6 space-y-5">
            <Distribution label="网站手动检测" value={sourceDistribution?.web ?? sourceDistribution?.manual ?? overview?.source_distribution?.web ?? 0} total={overview?.total_scans || 1} color="bg-blue-500" />
            <Distribution label="插件上传" value={sourceDistribution?.plugin ?? overview?.source_distribution?.plugin ?? 0} total={overview?.total_scans || 1} color="bg-emerald-500" />
            <Distribution label="重新检测" value={sourceDistribution?.recheck ?? overview?.source_distribution?.recheck ?? 0} total={overview?.total_scans || 1} color="bg-slate-500" />
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-950">规则运营视角</h2>
            <p className="mt-1 text-sm text-slate-500">高频规则、插件事件和误报反馈会决定下一步规则调优优先级。</p>
          </div>
          <Link to="/app/admin/rules" className="text-sm font-semibold text-blue-700">调整规则</Link>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">规则</th>
                <th className="px-4 py-3">类型</th>
                <th className="px-4 py-3">作用域</th>
                <th className="px-4 py-3">版本</th>
                <th className="px-4 py-3">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {hotRules.map((rule) => (
                <tr key={rule.id}>
                  <td className="px-4 py-4">
                    <p className="font-semibold text-slate-950">{rule.name}</p>
                    <p className="text-xs text-slate-500">{rule.rule_key || rule.pattern}</p>
                  </td>
                  <td className="px-4 py-4 text-sm">{rule.type}</td>
                  <td className="px-4 py-4 text-sm">{rule.scope}</td>
                  <td className="px-4 py-4 text-sm">{rule.version}</td>
                  <td className="px-4 py-4 text-sm">{rule.status}</td>
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

function EmptyChart({ text }: { text: string }) {
  return <div className="flex h-full w-full items-center justify-center text-sm text-slate-500">{text}</div>;
}
