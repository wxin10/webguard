import { useEffect, useState } from 'react';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import { aiApi } from '../services/api';
import type { AIStatus, AITestResponse } from '../types';

const testSample = {
  title: '登录验证',
  visible_text: '您的账号存在异常，请立即输入验证码完成验证',
  url: 'https://example-login.test/verify',
  has_password_input: true,
  button_texts: ['立即验证'],
  input_labels: ['账号', '密码', '验证码'],
  form_action_domains: ['example-login.test'],
};

export default function Model() {
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<AITestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = () => {
    setLoading(true);
    setError(null);
    aiApi
      .getStatus()
      .then(setStatus)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'AI 接入状态读取失败'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const runTest = () => {
    setTesting(true);
    setTestResult(null);
    setError(null);
    aiApi
      .testDeepSeek(testSample)
      .then(setTestResult)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'DeepSeek 接入测试失败'))
      .finally(() => setTesting(false));
  };

  if (loading) return <LoadingBlock />;

  const fallbackText = status?.configured
    ? 'DeepSeek 可用于高风险页面语义研判；异常时自动使用规则引擎兜底。'
    : '当前未配置 DEEPSEEK_API_KEY，系统将仅使用规则引擎兜底检测。';

  return (
    <div>
      <PageHeader
        title="AI 接入状态"
        description="展示 DeepSeek 大模型语义研判配置、可用性和规则引擎兜底状态。"
      />

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="AI 提供方" value={status?.provider || 'deepseek'} tone="blue" />
        <StatCard title="启用状态" value={status?.enabled ? 'Enabled' : 'Fallback'} tone={status?.enabled ? 'green' : 'slate'} />
        <StatCard title="密钥配置" value={status?.configured ? 'Configured' : 'Not configured'} tone={status?.configured ? 'green' : 'slate'} />
        <StatCard title="兜底策略" value="规则引擎兜底" tone="slate" />
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-950">DeepSeek 大模型语义研判</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{status?.message || fallbackText}</p>
          </div>
          <button
            type="button"
            onClick={runTest}
            disabled={testing}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {testing ? '测试中...' : '测试 DeepSeek 接入'}
          </button>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <Info label="provider" value={status?.provider || 'deepseek'} />
          <Info label="enabled" value={String(Boolean(status?.enabled))} />
          <Info label="configured" value={String(Boolean(status?.configured))} />
          <Info label="base_url" value={status?.base_url || '-'} />
          <Info label="model" value={status?.model || '-'} />
          <Info label="timeout_seconds" value={String(status?.timeout_seconds ?? '-')} />
          <Info label="api_key_masked" value={status?.api_key_masked || '未配置'} />
          <Info label="fallback" value={fallbackText} />
        </div>
      </section>

      {testResult ? (
        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">测试结果</h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Info label="status" value={testResult.status} />
            <Info label="provider" value={testResult.provider} />
            <Info label="risk_score" value={String(testResult.analysis.risk_score ?? '-')} />
            <Info label="label" value={testResult.analysis.label || '-'} />
          </div>
          <pre className="mt-4 max-h-96 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-5 text-slate-100">
            {JSON.stringify(testResult.analysis, null, 2)}
          </pre>
        </section>
      ) : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-2 break-all text-sm text-slate-800">{value}</p>
    </div>
  );
}
