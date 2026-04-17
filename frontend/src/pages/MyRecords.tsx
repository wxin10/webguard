import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import RiskBadge from '../components/RiskBadge';
import StatusNotice from '../components/StatusNotice';
import { domainsService } from '../services/domainsService';
import { recordsService } from '../services/recordsService';
import type { DomainListItem, ScanRecordItem } from '../types';
import { formatDate, scanSourceText, strategyText } from '../utils';

type SourceFilter = 'all' | 'web' | 'plugin';
type RiskFilter = 'all' | 'safe' | 'suspicious' | 'malicious';
type TimeFilter = 'all' | '7d' | '30d';

export default function MyRecords() {
  const [records, setRecords] = useState<ScanRecordItem[]>([]);
  const [domains, setDomains] = useState<DomainListItem[]>([]);
  const [source, setSource] = useState<SourceFilter>('all');
  const [risk, setRisk] = useState<RiskFilter>('all');
  const [time, setTime] = useState<TimeFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [recordData, domainData] = await Promise.all([
          recordsService.getMyRecords({
            source: source === 'all' ? undefined : source,
            label: risk === 'all' ? undefined : risk,
          }),
          domainsService.getMyDomains(),
        ]);
        setRecords(recordData.records || []);
        setDomains((domainData.items || []).filter((item) => item.status !== 'disabled'));
      } catch (err) {
        setError(err instanceof Error ? err.message : '历史记录加载失败。');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [source, risk]);

  if (loading) return <LoadingBlock />;

  const filteredRecords = records.filter((item) => {
    if (time === 'all') return true;
    const age = Date.now() - new Date(item.created_at).getTime();
    const maxDays = time === '7d' ? 7 : 30;
    return age <= maxDays * 24 * 60 * 60 * 1000;
  });

  return (
    <div>
      <PageHeader
        title="我的检测记录"
        description="网站手动检测和插件上传扫描都会生成统一 ScanRecord，并关联正式报告。这里是用户侧记录中心入口。"
        action={
          <Link to="/app/scan" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            提交检测
          </Link>
        }
      />

      {error && <StatusNotice tone="error">{error}</StatusNotice>}

      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <FilterButton active={source === 'all'} onClick={() => setSource('all')}>全部来源</FilterButton>
          <FilterButton active={source === 'web'} onClick={() => setSource('web')}>网站检测</FilterButton>
          <FilterButton active={source === 'plugin'} onClick={() => setSource('plugin')}>插件上传</FilterButton>
          <span className="mx-1 h-9 border-l border-slate-200" />
          <FilterButton active={risk === 'all'} onClick={() => setRisk('all')}>全部风险</FilterButton>
          <FilterButton active={risk === 'malicious'} onClick={() => setRisk('malicious')}>恶意</FilterButton>
          <FilterButton active={risk === 'suspicious'} onClick={() => setRisk('suspicious')}>可疑</FilterButton>
          <FilterButton active={risk === 'safe'} onClick={() => setRisk('safe')}>安全</FilterButton>
          <span className="mx-1 h-9 border-l border-slate-200" />
          <FilterButton active={time === 'all'} onClick={() => setTime('all')}>全部时间</FilterButton>
          <FilterButton active={time === '7d'} onClick={() => setTime('7d')}>最近 7 天</FilterButton>
          <FilterButton active={time === '30d'} onClick={() => setTime('30d')}>最近 30 天</FilterButton>
        </div>
      </section>

      <DataTable
        data={filteredRecords}
        emptyText="暂无符合条件的检测记录。"
        columns={[
          { key: 'url', title: 'URL', render: (value) => <span className="block max-w-lg truncate">{String(value || '-')}</span> },
          { key: 'label', title: '风险等级', render: (value, row) => <RiskBadge label={String(row.risk_level || value || 'unknown')} size="sm" /> },
          { key: 'risk_score', title: '风险分数', render: (value) => Number(value || 0).toFixed(1) },
          { key: 'source', title: '来源', render: (value) => scanSourceText(String(value || '')) },
          { key: 'domain', title: '策略状态', render: (_value, row) => policyState(row.host || row.domain, domains) },
          { key: 'created_at', title: '检测时间', render: (value) => formatDate(String(value || '')) },
          {
            key: 'id',
            title: '报告',
            render: (value, row) => (
              <Link to={`/app/reports/${row.report_id || value}`} className="font-semibold text-blue-700">
                打开报告
              </Link>
            ),
          },
        ]}
      />
    </div>
  );
}

function policyState(host: string | undefined, domains: DomainListItem[]) {
  if (!host) return '未处理';
  const matched = domains.find((item) => item.host === host || host.endsWith(`.${item.host}`));
  return matched ? strategyText(matched.list_type === 'temp_bypass' ? 'paused' : matched.list_type) : '未处理';
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} type="button" className={`rounded-lg px-4 py-2 text-sm font-semibold ${active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
      {children}
    </button>
  );
}
