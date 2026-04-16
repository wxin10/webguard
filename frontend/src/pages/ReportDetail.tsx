import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import RiskBadge from '../components/RiskBadge';
import { useAuth } from '../contexts/AuthContext';
import { reportsApi, userStrategyApi } from '../services/api';
import { AnalysisReport, HitRule, ScanRecordItem, ScoreBreakdown, UserStrategyOverview } from '../types';
import { formatDate, pluginEventText, riskBar, sourceText, strategyText } from '../utils';

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
      .catch((err) => setError(err instanceof Error ? err.message : '报告不存在，或后端服务不可用。'))
      .finally(() => setLoading(false));
  }, [id]);

  const fallbackBreakdown = useMemo(() => (report ? buildFallbackBreakdown(report) : null), [report]);
  const breakdown = report?.score_breakdown || fallbackBreakdown;
  const allRules = breakdown?.rules || report?.hit_rules || [];
  const matchedRules = allRules.filter((rule) => rule.matched);
  const appliedRules = allRules.filter((rule) => rule.matched && (rule.enabled ?? true) && Number(rule.contribution ?? rule.weighted_score ?? 0) > 0);

  const runAction = async (label: string, action: () => Promise<unknown>, success: string) => {
    setActing(label);
    setMessage('');
    try {
      await action();
      const strategyData = await userStrategyApi.getStrategies().catch(() => null);
      setStrategies(strategyData);
      setMessage(success);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '操作失败，请确认后端服务状态。');
    } finally {
      setActing('');
    }
  };

  if (loading) return <LoadingBlock />;
  if (error || !report || !breakdown) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">{error || '报告不存在。'}</div>;
  }

  const currentStrategy = policyState(report.domain, strategies);
  const userActions = [
    { label: '加入信任域名', action: () => reportsApi.trustDomain(report.id, { note: '用户从报告页加入信任域名', scope: 'user' }), success: `${report.domain} 已加入个人信任域名。` },
    { label: '加入阻止域名', action: () => reportsApi.blockDomain(report.id, { note: '用户从报告页加入阻止域名', scope: 'user' }), success: `${report.domain} 已加入个人阻止域名。` },
    { label: '提交误报', action: () => reportsApi.markFalsePositive(report.id, { note: '用户认为该报告可能误报', status: 'pending_review' }), success: '误报反馈已提交到管理员处理队列。' },
    { label: '重新检测', action: () => reportsApi.recheck(report.id, { note: '用户从报告页重新检测' }), success: '已重新检测并生成新的报告记录。' },
  ];
  const adminActions = [
    { label: '确认风险', action: () => reportsApi.review(report.id, { note: '管理员确认风险', status: 'confirmed_risk' }), success: '已记录确认风险处置结果。' },
    { label: '确认误报', action: () => reportsApi.markFalsePositive(report.id, { note: '管理员确认误报', status: 'confirmed_false_positive' }), success: '已记录误报处置结果。' },
    { label: '加入全局白名单', action: () => reportsApi.trustDomain(report.id, { note: '管理员从报告页加入全局白名单', scope: 'global' }), success: `${report.domain} 已加入全局白名单。` },
    { label: '加入全局黑名单', action: () => reportsApi.blockDomain(report.id, { note: '管理员从报告页加入全局黑名单', scope: 'global' }), success: `${report.domain} 已加入全局黑名单。` },
  ];

  return (
    <div>
      <PageHeader
        title={`风险报告 #${report.id}`}
        description="完整报告沉淀 URL、host、风险评分、命中规则、页面特征、处置建议、用户动作和插件现场事件。"
        action={<Link to={isAdmin ? '/app/admin/records' : '/app/my-records'} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">返回记录</Link>}
      />

      {message && <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{message}</div>}

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-6 lg:flex-row">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <RiskBadge label={report.label} size="lg" />
              <span className="text-sm text-slate-500">{sourceText(report.source)} · {formatDate(report.created_at)}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">host: {report.domain}</span>
            </div>
            <h2 className="mt-4 break-all text-2xl font-bold text-slate-950">{report.url}</h2>
            <p className="mt-2 text-sm text-slate-500">页面标题：{report.title || '未采集'}</p>
            <p className="mt-5 max-w-4xl text-slate-700">{report.conclusion}</p>
          </div>
          <div className="w-full rounded-lg border border-slate-200 bg-slate-50 p-5 lg:w-96">
            <p className="text-sm font-semibold text-slate-500">风险分数</p>
            <div className="mt-2 text-5xl font-bold text-slate-950">{breakdown.final_score.toFixed(1)}</div>
            <div className="mt-5 h-3 rounded-full bg-slate-200">
              <div className={`h-3 rounded-full ${riskBar(report.label)}`} style={{ width: `${Math.min(breakdown.final_score, 100)}%` }} />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <ScorePill label="规则分" value={breakdown.rule_score_total} />
              <ScorePill label="模型分" value={breakdown.model_score_total} />
              <ScorePill label="命中规则" value={matchedRules.length} />
              <ScorePill label="计分规则" value={appliedRules.length} />
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <p className="text-sm font-semibold text-emerald-800">{isAdmin ? '管理员处置' : '用户处置'}</p>
            <h3 className="mt-2 text-xl font-bold text-slate-950">报告页是风险处置入口。</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
              {isAdmin ? '管理员动作会写入报告动作记录，并可同步调整全局黑白名单。' : '用户动作会写入个人策略，插件继续从后端拉取同一套策略。'}
            </p>
            {!isAdmin && <p className="mt-3 inline-flex rounded-lg bg-white px-3 py-2 text-sm font-semibold text-emerald-800">当前域名策略：{currentStrategy}</p>}
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
              {isAdmin ? '进入样本队列' : '查看我的策略'}
            </button>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">页面特征摘要</h3>
          <div className="mt-4 grid gap-3 text-sm text-slate-700 md:grid-cols-2">
            <FeatureItem label="是否含密码框" value={breakdown.raw_features.has_password_input ? '是' : '否'} />
            <FeatureItem label="表单 action 域" value={(breakdown.raw_features.form_action_domains || []).join(', ') || '未发现'} />
            <FeatureItem label="按钮文本" value={(breakdown.raw_features.button_texts || []).join(', ') || '未采集'} />
            <FeatureItem label="输入标签" value={(breakdown.raw_features.input_labels || []).join(', ') || '未采集'} />
            <FeatureItem label="可见文本长度" value={String(breakdown.raw_features.visible_text_length ?? 0)} />
            <FeatureItem label="综合文本长度" value={String(breakdown.raw_features.text_length ?? 0)} />
          </div>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">处置建议</h3>
          <p className="mt-4 text-sm leading-6 text-slate-700">{report.recommendation || '暂无建议。'}</p>
          <h3 className="mt-6 text-lg font-bold text-slate-950">检测摘要</h3>
          <p className="mt-4 whitespace-pre-line text-sm leading-6 text-slate-700">{report.explanation || '暂无解释。'}</p>
        </section>
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-bold text-slate-950">命中规则</h3>
        <p className="mt-1 text-sm text-slate-500">{breakdown.fusion_summary}</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">规则</th>
                <th className="px-4 py-3">命中</th>
                <th className="px-4 py-3">权重</th>
                <th className="px-4 py-3">贡献</th>
                <th className="px-4 py-3">类别</th>
                <th className="px-4 py-3">原因</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {allRules.map((rule) => <RuleRow key={rule.rule_key} rule={rule} />)}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Timeline title="用户动作记录" empty="暂无用户动作。" data={report.actions || []} />
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">插件现场动作</h3>
          <DataTable
            data={report.plugin_events || []}
            emptyText="暂无插件现场事件。"
            columns={[
              { key: 'event_type', title: '事件', render: (_value, row) => pluginEventText(row.event_type, row.action) },
              { key: 'summary', title: '摘要', render: (value) => <span className="block max-w-md truncate">{value || '-'}</span> },
              { key: 'plugin_version', title: '版本', render: (value) => value || '-' },
              { key: 'created_at', title: '时间', render: (value) => formatDate(value) },
            ]}
          />
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
    </div>
  );
}

function buildFallbackBreakdown(report: AnalysisReport): ScoreBreakdown {
  const modelScore = (report.model_probs.malicious * 100) + (report.model_probs.suspicious * 50);
  const dominant = Object.entries(report.model_probs).sort((a, b) => b[1] - a[1])[0]?.[0] as ScoreBreakdown['model']['dominant_label'];
  return {
    rule_score_total: report.rule_score,
    model_score_total: modelScore,
    final_score: report.risk_score,
    label: report.label,
    fusion_summary: `最终风险分 = 规则分 ${report.rule_score.toFixed(1)} + 模型风险分 ${modelScore.toFixed(1)} 的融合结果。`,
    rules: report.hit_rules || [],
    model: {
      safe_prob: report.model_probs.safe,
      suspicious_prob: report.model_probs.suspicious,
      malicious_prob: report.model_probs.malicious,
      dominant_label: dominant || report.label,
      model_score: modelScore,
      contribution: modelScore * 0.6,
      contribution_summary: `模型倾向 ${dominant || report.label}。`,
    },
    raw_features: report.raw_features || {},
  };
}

function policyState(domain: string, strategies: UserStrategyOverview | null) {
  if (!strategies) return '未处理';
  const matched = [...strategies.trusted_sites, ...strategies.blocked_sites, ...strategies.paused_sites].find((item) => item.domain === domain);
  return matched ? strategyText(matched.strategy_type) : '未处理';
}

function ScorePill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-white p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-950">{typeof value === 'number' ? value.toFixed(1).replace('.0', '') : value}</p>
    </div>
  );
}

function FeatureItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 break-all text-slate-800">{value}</p>
    </div>
  );
}

function RuleRow({ rule }: { rule: HitRule }) {
  const contribution = Number(rule.contribution ?? rule.weighted_score ?? 0);
  return (
    <tr className={rule.matched ? 'bg-emerald-50/40' : undefined}>
      <td className="px-4 py-4 align-top">
        <div className="font-semibold text-slate-950">{rule.name || rule.rule_name}</div>
        <div className="mt-1 text-xs text-slate-500">{rule.rule_key}</div>
      </td>
      <td className="px-4 py-4 align-top text-sm">{rule.matched ? '命中' : '未命中'}</td>
      <td className="px-4 py-4 align-top text-sm">{Number(rule.weight ?? 0).toFixed(1)}</td>
      <td className="px-4 py-4 align-top text-sm font-bold text-slate-950">{contribution > 0 ? `+${contribution.toFixed(1)}` : '0'}</td>
      <td className="px-4 py-4 align-top text-sm">{rule.category || 'local'}</td>
      <td className="px-4 py-4 align-top text-sm leading-6 text-slate-700">{rule.reason || rule.detail || '-'}</td>
    </tr>
  );
}

function Timeline({ title, empty, data }: { title: string; empty: string; data: NonNullable<AnalysisReport['actions']> }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-slate-950">{title}</h3>
      <DataTable
        data={data}
        emptyText={empty}
        columns={[
          { key: 'action_type', title: '动作' },
          { key: 'actor', title: '操作者' },
          { key: 'status', title: '状态', render: (value) => value || '-' },
          { key: 'created_at', title: '时间', render: (value) => formatDate(value) },
        ]}
      />
    </section>
  );
}
