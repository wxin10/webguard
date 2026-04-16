import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import RiskBadge from '../components/RiskBadge';
import StatCard from '../components/StatCard';
import { recordsApi, reportsApi, rulesApi } from '../services/api';
import { ReportActionItem, RuleConfig, ScanRecordItem } from '../types';
import { formatDate, sourceText } from '../utils';

type QueueKey = 'all' | 'malicious' | 'suspicious' | 'plugin';

export default function Samples() {
  const [records, setRecords] = useState<ScanRecordItem[]>([]);
  const [actions, setActions] = useState<ReportActionItem[]>([]);
  const [rules, setRules] = useState<RuleConfig[]>([]);
  const [queue, setQueue] = useState<QueueKey>('all');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    Promise.all([recordsApi.getRecords(), reportsApi.getRecentActions(), rulesApi.getRules()])
      .then(([recordData, actionData, ruleData]) => {
        setRecords(recordData.records || []);
        setActions(actionData || []);
        setRules(ruleData.rules || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const risky = useMemo(() => records.filter((item) => item.label !== 'safe'), [records]);
  const pluginRisky = risky.filter((item) => item.source === 'plugin');
  const suspicious = risky.filter((item) => item.label === 'suspicious');
  const malicious = risky.filter((item) => item.label === 'malicious');
  const feedbackActions = actions.filter((item) => item.action_type === 'mark_false_positive' || item.action_type === 'false_positive');
  const reviewRules = [...rules]
    .filter((rule) => (rule.stats?.false_positive_feedback_7d || 0) > 0 || (rule.stats?.suspicious_hits_7d || 0) >= 3)
    .sort((a, b) => (b.stats?.false_positive_feedback_7d || 0) - (a.stats?.false_positive_feedback_7d || 0))
    .slice(0, 5);

  const visibleRecords = risky.filter((item) => {
    if (queue === 'malicious') return item.label === 'malicious';
    if (queue === 'suspicious') return item.label === 'suspicious';
    if (queue === 'plugin') return item.source === 'plugin';
    return true;
  });

  const handleReview = async (row: ScanRecordItem, status: string, note: string) => {
    await reportsApi.review(row.id, { status, note });
    setMessage(`${row.domain} 已记录处理结果：${note}`);
  };

  const handleFalsePositive = async (row: ScanRecordItem) => {
    await reportsApi.markFalsePositive(row.id, { status: 'confirmed_false_positive', note: '管理员在样本队列确认误报' });
    setMessage(`${row.domain} 已记录为误报。`);
  };

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="样本与误报处理"
        description="把争议样本、误报反馈和规则复核线索放在同一个队列里处理。"
        action={<Link to="/app/admin/rules" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">查看规则管理</Link>}
      />

      {message && <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{message}</div>}

      <div className="grid gap-4 md:grid-cols-5">
        <StatCard title="待复核样本" value={risky.length} description="可疑与恶意记录" tone="amber" />
        <StatCard title="高风险样本" value={malicious.length} description="建议优先确认" tone="red" />
        <StatCard title="误报反馈" value={feedbackActions.length || suspicious.length} description="用户反馈与可疑结论" tone="slate" />
        <StatCard title="助手风险事件" value={pluginRisky.length} description="来自浏览器助手" tone="blue" />
        <StatCard title="待复核规则" value={reviewRules.length} description="误报或可疑命中偏多" tone="green" />
      </div>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-wrap gap-2">
            <QueueButton active={queue === 'all'} onClick={() => setQueue('all')}>全部待处理</QueueButton>
            <QueueButton active={queue === 'malicious'} onClick={() => setQueue('malicious')}>高风险样本</QueueButton>
            <QueueButton active={queue === 'suspicious'} onClick={() => setQueue('suspicious')}>可疑/误报复核</QueueButton>
            <QueueButton active={queue === 'plugin'} onClick={() => setQueue('plugin')}>助手同步事件</QueueButton>
          </div>
          <DataTable
            data={visibleRecords}
            emptyText="暂无待复核样本。"
            columns={[
              { key: 'url', title: 'URL', render: (value) => <span className="block max-w-lg truncate">{value}</span> },
              { key: 'label', title: '风险', render: (value) => <RiskBadge label={value} size="sm" /> },
              { key: 'source', title: '来源', render: (value) => sourceText(value) },
              { key: 'risk_score', title: '评分', render: (value) => Number(value).toFixed(1) },
              { key: 'created_at', title: '进入时间', render: (value) => formatDate(value) },
              {
                key: 'id',
                title: '处理',
                render: (value, row) => (
                  <div className="flex flex-wrap gap-2">
                    <Link to={`/app/reports/${value}`} className="font-semibold text-emerald-700">复核</Link>
                    <button onClick={() => handleReview(row, 'confirmed_risk', '管理员确认风险')} className="font-semibold text-rose-700">确认风险</button>
                    <button onClick={() => handleFalsePositive(row)} className="font-semibold text-slate-700">误报</button>
                    <button onClick={() => handleReview(row, 'rule_review', '推送规则复核')} className="font-semibold text-amber-700">规则复核</button>
                  </div>
                ),
              },
            ]}
          />
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">规则复核线索</h2>
          <p className="mt-1 text-sm text-slate-500">误报反馈或可疑命中较多的规则会出现在这里。</p>
          <div className="mt-4 space-y-3">
            {reviewRules.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-500">暂无明显规则复核线索。</div>}
            {reviewRules.map((rule) => (
              <div key={rule.rule_key} className="rounded-lg bg-slate-50 p-4">
                <p className="font-semibold text-slate-950">{rule.name || rule.rule_name}</p>
                <p className="mt-1 text-xs text-slate-500">{rule.rule_key}</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  7 天命中 {rule.stats?.recent_hits_7d || 0} 次，误报反馈 {rule.stats?.false_positive_feedback_7d || 0} 次。{rule.stats?.false_positive_tendency || '继续观察'}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">最近用户反馈</h2>
        <div className="mt-4">
          <DataTable
            data={feedbackActions.slice(0, 8)}
            emptyText="暂无误报或处置反馈。"
            columns={[
              { key: 'report_id', title: '报告', render: (value) => value ? <Link to={`/app/reports/${value}`} className="font-semibold text-emerald-700">#{value}</Link> : '助手反馈' },
              { key: 'actor', title: '提交人' },
              { key: 'status', title: '状态', render: (value) => value || 'pending_review' },
              { key: 'note', title: '说明', render: (value) => <span className="block max-w-lg truncate">{value || '-'}</span> },
              { key: 'created_at', title: '时间', render: (value) => formatDate(value) },
            ]}
          />
        </div>
      </section>
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
