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
      <PageHeader
        title="插件管理"
        description="管理员只在这里管理浏览器辅助组件的连接、版本和上报事件。插件不承担完整用户流程，完整检测、报告和策略闭环都在 Web 平台完成。"
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="辅助入口状态" value="Available" description="API http://127.0.0.1:8000" tone="green" />
        <StatCard title="插件版本" value="1.0.0" description="Manifest V3 轻量组件" tone="blue" />
        <StatCard title="自动检测" value="Configurable" description="仅负责浏览器侧即时提醒" tone="slate" />
        <StatCard title="同步事件" value={events.length} description="进入 Web 报告流" tone="blue" />
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">插件职责边界</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-4">
          {[
            ['快速扫描', '扫描当前网页并上报到 Web 平台'],
            ['即时提醒', '在浏览器侧展示风险等级和简短原因'],
            ['必要拦截', '恶意页面跳转 warning 页面'],
            ['报告跳转', '一键打开 Web 平台详细报告'],
          ].map(([title, text]) => (
            <div key={title} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-slate-900">{title}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <DataTable
          data={events}
          emptyText="暂无插件同步事件。"
          columns={[
            { key: 'url', title: 'URL', render: (value) => <span className="block max-w-lg truncate">{value}</span> },
            { key: 'label', title: '风险等级' },
            { key: 'risk_score', title: '风险评分', render: (value) => Number(value).toFixed(1) },
            { key: 'created_at', title: '同步时间', render: (value) => formatDate(value) },
          ]}
        />
      </section>
    </div>
  );
}
