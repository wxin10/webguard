import { useEffect, useMemo, useState } from 'react';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import { rulesApi } from '../services/api';
import { RuleConfig } from '../types';
import { formatDate } from '../utils';

type EnabledFilter = 'all' | 'enabled' | 'disabled';

export default function Rules() {
  const [rules, setRules] = useState<RuleConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [enabled, setEnabled] = useState<EnabledFilter>('all');
  const [severity, setSeverity] = useState('all');

  const loadRules = () => {
    setLoading(true);
    rulesApi.getRules()
      .then((ruleData) => setRules(ruleData.rules || []))
      .finally(() => setLoading(false));
  };

  useEffect(loadRules, []);

  const categories = useMemo(() => uniqueOptions(rules.map((rule) => rule.category || 'general')), [rules]);
  const severities = useMemo(() => uniqueOptions(rules.map((rule) => rule.severity || 'medium')), [rules]);

  const filteredRules = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return rules.filter((rule) => {
      const haystack = `${rule.rule_name} ${rule.name || ''} ${rule.rule_key} ${rule.description || ''}`.toLowerCase();
      if (keyword && !haystack.includes(keyword)) return false;
      if (category !== 'all' && (rule.category || 'general') !== category) return false;
      if (severity !== 'all' && (rule.severity || 'medium') !== severity) return false;
      if (enabled === 'enabled' && !rule.enabled) return false;
      if (enabled === 'disabled' && rule.enabled) return false;
      return true;
    });
  }, [rules, query, category, enabled, severity]);

  const summary = useMemo(() => {
    const enabledRules = rules.filter((rule) => rule.enabled).length;
    const hotRules = rules.filter((rule) => (rule.stats?.recent_hits_7d || 0) >= 3).length;
    const fpWatch = rules.filter((rule) => (rule.stats?.false_positive_feedback_7d || 0) > 0).length;
    return { enabledRules, hotRules, fpWatch };
  }, [rules]);

  const updateRule = async (rule: RuleConfig, patch: Partial<RuleConfig>) => {
    setSaving(rule.id);
    setMessage('');
    try {
      await rulesApi.updateRule(rule.id, patch);
      const data = await rulesApi.getRules();
      setRules(data.rules || []);
      setMessage(`已保存规则 ${rule.rule_key}，后续检测会按新配置计算。`);
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="规则管理"
        description="直接维护规则权重、阈值、启用状态和说明；这些配置会被后端规则引擎读取，并影响后续判定。"
      />

      {message && <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{message}</div>}

      <section className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="规则总数" value={rules.length} />
        <SummaryCard label="启用中" value={summary.enabledRules} />
        <SummaryCard label="7 天高频命中" value={summary.hotRules} />
        <SummaryCard label="存在误报反馈" value={summary.fpWatch} />
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索规则名称、key 或描述"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500">
            <option value="all">全部类别</option>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={enabled} onChange={(event) => setEnabled(event.target.value as EnabledFilter)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500">
            <option value="all">全部状态</option>
            <option value="enabled">仅启用</option>
            <option value="disabled">仅停用</option>
          </select>
          <select value={severity} onChange={(event) => setSeverity(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500">
            <option value="all">全部严重级别</option>
            {severities.map((item) => <option key={item} value={item}>{severityText(item)}</option>)}
          </select>
        </div>
      </section>

      <section className="mt-6 space-y-4">
        {filteredRules.length === 0 && (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">没有匹配的规则。</div>
        )}
        {filteredRules.map((rule) => (
          <RuleEditor
            key={rule.id}
            rule={rule}
            saving={saving === rule.id}
            onSave={(patch) => updateRule(rule, patch)}
          />
        ))}
      </section>
    </div>
  );
}

function RuleEditor({ rule, saving, onSave }: { rule: RuleConfig; saving: boolean; onSave: (patch: Partial<RuleConfig>) => Promise<void> }) {
  const [draft, setDraft] = useState({
    name: rule.name || rule.rule_name,
    description: rule.description || '',
    weight: String(rule.weight),
    threshold: String(rule.threshold),
    severity: rule.severity || 'medium',
    enabled: rule.enabled,
  });

  useEffect(() => {
    setDraft({
      name: rule.name || rule.rule_name,
      description: rule.description || '',
      weight: String(rule.weight),
      threshold: String(rule.threshold),
      severity: rule.severity || 'medium',
      enabled: rule.enabled,
    });
  }, [rule]);

  const stats = rule.stats;
  const save = () => onSave({
    name: draft.name,
    description: draft.description,
    weight: Number(draft.weight),
    threshold: Number(draft.threshold),
    severity: draft.severity,
    enabled: draft.enabled,
  });

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${draft.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{draft.enabled ? '启用' : '停用'}</span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{rule.category || 'general'}</span>
            <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">{severityText(draft.severity)}</span>
            <span className="text-xs font-semibold text-slate-500">{rule.rule_key}</span>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[0.9fr_1.5fr]">
            <label className="text-sm font-semibold text-slate-700">
              规则名称
              <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-emerald-500" />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              描述
              <input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-emerald-500" />
            </label>
          </div>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {saving ? '保存中...' : '保存规则'}
        </button>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <label className="text-sm font-semibold text-slate-700">
          权重
          <input value={draft.weight} type="number" min="0" max="100" step="0.1" onChange={(event) => setDraft({ ...draft, weight: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-emerald-500" />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          阈值
          <input value={draft.threshold} type="number" min="0" step="0.01" onChange={(event) => setDraft({ ...draft, threshold: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-emerald-500" />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          严重级别
          <select value={draft.severity} onChange={(event) => setDraft({ ...draft, severity: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-emerald-500">
            <option value="low">低</option>
            <option value="medium">中</option>
            <option value="high">高</option>
            <option value="critical">严重</option>
          </select>
        </label>
        <label className="flex items-end gap-3 text-sm font-semibold text-slate-700">
          <input checked={draft.enabled} type="checkbox" onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} className="mb-3 h-4 w-4 rounded border-slate-300 text-emerald-600" />
          <span className="pb-2">启用规则</span>
        </label>
        <Metric label="7 天命中" value={`${stats?.recent_hits_7d || 0} 次`} />
        <Metric label="误报反馈" value={`${stats?.false_positive_feedback_7d || 0} 次`} />
      </div>

      <div className="mt-5 grid gap-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-700 md:grid-cols-4">
        <Metric label="7 天命中占比" value={`${(((stats?.recent_hit_rate_7d || 0) * 100)).toFixed(1)}%`} />
        <Metric label="可疑/恶意命中" value={`${stats?.risk_hits_7d || 0} 次`} />
        <Metric label="最近一次命中" value={stats?.last_hit_at ? formatDate(stats.last_hit_at) : '暂无'} />
        <Metric label="误报倾向" value={stats?.false_positive_tendency || '暂无明显误报信号'} />
      </div>
    </article>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 break-words font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function uniqueOptions(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function severityText(value?: string) {
  return {
    low: '低',
    medium: '中',
    high: '高',
    critical: '严重',
  }[value || ''] || value || '未设置';
}
