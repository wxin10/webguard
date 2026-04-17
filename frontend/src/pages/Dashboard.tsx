import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import RiskBadge from '../components/RiskBadge';
import StatCard from '../components/StatCard';
import StatusNotice from '../components/StatusNotice';
import { useAuth } from '../contexts/AuthContext';
import { adminPluginService } from '../services/adminPluginService';
import { adminRulesService } from '../services/adminRulesService';
import { adminStatsService } from '../services/adminStatsService';
import { domainsService } from '../services/domainsService';
import { pluginService } from '../services/pluginService';
import { recordsService } from '../services/recordsService';
import type { AdminRuleItem, DomainListItem, PluginSyncEventItem, ScanRecordItem, StatsOverview, TrendPoint } from '../types';
import { formatDate, scanSourceText } from '../utils';

export default function Dashboard() {
  const { user } = useAuth();
  return user?.role === 'admin' ? <AdminDashboard /> : <UserWorkspace />;
}

function UserWorkspace() {
  const [records, setRecords] = useState<ScanRecordItem[]>([]);
  const [domains, setDomains] = useState<DomainListItem[]>([]);
  const [events, setEvents] = useState<PluginSyncEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [recordData, domainData, eventData] = await Promise.all([
          recordsService.getMyRecords(),
          domainsService.getMyDomains(),
          pluginService.getMyEvents().catch(() => ({ events: [] })),
        ]);
        setRecords(recordData.records || []);
        setDomains((domainData.items || []).filter((item) => item.status !== 'disabled'));
        setEvents(eventData.events || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : '工作台数据加载失败。');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  if (loading) return <LoadingBlock />;

  const latest = records[0];
  const pluginRecords = records.filter((item) => item.source === 'plugin');
  const riskyRecords = records.filter((item) => ['suspicious', 'malicious'].includes(item.risk_level || item.label));
  const bypassCount = domains.filter((item) => item.list_type === 'temp_bypass').length;

  return (
    <div>
      <PageHeader
        title="个人安全工作台"
        description="网站是用户主控制台：检测、记录、报告、个人策略和插件同步都从这里进入。"
        action={
          <Link to="/app/scan" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            提交 URL 检测
          </Link>
        }
      />

      {error && <StatusNotice tone="error">{error}</StatusNotice>}

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard title="检测记录" value={records.length} description="Web 检测与插件同步" tone="blue" />
        <StatCard title="风险提醒" value={riskyRecords.length} description="可疑或恶意结论" tone="amber" />
        <StatCard title="插件同步" value={pluginRecords.length || events.length} description="来自浏览器执行端" tone="green" />
        <StatCard title="个人策略" value={domains.length} description={`${bypassCount} 个临时放行`} tone="slate" />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-950">最近报告</h2>
          {latest ? (
            <div className="mt-5">
              <RiskBadge label={latest.risk_level || latest.label} />
              <p className="mt-4 break-all text-sm font-semibold text-slate-900">{latest.url}</p>
              <p className="mt-2 text-sm text-slate-500">风险分 {Number(latest.risk_score || 0).toFixed(1)} · {scanSourceText(latest.source)} · {formatDate(latest.created_at)}</p>
              <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-600">{latest.summary || latest.explanation || '暂无解释信息'}</p>
              <Link to={`/app/reports/${latest.report_id || latest.id}`} className="mt-5 inline-flex rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
                打开详细报告
              </Link>
            </div>
          ) : (
            <div className="mt-5 rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500">暂无报告。</div>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-950">常用入口</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <TaskLink title="提交 URL 检测" text="生成风险等级、分数、摘要原因和正式报告。" to="/app/scan" tone="blue" />
            <TaskLink title="查看我的记录" text="统一查看网站检测和插件上传的 ScanRecord。" to="/app/my-records" tone="amber" />
            <TaskLink title="维护站点策略" text="管理信任、阻止和临时放行域名。" to="/app/my-domains" tone="slate" />
            <TaskLink title="插件同步状态" text="查看 warning、bypass、trust 和 feedback 回传。" to="/app/plugin-sync" tone="green" />
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
  const [rules, setRules] = useState<AdminRuleItem[]>([]);
  const [pluginVersion, setPluginVersion] = useState('-');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [overviewData, recordsData, trendData, ruleData, pluginData] = await Promise.all([
          adminStatsService.getOverview(),
          recordsService.getRecords(),
          adminStatsService.getTrend().catch(() => ({ trend: [] })),
          adminRulesService.getRules().catch(() => ({ rules: [] })),
          adminPluginService.getConfig().catch(() => null),
        ]);
        setOverview(overviewData);
        setRecords(recordsData.records || []);
        setTrend(trendData.trend || []);
        setRules(ruleData.rules || []);
        setPluginVersion(pluginData?.rule_version || '-');
      } catch (err) {
        setError(err instanceof Error ? err.message : '运营控制台数据加载失败。');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const reviewQueue = useMemo(() => records.filter((item) => (item.risk_level || item.label) !== 'safe'), [records]);
  const activeRules = rules.filter((rule) => rule.status === 'active' || rule.enabled);
  const maxTrend = Math.max(...trend.map((item) => item.count), 1);

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="运营控制台"
        description="管理员从这里进入统计、规则、名单、样本和插件策略管理，后端是统一检测与规则中台。"
        action={
          <Link to="/app/admin/rules" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            进入规则管理
          </Link>
        }
      />

      {error && <StatusNotice tone="error">{error}</StatusNotice>}

      <section className="grid gap-4 md:grid-cols-5">
        <StatCard title="总检测" value={overview?.total_scans || 0} tone="blue" />
        <StatCard title="今日检测" value={overview?.today_scans || 0} tone="slate" />
        <StatCard title="待复核" value={reviewQueue.length} tone="amber" />
        <StatCard title="启用规则" value={activeRules.length} tone="green" />
        <StatCard title="规则版本" value={pluginVersion} description="下发给插件" tone="slate" />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-950">风险趋势</h2>
              <p className="text-sm text-slate-500">检测量与风险分布用于指导规则运营。</p>
            </div>
            <Link to="/app/admin/stats" className="text-sm font-semibold text-blue-700">统计详情</Link>
          </div>
          <div className="mt-6 flex h-56 items-end gap-3">
            {trend.length ? trend.map((item) => (
              <div key={item.date} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex w-full items-end gap-1">
                  <div className="w-full rounded-t bg-emerald-500" style={{ height: `${Math.max((item.safe_count / maxTrend) * 190, 6)}px` }} />
                  <div className="w-full rounded-t bg-amber-500" style={{ height: `${Math.max((item.suspicious_count / maxTrend) * 190, 6)}px` }} />
                  <div className="w-full rounded-t bg-red-500" style={{ height: `${Math.max((item.malicious_count / maxTrend) * 190, 6)}px` }} />
                </div>
                <span className="text-xs text-slate-400">{item.date.slice(5)}</span>
              </div>
            )) : <div className="flex h-full w-full items-center justify-center text-sm text-slate-500">暂无趋势数据</div>}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">规则运营视角</h2>
          <div className="mt-4 space-y-3">
            {rules.slice(0, 5).map((rule) => (
              <div key={rule.id} className="rounded-lg bg-slate-50 p-4">
                <p className="font-semibold text-slate-950">{rule.name}</p>
                <p className="mt-1 text-xs text-slate-500">{rule.rule_key || rule.pattern}</p>
                <p className="mt-2 text-sm text-slate-700">{rule.type} · {rule.scope} · {rule.status}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-950">最新风险报告</h2>
            <p className="text-sm text-slate-500">从报告页查看完整评分拆解、命中规则和处置动作。</p>
          </div>
          <Link to="/app/admin/records" className="text-sm font-semibold text-blue-700">全部记录</Link>
        </div>
        <DataTable
          data={records.slice(0, 8)}
          columns={[
            { key: 'url', title: 'URL', render: (value) => <span className="block max-w-md truncate">{String(value || '-')}</span> },
            { key: 'label', title: '风险', render: (value, row) => <RiskBadge label={String(row.risk_level || value || 'unknown')} size="sm" /> },
            { key: 'risk_score', title: '评分', render: (value) => Number(value || 0).toFixed(1) },
            { key: 'source', title: '来源', render: (value) => scanSourceText(String(value || '')) },
            { key: 'created_at', title: '时间', render: (value) => formatDate(String(value || '')) },
            { key: 'id', title: '报告', render: (value, row) => <Link className="font-semibold text-blue-700" to={`/app/reports/${row.report_id || value}`}>打开</Link> },
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
    blue: 'border-blue-200 bg-blue-50 hover:bg-blue-100',
    slate: 'border-slate-200 bg-slate-50 hover:bg-slate-100',
  }[tone];

  return (
    <Link to={to} className={`block rounded-lg border p-5 transition ${toneClass}`}>
      <h3 className="font-bold text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </Link>
  );
}
