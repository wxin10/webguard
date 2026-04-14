import { useEffect, useMemo, useState } from 'react';
import DataTable from '../components/DataTable';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import { recordsApi, rulesApi } from '../services/api';
import { RuleConfig, ScanRecordItem } from '../types';

export default function Rules() {
  const [rules, setRules] = useState<RuleConfig[]>([]);
  const [records, setRecords] = useState<ScanRecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);

  const loadRules = () => {
    setLoading(true);
    Promise.all([rulesApi.getRules(), recordsApi.getRecords()])
      .then(([ruleData, recordData]) => {
        setRules(ruleData.rules || []);
        setRecords(recordData.records || []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(loadRules, []);

  const metrics = useMemo(() => {
    const result: Record<string, { hits: number; suspiciousHits: number; maliciousHits: number }> = {};
    records.forEach((record) => {
      (record.hit_rules_json || []).forEach((rule) => {
        if (!rule.matched) return;
        const key = rule.rule_key;
        if (!result[key]) result[key] = { hits: 0, suspiciousHits: 0, maliciousHits: 0 };
        result[key].hits += 1;
        if (record.label === 'suspicious') result[key].suspiciousHits += 1;
        if (record.label === 'malicious') result[key].maliciousHits += 1;
      });
    });
    return result;
  }, [records]);

  const updateRule = async (rule: RuleConfig, patch: Partial<RuleConfig>) => {
    setSaving(rule.id);
    await rulesApi.updateRule(rule.id, patch);
    await rulesApi.getRules().then((data) => setRules(data.rules || []));
    setSaving(null);
  };

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader title="规则管理" description="不只调整权重和阈值，也结合最近报告判断哪些规则命中频繁、哪些需要复核误报。" />
      <DataTable
        data={rules}
        columns={[
          { key: 'rule_name', title: '规则名称' },
          { key: 'rule_key', title: '规则键' },
          { key: 'description', title: '说明', render: (value) => <span className="block max-w-md whitespace-normal text-slate-600">{value || '-'}</span> },
          { key: 'recent_hits', title: '最近命中', render: (_value, row) => `${metrics[row.rule_key]?.hits || 0} 次` },
          { key: 'false_positive_watch', title: '误报关注', render: (_value, row) => `${metrics[row.rule_key]?.suspiciousHits || 0} 条可疑命中` },
          { key: 'advice', title: '建议', render: (_value, row) => ruleAdvice(row, metrics[row.rule_key]) },
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
      className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
    />
  );
}

function ruleAdvice(rule: RuleConfig, metric?: { hits: number; suspiciousHits: number; maliciousHits: number }) {
  if (!rule.enabled) return '已停用，观察影响';
  if (!metric || metric.hits === 0) return '近期未命中';
  if (metric.suspiciousHits >= metric.maliciousHits && metric.suspiciousHits >= 3) return '建议复核阈值';
  if (metric.maliciousHits >= 3) return '高风险命中稳定';
  return '继续观察';
}
