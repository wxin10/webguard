import axios from 'axios';
import type { AxiosResponse } from 'axios';
import {
  AnalysisReport,
  ApiResponse,
  BlacklistItem,
  DevelopmentUser,
  DomainList,
  ModelStatus,
  ModelVersionList,
  PageScanRequest,
  RiskDistributionResponse,
  RuleConfig,
  RuleConfigList,
  RuleStatsList,
  ScanRecordItem,
  ScanRecordList,
  ScanResult,
  StatsOverview,
  TrendStats,
  UrlScanRequest,
  ReportActionItem,
  UserSiteStrategyItem,
  UserStrategyOverview,
  UserRole,
  WhitelistItem,
} from '../types';

const api = axios.create({
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

async function unwrap<T>(request: Promise<AxiosResponse<ApiResponse<T>>>): Promise<T> {
  const response = await request;
  if (response.data.code !== 0) {
    throw new Error(response.data.message || '请求失败');
  }
  return response.data.data;
}

export const authApi = {
  mockLogin: (data: { username: string; role: UserRole }) =>
    unwrap(api.post<ApiResponse<DevelopmentUser>>('/api/v1/auth/mock-login', data)),
};

export const scanApi = {
  scanUrl: (data: UrlScanRequest) =>
    unwrap(api.post<ApiResponse<ScanResult>>('/api/v1/scan/url', data)),
  scanPage: (data: PageScanRequest) =>
    unwrap(api.post<ApiResponse<ScanResult>>('/api/v1/scan/page', data)),
};

export const recordsApi = {
  getRecords: () => unwrap(api.get<ApiResponse<ScanRecordList>>('/api/v1/records')),
  getMyRecords: () => unwrap(api.get<ApiResponse<ScanRecordList>>('/api/v1/records/me')),
  getRecordById: (id: number) =>
    unwrap(api.get<ApiResponse<ScanRecordItem>>(`/api/v1/records/${id}`)),
};

export const reportsApi = {
  getReport: (id: number | string) =>
    unwrap(api.get<ApiResponse<AnalysisReport>>(`/api/v1/reports/${id}`)),
  getLatestReport: () =>
    unwrap(api.get<ApiResponse<AnalysisReport>>('/api/v1/reports/latest')),
  getRecentActions: () =>
    unwrap(api.get<ApiResponse<ReportActionItem[]>>('/api/v1/reports/actions/recent')),
  getDomainHistory: (id: number | string) =>
    unwrap(api.get<ApiResponse<ScanRecordList>>(`/api/v1/reports/${id}/domain-history`)),
  trustDomain: (id: number | string, data: { note?: string; scope?: 'user' | 'global' } = {}) =>
    unwrap(api.post<ApiResponse<ReportActionItem>>(`/api/v1/reports/${id}/trust-domain`, data)),
  blockDomain: (id: number | string, data: { note?: string; scope?: 'user' | 'global' } = {}) =>
    unwrap(api.post<ApiResponse<ReportActionItem>>(`/api/v1/reports/${id}/block-domain`, data)),
  markFalsePositive: (id: number | string, data: { note?: string; status?: string } = {}) =>
    unwrap(api.post<ApiResponse<ReportActionItem>>(`/api/v1/reports/${id}/mark-false-positive`, data)),
  review: (id: number | string, data: { note?: string; status?: string } = {}) =>
    unwrap(api.post<ApiResponse<ReportActionItem>>(`/api/v1/reports/${id}/review`, data)),
  recheck: (id: number | string, data: { note?: string } = {}) =>
    unwrap(api.post<ApiResponse<{ action: ReportActionItem; result: ScanResult }>>(`/api/v1/reports/${id}/recheck`, data)),
};

export const userStrategyApi = {
  getStrategies: () =>
    unwrap(api.get<ApiResponse<UserStrategyOverview>>('/api/v1/user/strategies')),
  addTrustedSite: (data: { domain: string; reason?: string; source?: string }) =>
    unwrap(api.post<ApiResponse<UserSiteStrategyItem>>('/api/v1/user/trusted-sites', data)),
  addBlockedSite: (data: { domain: string; reason?: string; source?: string }) =>
    unwrap(api.post<ApiResponse<UserSiteStrategyItem>>('/api/v1/user/blocked-sites', data)),
  pauseSite: (data: { domain: string; reason?: string; source?: string; minutes?: number }) =>
    unwrap(api.post<ApiResponse<UserSiteStrategyItem>>('/api/v1/user/site-actions/pause', data)),
  resumeSite: (data: { domain: string; reason?: string; source?: string }) =>
    unwrap(api.post<ApiResponse<{ domain: string; resumed: boolean }>>('/api/v1/user/site-actions/resume', data)),
  removeTrustedSite: (id: number) =>
    unwrap(api.delete<ApiResponse<void>>(`/api/v1/user/trusted-sites/${id}`)),
  removeBlockedSite: (id: number) =>
    unwrap(api.delete<ApiResponse<void>>(`/api/v1/user/blocked-sites/${id}`)),
};

export const whitelistApi = {
  getWhitelist: () =>
    unwrap(api.get<ApiResponse<DomainList<WhitelistItem>>>('/api/v1/whitelist')),
  addToWhitelist: (data: { domain: string; reason: string }) =>
    unwrap(api.post<ApiResponse<WhitelistItem>>('/api/v1/whitelist', data)),
  removeFromWhitelist: (id: number) => api.delete<ApiResponse<void>>(`/api/v1/whitelist/${id}`),
};

export const blacklistApi = {
  getBlacklist: () =>
    unwrap(api.get<ApiResponse<DomainList<BlacklistItem>>>('/api/v1/blacklist')),
  addToBlacklist: (data: { domain: string; reason: string; risk_type: string }) =>
    unwrap(api.post<ApiResponse<BlacklistItem>>('/api/v1/blacklist', data)),
  removeFromBlacklist: (id: number) => api.delete<ApiResponse<void>>(`/api/v1/blacklist/${id}`),
};

export const rulesApi = {
  getRules: () => unwrap(api.get<ApiResponse<RuleConfigList>>('/api/v1/rules')),
  getRuleStats: () => unwrap(api.get<ApiResponse<RuleStatsList>>('/api/v1/rules/stats')),
  updateRule: (id: number, data: Partial<RuleConfig>) =>
    unwrap(api.put<ApiResponse<RuleConfig>>(`/api/v1/rules/${id}`, data)),
};

export const modelApi = {
  getModelStatus: () => unwrap(api.get<ApiResponse<ModelStatus>>('/api/v1/model/status')),
  getModelVersions: () =>
    unwrap(api.get<ApiResponse<ModelVersionList>>('/api/v1/model/versions')),
};

export const statsApi = {
  getOverview: () => unwrap(api.get<ApiResponse<StatsOverview>>('/api/v1/stats/overview')),
  getTrend: () => unwrap(api.get<ApiResponse<TrendStats>>('/api/v1/stats/trend')),
  getRiskDistribution: () =>
    unwrap(api.get<ApiResponse<RiskDistributionResponse>>('/api/v1/stats/risk-distribution')),
};

export default api;
