import axios from 'axios';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import type { ApiResponse, AuthTokenResponse, DevelopmentUser } from '../types';

export const AUTH_STORAGE_KEY = 'webguard_dev_user';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  _webguardRetry?: boolean;
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

export function readStoredAuthUser(): DevelopmentUser | null {
  const rawUser = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!rawUser) return null;
  try {
    return JSON.parse(rawUser) as DevelopmentUser;
  } catch {
    return null;
  }
}

export function writeStoredAuthUser(user: DevelopmentUser | null): void {
  if (user) localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  else localStorage.removeItem(AUTH_STORAGE_KEY);
}

api.interceptors.request.use((config) => {
  const user = readStoredAuthUser();
  const headers = config.headers as unknown as Record<string, string>;
  if (!user) return config;
  if (user.access_token) {
    headers.Authorization = `Bearer ${user.access_token}`;
  }
  if (user.username || user.role) {
    headers['X-WebGuard-User'] = user.username || 'platform-user';
    headers['X-WebGuard-Role'] = user.role || 'user';
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (!axios.isAxiosError<ApiResponse<unknown>>(error)) {
      return Promise.reject(error);
    }
    const originalRequest = error.config as RetriableRequestConfig | undefined;
    const requestUrl = originalRequest?.url || '';
    const isAuthEndpoint =
      requestUrl.includes('/api/v1/auth/login') ||
      requestUrl.includes('/api/v1/auth/mock-login') ||
      requestUrl.includes('/api/v1/auth/refresh') ||
      requestUrl.includes('/api/v1/auth/logout');

    if (error.response?.status !== 401 || !originalRequest || originalRequest._webguardRetry || isAuthEndpoint) {
      return Promise.reject(error);
    }

    originalRequest._webguardRetry = true;
    try {
      const refreshResponse = await axios.post<ApiResponse<AuthTokenResponse>>(
        `${API_BASE_URL}/api/v1/auth/refresh`,
        undefined,
        {
          withCredentials: true,
          headers: { 'Content-Type': 'application/json' },
        },
      );
      const refreshData = refreshResponse.data.data;
      if (refreshResponse.data.code !== 0 || !refreshData?.access_token) {
        throw new Error(refreshResponse.data.message || 'refresh failed');
      }
      const nextUser = {
        ...(refreshData.user || readStoredAuthUser() || { username: 'platform-user', role: 'user', display_name: 'platform-user' }),
        access_token: refreshData.access_token,
        token_type: refreshData.token_type,
        expires_in: refreshData.expires_in,
      } as DevelopmentUser;
      writeStoredAuthUser(nextUser);
      const headers = originalRequest.headers as unknown as Record<string, string>;
      headers.Authorization = `Bearer ${refreshData.access_token}`;
      return api(originalRequest);
    } catch {
      writeStoredAuthUser(null);
      return Promise.reject(error);
    }
  },
);

export async function unwrap<T>(request: Promise<AxiosResponse<ApiResponse<T>>>): Promise<T> {
  try {
    const response = await request;
    if (response.data.code !== 0) {
      throw new Error(response.data.message || '请求失败');
    }
    return response.data.data as T;
  } catch (error) {
    if (axios.isAxiosError<ApiResponse<unknown>>(error)) {
      const message = error.response?.data?.message || error.message || '网络请求失败';
      throw new Error(message);
    }
    if (error instanceof Error) throw error;
    throw new Error('网络请求失败');
  }
}

export default api;
