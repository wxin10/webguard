import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import RiskBadge from '../components/RiskBadge';
import StatCard from '../components/StatCard';
import { recordsApi } from '../services/api';
import { ScanRecordItem } from '../types';
import { formatDate, sourceText } from '../utils';

export default function Samples() {
  const [records, setRecords] = useState<ScanRecordItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    recordsApi.getRecords().then((data) => setRecords(data.records || [])).finally(() => setLoading(false));
  }, []);

  const risky = useMemo(() => records.filter((item) => item.label !== 'safe'), [records]);
  const pluginRisky = risky.filter((item) => item.source === 'plugin');
  const suspicious = risky.filter((item) => item.label === 'suspicious');
  const malicious = risky.filter((item) => item.label === 'malicious');

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="样本与误报处理"
        description="管理员将可疑、恶意和插件上报事件沉淀为运营样本，用于误报复核、规则调整和模型迭代。"
      />
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="待复核样本" value={risky.length} description="可疑与恶意记录" tone="amber" />
        <StatCard title="插件上报风险" value={pluginRisky.length} description="来自浏览器辅助入口" tone="blue" />
        <StatCard title="恶意样本" value={malicious.length} description="建议进入阻断策略" tone="red" />
      </div>
      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">处理队列</h2>
        <p className="mt-2 text-sm text-slate-500">当前以检测记录作为样本池，后续可接入正式工单、误报状态和人工审核流程。</p>
        <div className="mt-5">
          <DataTable
            data={[...malicious, ...suspicious]}
            emptyText="暂无待复核样本。"
            columns={[
              { key: 'url', title: 'URL', render: (value) => <span className="block max-w-lg truncate">{value}</span> },
              { key: 'label', title: '风险', render: (value) => <RiskBadge label={value} size="sm" /> },
              { key: 'source', title: '来源', render: (value) => sourceText(value) },
              { key: 'risk_score', title: '评分', render: (value) => Number(value).toFixed(1) },
              { key: 'created_at', title: '进入时间', render: (value) => formatDate(value) },
              { key: 'id', title: '操作', render: (value) => <Link to={`/app/reports/${value}`} className="font-semibold text-blue-600">复核报告</Link> },
            ]}
          />
        </div>
      </section>
    </div>
  );
}
