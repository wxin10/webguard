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
  ScanRecordItem,
  ScanRecordList,
  ScanResult,
  StatsOverview,
  TrendStats,
  UrlScanRequest,
  UserRole,
  WhitelistItem,
} from '../types';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
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
