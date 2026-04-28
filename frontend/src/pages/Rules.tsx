import { FormEvent, useEffect, useMemo, useState } from 'react';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import StatusNotice from '../components/StatusNotice';
import { adminRulesService } from '../services/adminRulesService';
import type { AdminRuleCreateRequest, AdminRuleItem, AdminRuleTestResponse } from '../types';
import { formatDate } from '../utils';

type RuleDraft = AdminRuleCreateRequest;

type RuleSampleDraft = {
  url: string;
  title: string;
  visible_text: string;
  button_texts: string;
  input_labels: string;
  form_action_domains: string;
  has_password_input: boolean;
};

const dslPlaceholder = `{
  "field": "url",
  "operator": "contains",
  "value": "fake-login"
}

{
  "all": [
    {
      "field": "url",
      "operator": "contains_any",
      "value": ["login", "verify", "wallet"]
    },
    {
      "field": "has_password_input",
      "operator": "equals",
      "value": true
    }
  ]
}`;

const emptyDraft: RuleDraft = {
  name: '',
  type: 'heuristic',
  scope: 'global',
  status: 'active',
  enabled: true,
  version: 'v1',
  pattern: '',
  content: '',
  description: '',
  category: 'general',
  severity: 'medium',
  weight: 10,
  threshold: 1,
};

const emptySample: RuleSampleDraft = {
  url: 'https://example.com/fake-login',
  title: '',
  visible_text: '',
  button_texts: '',
  input_labels: '',
  form_action_domains: '',
  has_password_input: false,
};

export default function Rules() {
  const [rules, setRules] = useState<AdminRuleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<AdminRuleItem | null>(null);
  const [draft, setDraft] = useState<RuleDraft>(emptyDraft);
  const [testingRule, setTestingRule] = useState<AdminRuleItem | null>(null);
  const [sample, setSample] = useState<RuleSampleDraft>(emptySample);
  const [testResult, setTestResult] = useState<AdminRuleTestResponse | null>(null);

  const loadRules = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await adminRulesService.getRules();
      setRules(data.rules || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '规则加载失败。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRules();
  }, []);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return rules;
    return rules.filter((rule) =>
      [
        rule.name,
        rule.rule_name,
        rule.rule_key,
        rule.type,
        rule.scope,
        rule.status,
        rule.category,
        rule.severity,
        rule.pattern || '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(keyword),
    );
  }, [query, rules]);

  const startEdit = (rule: AdminRuleItem) => {
    setEditing(rule);
    setDraft(ruleToDraft(rule));
    setMessage('');
    setError('');
  };

  const resetForm = () => {
    setEditing(null);
    setDraft(emptyDraft);
  };

  const updateDraft = <K extends keyof RuleDraft>(key: K, value: RuleDraft[K]) => {
    const next = { ...draft, [key]: value };
    if (key === 'status') {
      next.enabled = value === 'active';
    }
    setDraft(next);
  };

  const validateDraft = () => {
    if (!draft.name.trim()) return '请输入规则名称。';
    if (draft.weight < 0 || draft.weight > 100) return '权重必须在 0 到 100 之间。';
    if (draft.threshold < 0) return '阈值必须大于等于 0。';
    return '';
  };

  const submitRule = async (event: FormEvent) => {
    event.preventDefault();
    const validationError = validateDraft();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload = normalizeDraft(draft);
      if (editing) {
        await adminRulesService.updateRule(editing.id, payload);
        setMessage(`规则 ${payload.name} 已更新。`);
      } else {
        await adminRulesService.createRule(payload);
        setMessage('规则已创建。');
      }
      resetForm();
      await loadRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : '规则保存失败。');
    } finally {
      setSaving(false);
    }
  };

  const toggleRule = async (rule: AdminRuleItem) => {
    const active = isRuleActive(rule);
    const status = active ? 'disabled' : 'active';
    setSaving(true);
    setError('');
    try {
      await adminRulesService.updateRule(rule.id, { status, enabled: status === 'active' });
      setMessage(`规则 ${rule.name} 已${status === 'active' ? '启用' : '停用'}。`);
      await loadRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : '规则启停失败。');
    } finally {
      setSaving(false);
    }
  };

  const deleteRule = async (rule: AdminRuleItem) => {
    setSaving(true);
    setError('');
    try {
      await adminRulesService.deleteRule(rule.id);
      setMessage(`规则 ${rule.name} 已停用。`);
      await loadRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : '规则删除失败。');
    } finally {
      setSaving(false);
    }
  };

  const openTestPanel = (rule?: AdminRuleItem) => {
    setTestingRule(rule || null);
    if (rule) {
      setDraft(ruleToDraft(rule));
    }
    setTestResult(null);
    setMessage('');
    setError('');
  };

  const testCurrentRule = async () => {
    const validationError = validateDraft();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await adminRulesService.testRule({
        rule: normalizeDraft(draft),
        sample: {
          url: sample.url,
          title: sample.title,
          visible_text: sample.visible_text,
          button_texts: splitList(sample.button_texts),
          input_labels: splitList(sample.input_labels),
          form_action_domains: splitList(sample.form_action_domains),
          has_password_input: sample.has_password_input,
        },
      });
      setTestResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '规则测试失败。');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="规则管理"
        description="管理员维护平台规则、DSL 内容、兼容 pattern、权重阈值和启用状态。"
      />

      {message && <StatusNotice tone="success">{message}</StatusNotice>}
      {error && <StatusNotice tone="error">{error}</StatusNotice>}

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <StatCard title="规则总数" value={rules.length} />
        <StatCard title="启用规则" value={rules.filter(isRuleActive).length} tone="green" />
        <StatCard title="停用规则" value={rules.filter((rule) => !isRuleActive(rule)).length} tone="slate" />
        <StatCard title="高危规则" value={rules.filter((rule) => rule.severity === 'high' || rule.severity === 'critical').length} tone="blue" />
      </div>

      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <form onSubmit={submitRule} className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-4">
            <input value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} placeholder="规则名称" className="rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500" />
            <input value={draft.version} onChange={(event) => updateDraft('version', event.target.value)} placeholder="版本" className="rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500" />
            <input value={draft.category || ''} onChange={(event) => updateDraft('category', event.target.value)} placeholder="分类 category" className="rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500" />
            <select value={draft.severity} onChange={(event) => updateDraft('severity', event.target.value as RuleDraft['severity'])} className="rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500">
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="critical">critical</option>
            </select>
          </div>

          <div className="grid gap-3 lg:grid-cols-5">
            <select value={draft.type} onChange={(event) => updateDraft('type', event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500">
              <option value="heuristic">heuristic</option>
              <option value="keyword">keyword</option>
              <option value="remote">remote</option>
            </select>
            <select value={draft.scope} onChange={(event) => updateDraft('scope', event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500">
              <option value="global">global</option>
              <option value="user">user</option>
              <option value="plugin">plugin</option>
            </select>
            <select value={draft.status} onChange={(event) => updateDraft('status', event.target.value as RuleDraft['status'])} className="rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500">
              <option value="active">active</option>
              <option value="disabled">disabled</option>
            </select>
            <input value={draft.weight} onChange={(event) => updateDraft('weight', Number(event.target.value))} type="number" min={0} max={100} step="1" placeholder="weight" className="rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500" />
            <input value={draft.threshold} onChange={(event) => updateDraft('threshold', Number(event.target.value))} type="number" min={0} step="0.1" placeholder="threshold" className="rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500" />
          </div>

          <input value={draft.pattern || ''} onChange={(event) => updateDraft('pattern', event.target.value)} placeholder="pattern 兼容规则，例如 fake-login" className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500" />
          <textarea value={draft.content || ''} onChange={(event) => updateDraft('content', event.target.value)} placeholder={dslPlaceholder} className="h-44 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm outline-none focus:border-blue-500" />
          <textarea value={draft.description || ''} onChange={(event) => updateDraft('description', event.target.value)} placeholder="规则说明" className="h-20 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500" />

          <div className="flex flex-wrap gap-3">
            <button disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{editing ? '更新规则' : '新增规则'}</button>
            <button disabled={saving || !draft.name.trim()} onClick={() => openTestPanel()} type="button" className="rounded-lg border border-blue-200 px-4 py-2 font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-60">测试当前配置</button>
            {editing && (
              <button onClick={resetForm} type="button" className="rounded-lg border border-slate-200 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50">
                取消编辑 {editing.name}
              </button>
            )}
          </div>
        </form>
      </section>

      {(testingRule || testResult || !testingRule) && (
        <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">规则测试</h3>
              <p className="mt-1 text-sm text-slate-500">{testingRule ? `当前测试：${testingRule.name}` : '测试表单中的当前规则配置。'}</p>
            </div>
            {testingRule && <button type="button" onClick={() => setTestingRule(null)} className="text-sm font-semibold text-slate-600 hover:text-slate-900">改测表单配置</button>}
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <input value={sample.url} onChange={(event) => setSample({ ...sample, url: event.target.value })} placeholder="测试 URL" className="rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500" />
            <input value={sample.title} onChange={(event) => setSample({ ...sample, title: event.target.value })} placeholder="页面标题" className="rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500" />
            <input value={sample.button_texts} onChange={(event) => setSample({ ...sample, button_texts: event.target.value })} placeholder="按钮文本，逗号分隔" className="rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500" />
            <input value={sample.input_labels} onChange={(event) => setSample({ ...sample, input_labels: event.target.value })} placeholder="输入框标签，逗号分隔" className="rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500" />
            <input value={sample.form_action_domains} onChange={(event) => setSample({ ...sample, form_action_domains: event.target.value })} placeholder="表单 action 域名，逗号分隔" className="rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500" />
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <input type="checkbox" checked={sample.has_password_input} onChange={(event) => setSample({ ...sample, has_password_input: event.target.checked })} />
              包含密码输入框
            </label>
          </div>
          <textarea value={sample.visible_text} onChange={(event) => setSample({ ...sample, visible_text: event.target.value })} placeholder="可见文本" className="mt-3 h-24 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500" />
          <button disabled={saving || !draft.name.trim()} onClick={testCurrentRule} type="button" className="mt-3 rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-800 disabled:opacity-60">测试规则</button>

          {testResult && (
            <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
              <div className="grid gap-3 md:grid-cols-5">
                <ResultItem label="是否命中" value={testResult.matched ? '是' : '否'} />
                <ResultItem label="是否应用" value={testResult.applied ? '是' : '否'} />
                <ResultItem label="启用状态" value={testResult.enabled ? 'enabled' : 'disabled'} />
                <ResultItem label="贡献分" value={String(testResult.contribution)} />
                <ResultItem label="observed_value" value={String(testResult.observed_value)} />
              </div>
              <p className="mt-3 font-semibold text-slate-900">reason</p>
              <p className="mt-1 break-words">{testResult.reason}</p>
              <p className="mt-3 font-semibold text-slate-900">raw_feature</p>
              <pre className="mt-1 max-h-72 overflow-auto rounded-lg bg-white p-3 text-xs">{JSON.stringify(testResult.raw_feature, null, 2)}</pre>
            </div>
          )}
        </section>
      )}

      <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索规则名称、rule_key、类型、作用域、分类或 pattern" className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500" />
      </section>

      <DataTable
        data={filtered}
        emptyText="暂无规则。"
        columns={[
          { key: 'name', title: '名称', render: (_value, row) => <div><p className="font-semibold text-slate-900">{row.name}</p><p className="mt-1 text-xs text-slate-500">{row.rule_key}</p></div> },
          { key: 'type', title: 'type' },
          { key: 'scope', title: 'scope' },
          { key: 'status', title: '状态', render: (_value, row) => <StatusBadge active={isRuleActive(row)} enabled={Boolean(row.enabled)} /> },
          { key: 'category', title: 'category', render: (value) => String(value || '-') },
          { key: 'severity', title: 'severity', render: (value) => String(value || '-') },
          { key: 'weight', title: 'weight', render: (value) => String(value ?? 0) },
          { key: 'threshold', title: 'threshold', render: (value) => String(value ?? 0) },
          { key: 'version', title: 'version' },
          { key: 'updated_at', title: '更新时间', render: (value) => value ? formatDate(String(value)) : '-' },
          {
            key: 'id',
            title: '操作',
            render: (_value, row) => (
              <div className="flex flex-wrap gap-2">
                <button onClick={() => startEdit(row)} className="font-semibold text-blue-700">编辑</button>
                <button onClick={() => toggleRule(row)} className="font-semibold text-slate-700">{isRuleActive(row) ? '停用' : '启用'}</button>
                <button onClick={() => openTestPanel(row)} className="font-semibold text-emerald-700">测试</button>
                <button onClick={() => deleteRule(row)} className="font-semibold text-red-600">删除/禁用</button>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

function normalizeDraft(draft: RuleDraft): RuleDraft {
  const status = draft.status === 'active' ? 'active' : 'disabled';
  return {
    ...draft,
    name: draft.name.trim(),
    rule_key: draft.rule_key?.trim() || undefined,
    type: draft.type || 'heuristic',
    scope: draft.scope || 'global',
    status,
    enabled: status === 'active',
    version: draft.version || 'v1',
    pattern: draft.pattern?.trim() || null,
    content: draft.content || null,
    description: draft.description || null,
    category: draft.category?.trim() || 'general',
    severity: draft.severity || 'medium',
    weight: Number(draft.weight),
    threshold: Number(draft.threshold),
  };
}

function ruleToDraft(rule: AdminRuleItem): RuleDraft {
  const status = isRuleActive(rule) ? 'active' : 'disabled';
  return {
    rule_key: rule.rule_key,
    name: rule.name || rule.rule_name || rule.rule_key,
    type: rule.type || 'heuristic',
    scope: rule.scope || 'global',
    status,
    enabled: status === 'active',
    version: rule.version || 'v1',
    pattern: rule.pattern || '',
    content: rule.content || '',
    description: rule.description || '',
    category: rule.category || 'general',
    severity: (rule.severity as RuleDraft['severity']) || 'medium',
    weight: Number(rule.weight ?? 10),
    threshold: Number(rule.threshold ?? 1),
  };
}

function splitList(value: string) {
  return value.split(/[,，]/).map((item) => item.trim()).filter(Boolean);
}

function isRuleActive(rule: Pick<AdminRuleItem, 'status' | 'enabled'>) {
  return rule.status === 'active' || Boolean(rule.enabled);
}

function StatusBadge({ active, enabled }: { active: boolean; enabled: boolean }) {
  return (
    <div className="space-y-1">
      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
        {active ? 'active' : 'disabled'}
      </span>
      <p className="text-xs text-slate-500">enabled: {enabled ? 'true' : 'false'}</p>
    </div>
  );
}

function ResultItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-900">{value}</p>
    </div>
  );
}
