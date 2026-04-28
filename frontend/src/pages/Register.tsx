import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../services/api';

const registerImage = 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1400&q=80';

export default function Register() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (user) return <Navigate to="/app" replace />;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致。');
      return;
    }
    setLoading(true);
    try {
      await authApi.register({
        username: username.trim(),
        display_name: displayName.trim() || null,
        email: email.trim() || null,
        password,
      });
      setSuccess('注册成功，请登录。');
      window.setTimeout(() => navigate('/login', { replace: true }), 900);
    } catch (registerError) {
      setError(registerError instanceof Error ? registerError.message : '注册失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f7f4] px-4 py-8 text-slate-950">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm lg:grid-cols-[1fr_460px]">
        <section className="relative hidden min-h-full overflow-hidden lg:block">
          <img src={registerImage} alt="WebGuard account workspace" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#09251f]/90 via-[#0c3b32]/70 to-transparent" />
          <div className="absolute inset-0 flex flex-col justify-between p-10 text-white">
            <Link to="/" className="inline-flex w-fit items-center gap-3 text-sm font-semibold text-emerald-100">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500 text-base font-bold text-white">W</span>
              WebGuard
            </Link>
            <div className="max-w-xl">
              <p className="text-sm font-semibold text-emerald-100">Account Access</p>
              <h1 className="mt-4 text-4xl font-bold leading-tight">创建 WebGuard 账号</h1>
              <p className="mt-5 max-w-lg text-sm leading-6 text-emerald-50">
                注册后可使用个人安全检测、风险报告与浏览器助手绑定功能。管理员权限需由平台管理员开通。
              </p>
            </div>
          </div>
        </section>

        <form onSubmit={handleSubmit} className="flex flex-col justify-center p-7 sm:p-10">
          <Link to="/" className="mb-10 inline-flex w-fit items-center gap-3 text-sm font-semibold text-emerald-700 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 text-base font-bold text-white">W</span>
            WebGuard
          </Link>

          <p className="text-sm font-semibold text-emerald-700">账号注册</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-950">注册 WebGuard 账号</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            注册账号为普通用户，管理员权限需由平台管理员开通。
          </p>

          <label className="mt-7 block text-sm font-semibold text-slate-700">用户名</label>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
            placeholder="输入用户名"
          />

          <label className="mt-4 block text-sm font-semibold text-slate-700">显示名</label>
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
            placeholder="用于页面展示"
          />

          <label className="mt-4 block text-sm font-semibold text-slate-700">邮箱</label>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
            placeholder="可选"
          />

          <label className="mt-4 block text-sm font-semibold text-slate-700">密码</label>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
            placeholder="至少 6 位"
          />

          <label className="mt-4 block text-sm font-semibold text-slate-700">确认密码</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
            placeholder="再次输入密码"
          />

          <button
            disabled={loading || !username.trim() || password.length < 6 || !confirmPassword}
            className="mt-7 w-full rounded-lg bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? '注册中...' : '注册'}
          </button>

          {success && <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p>}
          {error && <p className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

          <Link to="/login" className="mt-6 text-center text-sm font-semibold text-slate-500 hover:text-emerald-700">
            已有账号？返回登录
          </Link>
        </form>
      </div>
    </div>
  );
}
