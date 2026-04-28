import PageHeader from '../components/PageHeader';
import { useAuth } from '../contexts/AuthContext';

export default function AccountSettings() {
  const { user } = useAuth();

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

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">浏览器助手</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Info label="连接状态" value="可前往浏览器助手页面查看" />
          <Info label="绑定管理" value="通过绑定页确认助手连接" />
          <Info label="安全策略" value="以平台策略为准" />
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
