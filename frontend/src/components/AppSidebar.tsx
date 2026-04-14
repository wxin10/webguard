import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const adminMenu = [
  { path: '/app', label: '运营总览' },
  { path: '/app/admin/records', label: '全部报告' },
  { path: '/app/admin/samples', label: '样本与误报' },
  { path: '/app/admin/rules', label: '规则管理' },
  { path: '/app/admin/domains', label: '全局名单' },
  { path: '/app/admin/model', label: '模型状态' },
  { path: '/app/admin/plugin', label: '插件管理' },
  { path: '/app/admin/stats', label: '风险统计' },
  { path: '/app/admin/users', label: '用户管理' },
];

const userMenu = [
  { path: '/app', label: '用户工作台' },
  { path: '/app/scan', label: '网址检测' },
  { path: '/app/my-records', label: '我的报告' },
  { path: '/app/my-domains', label: '我的安全策略' },
  { path: '/app/plugin-sync', label: '插件同步记录' },
  { path: '/app/report/latest', label: '最近报告' },
  { path: '/app/plugin-guide', label: '插件安装引导' },
  { path: '/app/account', label: '账户设置' },
];

export default function AppSidebar() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const menu = isAdmin ? adminMenu : userMenu;

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-slate-200 bg-white lg:block">
      <div className="border-b border-slate-200 px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-600 text-lg font-bold text-white">W</div>
          <div>
            <h1 className="text-xl font-bold text-slate-950">WebGuard</h1>
            <p className="text-xs text-slate-500">Web 安全检测平台</p>
          </div>
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-500">
          Web 平台承接检测、报告、策略与运营闭环；浏览器插件只作为轻量辅助入口。
        </p>
      </div>
      <nav className="space-y-1 px-4 py-5">
        {menu.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/app'}
            className={({ isActive }) =>
              `block rounded-lg px-4 py-3 text-sm font-semibold transition ${
                isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="absolute bottom-0 left-0 right-0 border-t border-slate-200 p-5">
        <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-900">{isAdmin ? '运营控制台' : '个人安全工作台'}</p>
          <p className="mt-1">{user?.display_name || user?.username}</p>
        </div>
      </div>
    </aside>
  );
}
