import { api, unwrap } from './client';
import type {
  AdminUserCreateRequest,
  AdminUserItem,
  AdminUserList,
  AdminUserPatchRequest,
  ApiResponse,
} from '../types';

export const adminUsersService = {
  getUsers: (params: { keyword?: string; role?: string; is_active?: boolean } = {}) =>
    unwrap(api.get<ApiResponse<AdminUserList>>('/api/v1/admin/users', { params })),
  createUser: (data: AdminUserCreateRequest) =>
    unwrap(api.post<ApiResponse<AdminUserItem>>('/api/v1/admin/users', data)),
  updateUser: (id: number, data: AdminUserPatchRequest) =>
    unwrap(api.patch<ApiResponse<AdminUserItem>>(`/api/v1/admin/users/${id}`, data)),
  resetPassword: (id: number, password: string) =>
    unwrap(api.post<ApiResponse<AdminUserItem>>(`/api/v1/admin/users/${id}/reset-password`, { password })),
  disableUser: (id: number) =>
    unwrap(api.post<ApiResponse<AdminUserItem>>(`/api/v1/admin/users/${id}/disable`)),
  enableUser: (id: number) =>
    unwrap(api.post<ApiResponse<AdminUserItem>>(`/api/v1/admin/users/${id}/enable`)),
  deleteUser: (id: number) =>
    unwrap(api.delete<ApiResponse<AdminUserItem>>(`/api/v1/admin/users/${id}`)),
};
