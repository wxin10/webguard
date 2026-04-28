import DataTable from '../components/DataTable';
import PageHeader from '../components/PageHeader';

const users = [
  { id: 1, username: '运营管理员', role: 'admin', status: '启用', active_at: '2026-04-13 10:20' },
  { id: 2, username: '安全分析员', role: 'user', status: '启用', active_at: '2026-04-13 10:18' },
  { id: 3, username: '浏览器助手账号', role: 'user', status: '启用', active_at: '2026-04-13 09:50' },
];

export default function Users() {
  return (
    <div>
      <PageHeader title="用户管理" description="运营控制台中的用户视图，展示账户、角色、状态和最近活跃时间。" />
      <DataTable
        data={users}
        columns={[
          { key: 'username', title: '用户名' },
          { key: 'role', title: '角色', render: (value) => (value === 'admin' ? '管理员' : '普通用户') },
          { key: 'status', title: '状态' },
          { key: 'active_at', title: '最近活跃时间' },
        ]}
      />
    </div>
  );
}
