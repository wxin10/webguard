import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import RiskBadge from '../components/RiskBadge';
import StatCard from '../components/StatCard';
import { pluginApi, userStrategyApi } from '../services/api';
import { PluginEventStats, PluginPolicyBundle, PluginSyncEventItem, UserStrategyOverview } from '../types';
import { formatDate, pluginEventText, strategyText } from '../utils';

type FilterKey = 'all' | 'scan' | 'warning' | 'action' | 'feedback';

export default function PluginSync() {
  const [events, setEvents] = useState<PluginSyncEventItem[]>([]);
  const [stats, setStats] = useState<PluginEventStats | null>(null);
  const [policy, setPolicy] = useState<PluginPolicyBundle | null>(null);
  const [strategies, setStrategies] = useState<UserStrategyOverview | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const loadData = () => {
    setLoading(true);
    Promise.all([pluginApi.getEvents(), pluginApi.getStats(), pluginApi.getPolicy(), userStrategyApi.getStrategies()])
      .then(([eventData, statsData, policyData, strategyData]) => {
        setEvents(eventData.events || []);
        setStats(statsData);
        setPolicy(policyData);
        setStrategies(strategyData);
      })
      .finally(() => setLoading(false));
  };

  useEffect(loadData, []);

  const visibleEvents = useMemo(() => events.filter((event) => {
    if (filter === 'scan') return event.event_type === 'scan';
    if (filter === 'warning') return event.event_type === 'warning';
    if (filter === 'feedback') return event.event_type === 'feedback';
    if (filter === 'action') return ['bypass', 'trust', 'temporary_trust'].includes(event.event_type);
    return true;
  }), [events, filter]);
  const latestEvent = events[0];

  const addTrusted = async (event: PluginSyncEventItem) => {
    if (!event.domain) return;
    await userStrategyApi.addTrustedSite({ domain: event.domain, reason: `来自插件同步事件 #${event.id}`, source: 'web' });
    setMessage(`${event.domain} 已加入个人信任域名。`);
    loadData();
  };

  const addBlocked = async (event: PluginSyncEventItem) => {
    if (!event.domain) return;
    await userStrategyApi.addBlockedSite({ domain: event.domain, reason: `来自插件同步事件 #${event.id}`, source: 'web' });
    setMessage(`${event.domain} 已加入个人阻止域名。`);
    loadData();
  };

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="插件同步记录"
        description="插件只上传当前页面扫描和用户现场动作，完整记录、策略沉淀和后续处置都在 Web 平台完成。"
        action={<Link to="/app/my-domains" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">管理个人策略</Link>}
      />

      {message && <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{message}</div>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="插件版本" value={policy?.plugin_version || '1.0.0'} description={`规则版本 ${policy?.rule_version || '-'}`} tone="blue" />
        <StatCard title="最近同步" value={latestEvent ? formatDate(latestEvent.created_at) : '-'} description={latestEvent ? '事件回传正常' : '暂无插件事件'} tone={latestEvent ? 'green' : 'slate'} />
        <StatCard title="Warning 拦截" value={stats?.warning_events || 0} description="恶意页面触发的提醒" tone="red" />
        <StatCard title="继续访问/信任" value={(stats?.bypass_events || 0) + (stats?.trust_events || 0)} description="现场处置动作" tone="amber" />
      </div>

      <section className="my-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>全部事件</FilterButton>
          <FilterButton active={filter === 'scan'} onClick={() => setFilter('scan')}>扫描事件</FilterButton>
          <FilterButton active={filter === 'warning'} onClick={() => setFilter('warning')}>Warning</FilterButton>
          <FilterButton active={filter === 'action'} onClick={() => setFilter('action')}>处置动作</FilterButton>
          <FilterButton active={filter === 'feedback'} onClick={() => setFilter('feedback')}>反馈</FilterButton>
        </div>
      </section>

      <DataTable
        data={visibleEvents}
        emptyText="暂无插件同步事件。"
        columns={[
          { key: 'event_type', title: '事件', render: (_value, row) => pluginEventText(row.event_type, row.action) },
          { key: 'url', title: 'URL', render: (value) => <span className="block max-w-lg truncate">{value || '-'}</span> },
          { key: 'risk_label', title: '风险', render: (value) => value ? <RiskBadge label={value} size="sm" /> : '-' },
          { key: 'risk_score', title: '分数', render: (value) => typeof value === 'number' ? value.toFixed(1) : '-' },
          { key: 'domain', title: '策略状态', render: (value) => policyState(value, strategies) },
          { key: 'created_at', title: '同步时间', render: (value) => formatDate(value) },
          {
            key: 'id',
            title: '处置',
            render: (_value, row) => (
              <div className="flex flex-wrap gap-2">
                {row.scan_record_id && <Link to={`/app/reports/${row.scan_record_id}`} className="font-semibold text-emerald-700">报告</Link>}
                {row.domain && <button onClick={() => addTrusted(row)} className="font-semibold text-slate-700">信任</button>}
                {row.domain && <button onClick={() => addBlocked(row)} className="font-semibold text-rose-700">阻止</button>}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

function policyState(domain: string | undefined, strategies: UserStrategyOverview | null) {
  if (!domain || !strategies) return '未处理';
  const matched = [
    ...strategies.trusted_sites,
    ...strategies.blocked_sites,
    ...strategies.paused_sites,
  ].find((item) => item.domain === domain);
  return matched ? strategyText(matched.strategy_type) : '未处理';
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} type="button" className={`rounded-lg px-4 py-2 text-sm font-semibold ${active ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
      {children}
    </button>
  );
}
