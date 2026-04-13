import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const adminMenu = [
  { path: '/', label: 'Dashboard' },
  { path: '/records', label: '全部记录' },
  { path: '/rules', label: '规则管理' },
  { path: '/domains', label: '黑白名单' },
  { path: '/model', label: '模型状态' },
  { path: '/plugin', label: '插件状态' },
  { path: '/stats', label: '统计分析' },
  { path: '/admin/users', label: '用户管理' },
];

const userMenu = [
  { path: '/', label: '首页' },
  { path: '/scan', label: '单网址检测' },
  { path: '/my-records', label: '我的记录' },
  { path: '/report/latest', label: '最近报告' },
  { path: '/plugin-guide', label: '插件使用说明' },
];

export default function AppSidebar() {
  const { user } = useAuth();
  const menu = user?.role === 'admin' ? adminMenu : userMenu;

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-slate-200 bg-white lg:block">
      <div className="border-b border-slate-200 px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white">W</div>
          <div>
            <h1 className="text-xl font-bold text-slate-950">WebGuard</h1>
            <p className="text-xs text-slate-500">恶意网站检测与主动防御</p>
          </div>
        </div>
      </div>
      <nav className="space-y-1 px-4 py-5">
        {menu.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `block rounded-xl px-4 py-3 text-sm font-semibold transition ${
                isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="absolute bottom-0 left-0 right-0 border-t border-slate-200 p-5">
        <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-900">{user?.role === 'admin' ? 'Admin 管理员' : 'User 普通用户'}</p>
          <p className="mt-1">当前演示身份: {user?.display_name}</p>
        </div>
      </div>
    </aside>
  );
}
