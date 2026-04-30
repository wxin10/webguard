import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import ScanResultCard from '../components/ScanResultCard';
import StatusNotice from '../components/StatusNotice';
import { scanService } from '../services/scanService';
import type { ScanResult } from '../types';

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
          <ScanResultCard url={url || result.url} result={result} />
        ) : (
          <section className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
            检测完成后，这里会展示风险等级、分数和摘要原因；完整证据链、用户动作和浏览器助手现场事件会沉淀到报告页。
          </section>
        )}
      </div>
    </div>
  );
}
