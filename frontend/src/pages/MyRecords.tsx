import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import RiskBadge from '../components/RiskBadge';
import { recordsApi, userStrategyApi } from '../services/api';
import { ScanRecordItem, UserStrategyOverview } from '../types';
import { formatDate, sourceText, strategyText } from '../utils';

type FilterKey = 'all' | 'malicious' | 'suspicious' | 'safe' | 'plugin';

export default function MyRecords() {
  const [records, setRecords] = useState<ScanRecordItem[]>([]);
  const [strategies, setStrategies] = useState<UserStrategyOverview | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([recordsApi.getMyRecords(), userStrategyApi.getStrategies()])
      .then(([recordData, strategyData]) => {
        setRecords(recordData.records || []);
        setStrategies(strategyData);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingBlock />;

  const filteredRecords = records.filter((item) => {
    if (filter === 'plugin') return item.source === 'plugin';
    if (filter === 'all') return true;
    return item.label === filter;
  });

  return (
    <div>
      <PageHeader
        title="我的检测记录"
        description="这里是用户侧历史检测入口。手动检测和插件上传都会生成统一 ScanRecord，并可进入完整报告继续处置。"
        action={<Link to="/app/scan" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">提交检测</Link>}
      />

      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>全部</FilterButton>
          <FilterButton active={filter === 'malicious'} onClick={() => setFilter('malicious')}>恶意</FilterButton>
          <FilterButton active={filter === 'suspicious'} onClick={() => setFilter('suspicious')}>可疑</FilterButton>
          <FilterButton active={filter === 'safe'} onClick={() => setFilter('safe')}>安全</FilterButton>
          <FilterButton active={filter === 'plugin'} onClick={() => setFilter('plugin')}>插件上传</FilterButton>
        </div>
      </section>

      <DataTable
        data={filteredRecords}
        emptyText="暂无符合条件的检测记录。"
        columns={[
          { key: 'url', title: 'URL', render: (value) => <span className="block max-w-lg truncate">{value}</span> },
          { key: 'label', title: '风险等级', render: (value) => <RiskBadge label={value} size="sm" /> },
          { key: 'risk_score', title: '风险分数', render: (value) => Number(value).toFixed(1) },
          { key: 'source', title: '来源', render: (value) => sourceText(value) },
          { key: 'domain', title: '策略状态', render: (value) => policyState(value, strategies) },
          { key: 'created_at', title: '检测时间', render: (value) => formatDate(value) },
          { key: 'id', title: '报告', render: (value) => <Link to={`/app/reports/${value}`} className="font-semibold text-emerald-700">打开报告</Link> },
        ]}
      />
    </div>
  );
}

function policyState(domain: string, strategies: UserStrategyOverview | null) {
  if (!strategies) return '未处理';
  const matched = [
    ...strategies.trusted_sites,
    ...strategies.blocked_sites,
    ...strategies.paused_sites,
  ].find((item) => item.domain === domain);
  return matched ? strategyText(matched.strategy_type) : '未处理';
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} type="button" className={`rounded-lg px-4 py-2 text-sm font-semibold ${active ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
      {children}
    </button>
  );
}
