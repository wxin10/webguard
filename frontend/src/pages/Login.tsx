import { FormEvent, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { UserRole } from '../types';

const loginImage = 'https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=1400&q=80';

export default function Login() {
  const { user, login, mockLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [developmentRole, setDevelopmentRole] = useState<UserRole>('user');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fromPath = isRedirectState(location.state) ? `${location.state.from.pathname}${location.state.from.search}` : '/app';

  if (user) return <Navigate to={fromPath} replace />;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const normalizedUsername = username.trim();
      await login(normalizedUsername, password);
      navigate(fromPath, { replace: true });
    } catch {
      setError('登录失败，请确认后端服务已启动。');
    } finally {
      setLoading(false);
    }
  };

  const handleMockLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const normalizedUsername = username.trim();
      const fallbackUsername = developmentRole === 'admin' ? 'platform-admin' : 'platform-user';
      await mockLogin(normalizedUsername || fallbackUsername, developmentRole);
      navigate(fromPath, { replace: true });
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'mock login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f7f4] px-4 py-8 text-slate-950">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm lg:grid-cols-[1fr_440px]">
        <section className="relative hidden min-h-full overflow-hidden lg:block">
          <img src={loginImage} alt="WebGuard security workspace" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#09251f]/90 via-[#0c3b32]/70 to-transparent" />
          <div className="absolute inset-0 flex flex-col justify-between p-10 text-white">
            <Link to="/" className="inline-flex w-fit items-center gap-3 text-sm font-semibold text-emerald-100">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500 text-base font-bold text-white">W</span>
              WebGuard
            </Link>
            <div className="max-w-xl">
              <p className="text-sm font-semibold text-emerald-100">Unified Web Security Platform</p>
              <h1 className="mt-4 text-4xl font-bold leading-tight">把恶意网站检测、风险报告和主动防御放进同一个工作平台。</h1>
              <div className="mt-8 grid gap-3 text-sm text-emerald-50 md:grid-cols-3">
                {['提交检测', '查看报告', '同步浏览器提醒'].map((item) => (
                  <div key={item} className="rounded-lg border border-white/20 bg-white/10 px-4 py-3 backdrop-blur">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <form onSubmit={handleSubmit} className="flex flex-col justify-center p-7 sm:p-10">
          <Link to="/" className="mb-10 inline-flex w-fit items-center gap-3 text-sm font-semibold text-emerald-700 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 text-base font-bold text-white">W</span>
            WebGuard
          </Link>

          <p className="text-sm font-semibold text-emerald-700">平台登录</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-950">进入 WebGuard</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            使用你的平台账号进入个人安全工作台或运营控制台。浏览器助手的报告和提醒会同步到这里继续处理。
          </p>

          <label className="mt-8 block text-sm font-semibold text-slate-700">账号</label>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
            placeholder="name@company.com"
          />

          <div className="mt-5 flex items-center justify-between gap-3">
            <label className="block text-sm font-semibold text-slate-700">密码</label>
            <span className="text-xs text-slate-400">当前本地环境仅做前端兼容</span>
          </div>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
            placeholder="输入密码"
          />

          <button
            disabled={loading || !username.trim() || !password.trim()}
            className="mt-7 w-full rounded-lg bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? '登录中...' : '登录并进入平台'}
          </button>

          {error && <p className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

          <details className="mt-6 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <summary className="cursor-pointer font-semibold text-slate-700">开发环境临时选项</summary>
            <p className="mt-3 leading-6">
              真实鉴权接入前，mock 登录会按这里的身份进入对应工作区。该选项仅用于本地开发检查，不作为正式登录路径。
            </p>
            <div className="mt-3 flex gap-2">
              {(['user', 'admin'] as UserRole[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setDevelopmentRole(item)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                    developmentRole === item ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  {item === 'admin' ? '运营管理员' : '普通用户'}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleMockLogin}
              disabled={loading}
              className="mt-4 rounded-lg border border-emerald-200 bg-white px-4 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Use development mock-login
            </button>
          </details>

          <Link to="/" className="mt-6 text-center text-sm font-semibold text-slate-500 hover:text-emerald-700">
            返回产品首页
          </Link>
        </form>
      </div>
    </div>
  );
}

function isRedirectState(state: unknown): state is { from: { pathname: string; search: string } } {
  if (!state || typeof state !== 'object' || !('from' in state)) return false;
  const from = (state as { from?: unknown }).from;
  return Boolean(
    from
      && typeof from === 'object'
      && typeof (from as { pathname?: unknown }).pathname === 'string'
      && typeof (from as { search?: unknown }).search === 'string',
  );
}
