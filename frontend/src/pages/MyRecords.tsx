import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import RiskBadge from '../components/RiskBadge';
import { recordsApi } from '../services/api';
import { ScanRecordItem } from '../types';
import { formatDate, sourceText } from '../utils';

export default function MyRecords() {
  const [records, setRecords] = useState<ScanRecordItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    recordsApi.getMyRecords().then((data) => setRecords(data.records || [])).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="我的报告"
        description="普通用户在 Web 平台统一查看手动检测和插件同步的报告，不在插件中完成复杂分析流程。"
        action={<Link to="/scan" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">提交检测</Link>}
      />
      <DataTable
        data={records}
        emptyText="暂无报告。"
        columns={[
          { key: 'url', title: 'URL', render: (value) => <span className="block max-w-lg truncate">{value}</span> },
          { key: 'label', title: '风险等级', render: (value) => <RiskBadge label={value} size="sm" /> },
          { key: 'risk_score', title: '风险评分', render: (value) => Number(value).toFixed(1) },
          { key: 'source', title: '来源', render: (value) => sourceText(value) },
          { key: 'created_at', title: '检测时间', render: (value) => formatDate(value) },
          { key: 'id', title: '操作', render: (value) => <Link to={`/reports/${value}`} className="font-semibold text-blue-600">查看报告</Link> },
        ]}
      />
    </div>
  );
}
