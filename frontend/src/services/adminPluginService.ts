import { api, unwrap } from './client';
import type { AdminPluginConfig, ApiResponse } from '../types';

export const adminPluginService = {
  getConfig: () => unwrap(api.get<ApiResponse<AdminPluginConfig>>('/api/v1/admin/plugin/config')),
  updateConfig: (data: Partial<AdminPluginConfig['config']>) =>
    unwrap(api.patch<ApiResponse<AdminPluginConfig['config']>>('/api/v1/admin/plugin/config', data)),
};
