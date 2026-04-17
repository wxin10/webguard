import { FormEvent, useEffect, useMemo, useState } from 'react';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import { adminDomainsService } from '../services/api';
import { DomainListItem } from '../types';
import { formatDate, sourceText, strategyText } from '../utils';

type DomainTab = 'trusted' | 'blocked';

export default function Domains() {
  const [tab, setTab] = useState<DomainTab>('trusted');
  const [items, setItems] = useState<DomainListItem[]>([]);
  const [host, setHost] = useState('');
  const [reason, setReason] = useState('');
  const [source, setSource] = useState('manual');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const loadData = () => {
    setLoading(true);
    adminDomainsService.getDomains()
      .then((data) => setItems(data.items || []))
      .finally(() => setLoading(false));
  };

  useEffect(loadData, []);

  const trusted = useMemo(() => items.filter((item) => item.list_type === 'trusted' && item.status !== 'disabled'), [items]);
  const blocked = useMemo(() => items.filter((item) => item.list_type === 'blocked' && item.status !== 'disabled'), [items]);
  const disabled = useMemo(() => items.filter((item) => item.status === 'disabled'), [items]);
  const data = tab === 'trusted' ? trusted : blocked;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const cleanHost = host.trim();
    if (!cleanHost) return;
    await adminDomainsService.createDomain({ host: cleanHost, list_type: tab, reason, source, status: 'active' });
    setMessage(`${cleanHost} 已保存到全局${strategyText(tab)}名单。`);
    setHost('');
    setReason('');
    loadData();
  };

  const remove = async (id: number) => {
    await adminDomainsService.deleteDomain(id);
    setMessage('全局域名策略已停用。');
    loadData();
  };

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="全局黑白名单"
        description="管理员维护全局 trusted / blocked 域名。个人策略仍在用户工作区维护，边界清晰。"
      />

      {message && <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{message}</div>}

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <StatCard title="全局白名单" value={trusted.length} tone="green" />
        <StatCard title="全局黑名单" value={blocked.length} tone="red" />
        <StatCard title="已停用项目" value={disabled.length} tone="slate" />
      </div>

      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex gap-2">
          <button onClick={() => setTab('trusted')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === 'trusted' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>全局白名单</button>
          <button onClick={() => setTab('blocked')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === 'blocked' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>全局黑名单</button>
        </div>
        <form onSubmit={handleSubmit} className="grid gap-3 lg:grid-cols-[1fr_1fr_160px_120px]">
          <input value={host} onChange={(event) => setHost(event.target.value)} placeholder="domain.com" className="rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-blue-500" />
          <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="添加原因" className="rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-blue-500" />
          <select value={source} onChange={(event) => setSource(event.target.value)} className="rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-blue-500">
            <option value="manual">手动添加</option>
            <option value="system">系统同步</option>
            <option value="plugin">插件事件</option>
          </select>
          <button className="rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700">保存</button>
        </form>
      </section>

      <DataTable
        data={data}
        emptyText="暂无全局域名策略。"
        columns={[
          { key: 'host', title: '域名' },
          { key: 'list_type', title: '类型', render: (value) => strategyText(value) },
          { key: 'reason', title: '原因', render: (value) => value || '-' },
          { key: 'source', title: '来源', render: (value) => sourceText(value) },
          { key: 'status', title: '状态', render: (value) => value === 'disabled' ? '已停用' : '启用中' },
          { key: 'updated_at', title: '更新时间', render: (value, row) => formatDate(value || row.created_at) },
          { key: 'id', title: '操作', render: (value, row) => row.status === 'disabled' ? '-' : <button onClick={() => remove(value)} className="font-semibold text-red-600">停用</button> },
        ]}
      />
    </div>
  );
}
