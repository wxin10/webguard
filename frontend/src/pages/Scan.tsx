import { FormEvent, useState } from 'react';
import PageHeader from '../components/PageHeader';
import ScanResultCard from '../components/ScanResultCard';
import { scanApi } from '../services/api';
import { ScanResult } from '../types';

export default function Scan() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!url.trim()) {
      setError('请输入需要检测的网址');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await scanApi.scanUrl({ url });
      setResult(data);
    } catch {
      setError('检测失败，请确认后端服务已启动，API 地址为 http://127.0.0.1:8000');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader title="单网址检测" description="输入 URL 后调用后端 Detector 主流程，展示风险等级、评分、规则命中、模型概率、解释与建议。" />
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">{error}</div>}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 md:flex-row">
          <input
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/login"
            className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
          <button disabled={loading} className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
            {loading ? '检测中...' : '开始检测'}
          </button>
        </form>
      </section>

      <div className="mt-6">
        {result ? (
          <ScanResultCard url={url} result={result} />
        ) : (
          <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
            检测完成后将在这里生成可解释分析摘要。
          </section>
        )}
      </div>
    </div>
  );
}
