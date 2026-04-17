import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import RiskBadge from '../components/RiskBadge';
import StatusNotice from '../components/StatusNotice';
import { useAuth } from '../contexts/AuthContext';
import { feedbackService } from '../services/feedbackService';
import { reportsService } from '../services/reportsService';
import type { AnalysisReport, HitRule, ScanRecordItem, ScoreBreakdown } from '../types';
import { feedbackStatusText, formatDate, pluginEventText, riskBar, scanSourceText } from '../utils';

export default function ReportDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [history, setHistory] = useState<ScanRecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError('');
    Promise.all([
      reportsService.getReport(id),
      reportsService.getDomainHistory(id).catch(() => ({ records: [] })),
    ])
      .then(([reportData, historyData]) => {
        setReport(reportData);
        setHistory(historyData.records || []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : '报告不存在，或后端服务不可用。'))
      .finally(() => setLoading(false));
  }, [id]);

  const breakdown = useMemo(() => (report ? report.score_breakdown || buildFallbackBreakdown(report) : null), [report]);
  const matchedRules = useMemo(() => {
    const rules = report?.matched_rules?.length ? report.matched_rules : report?.hit_rules || breakdown?.rules || [];
    return rules.filter((rule) => rule.matched !== false);
  }, [breakdown?.rules, report]);

  const runAction = async (label: string, action: () => Promise<unknown>, success: string) => {
    setActing(label);
    setMessage('');
    setError('');
    try {
      await action();
      setMessage(success);
      if (id) {
        const fresh = await reportsService.getReport(id).catch(() => null);
        if (fresh) setReport(fresh);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败，请确认后端服务状态。');
    } finally {
      setActing('');
    }
  };

  if (loading) return <LoadingBlock />;
  if (error && !report) return <StatusNotice tone="error">{error}</StatusNotice>;
  if (!report || !breakdown) return <StatusNotice tone="error">报告不存在。</StatusNotice>;

  const host = report.host || report.domain;
  const summary = report.summary || report.explanation || report.conclusion || '暂无摘要。';
  const userActions = [
    {
      label: '加入信任域名',
      action: () => reportsService.trustDomain(report.id, { note: '用户从报告页加入个人信任域名', scope: 'user' }),
      success: `${host} 已加入个人信任域名。`,
    },
    {
      label: '加入阻止域名',
      action: () => reportsService.blockDomain(report.id, { note: '用户从报告页加入个人阻止域名', scope: 'user' }),
      success: `${host} 已加入个人阻止域名。`,
    },
    {
      label: '提交误报',
      action: () => feedbackService.createFeedback({
        related_report_id: report.id,
        feedback_type: 'false_positive',
        content: '用户认为该报告可能是误报',
        source: 'web',
      }),
      success: '误报反馈已提交到管理端处理队列。',
    },
    {
      label: '重新检测',
      action: () => reportsService.recheck(report.id, { note: '用户从报告页重新检测' }),
      success: '已重新检测，并生成新的检测记录。',
    },
  ];
  const adminActions = [
    {
      label: '确认风险',
      action: () => reportsService.review(report.id, { note: '管理员确认风险', status: 'confirmed_risk' }),
      success: '已记录确认风险处置结果。',
    },
    {
      label: '确认误报',
      action: () => reportsService.markFalsePositive(report.id, { note: '管理员确认误报', status: 'confirmed_false_positive' }),
      success: '已记录误报处置结果。',
    },
    {
      label: '加入全局白名单',
      action: () => reportsService.trustDomain(report.id, { note: '管理员从报告页加入全局白名单', scope: 'global' }),
      success: `${host} 已加入全局白名单。`,
    },
    {
      label: '加入全局黑名单',
      action: () => reportsService.blockDomain(report.id, { note: '管理员从报告页加入全局黑名单', scope: 'global' }),
      success: `${host} 已加入全局黑名单。`,
    },
  ];

  return (
    <div>
      <PageHeader
        title={`风险报告 #${report.id}`}
        description="完整报告沉淀 URL、host、风险评分、命中规则、页面特征、处置建议、用户动作和插件现场事件。"
        action={
          <Link to={isAdmin ? '/app/admin/records' : '/app/my-records'} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            返回记录
          </Link>
        }
      />

      {message && <StatusNotice tone="success">{message}</StatusNotice>}
      {error && <StatusNotice tone="error">{error}</StatusNotice>}

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-6 lg:flex-row">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <RiskBadge label={report.risk_level || report.label} size="lg" />
              <span className="text-sm text-slate-500">{scanSourceText(report.source)} · {formatDate(report.created_at)}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">host: {host}</span>
            </div>
            <h2 className="mt-4 break-all text-2xl font-bold text-slate-950">{report.url}</h2>
            <p className="mt-2 text-sm text-slate-500">页面标题：{report.title || '未采集'}</p>
            <p className="mt-5 max-w-4xl whitespace-pre-line text-sm leading-6 text-slate-700">{summary}</p>
          </div>
          <div className="w-full rounded-lg border border-slate-200 bg-slate-50 p-5 lg:w-96">
            <p className="text-sm font-semibold text-slate-500">风险分数</p>
            <div className="mt-2 text-5xl font-bold text-slate-950">{breakdown.final_score.toFixed(1)}</div>
            <div className="mt-5 h-3 rounded-full bg-slate-200">
              <div className={`h-3 rounded-full ${riskBar(report.risk_level || report.label)}`} style={{ width: `${Math.min(breakdown.final_score, 100)}%` }} />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <ScorePill label="规则分" value={breakdown.rule_score_total} />
              <ScorePill label="模型分" value={breakdown.model_score_total} />
              <ScorePill label="命中规则" value={matchedRules.length} />
              <ScorePill label="插件事件" value={report.plugin_events?.length || 0} />
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <p className="text-sm font-semibold text-blue-800">{isAdmin ? '管理员处置' : '用户处置'}</p>
            <h3 className="mt-2 text-xl font-bold text-slate-950">报告页是风险处置入口</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
              {isAdmin ? '管理员动作会写入报告动作记录，并可同步调整全局黑白名单。' : '用户动作会写入个人策略，插件继续从后端拉取同一套策略摘要。'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(isAdmin ? adminActions : userActions).map((item) => (
              <button
                key={item.label}
                disabled={Boolean(acting)}
                onClick={() => runAction(item.label, item.action, item.success)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {acting === item.label ? '处理中...' : item.label}
              </button>
            ))}
            <button onClick={() => navigate(isAdmin ? '/app/admin/samples' : '/app/my-domains')} className="rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-50">
              {isAdmin ? '进入样本队列' : '查看我的策略'}
            </button>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">页面特征摘要</h3>
          <div className="mt-4 grid gap-3 text-sm text-slate-700 md:grid-cols-2">
            <FeatureItem label="是否含密码框" value={breakdown.raw_features.has_password_input ? '是' : '否'} />
            <FeatureItem label="表单 action 域" value={stringifyList(breakdown.raw_features.form_action_domains)} />
            <FeatureItem label="按钮文本" value={stringifyList(breakdown.raw_features.button_texts)} />
            <FeatureItem label="输入标签" value={stringifyList(breakdown.raw_features.input_labels)} />
            <FeatureItem label="可见文本长度" value={String(breakdown.raw_features.visible_text_length ?? 0)} />
            <FeatureItem label="综合文本长度" value={String(breakdown.raw_features.text_length ?? 0)} />
          </div>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">处置建议</h3>
          <p className="mt-4 text-sm leading-6 text-slate-700">{report.recommendation || '暂无建议。'}</p>
          <h3 className="mt-6 text-lg font-bold text-slate-950">检测原因</h3>
          <p className="mt-4 whitespace-pre-line text-sm leading-6 text-slate-700">{report.explanation || report.summary || '暂无解释。'}</p>
        </section>
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-bold text-slate-950">命中规则</h3>
        <p className="mt-1 text-sm text-slate-500">{breakdown.fusion_summary || '规则与模型共同生成最终风险评分。'}</p>
        <div className="mt-4">
          <DataTable
            data={matchedRules}
            emptyText="暂无命中规则。"
            columns={[
              { key: 'rule_key', title: '规则', render: (_value, row) => <RuleTitle rule={row} /> },
              { key: 'category', title: '类别', render: (value) => String(value || 'local') },
              { key: 'severity', title: '严重度', render: (value) => String(value || '-') },
              { key: 'weight', title: '权重', render: (value) => Number(value || 0).toFixed(1) },
              { key: 'contribution', title: '贡献', render: (value, row) => Number(value ?? row.weighted_score ?? 0).toFixed(1) },
              { key: 'reason', title: '原因', render: (value, row) => <span className="block max-w-lg truncate">{String(value || row.detail || '-')}</span> },
            ]}
          />
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">用户动作记录</h3>
          <div className="mt-4">
            <DataTable
              data={report.actions || []}
              emptyText="暂无用户动作。"
              columns={[
                { key: 'action_type', title: '动作' },
                { key: 'actor', title: '操作者' },
                { key: 'status', title: '状态', render: (value) => feedbackStatusText(String(value || '')) },
                { key: 'created_at', title: '时间', render: (value) => formatDate(String(value || '')) },
              ]}
            />
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">插件现场动作</h3>
          <div className="mt-4">
            <DataTable
              data={report.plugin_events || []}
              emptyText="暂无插件现场事件。"
              columns={[
                { key: 'event_type', title: '事件', render: (_value, row) => pluginEventText(row.event_type, row.action) },
                { key: 'summary', title: '摘要', render: (value) => <span className="block max-w-md truncate">{String(value || '-')}</span> },
                { key: 'plugin_version', title: '版本', render: (value) => String(value || '-') },
                { key: 'created_at', title: '时间', render: (value) => formatDate(String(value || '')) },
              ]}
            />
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-bold text-slate-950">同域名历史记录</h3>
        <div className="mt-4">
          <DataTable
            data={history}
            emptyText="暂无同域名历史记录。"
            columns={[
              { key: 'url', title: 'URL', render: (value) => <span className="block max-w-md truncate">{String(value || '-')}</span> },
              { key: 'label', title: '风险', render: (value, row) => <RiskBadge label={String(row.risk_level || value || 'unknown')} size="sm" /> },
              { key: 'source', title: '来源', render: (value) => scanSourceText(String(value || '')) },
              { key: 'created_at', title: '时间', render: (value) => formatDate(String(value || '')) },
              { key: 'id', title: '报告', render: (value, row) => <Link to={`/app/reports/${row.report_id || value}`} className="font-semibold text-blue-700">打开</Link> },
            ]}
          />
        </div>
      </section>
    </div>
  );
}

function buildFallbackBreakdown(report: AnalysisReport): ScoreBreakdown {
  const probs = report.model_probs || { safe: 0, suspicious: 0, malicious: 0 };
  const modelScore = (Number(probs.malicious || 0) * 100) + (Number(probs.suspicious || 0) * 50);
  const dominant = Object.entries(probs).sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0] as ScoreBreakdown['model']['dominant_label'];
  return {
    rule_score_total: Number(report.rule_score || 0),
    model_score_total: modelScore,
    final_score: Number(report.risk_score || 0),
    label: report.risk_level || report.label,
    fusion_summary: `最终风险分由规则分 ${Number(report.rule_score || 0).toFixed(1)} 与模型风险分 ${modelScore.toFixed(1)} 综合生成。`,
    rules: report.matched_rules || report.hit_rules || [],
    model: {
      safe_prob: Number(probs.safe || 0),
      suspicious_prob: Number(probs.suspicious || 0),
      malicious_prob: Number(probs.malicious || 0),
      dominant_label: dominant || report.label,
      model_score: modelScore,
      contribution: modelScore,
      contribution_summary: `模型倾向 ${dominant || report.label}`,
    },
    raw_features: report.raw_features || {},
  };
}

function ScorePill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-white p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-950">{typeof value === 'number' ? value.toFixed(1).replace('.0', '') : value}</p>
    </div>
  );
}

function FeatureItem({ label, value }: { label: string; value: string | boolean }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 break-all text-slate-800">{String(value)}</p>
    </div>
  );
}

function RuleTitle({ rule }: { rule: HitRule }) {
  return (
    <div>
      <div className="font-semibold text-slate-950">{rule.name || rule.rule_name || rule.rule_key}</div>
      <div className="mt-1 text-xs text-slate-500">{rule.rule_key}</div>
    </div>
  );
}

function stringifyList(value: unknown) {
  return Array.isArray(value) && value.length ? value.join(', ') : '未采集';
}
