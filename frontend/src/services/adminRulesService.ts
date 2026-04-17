import { api, unwrap } from './client';
import type { AdminRuleItem, AdminRuleList, ApiResponse } from '../types';

export const adminRulesService = {
  getRules: () => unwrap(api.get<ApiResponse<AdminRuleList>>('/api/v1/admin/rules')),
  createRule: (data: Partial<AdminRuleItem> & { name: string }) =>
    unwrap(api.post<ApiResponse<AdminRuleItem>>('/api/v1/admin/rules', data)),
  updateRule: (id: number, data: Partial<AdminRuleItem>) =>
    unwrap(api.patch<ApiResponse<AdminRuleItem>>(`/api/v1/admin/rules/${id}`, data)),
  deleteRule: (id: number) =>
    unwrap(api.delete<ApiResponse<{ id: number }>>(`/api/v1/admin/rules/${id}`)),
};
