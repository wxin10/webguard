import { FormEvent, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import { userStrategyApi } from '../services/api';
import { UserSiteStrategyItem } from '../types';
import { formatDate } from '../utils';

export default function UserDomains() {
  const location = useLocation();
  const [tab, setTab] = useState<'trusted' | 'blocked' | 'paused'>('trusted');
  const [trusted, setTrusted] = useState<UserSiteStrategyItem[]>([]);
  const [blocked, setBlocked] = useState<UserSiteStrategyItem[]>([]);
  const [paused, setPaused] = useState<UserSiteStrategyItem[]>([]);
  const [domain, setDomain] = useState(() => new URLSearchParams(location.search).get('domain') || '');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = () => {
    setLoading(true);
    userStrategyApi.getStrategies()
      .then((data) => {
        setTrusted(data.trusted_sites || []);
        setBlocked(data.blocked_sites || []);
        setPaused(data.paused_sites || []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(loadData, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!domain.trim()) return;
    if (tab === 'trusted') await userStrategyApi.addTrustedSite({ domain, reason, source: 'web' });
    if (tab === 'blocked') await userStrategyApi.addBlockedSite({ domain, reason, source: 'web' });
    if (tab === 'paused') await userStrategyApi.pauseSite({ domain, reason, source: 'web', minutes: 30 });
    setMessage(`${domain} 已保存到${tab === 'trusted' ? '信任站点' : tab === 'blocked' ? '阻止站点' : '临时忽略'}。`);
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

  const data = tab === 'trusted' ? trusted : tab === 'blocked' ? blocked : paused;

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="我的安全策略"
        description="这里是你的个人站点策略主数据源。Web 平台和浏览器助手都会优先使用这套后端策略，插件本地只做短期缓存或离线兜底。"
      />

      {message && <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{message}</div>}

      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-wrap gap-2">
          <TabButton active={tab === 'trusted'} onClick={() => setTab('trusted')}>信任站点</TabButton>
          <TabButton active={tab === 'blocked'} onClick={() => setTab('blocked')}>阻止站点</TabButton>
          <TabButton active={tab === 'paused'} onClick={() => setTab('paused')}>临时忽略</TabButton>
        </div>
        <form onSubmit={handleSubmit} className="grid gap-3 md:grid-cols-[1fr_1fr_140px]">
          <input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="example.com" className="rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-emerald-500" />
          <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="添加原因，插件动作也会同步到这里" className="rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-emerald-500" />
          <button className="rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-700">保存策略</button>
        </form>
      </section>

      <DataTable
        data={data}
        emptyText="暂无站点策略。"
        columns={[
          { key: 'domain', title: '域名' },
          { key: 'strategy_type', title: '类型', render: (value) => strategyText(value) },
          { key: 'source', title: '来源', render: (value) => value === 'plugin' ? '浏览器助手' : value === 'report' ? '报告页' : 'Web 平台' },
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

function strategyText(value: string) {
  if (value === 'trusted') return '信任';
  if (value === 'blocked') return '阻止';
  if (value === 'paused') return '临时忽略';
  return value;
}
