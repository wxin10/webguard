import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { pluginService } from '../services/pluginService';
import type { PluginBindingChallenge } from '../types';

export default function PluginBind() {
  const [searchParams] = useSearchParams();
  const challengeId = searchParams.get('challenge_id') || '';
  const [challenge, setChallenge] = useState<PluginBindingChallenge | null>(null);
  const [bindingCode, setBindingCode] = useState('');
  const [displayName, setDisplayName] = useState('WebGuard 浏览器助手');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const expiresAt = useMemo(
    () => challenge?.expires_at ? new Date(challenge.expires_at).toLocaleString() : '-',
    [challenge],
  );

  useEffect(() => {
    if (!challengeId) {
      setError('绑定请求不存在，请从浏览器助手设置页重新发起绑定。');
      return;
    }
    setLoading(true);
    pluginService.getBindingChallenge(challengeId)
      .then(setChallenge)
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : '绑定请求加载失败。'))
      .finally(() => setLoading(false));
  }, [challengeId]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!challengeId) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const result = await pluginService.confirmBindingChallenge(challengeId, {
        binding_code: bindingCode.trim(),
        display_name: displayName.trim() || undefined,
      });
      setMessage(`浏览器助手 ${result.plugin_instance_id} 已确认。请回到助手设置页完成绑定。`);
      setChallenge((current) => current ? { ...current, status: result.status } : current);
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : '绑定确认失败。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="绑定浏览器助手"
        description="确认浏览器助手发起的绑定请求，将当前浏览器与已登录的平台账号关联。"
      />
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        {!challengeId && <p className="text-sm font-semibold text-red-700">绑定请求不存在，请从浏览器助手设置页重新发起绑定。</p>}
        {challengeId && (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Info label="绑定请求" value={challengeId} />
              <Info label="助手实例" value={challenge?.plugin_instance_id || '-'} />
              <Info label="状态" value={bindingStatusText(challenge?.status || (loading ? 'loading' : '-'))} />
              <Info label="有效期至" value={expiresAt} />
            </div>

            <form onSubmit={handleSubmit} className="mt-6 max-w-xl">
              <label className="block text-sm font-semibold text-slate-700">绑定验证码</label>
              <input
                value={bindingCode}
                onChange={(event) => setBindingCode(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                placeholder="输入浏览器助手中显示的验证码"
              />

              <label className="mt-5 block text-sm font-semibold text-slate-700">助手名称</label>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                placeholder="例如：办公电脑浏览器助手"
              />

              <button
                disabled={loading || !bindingCode.trim() || !challenge}
                className="mt-6 rounded-lg bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? '确认中...' : '确认绑定'}
              </button>
            </form>
          </>
        )}
        {message && <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}
        {error && <p className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      </section>
    </div>
  );
}

function bindingStatusText(value: string) {
  const map: Record<string, string> = {
    pending: '待确认',
    confirmed: '已确认',
    exchanged: '已绑定',
    expired: '已失效',
    loading: '加载中',
    '-': '-',
  };
  return map[value] || value;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-2 break-all font-bold text-slate-950">{value}</p>
    </div>
  );
}
