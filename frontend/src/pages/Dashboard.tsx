import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import RiskBadge from '../components/RiskBadge';
import StatCard from '../components/StatCard';
import { useAuth } from '../contexts/AuthContext';
import { modelApi, recordsApi, rulesApi, statsApi, userStrategyApi } from '../services/api';
import { ModelStatus, RuleConfig, ScanRecordItem, StatsOverview, TrendPoint, UserStrategyOverview } from '../types';
import { formatDate, sourceText } from '../utils';

export default function Dashboard() {
  const { user } = useAuth();
  return user?.role === 'admin' ? <AdminDashboard /> : <UserWorkspace />;
}

function UserWorkspace() {
  const [records, setRecords] = useState<ScanRecordItem[]>([]);
  const [strategies, setStrategies] = useState<UserStrategyOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([recordsApi.getMyRecords(), userStrategyApi.getStrategies()])
      .then(([recordData, strategyData]) => {
        setRecords(recordData.records || []);
        setStrategies(strategyData);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingBlock />;

  const latest = records[0];
  const pluginRecords = records.filter((item) => item.source === 'plugin');
  const riskyRecords = records.filter((item) => item.label === 'suspicious' || item.label === 'malicious');
  const strategyCount = (strategies?.trusted_sites.length || 0) + (strategies?.blocked_sites.length || 0);

  return (
    <div>
      <PageHeader
        title="个人安全工作台"
        description="查看最近检测、风险提醒和个人站点策略。"
        action={<Link to="/app/scan" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">提交 URL 检测</Link>}
      />

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard title="最近报告" value={records.length} description="Web 检测与助手同步" tone="green" />
        <StatCard title="风险提醒" value={riskyRecords.length} description="可疑或恶意结论" tone="amber" />
        <StatCard title="助手同步" value={pluginRecords.length} description="来自浏览器助手的记录" tone="blue" />
        <StatCard title="我的策略" value={strategyCount} description={`${strategies?.paused_sites.length || 0} 个临时忽略站点`} tone="slate" />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-950">最近报告</h2>
          {latest ? (
            <div className="mt-5">
              <RiskBadge label={latest.label} />
              <p className="mt-4 break-all text-sm font-semibold text-slate-900">{latest.url}</p>
              <p className="mt-2 text-sm text-slate-500">风险分 {latest.risk_score.toFixed(1)} · {sourceText(latest.source)} · {formatDate(latest.created_at)}</p>
              <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-600">{latest.explanation || '暂无解释信息'}</p>
              <Link to={`/app/reports/${latest.id}`} className="mt-5 inline-flex rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">打开详细报告</Link>
            </div>
          ) : (
            <div className="mt-5 rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500">暂无报告。</div>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-950">常用入口</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <TaskLink title="提交 URL 检测" text="生成包含规则分、模型分和融合分的报告。" to="/app/scan" tone="green" />
            <TaskLink title="查看我的报告" text="复盘最近的风险结论和命中规则。" to="/app/my-records" tone="amber" />
            <TaskLink title="维护站点策略" text="管理信任站点、阻止站点和临时忽略。" to="/app/my-domains" tone="slate" />
            <TaskLink title="助手同步状态" text="确认浏览器助手是否回传检测结果。" to="/app/plugin-sync" tone="blue" />
          </div>
        </div>
      </section>
    </div>
  );
}

function AdminDashboard() {
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [records, setRecords] = useState<ScanRecordItem[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [rules, setRules] = useState<RuleConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([statsApi.getOverview(), recordsApi.getRecords(), statsApi.getTrend(), modelApi.getModelStatus(), rulesApi.getRules()])
      .then(([overviewData, recordsData, trendData, modelData, ruleData]) => {
        setOverview(overviewData);
        setRecords(recordsData.records || []);
        setTrend(trendData.trend || []);
        setModelStatus(modelData);
        setRules(ruleData.rules || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const reviewQueue = useMemo(() => records.filter((item) => item.label !== 'safe'), [records]);
  const hotRules = [...rules].sort((a, b) => (b.stats?.recent_hits_7d || 0) - (a.stats?.recent_hits_7d || 0)).slice(0, 5);
  const fpRules = rules.filter((item) => (item.stats?.false_positive_feedback_7d || 0) > 0);

  if (loading) return <LoadingBlock />;

  const maxTrend = Math.max(...trend.map((item) => item.count), 1);

  return (
    <div>
      <PageHeader
        title="运营控制台"
        description="优先查看风险态势、待复核样本和规则命中情况。"
        action={<Link to="/app/admin/rules" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">进入规则管理</Link>}
      />

      <section className="grid gap-4 md:grid-cols-5">
        <StatCard title="总检测" value={overview?.total_scans || 0} tone="blue" />
        <StatCard title="今日检测" value={overview?.today_scans || 0} tone="slate" />
        <StatCard title="待复核" value={reviewQueue.length} tone="amber" />
        <StatCard title="误报关注规则" value={fpRules.length} tone="red" />
        <StatCard title="模型服务" value={modelStatus?.model_type || 'fallback'} description={modelStatus?.active_model?.name || 'Fallback Model'} tone="green" />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-950">风险趋势</h2>
              <p className="text-sm text-slate-500">最近 7 天检测量与风险分布。</p>
            </div>
            <Link to="/app/admin/stats" className="text-sm font-semibold text-emerald-700">统计详情</Link>
          </div>
          <div className="mt-6 flex h-56 items-end gap-3">
            {trend.map((item) => (
              <div key={item.date} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex w-full items-end gap-1">
                  <div className="w-full rounded-t bg-emerald-500" style={{ height: `${Math.max((item.safe_count / maxTrend) * 190, 6)}px` }} />
                  <div className="w-full rounded-t bg-amber-500" style={{ height: `${Math.max((item.suspicious_count / maxTrend) * 190, 6)}px` }} />
                  <div className="w-full rounded-t bg-rose-500" style={{ height: `${Math.max((item.malicious_count / maxTrend) * 190, 6)}px` }} />
                </div>
                <span className="text-xs text-slate-400">{item.date.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">规则运营视角</h2>
          <div className="mt-4 space-y-3">
            {hotRules.map((rule) => (
              <div key={rule.rule_key} className="rounded-lg bg-slate-50 p-4">
                <p className="font-semibold text-slate-950">{rule.name || rule.rule_name}</p>
                <p className="mt-1 text-xs text-slate-500">{rule.rule_key}</p>
                <p className="mt-2 text-sm text-slate-700">7 天命中 {rule.stats?.recent_hits_7d || 0} 次，误报反馈 {rule.stats?.false_positive_feedback_7d || 0} 次。</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-950">最新风险报告</h2>
            <p className="text-sm text-slate-500">从报告页可以继续查看完整评分拆解。</p>
          </div>
          <Link to="/app/admin/records" className="text-sm font-semibold text-emerald-700">全部报告</Link>
        </div>
        <DataTable
          data={records.slice(0, 8)}
          columns={[
            { key: 'url', title: 'URL', render: (value) => <span className="block max-w-md truncate">{value}</span> },
            { key: 'label', title: '风险', render: (value) => <RiskBadge label={value} size="sm" /> },
            { key: 'risk_score', title: '评分', render: (value) => Number(value).toFixed(1) },
            { key: 'source', title: '来源', render: (value) => sourceText(value) },
            { key: 'created_at', title: '时间', render: (value) => formatDate(value) },
            { key: 'id', title: '报告', render: (value) => <Link className="font-semibold text-emerald-700" to={`/app/reports/${value}`}>打开</Link> },
          ]}
        />
      </section>
    </div>
  );
}

function TaskLink({ title, text, to, tone }: { title: string; text: string; to: string; tone: 'green' | 'amber' | 'blue' | 'slate' }) {
  const toneClass = {
    green: 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100',
    amber: 'border-amber-200 bg-amber-50 hover:bg-amber-100',
    blue: 'border-cyan-200 bg-cyan-50 hover:bg-cyan-100',
    slate: 'border-slate-200 bg-slate-50 hover:bg-slate-100',
  }[tone];

  return (
    <Link to={to} className={`block rounded-lg border p-5 transition ${toneClass}`}>
      <h3 className="font-bold text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </Link>
  );
}
