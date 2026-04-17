import { api, unwrap } from './client';
import type {
  ApiResponse,
  BlacklistItem,
  DevelopmentUser,
  DomainList,
  ModelStatus,
  ModelVersionList,
  RuleConfig,
  RuleConfigList,
  RuleStatsList,
  UserRole,
  UserSiteStrategyItem,
  UserStrategyOverview,
  WhitelistItem,
} from '../types';

export const authApi = {
  mockLogin: (data: { username: string; role: UserRole }) =>
    unwrap(api.post<ApiResponse<DevelopmentUser>>('/api/v1/auth/mock-login', data)),
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

export const modelApi = {
  getModelStatus: () => unwrap(api.get<ApiResponse<ModelStatus>>('/api/v1/model/status')),
  getModelVersions: () =>
    unwrap(api.get<ApiResponse<ModelVersionList>>('/api/v1/model/versions')),
};
