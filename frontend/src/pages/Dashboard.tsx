import { useEffect, useState } from 'react';
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
  return user?.role === 'admin' ? <AdminDashboard /> : <UserHome />;
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

  if (loading) return <LoadingBlock />;

  const maxTrend = Math.max(...trend.map((item) => item.count), 1);

  return (
    <div>
      <PageHeader
        title="管理员 Dashboard"
        description="面向安全运营和答辩演示的全局态势总览，覆盖检测量、风险分布、模型状态、插件事件和最近记录。"
        action={<Link to="/records" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">查看全部记录</Link>}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard title="总检测数" value={overview?.total_scans || 0} description="累计检测任务" tone="blue" />
        <StatCard title="今日检测数" value={overview?.today_scans || 0} description="今日新增事件" tone="slate" />
        <StatCard title="安全" value={overview?.safe_count || 0} description="低风险访问" tone="green" />
        <StatCard title="可疑" value={overview?.suspicious_count || 0} description="需要核验" tone="amber" />
        <StatCard title="恶意" value={overview?.malicious_count || 0} description="建议拦截" tone="red" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">风险趋势</h2>
              <p className="text-sm text-slate-500">最近 7 天检测量与风险变化</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">插件在线</span>
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

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">系统状态</h2>
          <div className="mt-5 space-y-4">
            <StatusLine label="后端 API" value="Online" tone="green" />
            <StatusLine label="浏览器插件" value="Connected" tone="green" />
            <StatusLine label="模型服务" value={modelStatus?.model_type || 'mock'} tone="blue" />
            <StatusLine label="当前模型" value={modelStatus?.active_model?.name || 'Mock Fallback'} tone="slate" />
            <StatusLine label="模型目录" value={modelStatus?.loaded_model_dir || '未加载真实模型'} tone="slate" />
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-950">最近检测记录</h2>
            <p className="text-sm text-slate-500">插件与后台联动产生的最新检测事件</p>
          </div>
        </div>
        <DataTable
          data={records.slice(0, 8)}
          columns={[
            { key: 'url', title: 'URL', render: (value) => <span className="block max-w-md truncate">{value}</span> },
            { key: 'label', title: '风险等级', render: (value) => <RiskBadge label={value} size="sm" /> },
            { key: 'risk_score', title: '风险评分', render: (value) => Number(value).toFixed(2) },
            { key: 'source', title: '来源', render: (value) => sourceText(value) },
            { key: 'created_at', title: '检测时间', render: (value) => formatDate(value) },
            { key: 'id', title: '操作', render: (value) => <Link className="font-semibold text-blue-600" to={`/reports/${value}`}>报告</Link> },
          ]}
        />
      </section>
    </div>
  );
}

function UserHome() {
  const [records, setRecords] = useState<ScanRecordItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    recordsApi.getMyRecords().then((data) => setRecords(data.records || [])).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingBlock />;
  const latest = records[0];

  return (
    <div>
      <PageHeader title="普通用户首页" description="面向浏览器插件用户的轻量工作台，突出单网址检测、最近报告和插件使用路径。" />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-slate-950">浏览器防护已准备就绪</h2>
          <p className="mt-3 text-slate-600">访问网页时，插件会采集页面结构、表单、标题与可见文本，后台规则引擎和模型服务会返回风险结论。</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/scan" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">检测一个网址</Link>
            <Link to="/plugin-guide" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">查看插件说明</Link>
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">最近一次报告</h2>
          {latest ? (
            <div className="mt-4">
              <RiskBadge label={latest.label} />
              <p className="mt-4 break-all text-sm font-semibold text-slate-900">{latest.url}</p>
              <p className="mt-2 text-sm text-slate-500">风险评分 {latest.risk_score.toFixed(2)} · {formatDate(latest.created_at)}</p>
              <Link to={`/reports/${latest.id}`} className="mt-5 inline-flex rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">查看报告</Link>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">暂无检测记录，可先进行一次单网址检测。</p>
          )}
        </section>
      </div>
    </div>
  );
}

function StatusLine({ label, value, tone }: { label: string; value: string; tone: 'green' | 'blue' | 'slate' }) {
  const toneClass = tone === 'green' ? 'text-emerald-700 bg-emerald-50' : tone === 'blue' ? 'text-blue-700 bg-blue-50' : 'text-slate-700 bg-slate-50';
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4">
      <span className="text-sm font-medium text-slate-600">{label}</span>
      <span className={`max-w-[220px] truncate rounded-full px-3 py-1 text-xs font-semibold ${toneClass}`}>{value}</span>
    </div>
  );
}
