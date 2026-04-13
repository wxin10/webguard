import { useEffect, useState } from 'react';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import { rulesApi } from '../services/api';
import { RuleConfig } from '../types';

export default function Rules() {
  const [rules, setRules] = useState<RuleConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);

  const loadRules = () => {
    setLoading(true);
    rulesApi.getRules().then((data) => setRules(data.rules || [])).finally(() => setLoading(false));
  };

  useEffect(loadRules, []);

  const updateRule = async (rule: RuleConfig, patch: Partial<RuleConfig>) => {
    setSaving(rule.id);
    await rulesApi.updateRule(rule.id, patch);
    await rulesApi.getRules().then((data) => setRules(data.rules || []));
    setSaving(null);
  };

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader title="规则管理" description="查看、启用/停用规则，并调整权重与阈值。规则结果会参与 Detector 的最终融合判断。" />
      <DataTable
        data={rules}
        columns={[
          { key: 'rule_name', title: '规则名称' },
          { key: 'rule_key', title: '规则键' },
          { key: 'description', title: '说明', render: (value) => <span className="block max-w-md whitespace-normal text-slate-600">{value || '-'}</span> },
          { key: 'weight', title: '权重', render: (value, row) => <NumberInput value={value} onBlur={(next) => updateRule(row, { weight: next })} /> },
          { key: 'threshold', title: '阈值', render: (value, row) => <NumberInput value={value} onBlur={(next) => updateRule(row, { threshold: next })} /> },
          {
            key: 'enabled',
            title: '状态',
            render: (value, row) => (
              <button
                disabled={saving === row.id}
                onClick={() => updateRule(row, { enabled: !value })}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${value ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}
              >
                {value ? '启用' : '停用'}
              </button>
            ),
          },
        ]}
      />
    </div>
  );
}

function NumberInput({ value, onBlur }: { value: number; onBlur: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  return (
    <input
      value={draft}
      type="number"
      step="0.01"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => onBlur(Number(draft))}
      className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
    />
  );
}
