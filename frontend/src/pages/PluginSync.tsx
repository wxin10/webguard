import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import RiskBadge from '../components/RiskBadge';
import { recordsApi, userStrategyApi } from '../services/api';
import { ScanRecordItem, UserStrategyOverview } from '../types';
import { formatDate } from '../utils';

export default function PluginSync() {
  const [records, setRecords] = useState<ScanRecordItem[]>([]);
  const [strategies, setStrategies] = useState<UserStrategyOverview | null>(null);
  const [filter, setFilter] = useState<'all' | 'unhandled' | 'handled'>('all');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const loadData = () => {
    setLoading(true);
    Promise.all([recordsApi.getMyRecords(), userStrategyApi.getStrategies()])
      .then(([recordData, strategyData]) => {
        setRecords((recordData.records || []).filter((item) => item.source === 'plugin'));
        setStrategies(strategyData);
      })
      .finally(() => setLoading(false));
  };

  useEffect(loadData, []);

  const markTrusted = async (row: ScanRecordItem) => {
    await userStrategyApi.addTrustedSite({ domain: row.domain, reason: `来自插件同步记录 #${row.id}`, source: 'web' });
    setMessage(`${row.domain} 已加入我的信任站点。`);
    loadData();
  };

  const markBlocked = async (row: ScanRecordItem) => {
    await userStrategyApi.addBlockedSite({ domain: row.domain, reason: `来自插件同步记录 #${row.id}`, source: 'web' });
    setMessage(`${row.domain} 已加入我的阻止站点。`);
    loadData();
  };

  if (loading) return <LoadingBlock />;

  const visibleRecords = records.filter((row) => {
    const handled = strategyFor(row.domain, strategies) !== '未处理';
    if (filter === 'handled') return handled;
    if (filter === 'unhandled') return !handled;
    return true;
  });

  return (
    <div>
      <PageHeader
        title="浏览器助手同步"
        description="这里汇总助手上报到 Web 平台的扫描结果，并标出哪些已经沉淀为个人策略。"
      />

      {message && <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{message}</div>}

      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>全部助手记录</FilterButton>
          <FilterButton active={filter === 'unhandled'} onClick={() => setFilter('unhandled')}>未处理</FilterButton>
          <FilterButton active={filter === 'handled'} onClick={() => setFilter('handled')}>已加入策略</FilterButton>
          <Link to="/app/my-domains" className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">查看我的策略</Link>
        </div>
      </section>

      <DataTable
        data={visibleRecords}
        emptyText="暂无符合条件的浏览器助手同步记录。"
        columns={[
          { key: 'url', title: 'URL', render: (value) => <span className="block max-w-lg truncate">{value}</span> },
          { key: 'label', title: '风险', render: (value) => <RiskBadge label={value} size="sm" /> },
          { key: 'risk_score', title: '评分', render: (value) => Number(value).toFixed(1) },
          { key: 'domain', title: '策略状态', render: (value) => strategyFor(value, strategies) },
          { key: 'created_at', title: '同步时间', render: (value) => formatDate(value) },
          {
            key: 'id',
            title: '操作',
            render: (value, row) => (
              <div className="flex flex-wrap gap-2">
                <Link to={`/app/reports/${value}`} className="font-semibold text-emerald-700">报告</Link>
                <button onClick={() => markTrusted(row)} className="font-semibold text-slate-700">信任</button>
                <button onClick={() => markBlocked(row)} className="font-semibold text-rose-700">阻止</button>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} type="button" className={`rounded-lg px-4 py-2 text-sm font-semibold ${active ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
      {children}
    </button>
  );
}

function strategyFor(domain: string, strategies: UserStrategyOverview | null) {
  if (!strategies) return '未处理';
  if (strategies.trusted_sites.some((item) => item.domain === domain)) return '已信任';
  if (strategies.blocked_sites.some((item) => item.domain === domain)) return '已阻止';
  if (strategies.paused_sites.some((item) => item.domain === domain)) return '临时忽略';
  return '未处理';
}
