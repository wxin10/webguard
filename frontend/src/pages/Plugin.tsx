import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import RiskBadge from '../components/RiskBadge';
import StatCard from '../components/StatCard';
import StatusNotice from '../components/StatusNotice';
import { adminPluginService } from '../services/adminPluginService';
import { pluginService } from '../services/pluginService';
import type { AdminPluginConfig, PluginDefaultConfig, PluginSyncEventItem } from '../types';
import { formatDate, pluginEventText } from '../utils';

export default function Plugin() {
  const [events, setEvents] = useState<PluginSyncEventItem[]>([]);
  const [config, setConfig] = useState<AdminPluginConfig | null>(null);
  const [draft, setDraft] = useState<PluginDefaultConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [configData, eventData] = await Promise.all([
        adminPluginService.getConfig(),
        pluginService.getEvents().catch(() => ({ events: [] })),
      ]);
      setConfig(configData);
      setDraft(configData.config);
      setEvents(eventData.events || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '插件配置加载失败。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const saveConfig = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    await adminPluginService.updateConfig(draft);
    setMessage('插件默认配置已更新，插件下次策略同步时会读取新配置。');
    loadData();
  };

  if (loading || !config || !draft) return <LoadingBlock />;

  const stats = config.stats;

  return (
    <div>
      <PageHeader
        title="插件运行与同步"
        description="管理员在网站主平台维护插件默认配置、规则版本和事件回传状态；插件只是浏览器现场执行端。"
        action={
          <Link to="/app/admin/stats" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            查看统计
          </Link>
        }
      />

      {message && <StatusNotice tone="success">{message}</StatusNotice>}
      {error && <StatusNotice tone="error">{error}</StatusNotice>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="规则版本" value={config.rule_version} tone="blue" />
        <StatCard title="同步事件" value={stats.total_events} tone="slate" />
        <StatCard title="安全预警触发" value={stats.warning_events} tone="red" />
        <StatCard title="现场处置" value={stats.bypass_events + stats.trust_events} tone="amber" />
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">插件默认配置</h2>
        <form onSubmit={saveConfig} className="mt-4 space-y-4">
          <div className="grid gap-3 lg:grid-cols-2">
            <label className="block">
              <span className="text-sm font-semibold text-slate-600">API 地址</span>
              <input value={draft.api_base_url} onChange={(event) => setDraft({ ...draft, api_base_url: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500" />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-600">Web 地址</span>
              <input value={draft.web_base_url} onChange={(event) => setDraft({ ...draft, web_base_url: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500" />
            </label>
          </div>
          <div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
            <Toggle label="自动检测" checked={draft.auto_detect} onChange={(checked) => setDraft({ ...draft, auto_detect: checked })} />
            <Toggle label="恶意自动拦截" checked={draft.auto_block_malicious} onChange={(checked) => setDraft({ ...draft, auto_block_malicious: checked })} />
            <Toggle label="可疑站点通知" checked={draft.notify_suspicious} onChange={(checked) => setDraft({ ...draft, notify_suspicious: checked })} />
            <Toggle label="事件回传" checked={draft.event_upload_enabled} onChange={(checked) => setDraft({ ...draft, event_upload_enabled: checked })} />
          </div>
          <button className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700">保存配置</button>
        </form>
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-950">插件事件流</h2>
            <p className="text-sm text-slate-500">扫描、安全预警、继续访问、信任和反馈都会回传到主平台。</p>
          </div>
          <Link to="/app/admin/samples" className="text-sm font-semibold text-blue-700">处理样本与误报</Link>
        </div>
        <DataTable
          data={events.slice(0, 30)}
          emptyText="暂无插件同步事件。"
          columns={[
            { key: 'event_type', title: '事件', render: (_value, row) => pluginEventText(row.event_type, row.action) },
            { key: 'username', title: '用户', render: (value) => String(value || '-') },
            { key: 'url', title: 'URL', render: (value) => <span className="block max-w-lg truncate">{String(value || '-')}</span> },
            { key: 'risk_level', title: '风险', render: (value, row) => (value || row.risk_label) ? <RiskBadge label={String(value || row.risk_label)} size="sm" /> : '-' },
            { key: 'risk_score', title: '分数', render: (value) => typeof value === 'number' ? value.toFixed(1) : '-' },
            { key: 'created_at', title: '时间', render: (value) => formatDate(String(value || '')) },
            { key: 'scan_record_id', title: '报告', render: (value) => value ? <Link to={`/app/reports/${value}`} className="font-semibold text-blue-700">#{String(value)}</Link> : '-' },
          ]}
        />
      </section>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-4 py-3">
      <span className="font-semibold text-slate-700">{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-blue-600" />
    </label>
  );
}
