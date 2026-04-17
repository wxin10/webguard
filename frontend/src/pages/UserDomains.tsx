import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import StatusNotice from '../components/StatusNotice';
import { domainsService } from '../services/domainsService';
import { pluginService } from '../services/pluginService';
import type { DomainListItem, PluginBootstrap } from '../types';
import { formatDate, sourceText, strategyText } from '../utils';

type StrategyTab = 'trusted' | 'blocked' | 'temp_bypass';

const emptyDraft = {
  host: '',
  reason: '',
  minutes: '30',
};

export default function UserDomains() {
  const location = useLocation();
  const [tab, setTab] = useState<StrategyTab>('trusted');
  const [items, setItems] = useState<DomainListItem[]>([]);
  const [bootstrap, setBootstrap] = useState<PluginBootstrap | null>(null);
  const [draft, setDraft] = useState(() => ({
    ...emptyDraft,
    host: new URLSearchParams(location.search).get('domain') || '',
  }));
  const [editing, setEditing] = useState<DomainListItem | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [domainData, bootstrapData] = await Promise.all([
        domainsService.getMyDomains(),
        pluginService.getBootstrap().catch(() => null),
      ]);
      setItems((domainData.items || []).filter((item) => item.status !== 'disabled'));
      setBootstrap(bootstrapData);
    } catch (err) {
      setError(err instanceof Error ? err.message : '个人域名策略加载失败。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const trusted = useMemo(() => items.filter((item) => item.list_type === 'trusted'), [items]);
  const blocked = useMemo(() => items.filter((item) => item.list_type === 'blocked'), [items]);
  const bypass = useMemo(() => items.filter((item) => item.list_type === 'temp_bypass'), [items]);
  const data = tab === 'trusted' ? trusted : tab === 'blocked' ? blocked : bypass;

  const startEdit = (item: DomainListItem) => {
    setEditing(item);
    setTab(item.list_type);
    setDraft({
      host: item.host,
      reason: item.reason || '',
      minutes: item.expires_at ? '30' : '30',
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

    setError('');
    if (editing) {
      await domainsService.updateMyDomain(editing.id, {
        host,
        list_type: tab,
        reason: draft.reason,
      });
      setMessage(`${host} 的个人策略已更新。`);
    } else {
      await domainsService.createMyDomain({
        host,
        list_type: tab,
        reason: draft.reason,
        source: 'manual',
        minutes: tab === 'temp_bypass' ? Number(draft.minutes) || 30 : undefined,
      });
      setMessage(`${host} 已保存到个人${listTypeText(tab)}策略。`);
    }
    resetForm();
    loadData();
  };

  const removeItem = async (item: DomainListItem) => {
    await domainsService.deleteMyDomain(item.id);
    setMessage(`${item.host} 已从个人策略中移除。`);
    loadData();
  };

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="我的安全策略"
        description="个人信任、阻止和临时放行策略沉淀在网站主平台。插件只读取后端下发的策略摘要，并保留最小运行缓存。"
      />

      {message && <StatusNotice tone="success">{message}</StatusNotice>}
      {error && <StatusNotice tone="error">{error}</StatusNotice>}

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="个人信任域名" value={trusted.length} tone="green" />
        <StatCard title="个人阻止域名" value={blocked.length} tone="red" />
        <StatCard title="临时放行" value={bypass.length} tone="amber" />
        <StatCard title="全局阻止域名" value={bootstrap?.blocked_hosts.length || 0} description="由管理员维护并下发给插件" tone="slate" />
      </div>

      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-wrap gap-2">
          <TabButton active={tab === 'trusted'} onClick={() => setTab('trusted')}>信任域名</TabButton>
          <TabButton active={tab === 'blocked'} onClick={() => setTab('blocked')}>阻止域名</TabButton>
          <TabButton active={tab === 'temp_bypass'} onClick={() => setTab('temp_bypass')}>临时放行</TabButton>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-3 lg:grid-cols-[1fr_1fr_140px_140px]">
          <input value={draft.host} onChange={(event) => setDraft({ ...draft, host: event.target.value })} placeholder="example.com" className="rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-blue-500" />
          <input value={draft.reason} onChange={(event) => setDraft({ ...draft, reason: event.target.value })} placeholder="策略原因，插件动作也会同步到这里" className="rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-blue-500" />
          <input value={draft.minutes} onChange={(event) => setDraft({ ...draft, minutes: event.target.value })} disabled={tab !== 'temp_bypass' || Boolean(editing)} type="number" min="1" className="rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 disabled:bg-slate-50" />
          <button className="rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700">
            {editing ? '更新策略' : '保存策略'}
          </button>
        </form>
        {editing && (
          <button onClick={resetForm} type="button" className="mt-3 text-sm font-semibold text-slate-600 hover:text-slate-900">
            取消编辑 {editing.host}
          </button>
        )}
      </section>

      <DataTable
        data={data}
        emptyText="暂无个人域名策略。"
        columns={[
          { key: 'host', title: '域名' },
          { key: 'list_type', title: '类型', render: (value) => listTypeText(String(value || '')) },
          { key: 'source', title: '来源', render: (value) => sourceText(String(value || '')) },
          { key: 'reason', title: '原因', render: (value) => String(value || '-') },
          { key: 'expires_at', title: '有效期', render: (value) => value ? formatDate(String(value)) : '长期' },
          { key: 'updated_at', title: '更新时间', render: (value, row) => formatDate(String(value || row.created_at || '')) },
          {
            key: 'id',
            title: '操作',
            render: (_value, row) => (
              <div className="flex flex-wrap gap-2">
                <button onClick={() => startEdit(row)} className="font-semibold text-blue-700">编辑</button>
                <button onClick={() => removeItem(row)} className="font-semibold text-red-600">{row.list_type === 'temp_bypass' ? '恢复保护' : '删除'}</button>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} type="button" className={`rounded-lg px-4 py-2 text-sm font-semibold ${active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
      {children}
    </button>
  );
}

function listTypeText(value?: string) {
  if (value === 'trusted') return strategyText('trusted');
  if (value === 'blocked') return strategyText('blocked');
  if (value === 'temp_bypass') return strategyText('paused');
  return value || '-';
}
