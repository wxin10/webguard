import { FormEvent, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { UserRole } from '../types';

export default function Login() {
  const { user, login } = useAuth();
  const [username, setUsername] = useState('user-dev');
  const [role, setRole] = useState<UserRole>('user');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    await login(username || `${role}-dev`, role);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto grid max-w-6xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm lg:grid-cols-[1.05fr_420px]">
        <section className="bg-slate-950 p-10 text-white">
          <Link to="/welcome" className="text-sm font-semibold text-blue-300">WebGuard</Link>
          <h1 className="mt-5 text-4xl font-bold leading-tight">登录 Web 安全检测平台</h1>
          <p className="mt-5 max-w-xl text-slate-300">
            Web 平台是主要工作入口：普通用户在这里检测网址、查看报告、管理个人安全策略；管理员在这里运营样本、规则、名单和模型。
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              ['用户工作台', '检测、报告、个人策略'],
              ['运营控制台', '样本、规则、模型、用户'],
              ['浏览器插件', '快速扫描、提醒和拦截'],
            ].map(([title, text]) => (
              <div key={title} className="rounded-lg border border-white/10 bg-white/5 p-4">
                <p className="font-semibold text-white">{title}</p>
                <p className="mt-2 text-sm text-slate-300">{text}</p>
              </div>
            ))}
          </div>
        </section>
        <form onSubmit={handleSubmit} className="p-8">
          <h2 className="text-2xl font-bold text-slate-950">开发期登录</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            当前入口仅用于本地开发的角色视图切换，后续应替换为真实鉴权、会话和后端权限校验。
          </p>

          <label className="mt-8 block text-sm font-semibold text-slate-700">用户名</label>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            placeholder="请输入用户名"
          />

          <div className="mt-6 grid grid-cols-2 gap-3">
            {(['user', 'admin'] as UserRole[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setRole(item);
                  setUsername(item === 'admin' ? 'admin-dev' : 'user-dev');
                }}
                className={`rounded-lg border px-4 py-3 text-left text-sm font-semibold ${
                  role === item ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                {item === 'admin' ? '管理员 admin' : '普通用户 user'}
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  {item === 'admin' ? '进入运营控制台' : '进入个人工作台'}
                </span>
              </button>
            ))}
          </div>

          <button disabled={loading} className="mt-8 w-full rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
            {loading ? '登录中...' : '进入 Web 平台'}
          </button>
          <Link to="/welcome" className="mt-5 block text-center text-sm font-semibold text-slate-500 hover:text-blue-600">
            返回产品首页
          </Link>
        </form>
      </div>
    </div>
  );
}
