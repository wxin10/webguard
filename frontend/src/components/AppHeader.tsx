import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const titles: Record<string, string> = {
  '/': 'WebGuard 平台',
  '/welcome': '产品首页',
  '/scan': '网址检测',
  '/records': '全部报告',
  '/my-records': '我的报告',
  '/my-domains': '我的安全策略',
  '/plugin-sync': '插件同步记录',
  '/rules': '规则管理',
  '/domains': '全局黑白名单',
  '/model': '模型状态',
  '/stats': '风险统计',
  '/plugin': '插件管理',
  '/plugin-guide': '插件安装引导',
  '/report/latest': '最近报告',
  '/admin/users': '用户管理',
  '/samples': '样本与误报',
  '/account': '账户设置',
};

export default function AppHeader() {
  const { user, logout, switchRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const pageTitle = titles[location.pathname] || (location.pathname.startsWith('/reports/') ? '分析报告' : 'WebGuard');
  const roleText = user?.role === 'admin' ? '管理员' : '普通用户';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur md:px-8">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-400">WebGuard Web Platform</p>
          <h2 className="text-xl font-bold text-slate-950">{pageTitle}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/welcome" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            产品入口
          </Link>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700">
            {roleText}
          </span>
          <button onClick={switchRole} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100">
            开发期切换身份
          </button>
          <button onClick={handleLogout} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            退出
          </button>
        </div>
      </div>
    </header>
  );
}
