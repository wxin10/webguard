import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import RiskBadge from '../components/RiskBadge';
import StatCard from '../components/StatCard';
import StatusNotice from '../components/StatusNotice';
import { adminFeedbackService } from '../services/adminFeedbackService';
import { recordsService } from '../services/recordsService';
import { reportsService } from '../services/reportsService';
import type { FeedbackCaseItem, ScanRecordItem } from '../types';
import { feedbackStatusText, formatDate, scanSourceText } from '../utils';

type QueueKey = 'all' | 'malicious' | 'suspicious' | 'feedback';

export default function Samples() {
  const [records, setRecords] = useState<ScanRecordItem[]>([]);
  const [feedbackCases, setFeedbackCases] = useState<FeedbackCaseItem[]>([]);
  const [queue, setQueue] = useState<QueueKey>('all');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [recordData, feedbackData] = await Promise.all([
        recordsService.getRecords(),
        adminFeedbackService.getFeedback(),
      ]);
      setRecords(recordData.records || []);
      setFeedbackCases(feedbackData.cases || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '样本与反馈加载失败。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const risky = useMemo(() => records.filter((item) => (item.risk_level || item.label) !== 'safe'), [records]);
  const visibleRecords = risky.filter((item) => {
    const label = item.risk_level || item.label;
    if (queue === 'malicious') return label === 'malicious';
    if (queue === 'suspicious') return label === 'suspicious';
    if (queue === 'feedback') return false;
    return true;
  });
  const pendingFeedback = feedbackCases.filter((item) => item.status === 'pending_review');

  const reviewRecord = async (row: ScanRecordItem, status: string, note: string) => {
    await reportsService.review(row.report_id || row.id, { status, note });
    setMessage(`${row.host || row.domain} 已记录处理状态：${note}`);
    loadData();
  };

  const markFalsePositive = async (row: ScanRecordItem) => {
    await reportsService.markFalsePositive(row.report_id || row.id, { status: 'confirmed_false_positive', note: '管理员确认误报' });
    setMessage(`${row.host || row.domain} 已确认为误报。`);
    loadData();
  };

  const updateFeedback = async (item: FeedbackCaseItem, status: string) => {
    await adminFeedbackService.updateFeedback(item.id, { status, comment: `管理员处理为 ${status}` });
    setMessage(`反馈 #${item.id} 已更新为 ${feedbackStatusText(status)}。`);
    loadData();
  };

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="样本与误报处理"
        description="风险样本、浏览器助手反馈和误报申诉进入管理员处理队列，处理结果沉淀到报告动作和反馈案例。"
        action={
          <Link to="/app/admin/rules" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            查看规则
          </Link>
        }
      />

      {message && <StatusNotice tone="success">{message}</StatusNotice>}
      {error && <StatusNotice tone="error">{error}</StatusNotice>}

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="待复核样本" value={risky.length} tone="amber" />
        <StatCard title="恶意样本" value={risky.filter((item) => (item.risk_level || item.label) === 'malicious').length} tone="red" />
        <StatCard title="可疑样本" value={risky.filter((item) => (item.risk_level || item.label) === 'suspicious').length} tone="slate" />
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
            emptyText="暂无反馈案例。"
            columns={[
              { key: 'id', title: '案例', render: (value) => `#${String(value)}` },
              { key: 'url', title: 'URL', render: (value) => <span className="block max-w-lg truncate">{String(value || '-')}</span> },
              { key: 'feedback_type', title: '类型', render: (value) => String(value || '-') },
              { key: 'status', title: '状态', render: (value) => feedbackStatusText(String(value || '')) },
              { key: 'source', title: '来源', render: (value) => scanSourceText(String(value || '')) },
              { key: 'created_at', title: '提交时间', render: (value) => formatDate(String(value || '')) },
              {
                key: 'report_id',
                title: '处理',
                render: (value, row) => {
                  const reportId = row.related_report_id || row.report_id || value;
                  return (
                    <div className="flex flex-wrap gap-2">
                      {reportId && <Link to={`/app/reports/${reportId}`} className="font-semibold text-blue-700">报告</Link>}
                      <button onClick={() => updateFeedback(row, 'confirmed_false_positive')} className="font-semibold text-slate-700">确认误报</button>
                      <button onClick={() => updateFeedback(row, 'confirmed_risk')} className="font-semibold text-red-600">确认风险</button>
                      <button onClick={() => updateFeedback(row, 'resolved')} className="font-semibold text-emerald-700">标记已处理</button>
                    </div>
                  );
                },
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
              { key: 'url', title: 'URL', render: (value) => <span className="block max-w-lg truncate">{String(value || '-')}</span> },
              { key: 'label', title: '风险', render: (value, row) => <RiskBadge label={String(row.risk_level || value || 'unknown')} size="sm" /> },
              { key: 'source', title: '来源', render: (value) => scanSourceText(String(value || '')) },
              { key: 'risk_score', title: '分数', render: (value) => Number(value || 0).toFixed(1) },
              { key: 'created_at', title: '进入时间', render: (value) => formatDate(String(value || '')) },
              {
                key: 'id',
                title: '处理',
                render: (value, row) => (
                  <div className="flex flex-wrap gap-2">
                    <Link to={`/app/reports/${row.report_id || value}`} className="font-semibold text-blue-700">复核</Link>
                    <button onClick={() => reviewRecord(row, 'confirmed_risk', '管理员确认风险')} className="font-semibold text-red-600">确认风险</button>
                    <button onClick={() => markFalsePositive(row)} className="font-semibold text-slate-700">确认误报</button>
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
    <button onClick={onClick} type="button" className={`rounded-lg px-4 py-2 text-sm font-semibold ${active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
      {children}
    </button>
  );
}
