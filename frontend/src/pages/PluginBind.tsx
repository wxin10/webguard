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
  const [displayName, setDisplayName] = useState('WebGuard Browser Extension');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const expiresAt = useMemo(
    () => challenge?.expires_at ? new Date(challenge.expires_at).toLocaleString() : '-',
    [challenge],
  );

  useEffect(() => {
    if (!challengeId) {
      setError('Missing challenge_id.');
      return;
    }
    setLoading(true);
    pluginService.getBindingChallenge(challengeId)
      .then(setChallenge)
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Failed to load challenge.'))
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
      setMessage(`Plugin instance ${result.plugin_instance_id} confirmed. Return to extension Options to finish token exchange.`);
      setChallenge((current) => current ? { ...current, status: result.status } : current);
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : 'Failed to confirm binding.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Plugin Binding"
        description="Confirm a browser extension binding challenge for your logged-in WebGuard account."
      />
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        {!challengeId && <p className="text-sm font-semibold text-red-700">Missing challenge_id in URL.</p>}
        {challengeId && (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Info label="Challenge ID" value={challengeId} />
              <Info label="Plugin Instance" value={challenge?.plugin_instance_id || '-'} />
              <Info label="Status" value={challenge?.status || (loading ? 'loading' : '-')} />
              <Info label="Expires At" value={expiresAt} />
            </div>

            <form onSubmit={handleSubmit} className="mt-6 max-w-xl">
              <label className="block text-sm font-semibold text-slate-700">Binding Code</label>
              <input
                value={bindingCode}
                onChange={(event) => setBindingCode(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                placeholder="6-digit code shown in extension Options"
              />

              <label className="mt-5 block text-sm font-semibold text-slate-700">Display Name</label>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                placeholder="Chrome on this computer"
              />

              <button
                disabled={loading || !bindingCode.trim() || !challenge}
                className="mt-6 rounded-lg bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Confirming...' : 'Confirm Binding'}
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-2 break-all font-bold text-slate-950">{value}</p>
    </div>
  );
}
