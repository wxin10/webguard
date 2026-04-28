import { FormEvent, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import PageHeader from '../components/PageHeader';
import { adminUsersService } from '../services/adminUsersService';
import type { AdminUserCreateRequest, AdminUserItem, AdminUserPatchRequest, UserRole } from '../types';

const emptyCreateForm: AdminUserCreateRequest = {
  username: '',
  password: '',
  email: '',
  display_name: '',
  role: 'user',
};

export default function Users() {
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [keyword, setKeyword] = useState('');
  const [role, setRole] = useState('');
  const [createForm, setCreateForm] = useState<AdminUserCreateRequest>(emptyCreateForm);
  const [editing, setEditing] = useState<AdminUserItem | null>(null);
  const [editForm, setEditForm] = useState<AdminUserPatchRequest>({});
  const [resetUser, setResetUser] = useState<AdminUserItem | null>(null);
  const [resetPassword, setResetPassword] = useState('');

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await adminUsersService.getUsers({
        keyword: keyword.trim() || undefined,
        role: role || undefined,
      });
      setUsers(data.items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '用户列表加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await adminUsersService.createUser({
        ...createForm,
        username: createForm.username.trim(),
        email: createForm.email?.trim() || null,
        display_name: createForm.display_name?.trim() || createForm.username.trim(),
      });
      setCreateForm(emptyCreateForm);
      await loadUsers();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '创建用户失败');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item: AdminUserItem) => {
    setEditing(item);
    setEditForm({
      email: item.email || '',
      display_name: item.display_name,
      role: item.role,
      is_active: item.is_active,
    });
  };

  const handleUpdate = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError('');
    try {
      await adminUsersService.updateUser(editing.id, {
        ...editForm,
        email: editForm.email?.trim() || null,
        display_name: editForm.display_name?.trim() || editing.username,
      });
      setEditing(null);
      await loadUsers();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : '更新用户失败');
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!resetUser) return;
    setSaving(true);
    setError('');
    try {
      await adminUsersService.resetPassword(resetUser.id, resetPassword);
      setResetUser(null);
      setResetPassword('');
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : '重置密码失败');
    } finally {
      setSaving(false);
    }
  };

  const runUserAction = async (action: () => Promise<AdminUserItem>) => {
    setSaving(true);
    setError('');
    try {
      await action();
      await loadUsers();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '操作失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="用户管理" description="管理平台账号、角色、状态与密码重置。" />

      {error && <p className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <label className="flex-1 text-sm font-semibold text-slate-700">
            搜索
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-emerald-500"
              placeholder="用户名、显示名或邮箱"
            />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            角色
            <select
              value={role}
              onChange={(event) => setRole(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-emerald-500 md:w-40"
            >
              <option value="">全部</option>
              <option value="admin">管理员</option>
              <option value="user">普通用户</option>
            </select>
          </label>
          <button
            type="button"
            onClick={loadUsers}
            disabled={loading}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            查询
          </button>
        </div>
      </section>

      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="text-base font-semibold text-slate-900">新增用户</h3>
        <form onSubmit={handleCreate} className="mt-4 grid gap-3 md:grid-cols-5">
          <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="用户名" value={createForm.username} onChange={(event) => setCreateForm({ ...createForm, username: event.target.value })} />
          <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="显示名" value={createForm.display_name || ''} onChange={(event) => setCreateForm({ ...createForm, display_name: event.target.value })} />
          <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="邮箱" value={createForm.email || ''} onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })} />
          <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="密码" type="password" value={createForm.password} onChange={(event) => setCreateForm({ ...createForm, password: event.target.value })} />
          <div className="flex gap-2">
            <select className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" value={createForm.role} onChange={(event) => setCreateForm({ ...createForm, role: event.target.value as UserRole })}>
              <option value="user">普通用户</option>
              <option value="admin">管理员</option>
            </select>
            <button disabled={saving || !createForm.username.trim() || !createForm.password.trim()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              新增
            </button>
          </div>
        </form>
      </section>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">用户名</th>
              <th className="px-4 py-3">显示名</th>
              <th className="px-4 py-3">邮箱</th>
              <th className="px-4 py-3">角色</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">最近登录</th>
              <th className="px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={7}>正在加载...</td></tr>
            ) : users.length ? users.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-3 font-semibold text-slate-900">{item.username}</td>
                <td className="px-4 py-3 text-slate-700">{item.display_name || '-'}</td>
                <td className="px-4 py-3 text-slate-700">{item.email || '-'}</td>
                <td className="px-4 py-3 text-slate-700">{item.role === 'admin' ? '管理员' : '普通用户'}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {item.is_active ? '启用' : '禁用'}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-700">{formatTime(item.last_login_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => startEdit(item)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">编辑</button>
                    <button type="button" onClick={() => setResetUser(item)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">重置密码</button>
                    {item.is_active ? (
                      <button type="button" onClick={() => runUserAction(() => adminUsersService.disableUser(item.id))} className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50">禁用</button>
                    ) : (
                      <button type="button" onClick={() => runUserAction(() => adminUsersService.enableUser(item.id))} className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">启用</button>
                    )}
                    <button type="button" onClick={() => runUserAction(() => adminUsersService.deleteUser(item.id))} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50">删除</button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={7}>暂无用户</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal title={`编辑用户：${editing.username}`} onClose={() => setEditing(null)}>
          <form onSubmit={handleUpdate} className="space-y-3">
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="显示名" value={editForm.display_name || ''} onChange={(event) => setEditForm({ ...editForm, display_name: event.target.value })} />
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="邮箱" value={editForm.email || ''} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} />
            <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={editForm.role || 'user'} onChange={(event) => setEditForm({ ...editForm, role: event.target.value as UserRole })}>
              <option value="user">普通用户</option>
              <option value="admin">管理员</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={Boolean(editForm.is_active)} onChange={(event) => setEditForm({ ...editForm, is_active: event.target.checked })} />
              启用账号
            </label>
            <button disabled={saving} className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">保存</button>
          </form>
        </Modal>
      )}

      {resetUser && (
        <Modal title={`重置密码：${resetUser.username}`} onClose={() => setResetUser(null)}>
          <form onSubmit={handleResetPassword} className="space-y-3">
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="新密码，至少 4 位" type="password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} />
            <button disabled={saving || resetPassword.length < 4} className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">确认重置</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">关闭</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function formatTime(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}
