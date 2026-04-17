import { FormEvent, useEffect, useMemo, useState } from 'react';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import { adminRulesService } from '../services/api';
import { AdminRuleItem } from '../types';
import { formatDate } from '../utils';

export default function Rules() {
  const [rules, setRules] = useState<AdminRuleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState({
    name: '',
    type: 'heuristic',
    scope: 'global',
    version: 'v1',
    pattern: '',
    content: '',
  });

  const loadRules = () => {
    setLoading(true);
    adminRulesService.getRules()
      .then((data) => setRules(data.rules || []))
      .finally(() => setLoading(false));
  };

  useEffect(loadRules, []);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return rules;
    return rules.filter((rule) => `${rule.name} ${rule.rule_key} ${rule.type} ${rule.scope} ${rule.pattern || ''}`.toLowerCase().includes(keyword));
  }, [query, rules]);

  const createRule = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim()) return;
    await adminRulesService.createRule({
      name: draft.name.trim(),
      type: draft.type,
      scope: draft.scope,
      version: draft.version,
      pattern: draft.pattern || draft.name.trim().toLowerCase().replace(/\s+/g, '_'),
      content: draft.content,
      status: 'active',
    });
    setMessage('规则已创建，后续检测会读取新的规则配置。');
    setDraft({ name: '', type: 'heuristic', scope: 'global', version: 'v1', pattern: '', content: '' });
    loadRules();
  };

  const toggleRule = async (rule: AdminRuleItem) => {
    const status = rule.status === 'active' ? 'disabled' : 'active';
    await adminRulesService.updateRule(rule.id, { status });
    setMessage(`规则 ${rule.name} 已${status === 'active' ? '启用' : '停用'}。`);
    loadRules();
  };

  const deleteRule = async (rule: AdminRuleItem) => {
    await adminRulesService.deleteRule(rule.id);
    setMessage(`规则 ${rule.name} 已停用。`);
    loadRules();
  };

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="规则管理"
        description="管理员维护本地/远端规则、版本、作用域和启用状态；插件只读取规则版本摘要，不承担规则管理。"
      />

      {message && <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{message}</div>}

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <StatCard title="规则总数" value={rules.length} />
        <StatCard title="启用规则" value={rules.filter((rule) => rule.status === 'active' || rule.enabled).length} tone="green" />
        <StatCard title="插件作用域" value={rules.filter((rule) => rule.scope === 'plugin').length} tone="blue" />
        <StatCard title="全局规则" value={rules.filter((rule) => rule.scope === 'global').length} tone="slate" />
      </div>

      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <form onSubmit={createRule} className="grid gap-3 xl:grid-cols-[1fr_140px_140px_120px_1fr_120px]">
          <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="规则名称" className="rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-emerald-500" />
          <select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-emerald-500">
            <option value="heuristic">本地规则</option>
            <option value="remote">远端规则</option>
            <option value="keyword">关键词</option>
          </select>
          <select value={draft.scope} onChange={(event) => setDraft({ ...draft, scope: event.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-emerald-500">
            <option value="global">global</option>
            <option value="user">user</option>
            <option value="plugin">plugin</option>
          </select>
          <input value={draft.version} onChange={(event) => setDraft({ ...draft, version: event.target.value })} placeholder="版本" className="rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-emerald-500" />
          <input value={draft.pattern} onChange={(event) => setDraft({ ...draft, pattern: event.target.value })} placeholder="pattern / key" className="rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-emerald-500" />
          <button className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700">新增规则</button>
        </form>
        <textarea value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} placeholder="规则内容或说明" className="mt-3 h-24 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-emerald-500" />
      </section>

      <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索规则名称、类型、作用域或 pattern" className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-emerald-500" />
      </section>

      <DataTable
        data={filtered}
        emptyText="暂无规则。"
        columns={[
          { key: 'name', title: '规则' },
          { key: 'type', title: '类型' },
          { key: 'scope', title: '作用域' },
          { key: 'status', title: '状态', render: (value, row) => value || (row.enabled ? 'active' : 'disabled') },
          { key: 'version', title: '版本' },
          { key: 'pattern', title: 'Pattern', render: (value) => value || '-' },
          { key: 'updated_at', title: '更新时间', render: (value) => value ? formatDate(value) : '-' },
          {
            key: 'id',
            title: '操作',
            render: (_value, row) => (
              <div className="flex gap-2">
                <button onClick={() => toggleRule(row)} className="font-semibold text-emerald-700">{row.status === 'active' ? '停用' : '启用'}</button>
                <button onClick={() => deleteRule(row)} className="font-semibold text-red-600">删除</button>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
