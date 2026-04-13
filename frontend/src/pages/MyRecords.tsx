import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import RiskBadge from '../components/RiskBadge';
import { recordsApi } from '../services/api';
import { ScanRecordItem } from '../types';
import { formatDate } from '../utils';

export default function MyRecords() {
  const [records, setRecords] = useState<ScanRecordItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    recordsApi.getMyRecords().then((data) => setRecords(data.records || [])).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader title="我的检测记录" description="普通用户仅查看与插件使用和个人检测相关的记录，不展示全局统计和系统管理能力。" />
      <DataTable
        data={records}
        columns={[
          { key: 'url', title: 'URL', render: (value) => <span className="block max-w-lg truncate">{value}</span> },
          { key: 'label', title: '风险等级', render: (value) => <RiskBadge label={value} size="sm" /> },
          { key: 'risk_score', title: '风险评分', render: (value) => Number(value).toFixed(2) },
          { key: 'created_at', title: '检测时间', render: (value) => formatDate(value) },
          { key: 'id', title: '操作', render: (value) => <Link to={`/reports/${value}`} className="font-semibold text-blue-600">查看报告</Link> },
        ]}
      />
    </div>
  );
}
