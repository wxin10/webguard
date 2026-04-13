import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const titles: Record<string, string> = {
  '/': '控制台',
  '/scan': '单网址检测',
  '/records': '全部历史记录',
  '/my-records': '我的检测记录',
  '/rules': '规则管理',
  '/domains': '黑白名单',
  '/model': '模型状态',
  '/stats': '统计分析',
  '/plugin': '插件状态',
  '/plugin-guide': '插件使用说明',
  '/report/latest': '最近报告',
  '/admin/users': '用户管理',
};

export default function AppHeader() {
  const { user, logout, switchRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const pageTitle = titles[location.pathname] || (location.pathname.startsWith('/reports/') ? '分析报告' : 'WebGuard');

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur md:px-8">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">WebGuard Console</p>
          <h2 className="text-xl font-bold text-slate-950">{pageTitle}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700">
            {user?.role === 'admin' ? 'Admin 管理员' : 'User 普通用户'}
          </span>
          <button onClick={switchRole} className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100">
            切换开发角色
          </button>
          <button onClick={handleLogout} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            退出
          </button>
        </div>
      </div>
    </header>
  );
}
