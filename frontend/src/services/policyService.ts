import { api, unwrap } from './client';
import type { ApiResponse, UserPolicy } from '../types';

export const policyService = {
  getMyPolicy: () => unwrap(api.get<ApiResponse<UserPolicy>>('/api/v1/my/policy')),
  updateMyPolicy: (data: Partial<UserPolicy>) =>
    unwrap(api.patch<ApiResponse<UserPolicy>>('/api/v1/my/policy', data)),
};
