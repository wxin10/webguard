import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import RiskBadge from '../components/RiskBadge';
import { recordsApi } from '../services/api';
import { ScanRecordItem } from '../types';
import { formatDate, sourceText } from '../utils';

export default function Records() {
  const [records, setRecords] = useState<ScanRecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [label, setLabel] = useState('all');

  useEffect(() => {
    recordsApi.getRecords().then((data) => setRecords(data.records || [])).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return records.filter((record) => {
      const keywordHit = !keyword || record.url.toLowerCase().includes(keyword.toLowerCase()) || record.domain.toLowerCase().includes(keyword.toLowerCase());
      const labelHit = label === 'all' || record.label === label;
      return keywordHit && labelHit;
    });
  }, [records, keyword, label]);

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader title="全部历史记录" description="管理员可查看来自 Web 页面、手动检测和浏览器插件的全部检测记录，并进入完整报告详情。" />
      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1fr_220px]">
          <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索 URL 或域名" className="rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
          <select value={label} onChange={(event) => setLabel(event.target.value)} className="rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100">
            <option value="all">全部风险</option>
            <option value="safe">安全</option>
            <option value="suspicious">可疑</option>
            <option value="malicious">恶意</option>
          </select>
        </div>
      </section>
      <DataTable
        data={filtered}
        columns={[
          { key: 'url', title: 'URL', render: (value) => <span className="block max-w-lg truncate">{value}</span> },
          { key: 'domain', title: '域名' },
          { key: 'label', title: '风险等级', render: (value) => <RiskBadge label={value} size="sm" /> },
          { key: 'risk_score', title: '风险评分', render: (value) => Number(value).toFixed(2) },
          { key: 'source', title: '来源', render: (value) => sourceText(value) },
          { key: 'created_at', title: '检测时间', render: (value) => formatDate(value) },
          { key: 'id', title: '操作', render: (value) => <Link to={`/app/reports/${value}`} className="font-semibold text-blue-600">查看报告</Link> },
        ]}
      />
    </div>
  );
}
