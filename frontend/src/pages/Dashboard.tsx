import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import RiskBadge from '../components/RiskBadge';
import StatCard from '../components/StatCard';
import { useAuth } from '../contexts/AuthContext';
import { modelApi, recordsApi, statsApi } from '../services/api';
import { ModelStatus, ScanRecordItem, StatsOverview, TrendPoint } from '../types';
import { formatDate, sourceText } from '../utils';

export default function Dashboard() {
  const { user } = useAuth();
  return user?.role === 'admin' ? <AdminDashboard /> : <UserWorkspace />;
}

function UserWorkspace() {
  const [records, setRecords] = useState<ScanRecordItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    recordsApi.getMyRecords().then((data) => setRecords(data.records || [])).finally(() => setLoading(false));
  }, []);

  const latest = records[0];
  const pluginRecords = records.filter((item) => item.source === 'plugin');
  const riskyRecords = records.filter((item) => item.label === 'suspicious' || item.label === 'malicious');
  const pluginStatus = pluginRecords.length > 0 ? '已同步' : '待连接';

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="个人安全工作台"
        description="从这里开始检测网址、查看最近报告、处理风险提醒，并确认浏览器助手同步状态。"
        action={<Link to="/app/scan" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">快速开始检测</Link>}
      />

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg border border-emerald-200 bg-[#ecf8f0] p-6">
          <p className="text-sm font-semibold text-emerald-800">下一步</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">检测一个网址，生成可追踪风险报告。</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">
            Web 平台负责完整检测、报告和策略管理；浏览器助手只把当前页面的提醒和快速扫描结果同步回来。
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/app/scan" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">提交 URL 检测</Link>
            <Link to="/app/my-records" className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50">查看我的报告</Link>
            <Link to="/app/my-domains" className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">管理安全策略</Link>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
          <StatCard title="最近报告" value={records.length} description="Web 检测与助手同步" tone="green" />
          <StatCard title="风险提醒" value={riskyRecords.length} description="可疑或恶意结论" tone="amber" />
          <StatCard title="助手状态" value={pluginStatus} description={`${pluginRecords.length} 条浏览器同步记录`} tone="blue" />
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-950">最近报告</h2>
              <p className="mt-1 text-sm text-slate-500">先看最新结果，再决定是否加入策略或继续复查。</p>
            </div>
            <Link to="/app/my-records" className="text-sm font-semibold text-emerald-700">全部报告</Link>
          </div>
          {latest ? (
            <div className="mt-5">
              <RiskBadge label={latest.label} />
              <p className="mt-4 break-all text-sm font-semibold text-slate-900">{latest.url}</p>
              <p className="mt-2 text-sm text-slate-500">风险评分 {latest.risk_score.toFixed(1)} · {sourceText(latest.source)} · {formatDate(latest.created_at)}</p>
              <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-600">{latest.explanation || '暂无解释信息'}</p>
              <Link to={`/app/reports/${latest.id}`} className="mt-5 inline-flex rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">打开详细报告</Link>
            </div>
          ) : (
            <div className="mt-5 rounded-lg border border-dashed border-slate-300 p-6 text-sm leading-6 text-slate-500">
              暂无报告。先提交一次网址检测，平台会在这里保留最近结果。
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-950">今天可以处理的任务</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <TaskLink title="快速开始检测" text="提交一个 URL，生成风险判断和处置建议。" to="/app/scan" tone="green" />
            <TaskLink title="查看风险提醒" text="聚焦可疑和恶意结论，优先处理高风险访问。" to="/app/my-records" tone="amber" />
            <TaskLink title="更新我的安全策略" text="维护信任站点和阻止站点，减少重复判断。" to="/app/my-domains" tone="slate" />
            <TaskLink title="确认助手同步" text="查看浏览器当前页扫描结果是否回流到 Web 报告。" to="/app/plugin-sync" tone="blue" />
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-950">浏览器助手同步</h2>
            <p className="text-sm text-slate-500">助手负责当前页提醒和快速扫描，完整报告继续在 Web 平台查看。</p>
          </div>
          <Link to="/app/plugin-guide" className="text-sm font-semibold text-emerald-700">安装或重新连接助手</Link>
        </div>
        <DataTable
          data={pluginRecords.slice(0, 6)}
          emptyText="暂无助手同步记录。安装浏览器助手后，当前页扫描结果会回到这里。"
          columns={[
            { key: 'url', title: 'URL', render: (value) => <span className="block max-w-lg truncate">{value}</span> },
            { key: 'label', title: '风险', render: (value) => <RiskBadge label={value} size="sm" /> },
            { key: 'risk_score', title: '评分', render: (value) => Number(value).toFixed(1) },
            { key: 'created_at', title: '时间', render: (value) => formatDate(value) },
            { key: 'id', title: '报告', render: (value) => <Link to={`/app/reports/${value}`} className="font-semibold text-emerald-700">打开</Link> },
          ]}
        />
      </section>
    </div>
  );
}

function AdminDashboard() {
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [records, setRecords] = useState<ScanRecordItem[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([statsApi.getOverview(), recordsApi.getRecords(), statsApi.getTrend(), modelApi.getModelStatus()])
      .then(([overviewData, recordsData, trendData, modelData]) => {
        setOverview(overviewData);
        setRecords(recordsData.records || []);
        setTrend(trendData.trend || []);
        setModelStatus(modelData);
      })
      .finally(() => setLoading(false));
  }, []);

  const reviewQueue = useMemo(() => records.filter((item) => item.label !== 'safe'), [records]);
  const pluginEvents = records.filter((item) => item.source === 'plugin');

  if (loading) return <LoadingBlock />;

  const maxTrend = Math.max(...trend.map((item) => item.count), 1);

  return (
    <div>
      <PageHeader
        title="运营控制台"
        description="先看风险态势和待处理队列，再调整规则、名单、模型与浏览器助手运行状态。"
        action={<Link to="/app/admin/samples" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">处理样本与误报</Link>}
      />

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-lg border border-rose-200 bg-[#fff1f2] p-6">
          <p className="text-sm font-semibold text-rose-700">当前风险态势</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">{overview?.malicious_count || 0} 个恶意结论需要持续跟踪。</h2>
          <p className="mt-3 text-sm leading-6 text-slate-700">
            总检测 {overview?.total_scans || 0} 次，今日新增 {overview?.today_scans || 0} 次。优先复核可疑与恶意样本，再把确认结果沉淀到规则、名单和模型策略。
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Link to="/app/admin/records" className="rounded-lg bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm">报告总览</Link>
            <Link to="/app/admin/rules" className="rounded-lg bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm">调整规则</Link>
            <Link to="/app/admin/domains" className="rounded-lg bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm">维护名单</Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <StatCard title="待复核样本" value={reviewQueue.length} description="可疑、恶意与误报线索" tone="amber" />
          <StatCard title="助手事件" value={pluginEvents.length} description="浏览器侧辅助上报" tone="blue" />
          <StatCard title="模型服务" value={modelStatus?.model_type || 'fallback'} description={modelStatus?.active_model?.name || 'Fallback Model'} tone="green" />
          <StatCard title="今日检测" value={overview?.today_scans || 0} description="新增检测事件" tone="slate" />
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-950">风险趋势</h2>
              <p className="text-sm text-slate-500">最近 7 天平台检测量与风险分布。</p>
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
          <h2 className="text-lg font-bold text-slate-950">运营入口</h2>
          <div className="mt-5 grid gap-3">
            <TaskLink title="复核样本与误报" text="把争议结论转成可执行的规则或名单调整。" to="/app/admin/samples" tone="amber" />
            <TaskLink title="检查模型与插件状态" text="确认模型、插件版本和辅助上报是否稳定。" to="/app/admin/model" tone="green" />
            <TaskLink title="查看风险报告总览" text="按来源、等级和时间追踪平台报告流。" to="/app/admin/records" tone="slate" />
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-950">最新风险报告</h2>
            <p className="text-sm text-slate-500">Web 提交和浏览器助手上报会进入同一条报告流，运营动作回到平台完成。</p>
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
            { key: 'id', title: '操作', render: (value) => <Link className="font-semibold text-emerald-700" to={`/app/reports/${value}`}>报告</Link> },
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
