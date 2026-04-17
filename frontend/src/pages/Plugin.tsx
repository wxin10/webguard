import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import RiskBadge from '../components/RiskBadge';
import StatCard from '../components/StatCard';
import { adminPluginService, pluginService } from '../services/api';
import { AdminPluginConfig, PluginSyncEventItem } from '../types';
import { formatDate, pluginEventText } from '../utils';

export default function Plugin() {
  const [events, setEvents] = useState<PluginSyncEventItem[]>([]);
  const [config, setConfig] = useState<AdminPluginConfig | null>(null);
  const [draft, setDraft] = useState({ api_base_url: '', web_base_url: '' });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const loadData = () => {
    setLoading(true);
    Promise.all([adminPluginService.getConfig(), pluginService.getEvents()])
      .then(([configData, eventData]) => {
        setConfig(configData);
        setDraft({
          api_base_url: configData.config.api_base_url,
          web_base_url: configData.config.web_base_url,
        });
        setEvents(eventData.events || []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(loadData, []);

  const saveConfig = async (event: FormEvent) => {
    event.preventDefault();
    await adminPluginService.updateConfig({
      api_base_url: draft.api_base_url,
      web_base_url: draft.web_base_url,
    });
    setMessage('插件默认配置已更新，插件下次 bootstrap 时会读取新配置。');
    loadData();
  };

  if (loading || !config) return <LoadingBlock />;

  const stats = config.stats;

  return (
    <div>
      <PageHeader
        title="插件运行与同步"
        description="管理员在网站主平台维护插件默认配置、规则版本和事件回传状态；插件只是浏览器现场执行端。"
        action={<Link to="/app/admin/stats" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">查看统计</Link>}
      />

      {message && <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{message}</div>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="规则版本" value={config.rule_version} tone="blue" />
        <StatCard title="同步事件" value={stats.total_events} tone="slate" />
        <StatCard title="Warning 触发" value={stats.warning_events} tone="red" />
        <StatCard title="Bypass / Trust" value={stats.bypass_events + stats.trust_events} tone="amber" />
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">插件默认配置</h2>
        <form onSubmit={saveConfig} className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_120px]">
          <input value={draft.api_base_url} onChange={(event) => setDraft({ ...draft, api_base_url: event.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-emerald-500" />
          <input value={draft.web_base_url} onChange={(event) => setDraft({ ...draft, web_base_url: event.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-emerald-500" />
          <button className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700">保存</button>
        </form>
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
          <ConfigItem label="自动检测" value={config.config.auto_detect ? '开启' : '关闭'} />
          <ConfigItem label="恶意自动拦截" value={config.config.auto_block_malicious ? '开启' : '关闭'} />
          <ConfigItem label="可疑通知" value={config.config.notify_suspicious ? '开启' : '关闭'} />
          <ConfigItem label="事件回传" value={config.config.event_upload_enabled ? '开启' : '关闭'} />
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-950">插件事件流</h2>
            <p className="text-sm text-slate-500">扫描、warning、bypass、trust 和 feedback 都回传到主平台。</p>
          </div>
          <Link to="/app/admin/samples" className="text-sm font-semibold text-emerald-700">处理样本与误报</Link>
        </div>
        <DataTable
          data={events.slice(0, 30)}
          emptyText="暂无插件同步事件。"
          columns={[
            { key: 'event_type', title: '事件', render: (_value, row) => pluginEventText(row.event_type, row.action) },
            { key: 'username', title: '用户' },
            { key: 'url', title: 'URL', render: (value) => <span className="block max-w-lg truncate">{value || '-'}</span> },
            { key: 'risk_label', title: '风险', render: (value, row) => (value || row.risk_level) ? <RiskBadge label={value || row.risk_level} size="sm" /> : '-' },
            { key: 'risk_score', title: '分数', render: (value) => typeof value === 'number' ? value.toFixed(1) : '-' },
            { key: 'created_at', title: '时间', render: (value) => formatDate(value) },
            { key: 'scan_record_id', title: '报告', render: (value) => value ? <Link to={`/app/reports/${value}`} className="font-semibold text-emerald-700">#{value}</Link> : '-' },
          ]}
        />
      </section>
    </div>
  );
}

function ConfigItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-4">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 break-all font-semibold text-slate-900">{value}</p>
    </div>
  );
}
