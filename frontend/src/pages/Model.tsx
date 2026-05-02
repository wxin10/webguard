import { FormEvent, useEffect, useState } from 'react';
import LoadingBlock from '../components/LoadingBlock';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import { aiApi } from '../services/api';
import type { AIConfig, AIConfigTestResponse } from '../types';
import { formatDate } from '../utils';

const emptyForm = {
  enabled: true,
  base_url: '',
  model: '',
  timeout_seconds: 20,
  api_key: '',
};

export default function Model() {
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [testResult, setTestResult] = useState<AIConfigTestResponse | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const syncForm = (nextConfig: AIConfig) => {
    setForm({
      enabled: nextConfig.enabled,
      base_url: nextConfig.base_url,
      model: nextConfig.model,
      timeout_seconds: nextConfig.timeout_seconds,
      api_key: '',
    });
  };

  const loadConfig = () => {
    setLoading(true);
    setError('');
    aiApi
      .getConfig()
      .then((nextConfig) => {
        setConfig(nextConfig);
        syncForm(nextConfig);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'AI 配置读取失败'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const saveConfig = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const nextConfig = await aiApi.updateConfig({
        enabled: form.enabled,
        base_url: form.base_url,
        model: form.model,
        timeout_seconds: Number(form.timeout_seconds),
        api_key: form.api_key,
      });
      setConfig(nextConfig);
      syncForm(nextConfig);
      setMessage('AI 接入配置已保存。');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 接入配置保存失败');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    setMessage('');
    setError('');
    try {
      const result = await aiApi.testConfig({
        enabled: form.enabled,
        base_url: form.base_url,
        model: form.model,
        timeout_seconds: Number(form.timeout_seconds),
        api_key: form.api_key,
      });
      setTestResult(result);
      setForm((current) => ({ ...current, api_key: '' }));
      const nextConfig = await aiApi.getConfig();
      setConfig(nextConfig);
      syncForm(nextConfig);
      setMessage(result.status === 'used' ? 'DeepSeek 测试成功。' : 'DeepSeek 测试完成，请查看状态。');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'DeepSeek 测试失败');
    } finally {
      setTesting(false);
    }
  };

  const clearKey = async () => {
    const confirmed = window.confirm('确认清除数据库中保存的 API Key？如果 .env 有 Key，系统会继续回退使用环境变量。');
    if (!confirmed) return;
    setClearing(true);
    setMessage('');
    setError('');
    try {
      const nextConfig = await aiApi.clearKey();
      setConfig(nextConfig);
      syncForm(nextConfig);
      setTestResult(null);
      setMessage('数据库 API Key 已清除；如环境变量配置了 Key，将继续作为 fallback 使用。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '清除数据库 API Key 失败');
    } finally {
      setClearing(false);
    }
  };

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="AI 接入配置"
        description="管理员配置 DeepSeek / 火山方舟接入参数；检测链路优先使用数据库配置，没有数据库 Key 时回退到环境变量。"
      />

      {message ? <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
      {error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="AI 提供方" value={config?.provider || 'deepseek'} tone="blue" />
        <StatCard title="启用状态" value={config?.enabled ? '已启用' : '已禁用'} tone={config?.enabled ? 'green' : 'slate'} />
        <StatCard title="密钥状态" value={config?.configured ? '已配置' : '未配置'} tone={config?.configured ? 'green' : 'slate'} />
        <StatCard title="配置来源" value={config?.source === 'database' ? 'database' : 'env fallback'} tone="slate" />
      </div>

      <form onSubmit={saveConfig} className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-950">DeepSeek / 火山方舟</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {config?.message || '数据库配置可热更新，不需要修改 .env 或重启服务。API Key 只以密文存储，前端只显示脱敏值。'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-300">
              {saving ? '保存中...' : '保存配置'}
            </button>
            <button type="button" onClick={testConnection} disabled={testing} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300">
              {testing ? '测试中...' : '测试连接'}
            </button>
            <button type="button" onClick={clearKey} disabled={clearing} className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60">
              {clearing ? '清除中...' : '清除数据库 API Key'}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
              className="h-4 w-4 rounded border-slate-300"
            />
            <span className="text-sm font-semibold text-slate-800">启用 DeepSeek 语义研判</span>
          </label>
          <Info label="当前脱敏 Key" value={config?.api_key_masked || '未配置'} />
          <Field label="base_url" value={form.base_url} onChange={(value) => setForm((current) => ({ ...current, base_url: value }))} placeholder="https://ark.cn-beijing.volces.com/api/v3" />
          <Field label="model" value={form.model} onChange={(value) => setForm((current) => ({ ...current, model: value }))} placeholder="deepseek-v3-2-251201" />
          <Field label="timeout_seconds" type="number" value={String(form.timeout_seconds)} onChange={(value) => setForm((current) => ({ ...current, timeout_seconds: Number(value) }))} min={5} max={120} />
          <Field
            label="API Key"
            type="password"
            value={form.api_key}
            onChange={(value) => setForm((current) => ({ ...current, api_key: value }))}
            placeholder="留空表示不修改现有 Key"
            help="留空表示不修改现有 Key。前端不会保存或展示完整 Key。"
          />
          <Info label="最后测试状态" value={config?.last_test_status || '未测试'} />
          <Info label="最后测试时间" value={config?.last_test_at ? formatDate(config.last_test_at) : '未测试'} />
          <Info label="最后测试说明" value={config?.last_test_message || '-'} wide />
        </div>
      </form>

      {testResult ? (
        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">测试结果</h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Info label="status" value={testResult.status} />
            <Info label="provider" value={testResult.provider} />
            <Info label="risk_score" value={String(testResult.analysis.risk_score ?? '-')} />
            <Info label="label" value={testResult.analysis.label || '-'} />
            <Info label="reasons" value={testResult.analysis.reasons?.join('；') || '-'} wide />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  help,
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  help?: string;
  min?: number;
  max?: number;
}) {
  return (
    <label className="block rounded-lg border border-slate-200 bg-slate-50 p-4">
      <span className="text-sm font-semibold text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        min={min}
        max={max}
        className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
      />
      {help ? <span className="mt-2 block text-xs text-slate-500">{help}</span> : null}
    </label>
  );
}

function Info({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-slate-50 p-4 ${wide ? 'lg:col-span-2' : ''}`}>
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-2 break-all text-sm text-slate-800">{value}</p>
    </div>
  );
}
