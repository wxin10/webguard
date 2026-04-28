import axios from 'axios';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import type { ApiResponse, AuthTokenResponse, DevelopmentUser } from '../types';

export const AUTH_STORAGE_KEY = 'webguard_dev_user';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
export const ENABLE_DEV_TOKEN_STORAGE = import.meta.env.VITE_ENABLE_DEV_TOKEN_STORAGE === 'true';

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  _webguardRetry?: boolean;
}

let authSession: DevelopmentUser | null = readStoredAuthUser();

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

export function readStoredAuthUser(): DevelopmentUser | null {
  if (!ENABLE_DEV_TOKEN_STORAGE) return null;
  const rawUser = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!rawUser) return null;
  try {
    return JSON.parse(rawUser) as DevelopmentUser;
  } catch {
    return null;
  }
}

export function writeStoredAuthUser(user: DevelopmentUser | null): void {
  if (user && ENABLE_DEV_TOKEN_STORAGE) localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  else localStorage.removeItem(AUTH_STORAGE_KEY);
}

export function getAuthSession(): DevelopmentUser | null {
  return authSession;
}

export function setAuthSession(user: DevelopmentUser | null): void {
  authSession = user;
  writeStoredAuthUser(user);
}

api.interceptors.request.use((config) => {
  const user = getAuthSession();
  const headers = config.headers as unknown as Record<string, string>;
  if (!user) return config;
  if (user.access_token) {
    headers.Authorization = `Bearer ${user.access_token}`;
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
      if (!refreshData.user) {
        throw new Error('refresh response missing user');
      }
      const nextUser = {
        ...refreshData.user,
        access_token: refreshData.access_token,
        token_type: refreshData.token_type,
        expires_in: refreshData.expires_in,
      } as DevelopmentUser;
      setAuthSession(nextUser);
      const headers = originalRequest.headers as unknown as Record<string, string>;
      headers.Authorization = `Bearer ${refreshData.access_token}`;
      return api(originalRequest);
    } catch {
      setAuthSession(null);
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
