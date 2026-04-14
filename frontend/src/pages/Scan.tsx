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
      <PageHeader
        title="网址检测"
        description="这是普通用户的主要检测入口。输入 URL 后由 Web 平台生成可解释报告；插件仅用于浏览器当前页的快捷扫描。"
      />
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">{error}</div>}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 md:flex-row">
          <input
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/login"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
          <button disabled={loading} className="rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
            {loading ? '检测中...' : '生成报告'}
          </button>
        </form>
      </section>

      <div className="mt-6">
        {result ? (
          <ScanResultCard url={url} result={result} />
        ) : (
          <section className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
            检测完成后将在这里生成报告摘要，并可进入 Web 报告页查看完整证据链。
          </section>
        )}
      </div>
    </div>
  );
}
