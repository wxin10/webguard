import axios from 'axios';
import type { AxiosResponse } from 'axios';
import type { ApiResponse, DevelopmentUser } from '../types';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const rawUser = localStorage.getItem('webguard_dev_user');
  const headers = config.headers as unknown as Record<string, string>;
  if (!rawUser) return config;
  try {
    const user = JSON.parse(rawUser) as DevelopmentUser;
    headers['X-WebGuard-User'] = user.username || 'platform-user';
    headers['X-WebGuard-Role'] = user.role || 'user';
  } catch {
    headers['X-WebGuard-User'] = 'platform-user';
    headers['X-WebGuard-Role'] = 'user';
  }
  return config;
});

export async function unwrap<T>(request: Promise<AxiosResponse<ApiResponse<T>>>): Promise<T> {
  try {
    const response = await request;
    if (response.data.success === false || response.data.code !== 0) {
      throw new Error(response.data.message || '请求失败');
    }
    return response.data.data;
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error('网络请求失败');
  }
}

export default api;
