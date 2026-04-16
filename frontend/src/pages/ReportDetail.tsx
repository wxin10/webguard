import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import RiskBadge from '../components/RiskBadge';
import { useAuth } from '../contexts/AuthContext';
import { reportsApi, userStrategyApi } from '../services/api';
import { AnalysisReport, HitRule, ScanRecordItem, ScoreBreakdown, UserStrategyOverview } from '../types';
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
      .catch(() => setError('报告不存在，或后端服务未启动。'))
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
      setMessage('操作失败，请确认后端服务状态。');
    } finally {
      setActing('');
    }
  };

  const fallbackBreakdown = useMemo(() => (report ? buildFallbackBreakdown(report) : null), [report]);
  const breakdown = report?.score_breakdown || fallbackBreakdown;
  const allRules = breakdown?.rules || report?.hit_rules || [];
  const matchedRules = allRules.filter((rule) => rule.matched);
  const appliedRules = allRules.filter((rule) => rule.matched && (rule.enabled ?? true) && Number(rule.contribution ?? rule.weighted_score ?? 0) > 0);

  if (loading) return <LoadingBlock />;
  if (error || !report || !breakdown) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">{error || '报告不存在'}</div>;
  }

  const userActions = [
    { label: '加入信任站点', action: () => reportsApi.trustDomain(report.id, { note: '用户从报告页加入信任站点', scope: 'user' }), success: `${report.domain} 已加入我的信任站点。` },
    { label: '加入阻止站点', action: () => reportsApi.blockDomain(report.id, { note: '用户从报告页加入阻止站点', scope: 'user' }), success: `${report.domain} 已加入我的阻止站点。` },
    { label: '标记为误报', action: () => reportsApi.markFalsePositive(report.id, { note: '用户认为该报告可能误报', status: 'pending_review' }), success: '误报反馈已提交到管理员待处理队列。' },
    { label: '重新检测', action: () => reportsApi.recheck(report.id, { note: '用户从报告页重新检测' }), success: '已重新检测并生成新的报告记录。' },
  ];

  const adminActions = [
    { label: '确认风险', action: () => reportsApi.review(report.id, { note: '管理员确认风险', status: 'confirmed_risk' }), success: '已记录确认风险处置结果。' },
    { label: '确认误报', action: () => reportsApi.markFalsePositive(report.id, { note: '管理员确认误报', status: 'confirmed_false_positive' }), success: '已记录误报处置结果。' },
    { label: '推送规则复核', action: () => reportsApi.review(report.id, { note: '推送到规则复核', status: 'rule_review' }), success: '已推送到规则复核队列。' },
    { label: '加入全局白名单', action: () => reportsApi.trustDomain(report.id, { note: '管理员从报告页加入全局白名单', scope: 'global' }), success: `${report.domain} 已加入全局白名单。` },
    { label: '加入全局黑名单', action: () => reportsApi.blockDomain(report.id, { note: '管理员从报告页加入全局黑名单', scope: 'global' }), success: `${report.domain} 已加入全局黑名单。` },
  ];

  const currentStrategy = strategyFor(report.domain, strategies);

  return (
    <div>
      <PageHeader
        title={`风险报告 #${report.id}`}
        description="完整拆解规则命中、规则分、模型分与最终融合分，便于复盘每一次判定。"
        action={<Link to={isAdmin ? '/app/admin/records' : '/app/my-records'} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">返回报告列表</Link>}
      />

      {message && <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{message}</div>}

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-5 lg:flex-row">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <RiskBadge label={report.label} size="lg" />
              <span className="text-sm text-slate-500">{sourceText(report.source)} · {formatDate(report.created_at)}</span>
            </div>
            <h2 className="mt-4 break-all text-2xl font-bold text-slate-950">{report.url}</h2>
            <p className="mt-2 text-sm text-slate-500">域名：{report.domain} · 标题：{report.title || '未采集'}</p>
            <p className="mt-5 max-w-4xl text-slate-700">{report.conclusion}</p>
          </div>
          <div className="w-full rounded-lg border border-slate-200 bg-slate-50 p-5 lg:w-96">
            <p className="text-sm font-semibold text-slate-500">最终风险分</p>
            <div className="mt-2 text-5xl font-bold text-slate-950">{breakdown.final_score.toFixed(1)}</div>
            <div className="mt-5 h-3 rounded-full bg-slate-200">
              <div className={`h-3 rounded-full ${riskBar(report.label)}`} style={{ width: `${Math.min(breakdown.final_score, 100)}%` }} />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <ScorePill label="规则分" value={breakdown.rule_score_total} />
              <ScorePill label="模型分" value={breakdown.model_score_total} />
              <ScorePill label="命中规则" value={matchedRules.length} />
              <ScorePill label="实际计分" value={appliedRules.length} />
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <p className="text-sm font-semibold text-emerald-800">{isAdmin ? '管理员处置流' : '报告处置'}</p>
            <h3 className="mt-2 text-xl font-bold text-slate-950">看完评分依据后，直接完成下一步处理。</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
              {isAdmin ? '管理员动作会写入报告处置记录，并可同步调整全局黑白名单。' : '用户动作会写入个人站点策略，浏览器助手会继续使用同一套后端策略。'}
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
              {isAdmin ? '进入处理队列' : '查看我的策略'}
            </button>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-bold text-slate-950">最终评分公式说明</h3>
        <p className="mt-3 text-sm leading-6 text-slate-700">{breakdown.fusion_summary}</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          本次最终风险分主要由规则分和模型分组成。规则分来自启用规则的命中贡献，模型分来自 safe / suspicious / malicious 概率映射。关闭的规则即使命中特征也不会贡献分。
        </p>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">模型输出明细</h3>
          <Probability label="safe 概率" value={breakdown.model.safe_prob} color="bg-emerald-500" />
          <Probability label="suspicious 概率" value={breakdown.model.suspicious_prob} color="bg-amber-500" />
          <Probability label="malicious 概率" value={breakdown.model.malicious_prob} color="bg-red-500" />
          <div className="mt-5 rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-700">
            <p>模型主导类别：<span className="font-semibold text-slate-950">{breakdown.model.dominant_label}</span></p>
            <p>模型风险分：<span className="font-semibold text-slate-950">{breakdown.model.model_score.toFixed(1)}</span></p>
            <p>{breakdown.model.contribution_summary}</p>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">原始特征摘要</h3>
          <div className="mt-4 grid gap-3 text-sm text-slate-700 md:grid-cols-2">
            <FeatureItem label="是否有密码框" value={breakdown.raw_features.has_password_input ? '是' : '否'} />
            <FeatureItem label="表单 action 域" value={(breakdown.raw_features.form_action_domains || []).join(', ') || '未发现'} />
            <FeatureItem label="URL 特征" value={String(breakdown.raw_features.url || report.url)} />
            <FeatureItem label="标题特征" value={String(breakdown.raw_features.title || report.title || '未采集')} />
            <FeatureItem label="按钮文本" value={(breakdown.raw_features.button_texts || []).join(', ') || '未采集'} />
            <FeatureItem label="输入标签" value={(breakdown.raw_features.input_labels || []).join(', ') || '未采集'} />
            <FeatureItem label="可见文本长度" value={String(breakdown.raw_features.visible_text_length ?? 0)} />
            <FeatureItem label="综合文本长度" value={String(breakdown.raw_features.text_length ?? 0)} />
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h3 className="text-lg font-bold text-slate-950">规则贡献明细</h3>
            <p className="mt-1 text-sm text-slate-500">显示所有参与展示的规则，包括未命中和已停用规则；只有启用且命中的规则会贡献分。</p>
          </div>
          <Link to="/app/admin/rules" className="text-sm font-semibold text-emerald-700">进入规则管理</Link>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[980px] text-left">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">规则</th>
                <th className="px-4 py-3">命中</th>
                <th className="px-4 py-3">权重</th>
                <th className="px-4 py-3">阈值</th>
                <th className="px-4 py-3">贡献</th>
                <th className="px-4 py-3">类别</th>
                <th className="px-4 py-3">严重级别</th>
                <th className="px-4 py-3">为什么命中 / 未命中</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {allRules.map((rule) => <RuleRow key={rule.rule_key} rule={rule} />)}
            </tbody>
          </table>
        </div>
      </section>

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
    fusion_summary: `最终风险分 = 规则分 ${report.rule_score.toFixed(1)} x 40% + 模型风险分 ${modelScore.toFixed(1)} x 60%。`,
    rules: report.hit_rules || [],
    model: {
      safe_prob: report.model_probs.safe,
      suspicious_prob: report.model_probs.suspicious,
      malicious_prob: report.model_probs.malicious,
      dominant_label: dominant || report.label,
      model_score: modelScore,
      contribution: modelScore * 0.6,
      contribution_summary: `模型倾向为 ${dominant || report.label}，映射风险分 ${modelScore.toFixed(1)}。`,
    },
    raw_features: report.raw_features || {},
  };
}

function strategyFor(domain: string, strategies: UserStrategyOverview | null) {
  if (!strategies) return '未处理';
  if (strategies.trusted_sites.some((item) => item.domain === domain)) return '已信任';
  if (strategies.blocked_sites.some((item) => item.domain === domain)) return '已阻止';
  if (strategies.paused_sites.some((item) => item.domain === domain)) return '临时忽略';
  return '未处理';
}

function ScorePill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-white p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-950">{typeof value === 'number' ? value.toFixed(1).replace('.0', '') : value}</p>
    </div>
  );
}

function Probability({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="mt-5">
      <div className="flex justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="font-semibold text-slate-950">{(value * 100).toFixed(1)}%</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-slate-200">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.min(value * 100, 100)}%` }} />
      </div>
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
  const enabled = rule.enabled ?? true;
  return (
    <tr className={rule.matched ? 'bg-emerald-50/40' : undefined}>
      <td className="px-4 py-4 align-top">
        <div className="font-semibold text-slate-950">{rule.name || rule.rule_name}</div>
        <div className="mt-1 text-xs text-slate-500">{rule.rule_key}</div>
        {!enabled && <div className="mt-2 inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">已停用，不计分</div>}
      </td>
      <td className="px-4 py-4 align-top text-sm">{rule.matched ? '命中' : '未命中'}</td>
      <td className="px-4 py-4 align-top text-sm">{Number(rule.weight ?? 0).toFixed(1)}</td>
      <td className="px-4 py-4 align-top text-sm">{Number(rule.threshold ?? 0).toFixed(2).replace(/\.00$/, '')}</td>
      <td className="px-4 py-4 align-top text-sm font-bold text-slate-950">{contribution > 0 ? `+${contribution.toFixed(1)}` : '0'}</td>
      <td className="px-4 py-4 align-top text-sm">{rule.category || 'legacy'}</td>
      <td className="px-4 py-4 align-top text-sm">{severityText(rule.severity)}</td>
      <td className="px-4 py-4 align-top text-sm leading-6 text-slate-700">
        <p>{rule.reason || rule.detail || '未记录原因'}</p>
        {rule.raw_feature && Object.keys(rule.raw_feature).length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer font-semibold text-emerald-700">查看原始特征</summary>
            <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-50">{JSON.stringify(rule.raw_feature, null, 2)}</pre>
          </details>
        )}
      </td>
    </tr>
  );
}

function severityText(value?: string) {
  return {
    low: '低',
    medium: '中',
    high: '高',
    critical: '严重',
  }[value || ''] || value || '未设置';
}
