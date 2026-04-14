import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import RiskBadge from '../components/RiskBadge';
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

  const blockedEvents = events.filter((item) => item.label === 'malicious');
  const suspiciousEvents = events.filter((item) => item.label === 'suspicious');
  const abnormalEvents = events.filter((item) => item.risk_score >= 70 || item.has_password_input);

  return (
    <div>
      <PageHeader
        title="浏览器助手运行状态"
        description="管理员在这里确认助手版本、连接状态和上报事件。助手只负责当前页提醒、快速扫描和报告跳转，处置闭环回到 Web 平台。"
        action={<Link to="/app/admin/records" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">查看报告流</Link>}
      />

      <section className="rounded-lg border border-emerald-200 bg-[#ecf8f0] p-6">
        <p className="text-sm font-semibold text-emerald-800">辅助入口</p>
        <h2 className="mt-2 text-2xl font-bold text-slate-950">助手把浏览器现场带回 Web 平台。</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">
          当前页扫描、即时提醒和必要拦截来自浏览器助手；报告分析、规则调整、名单维护和样本处理继续在运营控制台完成。
        </p>
      </section>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="连接状态" value="Available" description="API http://127.0.0.1:8000" tone="green" />
        <StatCard title="助手版本" value="1.0.0" description="Manifest V3" tone="blue" />
        <StatCard title="最近拦截事件" value={blockedEvents.length} description="恶意页面提醒与拦截" tone="red" />
        <StatCard title="异常上报" value={abnormalEvents.length} description="高分或含密码表单" tone="amber" />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <StatCard title="同步事件" value={events.length} description="进入 Web 报告流" tone="blue" />
        <StatCard title="可疑提醒" value={suspiciousEvents.length} description="建议进入样本队列复核" tone="slate" />
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-950">助手同步事件</h2>
            <p className="text-sm text-slate-500">这里仅看浏览器侧输入，后续分析和处置进入统一报告流。</p>
          </div>
          <Link to="/plugin-install" className="text-sm font-semibold text-emerald-700">安装说明</Link>
        </div>
        <DataTable
          data={events.slice(0, 20)}
          emptyText="暂无浏览器助手同步事件。"
          columns={[
            { key: 'url', title: 'URL', render: (value) => <span className="block max-w-lg truncate">{value}</span> },
            { key: 'label', title: '风险', render: (value) => <RiskBadge label={value} size="sm" /> },
            { key: 'risk_score', title: '评分', render: (value) => Number(value).toFixed(1) },
            { key: 'has_password_input', title: '异常信号', render: (value, row) => value || row.risk_score >= 70 ? '需关注' : '正常' },
            { key: 'created_at', title: '同步时间', render: (value) => formatDate(value) },
            { key: 'id', title: '报告', render: (value) => <Link to={`/app/reports/${value}`} className="font-semibold text-emerald-700">打开</Link> },
          ]}
        />
      </section>
    </div>
  );
}
