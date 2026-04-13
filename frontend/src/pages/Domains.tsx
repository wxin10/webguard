import { FormEvent, useEffect, useState } from 'react';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import { blacklistApi, whitelistApi } from '../services/api';
import { BlacklistItem, WhitelistItem } from '../types';
import { formatDate } from '../utils';

export default function Domains() {
  const [tab, setTab] = useState<'white' | 'black'>('white');
  const [white, setWhite] = useState<WhitelistItem[]>([]);
  const [black, setBlack] = useState<BlacklistItem[]>([]);
  const [domain, setDomain] = useState('');
  const [reason, setReason] = useState('');
  const [riskType, setRiskType] = useState('phishing');
  const [loading, setLoading] = useState(true);

  const loadData = () => {
    setLoading(true);
    Promise.all([whitelistApi.getWhitelist(), blacklistApi.getBlacklist()])
      .then(([w, b]) => {
        setWhite(w.items || []);
        setBlack(b.items || []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(loadData, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!domain.trim()) return;
    if (tab === 'white') await whitelistApi.addToWhitelist({ domain, reason });
    else await blacklistApi.addToBlacklist({ domain, reason, risk_type: riskType });
    setDomain('');
    setReason('');
    loadData();
  };

  const remove = async (id: number) => {
    if (tab === 'white') await whitelistApi.removeFromWhitelist(id);
    else await blacklistApi.removeFromBlacklist(id);
    loadData();
  };

  if (loading) return <LoadingBlock />;

  const data = tab === 'white' ? white : black;

  return (
    <div>
      <PageHeader title="黑白名单" description="对白名单域名直接降低风险，对黑名单域名直接触发恶意结论，支持原因留存。" />
      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex gap-2">
          <button onClick={() => setTab('white')} className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === 'white' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>白名单</button>
          <button onClick={() => setTab('black')} className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === 'black' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>黑名单</button>
        </div>
        <form onSubmit={handleSubmit} className="grid gap-3 lg:grid-cols-[1fr_1fr_180px_120px]">
          <input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="domain.com" className="rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500" />
          <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="添加原因" className="rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500" />
          <input value={riskType} onChange={(event) => setRiskType(event.target.value)} disabled={tab === 'white'} placeholder="风险类型" className="rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 disabled:bg-slate-50" />
          <button className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700">添加</button>
        </form>
      </section>
      <DataTable
        data={data}
        columns={[
          { key: 'domain', title: '域名' },
          { key: 'reason', title: '原因', render: (value) => value || '-' },
          ...(tab === 'black' ? [{ key: 'risk_type', title: '风险类型', render: (value: string) => value || '-' }] : []),
          { key: 'added_at', title: '添加时间', render: (value) => formatDate(value) },
          { key: 'id', title: '操作', render: (value) => <button onClick={() => remove(value)} className="font-semibold text-red-600">删除</button> },
        ]}
      />
    </div>
  );
}
