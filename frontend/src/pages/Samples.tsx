import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import RiskBadge from '../components/RiskBadge';
import StatCard from '../components/StatCard';
import { pluginApi, recordsApi, reportsApi } from '../services/api';
import { FeedbackCaseItem, ScanRecordItem } from '../types';
import { formatDate, sourceText } from '../utils';

type QueueKey = 'all' | 'malicious' | 'suspicious' | 'feedback';

export default function Samples() {
  const [records, setRecords] = useState<ScanRecordItem[]>([]);
  const [feedbackCases, setFeedbackCases] = useState<FeedbackCaseItem[]>([]);
  const [queue, setQueue] = useState<QueueKey>('all');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const loadData = () => {
    setLoading(true);
    Promise.all([recordsApi.getRecords(), pluginApi.getFeedbackCases()])
      .then(([recordData, feedbackData]) => {
        setRecords(recordData.records || []);
        setFeedbackCases(feedbackData.cases || []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(loadData, []);

  const risky = useMemo(() => records.filter((item) => item.label !== 'safe'), [records]);
  const visibleRecords = risky.filter((item) => {
    if (queue === 'malicious') return item.label === 'malicious';
    if (queue === 'suspicious') return item.label === 'suspicious';
    if (queue === 'feedback') return false;
    return true;
  });
  const pendingFeedback = feedbackCases.filter((item) => item.status === 'pending_review');

  const reviewRecord = async (row: ScanRecordItem, status: string, note: string) => {
    await reportsApi.review(row.id, { status, note });
    setMessage(`${row.domain} 已记录处理状态：${note}`);
  };

  const updateFeedback = async (item: FeedbackCaseItem, status: string) => {
    await pluginApi.updateFeedbackCase(item.id, { status, comment: `管理员处理为 ${status}` });
    setMessage(`反馈 #${item.id} 已更新为 ${status}`);
    loadData();
  };

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="样本与误报处理"
        description="风险样本、插件反馈和误报申诉都在这里进入管理员处理队列，处理结果沉淀到报告动作和反馈案件。"
        action={<Link to="/app/admin/rules" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">查看规则</Link>}
      />

      {message && <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{message}</div>}

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="待复核样本" value={risky.length} tone="amber" />
        <StatCard title="恶意样本" value={risky.filter((item) => item.label === 'malicious').length} tone="red" />
        <StatCard title="可疑样本" value={risky.filter((item) => item.label === 'suspicious').length} tone="slate" />
        <StatCard title="待处理反馈" value={pendingFeedback.length} tone="blue" />
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <QueueButton active={queue === 'all'} onClick={() => setQueue('all')}>全部样本</QueueButton>
          <QueueButton active={queue === 'malicious'} onClick={() => setQueue('malicious')}>恶意样本</QueueButton>
          <QueueButton active={queue === 'suspicious'} onClick={() => setQueue('suspicious')}>可疑样本</QueueButton>
          <QueueButton active={queue === 'feedback'} onClick={() => setQueue('feedback')}>误报与申诉</QueueButton>
        </div>
      </section>

      {queue === 'feedback' ? (
        <section className="mt-6">
          <DataTable
            data={feedbackCases}
            emptyText="暂无反馈案件。"
            columns={[
              { key: 'id', title: '案件', render: (value) => `#${value}` },
              { key: 'url', title: 'URL', render: (value) => <span className="block max-w-lg truncate">{value || '-'}</span> },
              { key: 'feedback_type', title: '类型' },
              { key: 'status', title: '状态' },
              { key: 'source', title: '来源', render: (value) => sourceText(value) },
              { key: 'created_at', title: '提交时间', render: (value) => formatDate(value) },
              {
                key: 'report_id',
                title: '处理',
                render: (value, row) => (
                  <div className="flex flex-wrap gap-2">
                    {value && <Link to={`/app/reports/${value}`} className="font-semibold text-emerald-700">报告</Link>}
                    <button onClick={() => updateFeedback(row, 'confirmed_false_positive')} className="font-semibold text-slate-700">确认误报</button>
                    <button onClick={() => updateFeedback(row, 'confirmed_risk')} className="font-semibold text-rose-700">确认风险</button>
                  </div>
                ),
              },
            ]}
          />
        </section>
      ) : (
        <section className="mt-6">
          <DataTable
            data={visibleRecords}
            emptyText="暂无待复核样本。"
            columns={[
              { key: 'url', title: 'URL', render: (value) => <span className="block max-w-lg truncate">{value}</span> },
              { key: 'label', title: '风险', render: (value) => <RiskBadge label={value} size="sm" /> },
              { key: 'source', title: '来源', render: (value) => sourceText(value) },
              { key: 'risk_score', title: '分数', render: (value) => Number(value).toFixed(1) },
              { key: 'created_at', title: '进入时间', render: (value) => formatDate(value) },
              {
                key: 'id',
                title: '处理',
                render: (value, row) => (
                  <div className="flex flex-wrap gap-2">
                    <Link to={`/app/reports/${value}`} className="font-semibold text-emerald-700">复核</Link>
                    <button onClick={() => reviewRecord(row, 'confirmed_risk', '管理员确认风险')} className="font-semibold text-rose-700">确认风险</button>
                    <button onClick={() => reportsApi.markFalsePositive(row.id, { status: 'confirmed_false_positive', note: '管理员确认误报' })} className="font-semibold text-slate-700">确认误报</button>
                  </div>
                ),
              },
            ]}
          />
        </section>
      )}
    </div>
  );
}

function QueueButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} type="button" className={`rounded-lg px-4 py-2 text-sm font-semibold ${active ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
      {children}
    </button>
  );
}
