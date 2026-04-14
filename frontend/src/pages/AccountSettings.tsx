import PageHeader from '../components/PageHeader';
import { useAuth } from '../contexts/AuthContext';

export default function AccountSettings() {
  const { user, switchRole } = useAuth();

  return (
    <div>
      <PageHeader title="账户设置" description="管理账户信息、通知偏好、报告订阅和浏览器助手绑定状态。" />
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">当前账户</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <Info label="用户名" value={user?.username || '-'} />
          <Info label="角色" value={user?.role === 'admin' ? '管理员' : '普通用户'} />
          <Info label="显示名称" value={user?.display_name || '-'} />
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">偏好设置</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Info label="通知偏好" value="待接入" />
          <Info label="报告订阅" value="待接入" />
          <Info label="浏览器助手绑定" value="待接入" />
        </div>
      </section>

      <details className="mt-6 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
        <summary className="cursor-pointer text-base font-bold text-slate-800">开发环境临时能力</summary>
        <p className="mt-3 max-w-3xl leading-6">
          当前本地环境仍保留 mock 登录与角色切换能力，用于开发阶段检查个人安全工作台和运营控制台。正式上线需要接入真实用户、会话管理、后端权限校验和审计日志。
        </p>
        <button onClick={switchRole} className="mt-5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
          切换开发角色
        </button>
      </details>
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
