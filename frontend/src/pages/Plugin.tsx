import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import RiskBadge from '../components/RiskBadge';
import StatCard from '../components/StatCard';
import { pluginApi } from '../services/api';
import { FeedbackCaseItem, PluginEventStats, PluginPolicyBundle, PluginSyncEventItem } from '../types';
import { formatDate, pluginEventText } from '../utils';

export default function Plugin() {
  const [events, setEvents] = useState<PluginSyncEventItem[]>([]);
  const [feedbackCases, setFeedbackCases] = useState<FeedbackCaseItem[]>([]);
  const [stats, setStats] = useState<PluginEventStats | null>(null);
  const [policy, setPolicy] = useState<PluginPolicyBundle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      pluginApi.getEvents(),
      pluginApi.getStats(),
      pluginApi.getPolicy(),
      pluginApi.getFeedbackCases(),
    ])
      .then(([eventData, statsData, policyData, feedbackData]) => {
        setEvents(eventData.events || []);
        setStats(statsData);
        setPolicy(policyData);
        setFeedbackCases(feedbackData.cases || []);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="插件运行与同步"
        description="管理员在这里查看插件版本、默认配置、策略下发边界和事件回传。插件是浏览器侧执行端，核心资产仍沉淀在 Web 平台。"
        action={<Link to="/app/admin/stats" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">查看统计</Link>}
      />

      <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-6">
        <p className="text-sm font-semibold text-emerald-800">策略下发</p>
        <h2 className="mt-2 text-2xl font-bold text-slate-950">插件只拉取必要策略并执行现场动作。</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">
          当前规则版本 {policy?.rule_version || '-'}，插件默认配置由后端下发；个人策略和全局名单仍由网站维护。
        </p>
      </section>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="插件版本" value={policy?.plugin_version || '1.0.0'} description="Manifest V3 执行端" tone="blue" />
        <StatCard title="同步事件" value={stats?.total_events || 0} description="插件回传到平台" tone="slate" />
        <StatCard title="Warning 触发" value={stats?.warning_events || 0} description="恶意页面拦截" tone="red" />
        <StatCard title="误报反馈" value={feedbackCases.length} description="进入样本与误报队列" tone="amber" />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="用户白名单" value={policy?.user_trusted_hosts.length || 0} tone="green" />
        <StatCard title="用户黑名单" value={policy?.user_blocked_hosts.length || 0} tone="red" />
        <StatCard title="全局白名单" value={policy?.global_trusted_hosts.length || 0} tone="green" />
        <StatCard title="全局黑名单" value={policy?.global_blocked_hosts.length || 0} tone="red" />
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-950">插件事件流</h2>
            <p className="text-sm text-slate-500">扫描、warning、bypass、trust 和反馈都会回传到这里。</p>
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
            { key: 'risk_label', title: '风险', render: (value) => value ? <RiskBadge label={value} size="sm" /> : '-' },
            { key: 'risk_score', title: '分数', render: (value) => typeof value === 'number' ? value.toFixed(1) : '-' },
            { key: 'created_at', title: '时间', render: (value) => formatDate(value) },
            { key: 'scan_record_id', title: '报告', render: (value) => value ? <Link to={`/app/reports/${value}`} className="font-semibold text-emerald-700">#{value}</Link> : '-' },
          ]}
        />
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">插件默认配置</h2>
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-3">
          <ConfigItem label="API 地址" value={policy?.defaults.api_base_url || '-'} />
          <ConfigItem label="Web 地址" value={policy?.defaults.web_base_url || '-'} />
          <ConfigItem label="自动检测" value={policy?.defaults.auto_detect ? '开启' : '关闭'} />
          <ConfigItem label="恶意自动拦截" value={policy?.defaults.auto_block_malicious ? '开启' : '关闭'} />
          <ConfigItem label="可疑通知" value={policy?.defaults.notify_suspicious ? '开启' : '关闭'} />
          <ConfigItem label="事件回传" value={policy?.defaults.event_upload_enabled ? '开启' : '关闭'} />
        </div>
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
