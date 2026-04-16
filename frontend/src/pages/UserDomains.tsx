import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import { pluginApi, userStrategyApi } from '../services/api';
import { PluginPolicyBundle, UserSiteStrategyItem } from '../types';
import { formatDate, sourceText, strategyText } from '../utils';

type StrategyTab = 'trusted' | 'blocked' | 'paused';

export default function UserDomains() {
  const location = useLocation();
  const [tab, setTab] = useState<StrategyTab>('trusted');
  const [trusted, setTrusted] = useState<UserSiteStrategyItem[]>([]);
  const [blocked, setBlocked] = useState<UserSiteStrategyItem[]>([]);
  const [paused, setPaused] = useState<UserSiteStrategyItem[]>([]);
  const [policy, setPolicy] = useState<PluginPolicyBundle | null>(null);
  const [domain, setDomain] = useState(() => new URLSearchParams(location.search).get('domain') || '');
  const [reason, setReason] = useState('');
  const [minutes, setMinutes] = useState('30');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = () => {
    setLoading(true);
    Promise.all([userStrategyApi.getStrategies(), pluginApi.getPolicy()])
      .then(([strategies, policyData]) => {
        setTrusted(strategies.trusted_sites || []);
        setBlocked(strategies.blocked_sites || []);
        setPaused(strategies.paused_sites || []);
        setPolicy(policyData);
      })
      .finally(() => setLoading(false));
  };

  useEffect(loadData, []);

  const data = useMemo(() => tab === 'trusted' ? trusted : tab === 'blocked' ? blocked : paused, [blocked, paused, tab, trusted]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const cleanDomain = domain.trim();
    if (!cleanDomain) return;
    if (tab === 'trusted') await userStrategyApi.addTrustedSite({ domain: cleanDomain, reason, source: 'web' });
    if (tab === 'blocked') await userStrategyApi.addBlockedSite({ domain: cleanDomain, reason, source: 'web' });
    if (tab === 'paused') await userStrategyApi.pauseSite({ domain: cleanDomain, reason, source: 'web', minutes: Number(minutes) || 30 });
    setMessage(`${cleanDomain} 已保存到${strategyText(tab)}策略。`);
    setDomain('');
    setReason('');
    loadData();
  };

  const removeItem = async (item: UserSiteStrategyItem) => {
    if (item.strategy_type === 'trusted') await userStrategyApi.removeTrustedSite(item.id);
    if (item.strategy_type === 'blocked') await userStrategyApi.removeBlockedSite(item.id);
    if (item.strategy_type === 'paused') await userStrategyApi.resumeSite({ domain: item.domain, source: 'web' });
    setMessage(`${item.domain} 已${item.strategy_type === 'paused' ? '恢复保护' : '移除'}。`);
    loadData();
  };

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="我的安全策略"
        description="个人信任、阻止和临时放行都以网站为主数据源；插件只拉取策略并保留短期运行缓存。"
      />

      {message && <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{message}</div>}

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="个人信任域名" value={trusted.length} tone="green" />
        <StatCard title="个人阻止域名" value={blocked.length} tone="red" />
        <StatCard title="临时放行" value={paused.length} tone="amber" />
        <StatCard title="全局阻止域名" value={policy?.global_blocked_hosts.length || 0} description="由管理员维护并下发给插件" tone="slate" />
      </div>

      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-wrap gap-2">
          <TabButton active={tab === 'trusted'} onClick={() => setTab('trusted')}>信任域名</TabButton>
          <TabButton active={tab === 'blocked'} onClick={() => setTab('blocked')}>阻止域名</TabButton>
          <TabButton active={tab === 'paused'} onClick={() => setTab('paused')}>临时放行</TabButton>
        </div>
        <form onSubmit={handleSubmit} className="grid gap-3 lg:grid-cols-[1fr_1fr_140px_140px]">
          <input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="example.com" className="rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-emerald-500" />
          <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="添加原因，插件动作也会同步到这里" className="rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-emerald-500" />
          <input value={minutes} onChange={(event) => setMinutes(event.target.value)} disabled={tab !== 'paused'} type="number" min="1" className="rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-emerald-500 disabled:bg-slate-50" />
          <button className="rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-700">保存策略</button>
        </form>
      </section>

      <DataTable
        data={data}
        emptyText="暂无站点策略。"
        columns={[
          { key: 'domain', title: '域名' },
          { key: 'strategy_type', title: '类型', render: (value) => strategyText(value) },
          { key: 'source', title: '来源', render: (value) => sourceText(value) },
          { key: 'reason', title: '原因', render: (value) => value || '-' },
          { key: 'expires_at', title: '有效期', render: (value) => value ? formatDate(value) : '长期' },
          { key: 'updated_at', title: '更新时间', render: (value, row) => formatDate(value || row.created_at) },
          { key: 'id', title: '操作', render: (_value, row) => <button onClick={() => removeItem(row)} className="font-semibold text-emerald-700">{row.strategy_type === 'paused' ? '恢复保护' : '移除'}</button> },
        ]}
      />
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} type="button" className={`rounded-lg px-4 py-2 text-sm font-semibold ${active ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
      {children}
    </button>
  );
}
