import axios from 'axios';
import type { AxiosResponse } from 'axios';
import {
  AdminPluginConfig,
  AdminRuleItem,
  AdminRuleList,
  AnalysisReport,
  ApiResponse,
  BlacklistItem,
  DevelopmentUser,
  DomainList,
  DomainListItem,
  DomainListItemList,
  FeedbackCaseList,
  FeedbackTrend,
  ModelStatus,
  ModelVersionList,
  PageScanRequest,
  PluginBootstrap,
  PluginEventStats,
  PluginPolicyBundle,
  PluginSyncEventList,
  RiskDistributionResponse,
  RuleConfig,
  RuleConfigList,
  RuleStatsList,
  ScanRecordItem,
  ScanRecordList,
  ScanResult,
  SourceDistributionResponse,
  StatsOverview,
  TrendStats,
  UrlScanRequest,
  ReportActionItem,
  UserPolicy,
  UserRole,
  UserSiteStrategyItem,
  UserStrategyOverview,
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
  if (response.data.success === false || response.data.code !== 0) {
    throw new Error(response.data.message || 'Request failed');
  }
  return response.data.data;
}

export const authApi = {
  mockLogin: (data: { username: string; role: UserRole }) =>
    unwrap(api.post<ApiResponse<DevelopmentUser>>('/api/v1/auth/mock-login', data)),
};

export const scanService = {
  scanUrl: (data: UrlScanRequest) =>
    unwrap(api.post<ApiResponse<ScanResult>>('/api/v1/scan/url', data)),
  scanPage: (data: PageScanRequest) =>
    unwrap(api.post<ApiResponse<ScanResult>>('/api/v1/scan/page', data)),
};
export const scanApi = scanService;

export const recordsService = {
  getRecords: (params: { label?: string; source?: string; q?: string } = {}) =>
    unwrap(api.get<ApiResponse<ScanRecordList>>('/api/v1/records', { params })),
  getMyRecords: (params: { label?: string; source?: string; q?: string } = {}) =>
    unwrap(api.get<ApiResponse<ScanRecordList>>('/api/v1/records/me', { params })),
  getMine: (params: { label?: string; source?: string; q?: string } = {}) =>
    unwrap(api.get<ApiResponse<ScanRecordList>>('/api/v1/records/me', { params })),
  getRecordById: (id: number) =>
    unwrap(api.get<ApiResponse<ScanRecordItem>>(`/api/v1/records/${id}`)),
};
export const recordsApi = recordsService;

export const reportsService = {
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
export const reportsApi = reportsService;

export const domainsService = {
  getMyDomains: (params: { list_type?: string } = {}) =>
    unwrap(api.get<ApiResponse<DomainListItemList>>('/api/v1/my/domains', { params })),
  createMyDomain: (data: {
    host: string;
    list_type: 'trusted' | 'blocked' | 'temp_bypass';
    source?: string;
    reason?: string;
    expires_at?: string;
    minutes?: number;
  }) => unwrap(api.post<ApiResponse<DomainListItem>>('/api/v1/my/domains', data)),
  updateMyDomain: (id: number, data: Partial<DomainListItem>) =>
    unwrap(api.patch<ApiResponse<DomainListItem>>(`/api/v1/my/domains/${id}`, data)),
  deleteMyDomain: (id: number) =>
    unwrap(api.delete<ApiResponse<{ id: number }>>(`/api/v1/my/domains/${id}`)),
};

export const policyService = {
  getMyPolicy: () => unwrap(api.get<ApiResponse<UserPolicy>>('/api/v1/my/policy')),
  updateMyPolicy: (data: Partial<UserPolicy>) =>
    unwrap(api.patch<ApiResponse<UserPolicy>>('/api/v1/my/policy', data)),
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

export const pluginService = {
  getPolicy: () =>
    unwrap(api.get<ApiResponse<PluginPolicyBundle>>('/api/v1/plugin/policy')),
  getBootstrap: () =>
    unwrap(api.get<ApiResponse<PluginBootstrap>>('/api/v1/plugin/bootstrap')),
  getEvents: (params: { event_type?: string; risk_label?: string } = {}) =>
    unwrap(api.get<ApiResponse<PluginSyncEventList>>('/api/v1/plugin/events', { params })),
  getMyEvents: (params: { event_type?: string; risk_level?: string } = {}) =>
    unwrap(api.get<ApiResponse<PluginSyncEventList>>('/api/v1/my/plugin-events', { params })),
  getStats: () =>
    unwrap(api.get<ApiResponse<PluginEventStats>>('/api/v1/plugin/stats')),
  recordEvent: (data: {
    event_type: string;
    action?: string;
    url?: string;
    host?: string;
    domain?: string;
    risk_level?: string;
    risk_label?: string;
    risk_score?: number;
    summary?: string;
    scan_record_id?: number;
    plugin_version?: string;
    payload?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }) => unwrap(api.post<ApiResponse<unknown>>('/api/v1/plugin/events', data)),
  getFeedbackCases: (params: { status?: string } = {}) =>
    unwrap(api.get<ApiResponse<FeedbackCaseList>>('/api/v1/plugin/feedback-cases', { params })),
  updateFeedbackCase: (id: number, data: { status: string; comment?: string }) =>
    unwrap(api.put<ApiResponse<unknown>>(`/api/v1/plugin/feedback-cases/${id}`, data)),
};
export const pluginApi = pluginService;

export const feedbackService = {
  createFeedback: (data: {
    url?: string;
    related_report_id?: number;
    report_id?: number;
    related_event_id?: number;
    feedback_type?: 'false_positive' | 'false_negative' | 'other';
    content?: string;
    source?: string;
  }) => unwrap(api.post<ApiResponse<unknown>>('/api/v1/feedback', data)),
  getMyFeedback: (params: { status?: string } = {}) =>
    unwrap(api.get<ApiResponse<FeedbackCaseList>>('/api/v1/my/feedback', { params })),
};

export const whitelistApi = {
  getWhitelist: () =>
    unwrap(api.get<ApiResponse<DomainList<WhitelistItem>>>('/api/v1/whitelist')),
  addToWhitelist: (data: { domain: string; reason?: string; source?: string; status?: string }) =>
    unwrap(api.post<ApiResponse<WhitelistItem>>('/api/v1/whitelist', data)),
  removeFromWhitelist: (id: number) => api.delete<ApiResponse<void>>(`/api/v1/whitelist/${id}`),
};

export const blacklistApi = {
  getBlacklist: () =>
    unwrap(api.get<ApiResponse<DomainList<BlacklistItem>>>('/api/v1/blacklist')),
  addToBlacklist: (data: { domain: string; reason?: string; risk_type?: string; source?: string; status?: string }) =>
    unwrap(api.post<ApiResponse<BlacklistItem>>('/api/v1/blacklist', data)),
  removeFromBlacklist: (id: number) => api.delete<ApiResponse<void>>(`/api/v1/blacklist/${id}`),
};

export const rulesApi = {
  getRules: () => unwrap(api.get<ApiResponse<RuleConfigList>>('/api/v1/rules')),
  getRuleStats: () => unwrap(api.get<ApiResponse<RuleStatsList>>('/api/v1/rules/stats')),
  updateRule: (id: number, data: Partial<RuleConfig>) =>
    unwrap(api.put<ApiResponse<RuleConfig>>(`/api/v1/rules/${id}`, data)),
};

export const adminRulesService = {
  getRules: () => unwrap(api.get<ApiResponse<AdminRuleList>>('/api/v1/admin/rules')),
  createRule: (data: Partial<AdminRuleItem> & { name: string }) =>
    unwrap(api.post<ApiResponse<AdminRuleItem>>('/api/v1/admin/rules', data)),
  updateRule: (id: number, data: Partial<AdminRuleItem>) =>
    unwrap(api.patch<ApiResponse<AdminRuleItem>>(`/api/v1/admin/rules/${id}`, data)),
  deleteRule: (id: number) =>
    unwrap(api.delete<ApiResponse<{ id: number }>>(`/api/v1/admin/rules/${id}`)),
};

export const adminDomainsService = {
  getDomains: (params: { list_type?: string } = {}) =>
    unwrap(api.get<ApiResponse<DomainListItemList>>('/api/v1/admin/domains', { params })),
  createDomain: (data: { host: string; list_type: 'trusted' | 'blocked'; source?: string; reason?: string; status?: string }) =>
    unwrap(api.post<ApiResponse<DomainListItem>>('/api/v1/admin/domains', data)),
  updateDomain: (id: number, data: Partial<DomainListItem>) =>
    unwrap(api.patch<ApiResponse<DomainListItem>>(`/api/v1/admin/domains/${id}`, data)),
  deleteDomain: (id: number) =>
    unwrap(api.delete<ApiResponse<{ id: number }>>(`/api/v1/admin/domains/${id}`)),
};

export const adminPluginService = {
  getConfig: () => unwrap(api.get<ApiResponse<AdminPluginConfig>>('/api/v1/admin/plugin/config')),
  updateConfig: (data: Partial<AdminPluginConfig['config']>) =>
    unwrap(api.patch<ApiResponse<AdminPluginConfig['config']>>('/api/v1/admin/plugin/config', data)),
};

export const adminFeedbackService = {
  getFeedback: (params: { status?: string } = {}) =>
    unwrap(api.get<ApiResponse<FeedbackCaseList>>('/api/v1/admin/feedback', { params })),
  updateFeedback: (id: number, data: { status: string; comment?: string }) =>
    unwrap(api.patch<ApiResponse<unknown>>(`/api/v1/admin/feedback/${id}`, data)),
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
  getSourceDistribution: () =>
    unwrap(api.get<ApiResponse<SourceDistributionResponse>>('/api/v1/stats/source-distribution')),
  getFeedbackTrend: () =>
    unwrap(api.get<ApiResponse<FeedbackTrend>>('/api/v1/stats/feedback-trend')),
};
export const adminStatsService = statsApi;

export default api;
