import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function AppHeader() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';
  const workspaceText = isAdmin ? '运营控制台' : '个人安全工作台';
  const headerTitle = isAdmin ? '安全运营入口' : '安全工作入口';
  const primaryAction = isAdmin
    ? { to: '/app/admin/samples', label: '处理样本' }
    : { to: '/app/scan', label: '检测网址' };
  const assistantLink = isAdmin ? '/app/admin/plugin' : '/app/plugin-sync';

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur md:px-8">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-700">WebGuard · {workspaceText}</p>
          <h2 className="text-xl font-bold text-slate-950">{headerTitle}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link to={primaryAction.to} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
            {primaryAction.label}
          </Link>
          <Link to={assistantLink} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            浏览器助手
          </Link>
          <Link to="/" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            产品首页
          </Link>
          <Link to="/app/account" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            账户
          </Link>
          <button onClick={handleLogout} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            退出
          </button>
        </div>
      </div>
    </header>
  );
}
