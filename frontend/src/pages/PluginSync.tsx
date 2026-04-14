import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import RiskBadge from '../components/RiskBadge';
import { recordsApi } from '../services/api';
import { ScanRecordItem } from '../types';
import { formatDate } from '../utils';

export default function PluginSync() {
  const [records, setRecords] = useState<ScanRecordItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    recordsApi.getMyRecords()
      .then((data) => setRecords((data.records || []).filter((item) => item.source === 'plugin')))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="插件同步记录"
        description="这里汇总浏览器插件上报到 Web 平台的扫描结果。插件负责即时提醒，完整报告、历史追踪和策略调整都在 Web 中完成。"
      />
      <DataTable
        data={records}
        emptyText="暂无插件同步记录。"
        columns={[
          { key: 'url', title: 'URL', render: (value) => <span className="block max-w-lg truncate">{value}</span> },
          { key: 'label', title: '风险', render: (value) => <RiskBadge label={value} size="sm" /> },
          { key: 'risk_score', title: '评分', render: (value) => Number(value).toFixed(1) },
          { key: 'created_at', title: '同步时间', render: (value) => formatDate(value) },
          { key: 'id', title: '报告', render: (value) => <Link to={`/app/reports/${value}`} className="font-semibold text-blue-600">打开报告</Link> },
        ]}
      />
    </div>
  );
}
