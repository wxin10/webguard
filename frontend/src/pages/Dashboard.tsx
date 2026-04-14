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
  const riskyCount = records.filter((item) => item.label === 'suspicious' || item.label === 'malicious').length;

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="用户安全工作台"
        description="在 Web 平台完成网址检测、报告查看、个人安全策略和插件同步结果管理。插件只负责浏览器侧快速扫描和即时提醒。"
        action={<Link to="/app/scan" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">提交网址检测</Link>}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="我的报告" value={records.length} description="Web 检测与插件同步结果" tone="blue" />
        <StatCard title="需关注风险" value={riskyCount} description="可疑或恶意结论" tone="amber" />
        <StatCard title="插件同步" value={pluginRecords.length} description="来自浏览器辅助组件" tone="green" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h2 className="text-xl font-bold text-slate-950">主要操作</h2>
              <p className="mt-1 text-sm text-slate-500">检测、报告、策略都回到 Web 平台完成。</p>
            </div>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <ActionCard title="检测一个网址" text="提交 URL 并生成结构化风险报告。" to="/app/scan" />
            <ActionCard title="查看我的报告" text="按风险等级和来源追踪历史结果。" to="/app/my-records" />
            <ActionCard title="管理个人策略" text="维护自己的信任站点和阻止站点。" to="/app/my-domains" />
            <ActionCard title="查看插件同步" text="确认浏览器侧上报的扫描结果。" to="/app/plugin-sync" />
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-950">最近报告</h2>
          {latest ? (
            <div className="mt-5">
              <RiskBadge label={latest.label} />
              <p className="mt-4 break-all text-sm font-semibold text-slate-900">{latest.url}</p>
              <p className="mt-2 text-sm text-slate-500">风险评分 {latest.risk_score.toFixed(1)} · {sourceText(latest.source)} · {formatDate(latest.created_at)}</p>
              <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-600">{latest.explanation || '暂无解释信息'}</p>
              <Link to={`/app/reports/${latest.id}`} className="mt-5 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">打开详细报告</Link>
            </div>
          ) : (
            <p className="mt-5 text-sm text-slate-500">暂无报告，先提交一次网址检测。</p>
          )}
        </section>
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-950">插件同步结果</h2>
            <p className="text-sm text-slate-500">插件只作为浏览器侧辅助入口，所有报告详情继续在 Web 平台查看。</p>
          </div>
          <Link to="/app/plugin-sync" className="text-sm font-semibold text-blue-600">查看全部</Link>
        </div>
        <DataTable
          data={pluginRecords.slice(0, 6)}
          emptyText="暂无插件同步记录。"
          columns={[
            { key: 'url', title: 'URL', render: (value) => <span className="block max-w-lg truncate">{value}</span> },
            { key: 'label', title: '风险', render: (value) => <RiskBadge label={value} size="sm" /> },
            { key: 'risk_score', title: '评分', render: (value) => Number(value).toFixed(1) },
            { key: 'created_at', title: '时间', render: (value) => formatDate(value) },
            { key: 'id', title: '报告', render: (value) => <Link to={`/app/reports/${value}`} className="font-semibold text-blue-600">打开</Link> },
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

  const samples = useMemo(() => records.filter((item) => item.label !== 'safe'), [records]);

  if (loading) return <LoadingBlock />;

  const maxTrend = Math.max(...trend.map((item) => item.count), 1);

  return (
    <div>
      <PageHeader
        title="运营控制台"
        description="管理员在 Web 平台完成全局态势、样本处理、规则、名单、模型和用户运营。插件只提供浏览器侧事件输入。"
        action={<Link to="/app/admin/samples" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">处理样本与误报</Link>}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard title="总检测数" value={overview?.total_scans || 0} description="平台累计任务" tone="blue" />
        <StatCard title="今日检测" value={overview?.today_scans || 0} description="新增检测事件" tone="slate" />
        <StatCard title="安全" value={overview?.safe_count || 0} description="低风险访问" tone="green" />
        <StatCard title="可疑" value={overview?.suspicious_count || 0} description="进入样本池复核" tone="amber" />
        <StatCard title="恶意" value={overview?.malicious_count || 0} description="触发阻断策略" tone="red" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.9fr]">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">风险趋势</h2>
              <p className="text-sm text-slate-500">最近 7 天平台检测量与风险分布。</p>
            </div>
            <Link to="/app/admin/stats" className="text-sm font-semibold text-blue-600">统计详情</Link>
          </div>
          <div className="mt-6 flex h-56 items-end gap-3">
            {trend.map((item) => (
              <div key={item.date} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex w-full items-end gap-1">
                  <div className="w-full rounded-t bg-emerald-500" style={{ height: `${Math.max((item.safe_count / maxTrend) * 190, 6)}px` }} />
                  <div className="w-full rounded-t bg-amber-500" style={{ height: `${Math.max((item.suspicious_count / maxTrend) * 190, 6)}px` }} />
                  <div className="w-full rounded-t bg-red-500" style={{ height: `${Math.max((item.malicious_count / maxTrend) * 190, 6)}px` }} />
                </div>
                <span className="text-xs text-slate-400">{item.date.slice(5)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">运营状态</h2>
          <div className="mt-5 space-y-4">
            <StatusLine label="Web API" value="Online" tone="green" />
            <StatusLine label="插件事件入口" value="辅助上报" tone="blue" />
            <StatusLine label="模型服务" value={modelStatus?.model_type || 'fallback'} tone="blue" />
            <StatusLine label="当前模型" value={modelStatus?.active_model?.name || 'Fallback Model'} tone="slate" />
            <StatusLine label="待复核样本" value={`${samples.length}`} tone="slate" />
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-950">最新平台报告</h2>
            <p className="text-sm text-slate-500">来自 Web 提交与插件辅助上报的统一报告流。</p>
          </div>
          <Link to="/app/admin/records" className="text-sm font-semibold text-blue-600">全部报告</Link>
        </div>
        <DataTable
          data={records.slice(0, 8)}
          columns={[
            { key: 'url', title: 'URL', render: (value) => <span className="block max-w-md truncate">{value}</span> },
            { key: 'label', title: '风险', render: (value) => <RiskBadge label={value} size="sm" /> },
            { key: 'risk_score', title: '评分', render: (value) => Number(value).toFixed(1) },
            { key: 'source', title: '来源', render: (value) => sourceText(value) },
            { key: 'created_at', title: '时间', render: (value) => formatDate(value) },
            { key: 'id', title: '操作', render: (value) => <Link className="font-semibold text-blue-600" to={`/app/reports/${value}`}>报告</Link> },
          ]}
        />
      </section>
    </div>
  );
}

function ActionCard({ title, text, to }: { title: string; text: string; to: string }) {
  return (
    <Link to={to} className="rounded-lg border border-slate-200 bg-slate-50 p-5 transition hover:border-blue-200 hover:bg-blue-50">
      <h3 className="font-bold text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </Link>
  );
}

function StatusLine({ label, value, tone }: { label: string; value: string; tone: 'green' | 'blue' | 'slate' }) {
  const toneClass = tone === 'green' ? 'text-emerald-700 bg-emerald-50' : tone === 'blue' ? 'text-blue-700 bg-blue-50' : 'text-slate-700 bg-slate-50';
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-4">
      <span className="text-sm font-medium text-slate-600">{label}</span>
      <span className={`max-w-[220px] truncate rounded-full px-3 py-1 text-xs font-semibold ${toneClass}`}>{value}</span>
    </div>
  );
}
