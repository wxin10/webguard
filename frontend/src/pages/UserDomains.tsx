import { FormEvent, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import { blacklistApi, whitelistApi } from '../services/api';
import { BlacklistItem, WhitelistItem } from '../types';
import { formatDate } from '../utils';

export default function UserDomains() {
  const location = useLocation();
  const [tab, setTab] = useState<'trusted' | 'blocked'>('trusted');
  const [trusted, setTrusted] = useState<WhitelistItem[]>([]);
  const [blocked, setBlocked] = useState<BlacklistItem[]>([]);
  const [domain, setDomain] = useState(() => new URLSearchParams(location.search).get('domain') || '');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = () => {
    setLoading(true);
    Promise.all([whitelistApi.getWhitelist(), blacklistApi.getBlacklist()])
      .then(([white, black]) => {
        setTrusted(white.items || []);
        setBlocked(black.items || []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(loadData, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!domain.trim()) return;
    if (tab === 'trusted') await whitelistApi.addToWhitelist({ domain, reason });
    else await blacklistApi.addToBlacklist({ domain, reason, risk_type: 'user_blocked' });
    setDomain('');
    setReason('');
    loadData();
  };

  const data = tab === 'trusted' ? trusted : blocked;

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="我的安全策略"
        description="普通用户在 Web 平台维护自己的信任站点和阻止站点。插件只提供当前站点快捷入口，最终策略仍由 Web 平台统一管理。"
      />
      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex gap-2">
          <button onClick={() => setTab('trusted')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === 'trusted' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>信任站点</button>
          <button onClick={() => setTab('blocked')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === 'blocked' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>阻止站点</button>
        </div>
        <form onSubmit={handleSubmit} className="grid gap-3 md:grid-cols-[1fr_1fr_120px]">
          <input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="example.com" className="rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-blue-500" />
          <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="添加原因" className="rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-blue-500" />
          <button className="rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700">保存</button>
        </form>
      </section>
      <DataTable
        data={data}
        emptyText="暂无站点策略。"
        columns={[
          { key: 'domain', title: '域名' },
          { key: 'reason', title: '原因', render: (value) => value || '-' },
          { key: 'added_at', title: '添加时间', render: (value) => formatDate(value) },
        ]}
      />
    </div>
  );
}
