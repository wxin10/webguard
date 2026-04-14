import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import RiskBadge from '../components/RiskBadge';
import RuleHitList from '../components/RuleHitList';
import { useAuth } from '../contexts/AuthContext';
import { reportsApi, userStrategyApi } from '../services/api';
import { AnalysisReport, ScanRecordItem, UserStrategyOverview } from '../types';
import { formatDate, riskBar, sourceText } from '../utils';

export default function ReportDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [history, setHistory] = useState<ScanRecordItem[]>([]);
  const [strategies, setStrategies] = useState<UserStrategyOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      reportsApi.getReport(id),
      reportsApi.getDomainHistory(id).catch(() => ({ records: [] })),
      userStrategyApi.getStrategies().catch(() => null),
    ])
      .then(([reportData, historyData, strategyData]) => {
        setReport(reportData);
        setHistory(historyData.records || []);
        setStrategies(strategyData);
      })
      .catch(() => setError('报告不存在或后端服务未启动'))
      .finally(() => setLoading(false));
  }, [id]);

  const runAction = async (label: string, action: () => Promise<unknown>, success: string) => {
    setActing(label);
    setMessage('');
    try {
      await action();
      const strategyData = await userStrategyApi.getStrategies().catch(() => null);
      setStrategies(strategyData);
      setMessage(success);
    } catch {
      setMessage('操作失败，请确认后端服务已启动。');
    } finally {
      setActing('');
    }
  };

  if (loading) return <LoadingBlock />;
  if (error || !report) return <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">{error || '报告不存在'}</div>;

  const userActions = [
    { label: '加入信任站点', action: () => reportsApi.trustDomain(report.id, { note: '用户从报告页加入信任站点', scope: 'user' }), success: `${report.domain} 已加入我的信任站点。` },
    { label: '加入阻止站点', action: () => reportsApi.blockDomain(report.id, { note: '用户从报告页加入阻止站点', scope: 'user' }), success: `${report.domain} 已加入我的阻止站点。` },
    { label: '标记为误报', action: () => reportsApi.markFalsePositive(report.id, { note: '用户认为该报告可能误报', status: 'pending_review' }), success: '误报反馈已提交到管理员待处理队列。' },
    { label: '重新检测', action: () => reportsApi.recheck(report.id, { note: '用户从报告页重新检测' }), success: '已重新检测并生成新的报告记录。' },
  ];
  const currentStrategy = strategyFor(report.domain, strategies);

  const adminActions = [
    { label: '确认风险', action: () => reportsApi.review(report.id, { note: '管理员确认风险', status: 'confirmed_risk' }), success: '已记录确认风险处置结果。' },
    { label: '确认误报', action: () => reportsApi.markFalsePositive(report.id, { note: '管理员确认误报', status: 'confirmed_false_positive' }), success: '已记录误报处置结果。' },
    { label: '推送规则复核', action: () => reportsApi.review(report.id, { note: '推送到规则复核', status: 'rule_review' }), success: '已推送到规则复核队列。' },
    { label: '加入全局白名单', action: () => reportsApi.trustDomain(report.id, { note: '管理员从报告页加入全局白名单', scope: 'global' }), success: `${report.domain} 已加入全局白名单。` },
    { label: '加入全局黑名单', action: () => reportsApi.blockDomain(report.id, { note: '管理员从报告页加入全局黑名单', scope: 'global' }), success: `${report.domain} 已加入全局黑名单。` },
  ];

  return (
    <div>
      <PageHeader
        title={`风险报告 #${report.id}`}
        description="报告页现在承接检测后的处理动作：用户可以沉淀个人策略，管理员可以形成复核与全局处置记录。"
        action={<Link to={isAdmin ? '/app/admin/records' : '/app/my-records'} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">返回报告列表</Link>}
      />

      {message && <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{message}</div>}

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-5 lg:flex-row">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <RiskBadge label={report.label} size="lg" />
              <span className="text-sm text-slate-500">{sourceText(report.source)} · {formatDate(report.created_at)}</span>
            </div>
            <h2 className="mt-4 break-all text-2xl font-bold text-slate-950">{report.url}</h2>
            <p className="mt-2 text-sm text-slate-500">域名: {report.domain} · 标题: {report.title || '未采集'}</p>
            <p className="mt-5 max-w-4xl text-slate-700">{report.conclusion}</p>
          </div>
          <div className="w-full rounded-lg border border-slate-200 bg-slate-50 p-5 lg:w-80">
            <p className="text-sm font-semibold text-slate-500">风险评分</p>
            <div className="mt-2 text-5xl font-bold text-slate-950">{report.risk_score.toFixed(1)}</div>
            <div className="mt-5 h-3 rounded-full bg-slate-200">
              <div className={`h-3 rounded-full ${riskBar(report.label)}`} style={{ width: `${Math.min(report.risk_score, 100)}%` }} />
            </div>
            <p className="mt-3 text-sm text-slate-500">规则评分 {report.rule_score.toFixed(2)}</p>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-emerald-200 bg-[#ecf8f0] p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <p className="text-sm font-semibold text-emerald-800">{isAdmin ? '管理员处理流' : '报告处理'}</p>
            <h3 className="mt-2 text-xl font-bold text-slate-950">看完报告后，直接完成下一步。</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
              {isAdmin ? '管理员动作会写入报告处置记录，并可同步调整全局黑白名单。' : '用户动作会写入你的个人策略，浏览器助手会继续使用同一套后端策略。'}
            </p>
            {!isAdmin && (
              <p className="mt-3 inline-flex rounded-lg bg-white px-3 py-2 text-sm font-semibold text-emerald-800">
                当前域名策略状态：{currentStrategy}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {(isAdmin ? adminActions : userActions).map((item) => (
              <button
                key={item.label}
                disabled={Boolean(acting)}
                onClick={() => runAction(item.label, item.action, item.success)}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {acting === item.label ? '处理中...' : item.label}
              </button>
            ))}
            <button onClick={() => navigate(isAdmin ? '/app/admin/samples' : '/app/my-domains')} className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50">
              {isAdmin ? '进入处理队列' : '查看我的策略'}
            </button>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">模型概率</h3>
          <Probability label="安全" value={report.model_probs.safe} color="bg-emerald-500" />
          <Probability label="可疑" value={report.model_probs.suspicious} color="bg-amber-500" />
          <Probability label="恶意" value={report.model_probs.malicious} color="bg-red-500" />
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">规则命中</h3>
          <div className="mt-4">
            <RuleHitList rules={report.hit_rules || []} />
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">检测解释</h3>
          <p className="mt-4 whitespace-pre-line text-sm leading-6 text-slate-700">{report.explanation || '暂无解释'}</p>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">处理建议</h3>
          <p className="mt-4 text-sm leading-6 text-slate-700">{report.recommendation || '暂无建议'}</p>
        </section>
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-bold text-slate-950">同域名历史记录</h3>
        <div className="mt-4">
          <DataTable
            data={history}
            emptyText="暂无同域名历史记录。"
            columns={[
              { key: 'url', title: 'URL', render: (value) => <span className="block max-w-md truncate">{value}</span> },
              { key: 'label', title: '风险', render: (value) => <RiskBadge label={value} size="sm" /> },
              { key: 'source', title: '来源', render: (value) => sourceText(value) },
              { key: 'created_at', title: '时间', render: (value) => formatDate(value) },
              { key: 'id', title: '报告', render: (value) => <Link to={`/app/reports/${value}`} className="font-semibold text-emerald-700">打开</Link> },
            ]}
          />
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-bold text-slate-950">分析证据</h3>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {report.evidence.map((item) => (
            <div key={item.title} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h4 className="font-semibold text-slate-900">{item.title}</h4>
              <p className="mt-2 text-sm text-slate-600">{item.summary}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function strategyFor(domain: string, strategies: UserStrategyOverview | null) {
  if (!strategies) return '未处理';
  if (strategies.trusted_sites.some((item) => item.domain === domain)) return '已信任';
  if (strategies.blocked_sites.some((item) => item.domain === domain)) return '已阻止';
  if (strategies.paused_sites.some((item) => item.domain === domain)) return '临时忽略';
  return '未处理';
}

function Probability({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="mt-5">
      <div className="flex justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="font-semibold text-slate-950">{value.toFixed(2)}</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-slate-200">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.min(value * 100, 100)}%` }} />
      </div>
    </div>
  );
}
