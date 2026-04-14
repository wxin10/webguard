import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const titles: Record<string, string> = {
  '/app': '工作台',
  '/app/scan': '快速检测',
  '/app/my-records': '我的风险报告',
  '/app/my-domains': '我的安全策略',
  '/app/plugin-sync': '浏览器助手同步',
  '/app/plugin-guide': '浏览器助手安装',
  '/app/report/latest': '最近报告',
  '/app/account': '账户设置',
  '/app/admin/records': '风险报告总览',
  '/app/admin/samples': '样本与误报处理',
  '/app/admin/rules': '规则调整',
  '/app/admin/domains': '全局名单',
  '/app/admin/model': '模型状态',
  '/app/admin/stats': '风险统计',
  '/app/admin/plugin': '浏览器助手运行状态',
  '/app/admin/users': '用户管理',
};

export default function AppHeader() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const pageTitle = titles[location.pathname] || (location.pathname.startsWith('/app/reports/') ? '风险报告' : 'WebGuard');
  const isAdmin = user?.role === 'admin';
  const workspaceText = isAdmin ? '运营控制台' : '个人安全工作台';
  const primaryAction = isAdmin
    ? { to: '/app/admin/samples', label: '处理样本' }
    : { to: '/app/scan', label: '检测网址' };
  const assistantLink = isAdmin ? '/app/admin/plugin' : '/app/plugin-sync';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur md:px-8">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-700">WebGuard · {workspaceText}</p>
          <h2 className="text-xl font-bold text-slate-950">{pageTitle}</h2>
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
