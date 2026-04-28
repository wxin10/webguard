import { api, unwrap } from './client';
import type {
  AdminRuleCreateRequest,
  AdminRuleItem,
  AdminRuleList,
  AdminRulePatchRequest,
  AdminRuleTestRequest,
  AdminRuleTestResponse,
  ApiResponse,
} from '../types';

export const adminRulesService = {
  getRules: () => unwrap(api.get<ApiResponse<AdminRuleList>>('/api/v1/admin/rules')),
  createRule: (data: AdminRuleCreateRequest) =>
    unwrap(api.post<ApiResponse<AdminRuleItem>>('/api/v1/admin/rules', data)),
  updateRule: (id: number, data: AdminRulePatchRequest) =>
    unwrap(api.patch<ApiResponse<AdminRuleItem>>(`/api/v1/admin/rules/${id}`, data)),
  deleteRule: (id: number) =>
    unwrap(api.delete<ApiResponse<{ id: number }>>(`/api/v1/admin/rules/${id}`)),
  testRule: (data: AdminRuleTestRequest) =>
    unwrap(api.post<ApiResponse<AdminRuleTestResponse>>('/api/v1/admin/rules/test', data)),
};
