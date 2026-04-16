import { FormEvent, useEffect, useState } from 'react';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import { blacklistApi, whitelistApi } from '../services/api';
import { BlacklistItem, WhitelistItem } from '../types';
import { formatDate, sourceText } from '../utils';

export default function Domains() {
  const [tab, setTab] = useState<'white' | 'black'>('white');
  const [white, setWhite] = useState<WhitelistItem[]>([]);
  const [black, setBlack] = useState<BlacklistItem[]>([]);
  const [domain, setDomain] = useState('');
  const [reason, setReason] = useState('');
  const [riskType, setRiskType] = useState('phishing');
  const [source, setSource] = useState('admin');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

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
    const cleanDomain = domain.trim();
    if (!cleanDomain) return;
    if (tab === 'white') await whitelistApi.addToWhitelist({ domain: cleanDomain, reason, source, status: 'active' });
    else await blacklistApi.addToBlacklist({ domain: cleanDomain, reason, risk_type: riskType, source, status: 'active' });
    setMessage(`${cleanDomain} 已保存到全局${tab === 'white' ? '白名单' : '黑名单'}。`);
    setDomain('');
    setReason('');
    loadData();
  };

  const remove = async (id: number) => {
    if (tab === 'white') await whitelistApi.removeFromWhitelist(id);
    else await blacklistApi.removeFromBlacklist(id);
    setMessage('已停用该全局名单项。');
    loadData();
  };

  if (loading) return <LoadingBlock />;

  const data = tab === 'white' ? white : black;

  return (
    <div>
      <PageHeader
        title="全局黑白名单"
        description="管理员维护全局域名策略。个人信任和阻止策略仍在用户工作区维护，二者边界清晰。"
      />

      {message && <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{message}</div>}

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <StatCard title="全局白名单" value={white.filter((item) => item.status !== 'disabled').length} tone="green" />
        <StatCard title="全局黑名单" value={black.filter((item) => item.status !== 'disabled').length} tone="red" />
        <StatCard title="已停用项" value={[...white, ...black].filter((item) => item.status === 'disabled').length} tone="slate" />
      </div>

      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex gap-2">
          <button onClick={() => setTab('white')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === 'white' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>全局白名单</button>
          <button onClick={() => setTab('black')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === 'black' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>全局黑名单</button>
        </div>
        <form onSubmit={handleSubmit} className="grid gap-3 lg:grid-cols-[1fr_1fr_160px_160px_120px]">
          <input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="domain.com" className="rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-blue-500" />
          <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="添加原因" className="rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-blue-500" />
          <input value={riskType} onChange={(event) => setRiskType(event.target.value)} disabled={tab === 'white'} placeholder="风险类型" className="rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 disabled:bg-slate-50" />
          <select value={source} onChange={(event) => setSource(event.target.value)} className="rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-blue-500">
            <option value="admin">管理员</option>
            <option value="report">报告处置</option>
            <option value="sample">样本复核</option>
            <option value="sync">系统同步</option>
          </select>
          <button className="rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700">保存</button>
        </form>
      </section>

      <DataTable
        data={data}
        emptyText="暂无全局域名策略。"
        columns={[
          { key: 'domain', title: '域名' },
          { key: 'reason', title: '原因', render: (value) => value || '-' },
          ...(tab === 'black' ? [{ key: 'risk_type', title: '风险类型', render: (value: string) => value || '-' }] : []),
          { key: 'source', title: '来源', render: (value) => sourceText(value) },
          { key: 'status', title: '状态', render: (value) => value === 'disabled' ? '已停用' : '启用中' },
          { key: 'updated_at', title: '更新时间', render: (value, row) => formatDate(value || row.added_at) },
          { key: 'id', title: '操作', render: (value, row) => row.status === 'disabled' ? '-' : <button onClick={() => remove(value)} className="font-semibold text-red-600">停用</button> },
        ]}
      />
    </div>
  );
}
