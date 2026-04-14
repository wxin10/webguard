import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import RiskBadge from '../components/RiskBadge';
import { recordsApi } from '../services/api';
import { ScanRecordItem } from '../types';
import { formatDate, sourceText } from '../utils';

type FilterKey = 'all' | 'malicious' | 'suspicious' | 'plugin' | 'recent';

export default function MyRecords() {
  const [records, setRecords] = useState<ScanRecordItem[]>([]);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    recordsApi.getMyRecords().then((data) => setRecords(data.records || [])).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingBlock />;

  const filteredRecords = records.filter((item) => {
    if (filter === 'malicious') return item.label === 'malicious';
    if (filter === 'suspicious') return item.label === 'suspicious';
    if (filter === 'plugin') return item.source === 'plugin';
    if (filter === 'recent') return Date.now() - new Date(item.created_at).getTime() <= 7 * 24 * 60 * 60 * 1000;
    return true;
  });

  return (
    <div>
      <PageHeader
        title="我的报告"
        description="按风险、来源和时间快速找到需要处理的报告，再进入报告页加入策略、标记误报或重新检测。"
        action={<Link to="/app/scan" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">提交检测</Link>}
      />

      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>全部报告</FilterButton>
          <FilterButton active={filter === 'malicious'} onClick={() => setFilter('malicious')}>仅看恶意</FilterButton>
          <FilterButton active={filter === 'suspicious'} onClick={() => setFilter('suspicious')}>仅看可疑</FilterButton>
          <FilterButton active={filter === 'plugin'} onClick={() => setFilter('plugin')}>仅看助手同步</FilterButton>
          <FilterButton active={filter === 'recent'} onClick={() => setFilter('recent')}>最近 7 天</FilterButton>
        </div>
      </section>

      <DataTable
        data={filteredRecords}
        emptyText="暂无符合条件的报告。"
        columns={[
          { key: 'url', title: 'URL', render: (value) => <span className="block max-w-lg truncate">{value}</span> },
          { key: 'label', title: '风险等级', render: (value) => <RiskBadge label={value} size="sm" /> },
          { key: 'risk_score', title: '风险评分', render: (value) => Number(value).toFixed(1) },
          { key: 'source', title: '来源', render: (value) => sourceText(value) },
          { key: 'created_at', title: '检测时间', render: (value) => formatDate(value) },
          { key: 'id', title: '处理', render: (value) => <Link to={`/app/reports/${value}`} className="font-semibold text-emerald-700">打开处理</Link> },
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
