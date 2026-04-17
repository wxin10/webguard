import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import RiskBadge from '../components/RiskBadge';
import StatCard from '../components/StatCard';
import StatusNotice from '../components/StatusNotice';
import { pluginService } from '../services/pluginService';
import type { PluginBootstrap, PluginSyncEventItem } from '../types';
import { formatDate, pluginEventText } from '../utils';

type FilterKey = 'all' | 'scan' | 'warning' | 'action' | 'feedback';

export default function PluginSync() {
  const [events, setEvents] = useState<PluginSyncEventItem[]>([]);
  const [bootstrap, setBootstrap] = useState<PluginBootstrap | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [eventData, bootstrapData] = await Promise.all([
          pluginService.getMyEvents(),
          pluginService.getBootstrap().catch(() => null),
        ]);
        setEvents(eventData.events || []);
        setBootstrap(bootstrapData);
      } catch (err) {
        setError(err instanceof Error ? err.message : '插件同步事件加载失败。');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const visibleEvents = useMemo(() => events.filter((event) => {
    if (filter === 'scan') return event.event_type === 'scan';
    if (filter === 'warning') return event.event_type === 'warning';
    if (filter === 'feedback') return event.event_type === 'feedback';
    if (filter === 'action') return ['bypass', 'trust', 'temporary_trust'].includes(event.event_type);
    return true;
  }), [events, filter]);

  const latestEvent = events[0];
  const warningCount = events.filter((event) => event.event_type === 'warning').length;
  const actionCount = events.filter((event) => ['bypass', 'trust', 'temporary_trust'].includes(event.event_type)).length;

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="插件同步记录"
        description="插件只上传当前页扫描和现场处置动作；记录、报告和策略都由网站主平台承接。"
        action={
          <Link to="/app/my-domains" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            管理个人策略
          </Link>
        }
      />

      {error && <StatusNotice tone="error">{error}</StatusNotice>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="插件配置版本" value={bootstrap?.current_rule_version || '-'} description="来自后端 bootstrap" tone="blue" />
        <StatCard title="最近同步" value={latestEvent ? formatDate(latestEvent.created_at) : '-'} description={latestEvent?.plugin_version ? `插件 ${latestEvent.plugin_version}` : '暂无插件事件'} tone={latestEvent ? 'green' : 'slate'} />
        <StatCard title="Warning 触发" value={warningCount} tone="red" />
        <StatCard title="现场处置动作" value={actionCount} description="bypass / trust / temporary trust" tone="amber" />
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
          { key: 'created_at', title: '时间', render: (value) => formatDate(String(value || '')) },
          { key: 'event_type', title: '事件', render: (_value, row) => pluginEventText(row.event_type, row.action) },
          { key: 'url', title: 'URL / Host', render: (value, row) => <span className="block max-w-lg truncate">{String(value || row.host || row.domain || '-')}</span> },
          { key: 'risk_level', title: '风险', render: (value, row) => (value || row.risk_label) ? <RiskBadge label={String(value || row.risk_label)} size="sm" /> : '-' },
          { key: 'risk_score', title: '分数', render: (value) => typeof value === 'number' ? value.toFixed(1) : '-' },
          { key: 'summary', title: '摘要', render: (value) => <span className="block max-w-md truncate">{String(value || '-')}</span> },
          { key: 'plugin_version', title: '版本', render: (value) => String(value || '-') },
          {
            key: 'scan_record_id',
            title: '报告',
            render: (value) => value ? <Link to={`/app/reports/${value}`} className="font-semibold text-blue-700">打开</Link> : '-',
          },
        ]}
      />
    </div>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} type="button" className={`rounded-lg px-4 py-2 text-sm font-semibold ${active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
      {children}
    </button>
  );
}
