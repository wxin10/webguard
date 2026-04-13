import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { UserRole } from '../types';

export default function Login() {
  const { user, login } = useAuth();
  const [username, setUsername] = useState('admin-dev');
  const [role, setRole] = useState<UserRole>('admin');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    await login(username || `${role}-dev`, role);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[1fr_420px]">
        <section className="bg-slate-950 p-10 text-white">
          <p className="text-sm font-semibold text-blue-300">WebGuard</p>
          <h1 className="mt-4 text-4xl font-bold leading-tight">恶意网站检测与主动防御系统</h1>
          <p className="mt-5 max-w-xl text-slate-300">
            基于浏览器插件与 Web 后台联动，展示从网页采集、规则命中、模型推理到主动拦截的完整闭环。
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {['插件实时检测', '可解释分析报告', '管理员运营后台'].map((item) => (
              <div key={item} className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
                {item}
              </div>
            ))}
          </div>
        </section>
        <form onSubmit={handleSubmit} className="p-8">
          <h2 className="text-2xl font-bold text-slate-950">开发登录</h2>
          <p className="mt-2 text-sm text-slate-500">当前为 development only 登录入口，后续可替换为真实鉴权服务。</p>

          <label className="mt-8 block text-sm font-semibold text-slate-700">用户名</label>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            placeholder="请输入用户名"
          />

          <div className="mt-6 grid grid-cols-2 gap-3">
            {(['admin', 'user'] as UserRole[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setRole(item);
                  setUsername(item === 'admin' ? 'admin-dev' : 'user-dev');
                }}
                className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold ${
                  role === item ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                {item === 'admin' ? '管理员 admin' : '普通用户 user'}
              </button>
            ))}
          </div>

          <button disabled={loading} className="mt-8 w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
}
