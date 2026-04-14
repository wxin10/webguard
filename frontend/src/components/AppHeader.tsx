import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const titles: Record<string, string> = {
  '/app': 'WebGuard 工作区',
  '/app/scan': '网址检测',
  '/app/my-records': '我的报告',
  '/app/my-domains': '我的安全策略',
  '/app/plugin-sync': '插件同步记录',
  '/app/plugin-guide': '插件安装引导',
  '/app/report/latest': '最近报告',
  '/app/account': '账户设置',
  '/app/admin/records': '全部报告',
  '/app/admin/samples': '样本与误报',
  '/app/admin/rules': '规则管理',
  '/app/admin/domains': '全局名单',
  '/app/admin/model': '模型状态',
  '/app/admin/stats': '风险统计',
  '/app/admin/plugin': '插件管理',
  '/app/admin/users': '用户管理',
};

export default function AppHeader() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const pageTitle = titles[location.pathname] || (location.pathname.startsWith('/app/reports/') ? '分析报告' : 'WebGuard');
  const roleText = user?.role === 'admin' ? '运营管理员' : '普通用户';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur md:px-8">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-400">WebGuard Platform</p>
          <h2 className="text-xl font-bold text-slate-950">{pageTitle}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            产品首页
          </Link>
          <Link to="/app/account" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            账户设置
          </Link>
          <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
            {roleText}
          </span>
          <button onClick={handleLogout} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            退出
          </button>
        </div>
      </div>
    </header>
  );
}
