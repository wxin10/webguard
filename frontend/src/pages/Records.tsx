import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import RiskBadge from '../components/RiskBadge';
import StatusNotice from '../components/StatusNotice';
import { recordsService } from '../services/recordsService';
import type { ScanRecordItem } from '../types';
import { formatDate, scanSourceText } from '../utils';

type RiskFilter = 'all' | 'safe' | 'suspicious' | 'malicious';
type SourceFilter = 'all' | 'web' | 'plugin' | 'recheck';

export default function Records() {
  const [records, setRecords] = useState<ScanRecordItem[]>([]);
  const [risk, setRisk] = useState<RiskFilter>('all');
  const [source, setSource] = useState<SourceFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await recordsService.getRecords({
          label: risk === 'all' ? undefined : risk,
          source: source === 'all' ? undefined : source,
        });
        setRecords(data.records || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : '检测记录加载失败。');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [risk, source]);

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="检测记录"
        description="管理员查看全平台 ScanRecord，包含网站检测、插件上传和重新检测来源，并可进入完整报告。"
      />

      {error && <StatusNotice tone="error">{error}</StatusNotice>}

      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-semibold text-slate-600">风险等级</span>
            <select value={risk} onChange={(event) => setRisk(event.target.value as RiskFilter)} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500">
              <option value="all">全部风险</option>
              <option value="safe">安全</option>
              <option value="suspicious">可疑</option>
              <option value="malicious">恶意</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-600">检测来源</span>
            <select value={source} onChange={(event) => setSource(event.target.value as SourceFilter)} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500">
              <option value="all">全部来源</option>
              <option value="web">网站检测</option>
              <option value="plugin">插件上传</option>
              <option value="recheck">重新检测</option>
            </select>
          </label>
        </div>
      </section>

      <DataTable
        data={records}
        emptyText="暂无检测记录。"
        columns={[
          { key: 'url', title: 'URL', render: (value) => <span className="block max-w-lg truncate">{String(value || '-')}</span> },
          { key: 'domain', title: '域名', render: (value, row) => String(row.host || value || '-') },
          { key: 'label', title: '风险等级', render: (value, row) => <RiskBadge label={String(row.risk_level || value || 'unknown')} size="sm" /> },
          { key: 'risk_score', title: '风险评分', render: (value) => Number(value || 0).toFixed(2) },
          { key: 'source', title: '来源', render: (value) => scanSourceText(String(value || '')) },
          { key: 'created_at', title: '检测时间', render: (value) => formatDate(String(value || '')) },
          { key: 'id', title: '操作', render: (value, row) => <Link to={`/app/reports/${row.report_id || value}`} className="font-semibold text-blue-600">查看报告</Link> },
        ]}
      />
    </div>
  );
}
