import { FormEvent, useEffect, useMemo, useState } from 'react';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import StatusNotice from '../components/StatusNotice';
import { adminDomainsService } from '../services/adminDomainsService';
import type { DomainListItem } from '../types';
import { formatDate, sourceText, strategyText } from '../utils';

type DomainTab = 'trusted' | 'blocked';

const emptyDraft = {
  host: '',
  reason: '',
  source: 'manual',
};

export default function Domains() {
  const [tab, setTab] = useState<DomainTab>('trusted');
  const [items, setItems] = useState<DomainListItem[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [editing, setEditing] = useState<DomainListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await adminDomainsService.getDomains();
      setItems(data.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '全局域名策略加载失败。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const trusted = useMemo(() => items.filter((item) => item.list_type === 'trusted' && item.status !== 'disabled'), [items]);
  const blocked = useMemo(() => items.filter((item) => item.list_type === 'blocked' && item.status !== 'disabled'), [items]);
  const disabled = useMemo(() => items.filter((item) => item.status === 'disabled'), [items]);
  const data = tab === 'trusted' ? trusted : blocked;

  const startEdit = (item: DomainListItem) => {
    setEditing(item);
    setTab(item.list_type === 'blocked' ? 'blocked' : 'trusted');
    setDraft({
      host: item.host,
      reason: item.reason || '',
      source: item.source || 'manual',
    });
  };

  const resetForm = () => {
    setEditing(null);
    setDraft(emptyDraft);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const host = draft.host.trim();
    if (!host) {
      setError('请输入域名。');
      return;
    }

    if (editing) {
      await adminDomainsService.updateDomain(editing.id, {
        host,
        list_type: tab,
        reason: draft.reason,
        source: draft.source,
        status: 'active',
      });
      setMessage(`${host} 的全局策略已更新。`);
    } else {
      await adminDomainsService.createDomain({ host, list_type: tab, reason: draft.reason, source: draft.source, status: 'active' });
      setMessage(`${host} 已保存到全局${strategyText(tab)}名单。`);
    }
    resetForm();
    loadData();
  };

  const remove = async (item: DomainListItem) => {
    await adminDomainsService.deleteDomain(item.id);
    setMessage(`${item.host} 已删除或停用。`);
    loadData();
  };

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="全局黑白名单"
        description="管理员维护全局 trusted / blocked 域名。个人策略仍在用户工作区维护，边界清晰。"
      />

      {message && <StatusNotice tone="success">{message}</StatusNotice>}
      {error && <StatusNotice tone="error">{error}</StatusNotice>}

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
          <input value={draft.host} onChange={(event) => setDraft({ ...draft, host: event.target.value })} placeholder="domain.com" className="rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-blue-500" />
          <input value={draft.reason} onChange={(event) => setDraft({ ...draft, reason: event.target.value })} placeholder="添加原因" className="rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-blue-500" />
          <select value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value })} className="rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-blue-500">
            <option value="manual">手动添加</option>
            <option value="system">系统同步</option>
            <option value="plugin">插件事件</option>
          </select>
          <button className="rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700">{editing ? '更新' : '保存'}</button>
        </form>
        {editing && (
          <button onClick={resetForm} type="button" className="mt-3 text-sm font-semibold text-slate-600 hover:text-slate-900">
            取消编辑 {editing.host}
          </button>
        )}
      </section>

      <DataTable
        data={data}
        emptyText="暂无全局域名策略。"
        columns={[
          { key: 'host', title: '域名' },
          { key: 'list_type', title: '类型', render: (value) => strategyText(String(value || '')) },
          { key: 'reason', title: '原因', render: (value) => String(value || '-') },
          { key: 'source', title: '来源', render: (value) => sourceText(String(value || '')) },
          { key: 'status', title: '状态', render: (value) => value === 'disabled' ? '已停用' : '启用中' },
          { key: 'updated_at', title: '更新时间', render: (value, row) => formatDate(String(value || row.created_at || '')) },
          {
            key: 'id',
            title: '操作',
            render: (_value, row) => row.status === 'disabled' ? '-' : (
              <div className="flex flex-wrap gap-2">
                <button onClick={() => startEdit(row)} className="font-semibold text-blue-700">编辑</button>
                <button onClick={() => remove(row)} className="font-semibold text-red-600">删除</button>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
