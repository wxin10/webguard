import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import RiskBadge from '../components/RiskBadge';
import RuleHitList from '../components/RuleHitList';
import StatusNotice from '../components/StatusNotice';
import { scanService } from '../services/scanService';
import type { ScanResult } from '../types';
import { riskBar } from '../utils';

export default function Scan() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const targetUrl = url.trim();
    if (!targetUrl) {
      setError('请输入需要检测的网址。');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await scanService.scanUrl({ url: targetUrl });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '检测失败，请确认后端服务可用。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="网站检测"
        description="在网站主平台发起 URL 检测，后端会生成统一的检测记录和正式报告。浏览器助手上传的现场扫描也会进入同一套记录体系。"
        action={
          <Link to="/app/my-records" className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            查看历史记录
          </Link>
        }
      />

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        {error && <StatusNotice tone="error">{error}</StatusNotice>}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 md:flex-row">
          <input
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/login"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
          <button disabled={loading} className="rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
            {loading ? '检测中...' : '生成检测报告'}
          </button>
        </form>
      </section>

      <div className="mt-6">
        {result ? (
          <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
              <div>
                <p className="text-sm font-semibold text-blue-600">检测摘要</p>
                <h2 className="mt-2 break-all text-xl font-bold text-slate-950">{url}</h2>
                <p className="mt-1 text-sm text-slate-500">报告编号 #{result.report_id || result.record_id}</p>
              </div>
              <RiskBadge label={result.label} size="lg" />
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              <Metric title="风险分数" value={result.risk_score.toFixed(1)} tone={result.label} />
              <Metric title="规则分数" value={result.rule_score.toFixed(1)} />
              <Metric title="模型恶意概率" value={`${(result.model_malicious_prob * 100).toFixed(1)}%`} />
            </div>

            <div className="mt-5 h-2 rounded-full bg-slate-200">
              <div className={`h-2 rounded-full ${riskBar(result.label)}`} style={{ width: `${Math.min(result.risk_score, 100)}%` }} />
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              <div className="rounded-lg bg-slate-50 p-4">
                <h3 className="font-semibold text-slate-950">摘要原因</h3>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{result.explanation || '暂无摘要。'}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-4">
                <h3 className="font-semibold text-slate-950">处置建议</h3>
                <p className="mt-2 text-sm leading-6 text-slate-700">{result.recommendation || '暂无处置建议。'}</p>
              </div>
            </div>

            <div className="mt-6">
              <h3 className="mb-3 font-semibold text-slate-950">命中规则</h3>
              <RuleHitList rules={result.hit_rules || []} />
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Link className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" to="/app/my-records">
                返回记录
              </Link>
              <Link className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700" to={`/app/reports/${result.report_id || result.record_id}`}>
                查看完整报告
              </Link>
            </div>
          </section>
        ) : (
          <section className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
            检测完成后，这里会展示风险等级、分数和摘要原因；完整证据链、用户动作和浏览器助手现场事件会沉淀到报告页。
          </section>
        )}
      </div>
    </div>
  );
}

function Metric({ title, value, tone }: { title: string; value: string; tone?: string }) {
  const color = tone === 'malicious' ? 'text-red-600' : tone === 'suspicious' ? 'text-amber-600' : tone === 'safe' ? 'text-emerald-600' : 'text-slate-950';
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm text-slate-500">{title}</p>
      <p className={`mt-2 text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
