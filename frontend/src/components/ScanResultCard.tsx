import { Link } from 'react-router-dom';
import type { AIAnalysis, BehaviorSignal, ScanResult } from '../types';
import { aiStatusDescription, aiStatusLabel, fusionDescription, resolveAiAnalysis, resolveAiFusionUsed, resolveAiScore, resolveAiStatus } from '../utils/aiAnalysis';
import { riskBar } from '../utils';
import RiskBadge from './RiskBadge';
import RuleHitList from './RuleHitList';

interface ScanResultCardProps {
  url: string;
  result: ScanResult;
}

export default function ScanResultCard({ url, result }: ScanResultCardProps) {
  const behaviorScore = result.behavior_score ?? result.rule_score ?? 0;
  const behaviorSignals = normalizedBehaviorSignals(result);
  const aiAnalysis = resolveAiAnalysis(result);
  const aiStatus = resolveAiStatus(result);
  const aiScore = resolveAiScore(result);
  const aiFusionUsed = resolveAiFusionUsed(result);
  const reportId = result.report_id || result.record_id;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <h3 className="text-xl font-bold text-slate-950">检测结果</h3>
          <p className="mt-1 break-all text-sm text-slate-500">{url}</p>
          <p className="mt-1 text-xs text-slate-400">报告编号: {reportId}</p>
        </div>
        <RiskBadge label={result.label} size="lg" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-4">
        <Metric title="风险评分" value={result.risk_score.toFixed(1)} tone={result.label} />
        <Metric title="行为评分" value={behaviorScore.toFixed(1)} />
        <Metric title="DeepSeek 风险分" value={typeof aiScore === 'number' ? aiScore.toFixed(1) : '--'} />
        <Metric title="AI 语义研判" value={aiStatusLabel(aiStatus)} />
      </div>

      <div className="mt-5 h-2 rounded-full bg-slate-200">
        <div className={`h-2 rounded-full ${riskBar(result.label)}`} style={{ width: `${Math.min(result.risk_score, 100)}%` }} />
      </div>

      <section className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h4 className="font-semibold text-slate-900">多源检测概览</h4>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <SourceItem
            title="策略命中"
            active={Boolean(result.policy_hit?.hit)}
            description={result.policy_hit?.hit ? policyDescription(result) : '未命中站点访问策略。'}
            activeText="命中站点访问策略"
          />
          <SourceItem
            title="外部规则库"
            active={Boolean(result.threat_intel_hit)}
            description={result.threat_intel_hit ? threatIntelDescription(result) : '未命中外部恶意网站规则库。'}
            activeText="命中外部恶意网站规则库"
          />
          <SourceItem
            title="页面行为风险信号"
            active={behaviorSignals.length > 0}
            description={`行为风险评分 ${behaviorScore.toFixed(1)}，已展示 ${Math.min(behaviorSignals.length, 3)} 条主要信号。`}
            activeText="页面行为风险信号"
          />
          <SourceItem
            title="AI 语义研判"
            active={aiStatus === 'used'}
            description={aiStatusDescription(aiStatus)}
            activeText={aiStatusLabel(aiStatus)}
            inactiveText={aiStatusLabel(aiStatus)}
          />
        </div>
        <p className="mt-4 rounded-lg bg-white px-3 py-2 text-sm text-slate-600">
          {fusionDescription(aiFusionUsed)}
        </p>
      </section>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <section>
          <h4 className="mb-3 font-semibold text-slate-900">页面行为风险信号</h4>
          <RuleHitList rules={behaviorSignals.slice(0, 3)} />
        </section>
        <section className="space-y-4">
          <AIAnalysisSummary analysis={aiAnalysis} aiScore={aiScore} />
          <ThreatIntelSummary result={result} />
        </section>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h4 className="font-semibold text-slate-900">检测解释</h4>
          <ReasonSummary result={result} />
        </section>
        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h4 className="font-semibold text-slate-900">处理建议</h4>
          <p className="mt-2 text-sm leading-6 text-slate-600">{result.recommendation || aiAnalysis.recommendation || '暂无处置建议。'}</p>
        </section>
      </div>

      <div className="mt-6 flex justify-end">
        <Link className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700" to={`/app/reports/${reportId}`}>
          查看完整报告
        </Link>
      </div>
    </div>
  );
}

function Metric({ title, value, tone }: { title: string; value: string; tone?: string }) {
  const color = tone === 'malicious' ? 'text-red-600' : tone === 'suspicious' ? 'text-amber-600' : tone === 'safe' ? 'text-emerald-600' : 'text-slate-950';
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm text-slate-500">{title}</p>
      <div className={`mt-2 text-3xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function SourceItem({ title, active, description, activeText, inactiveText = '未命中' }: { title: string; active: boolean; description: string; activeText: string; inactiveText?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-slate-900">{title}</span>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${active ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
          {active ? activeText : inactiveText}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </div>
  );
}

function AIAnalysisSummary({ analysis, aiScore }: { analysis: AIAnalysis; aiScore?: number | null }) {
  const riskTypes = analysis.risk_types?.length ? analysis.risk_types.join('、') : '未提供';
  const reasons = analysis.reasons?.slice(0, 2) || [];
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h4 className="font-semibold text-slate-900">AI 语义研判</h4>
      <p className="mt-2 text-sm leading-6 text-slate-600">{aiStatusDescription(analysis.status)}</p>
      {analysis.status === 'used' && (
        <div className="mt-3 space-y-2 text-sm text-slate-600">
          <p>DeepSeek 风险分：{typeof aiScore === 'number' ? aiScore.toFixed(1) : typeof analysis.risk_score === 'number' ? analysis.risk_score.toFixed(1) : '--'}</p>
          <p>标签：{analysis.label || '未提供'}</p>
          <p>置信度：{typeof analysis.confidence === 'number' ? `${(analysis.confidence * 100).toFixed(0)}%` : '--'}</p>
          <p>风险类型：{riskTypes}</p>
          {reasons.map((reason, index) => <p key={index}>判断理由：{reason}</p>)}
          <p>安全建议：{analysis.recommendation || '未提供'}</p>
          <p>触发原因：{analysis.trigger_reasons?.length ? analysis.trigger_reasons.join('、') : '未提供'}</p>
        </div>
      )}
    </div>
  );
}

function ThreatIntelSummary({ result }: { result: ScanResult }) {
  const matches = result.threat_intel_matches || [];
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h4 className="font-semibold text-slate-900">外部恶意网站规则库</h4>
      {result.threat_intel_hit ? (
        <div className="mt-2 space-y-2 text-sm leading-6 text-slate-600">
          {matches.slice(0, 2).map((match, index) => (
            <p key={`${match.source || 'source'}-${index}`}>
              {match.source || '未知来源'}：{match.risk_type || '未知风险'}。{match.reason || ''}
            </p>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm leading-6 text-slate-600">未命中外部恶意网站规则库。</p>
      )}
    </div>
  );
}

function ReasonSummary({ result }: { result: ScanResult }) {
  const reasons = Array.isArray(result.reason_summary) ? result.reason_summary.filter(Boolean) : [];
  if (reasons.length) {
    return (
      <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-600">
        {reasons.slice(0, 4).map((reason, index) => <li key={index}>{reason}</li>)}
      </ul>
    );
  }
  return <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{result.explanation || result.summary || '暂无摘要。'}</p>;
}

function normalizedBehaviorSignals(result: ScanResult): BehaviorSignal[] {
  if (Array.isArray(result.behavior_signals) && result.behavior_signals.length) return result.behavior_signals;
  return (result.hit_rules || [])
    .filter((rule) => rule.matched !== false)
    .map((rule) => ({
      rule_key: rule.rule_key,
      rule_name: rule.rule_name || rule.name,
      matched: rule.matched,
      severity: rule.severity,
      category: rule.category,
      score: rule.weighted_score ?? rule.contribution,
      evidence: rule.evidence || rule.raw_feature,
      reason: rule.reason || rule.detail || null,
      caution: rule.caution,
      false_positive_note: rule.false_positive_note,
    }));
}

function policyDescription(result: ScanResult): string {
  const policy = result.policy_hit;
  return [policy?.scope, policy?.list_type, policy?.source, policy?.reason].filter(Boolean).join(' · ') || '命中站点访问策略。';
}

function threatIntelDescription(result: ScanResult): string {
  const first = result.threat_intel_matches?.[0];
  if (!first) return '命中外部恶意网站规则库。';
  return `${first.source || '未知来源'} · ${first.risk_type || '未知风险'}${first.reason ? ` · ${first.reason}` : ''}`;
}
