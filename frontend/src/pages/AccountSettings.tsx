import PageHeader from '../components/PageHeader';
import { useAuth } from '../contexts/AuthContext';

export default function AccountSettings() {
  const { user } = useAuth();

  return (
    <div>
      <PageHeader title="账户设置" description="当前保留 development-only 身份上下文，为后续正式鉴权、通知偏好和个人策略预留结构。" />
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">当前账户</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <Info label="用户名" value={user?.username || '-'} />
          <Info label="角色" value={user?.role === 'admin' ? '管理员' : '普通用户'} />
          <Info label="显示名称" value={user?.display_name || '-'} />
        </div>
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
          当前登录入口仅用于本地开发。正式上线需要接入真实用户、密码或单点登录、token/session 管理、后端权限校验和审计日志。
        </div>
      </section>
      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">后续设置项</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Info label="通知偏好" value="待接入" />
          <Info label="报告订阅" value="待接入" />
          <Info label="插件绑定" value="待接入" />
        </div>
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-2 font-bold text-slate-950">{value}</p>
    </div>
  );
}
