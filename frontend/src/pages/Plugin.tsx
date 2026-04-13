import { useEffect, useState } from 'react';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import { recordsApi } from '../services/api';
import { ScanRecordItem } from '../types';
import { formatDate } from '../utils';

export default function Plugin() {
  const [events, setEvents] = useState<ScanRecordItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    recordsApi.getRecords()
      .then((data) => setEvents((data.records || []).filter((item) => item.source === 'plugin')))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader title="插件状态" description="展示浏览器插件连接状态、最近插件检测事件、版本信息和触发统计。" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="连接状态" value="Connected" description="API http://127.0.0.1:8000" tone="green" />
        <StatCard title="插件版本" value="1.0.0" description="Manifest V3" tone="blue" />
        <StatCard title="自动检测" value="Enabled" description="打开页面后自动检测" tone="green" />
        <StatCard title="插件事件" value={events.length} description="最近插件检测记录" tone="slate" />
      </div>
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">插件联动闭环</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-4">
          {['页面特征采集', '后台检测接口', '风险结果缓存', '恶意页面拦截'].map((item) => (
            <div key={item} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700">{item}</div>
          ))}
        </div>
      </section>
      <section className="mt-6">
        <DataTable
          data={events}
          emptyText="暂无插件检测事件，可加载插件后访问任意网页触发。"
          columns={[
            { key: 'url', title: 'URL', render: (value) => <span className="block max-w-lg truncate">{value}</span> },
            { key: 'label', title: '风险等级' },
            { key: 'risk_score', title: '风险评分', render: (value) => Number(value).toFixed(2) },
            { key: 'created_at', title: '触发时间', render: (value) => formatDate(value) },
          ]}
        />
      </section>
    </div>
  );
}
