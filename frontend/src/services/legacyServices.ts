import { api, unwrap } from './client';
import type {
  ApiResponse,
  AIStatus,
  AIConfig,
  AIConfigTestRequest,
  AIConfigTestResponse,
  AIConfigUpdateRequest,
  AITestRequest,
  AITestResponse,
  AuthTokenResponse,
  DevelopmentUser,
  LoginRequest,
  RegisterRequest,
} from '../types';

export const authApi = {
  login: (data: LoginRequest) =>
    unwrap(api.post<ApiResponse<AuthTokenResponse>>('/api/v1/auth/login', data)),
  refresh: () => unwrap(api.post<ApiResponse<AuthTokenResponse>>('/api/v1/auth/refresh')),
  logout: () => unwrap(api.post<ApiResponse<{ logged_out: boolean }>>('/api/v1/auth/logout')),
  me: () => unwrap(api.get<ApiResponse<DevelopmentUser>>('/api/v1/auth/me')),
  register: (data: RegisterRequest) =>
    unwrap(api.post<ApiResponse<DevelopmentUser>>('/api/v1/auth/register', data)),
};

export const aiApi = {
  getStatus: () => unwrap(api.get<ApiResponse<AIStatus>>('/api/v1/ai/status')),
  testDeepSeek: (data: AITestRequest) =>
    unwrap(api.post<ApiResponse<AITestResponse>>('/api/v1/ai/test', data)),
  getConfig: () => unwrap(api.get<ApiResponse<AIConfig>>('/api/v1/ai/config')),
  updateConfig: (data: AIConfigUpdateRequest) =>
    unwrap(api.put<ApiResponse<AIConfig>>('/api/v1/ai/config', data)),
  clearKey: () => unwrap(api.delete<ApiResponse<AIConfig>>('/api/v1/ai/config/key')),
  testConfig: (data?: AIConfigTestRequest) =>
    unwrap(api.post<ApiResponse<AIConfigTestResponse>>('/api/v1/ai/config/test', data ?? {})),
};
