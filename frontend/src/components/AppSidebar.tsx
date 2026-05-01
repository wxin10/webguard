import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const adminSections = [
  {
    title: '运营任务',
    items: [
      { path: '/app', label: '风险态势' },
      { path: '/app/admin/samples', label: '样本与误报' },
      { path: '/app/admin/records', label: '报告总览' },
      { path: '/app/admin/stats', label: '风险统计' },
    ],
  },
  {
    title: '防护策略',
    items: [
      { path: '/app/admin/rules', label: '规则调整' },
      { path: '/app/admin/domains', label: '全局名单' },
      { path: '/app/admin/model', label: 'AI 接入状态' },
      { path: '/app/admin/users', label: '用户管理' },
    ],
  },
  {
    title: '平台管理',
    items: [
      { path: '/app/admin/plugin', label: '浏览器助手' },
    ],
  },
  {
    title: '账号',
    items: [
      { path: '/app/account', label: '账号设置' },
    ],
  },
];

const userSections = [
  {
    title: '我的任务',
    items: [
      { path: '/app', label: '安全工作台' },
      { path: '/app/scan', label: '快速检测' },
      { path: '/app/my-records', label: '我的报告' },
      { path: '/app/report/latest', label: '最近报告' },
    ],
  },
  {
    title: '防护策略',
    items: [
      { path: '/app/my-domains', label: '我的安全策略' },
    ],
  },
  {
    title: '账号',
    items: [
      { path: '/app/plugin-sync', label: '同步记录' },
      { path: '/app/plugin-guide', label: '安装与连接' },
      { path: '/app/account', label: '账号设置' },
    ],
  },
];

export default function AppSidebar() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const sections = isAdmin ? adminSections : userSections;

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-slate-200 bg-white lg:block">
      <div className="border-b border-slate-200 px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-600 text-lg font-bold text-white">W</div>
          <div>
            <h1 className="text-xl font-bold text-slate-950">WebGuard</h1>
            <p className="text-xs text-emerald-700">{isAdmin ? '运营控制台' : '个人安全工作台'}</p>
          </div>
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-500">
          Web 平台承接检测、报告、策略和运营闭环；浏览器助手负责当前页提醒、快速扫描和报告跳转。
        </p>
      </div>
      <nav className="space-y-6 px-4 py-5">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="px-4 text-xs font-semibold text-slate-400">{section.title}</p>
            <div className="mt-2 space-y-1">
              {section.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/app'}
                  className={({ isActive }) =>
                    `block rounded-lg px-4 py-3 text-sm font-semibold transition ${
                      isActive ? 'bg-emerald-50 text-emerald-800' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="absolute bottom-0 left-0 right-0 border-t border-slate-200 p-5">
        <div className="rounded-lg bg-[#f4f7f4] p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-900">{isAdmin ? '运营视图' : '个人视图'}</p>
          <p className="mt-1">{isAdmin ? '全局风险与策略管理' : '检测、报告与个人策略'}</p>
        </div>
      </div>
    </aside>
  );
}
