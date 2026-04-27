import { api, unwrap } from './client';
import type {
  ApiResponse,
  FeedbackCaseList,
  PluginBootstrap,
  PluginBindingChallenge,
  PluginBindingConfirmResponse,
  PluginEventStats,
  PluginInstanceList,
  PluginPolicyBundle,
  PluginSyncEventList,
} from '../types';

export interface PluginEventPayload {
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
}

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
  getBindingChallenge: (challengeId: string) =>
    unwrap(api.get<ApiResponse<PluginBindingChallenge>>(`/api/v1/plugin/binding-challenges/${challengeId}`)),
  confirmBindingChallenge: (challengeId: string, data: { binding_code: string; display_name?: string }) =>
    unwrap(api.post<ApiResponse<PluginBindingConfirmResponse>>(`/api/v1/plugin/binding-challenges/${challengeId}/confirm`, data)),
  getInstances: () =>
    unwrap(api.get<ApiResponse<PluginInstanceList>>('/api/v1/plugin/instances')),
  revokeInstance: (pluginInstanceId: string) =>
    unwrap(api.delete<ApiResponse<unknown>>(`/api/v1/plugin/instances/${pluginInstanceId}`)),
  recordEvent: (data: PluginEventPayload) =>
    unwrap(api.post<ApiResponse<unknown>>('/api/v1/plugin/events', data)),
  getFeedbackCases: (params: { status?: string } = {}) =>
    unwrap(api.get<ApiResponse<FeedbackCaseList>>('/api/v1/plugin/feedback-cases', { params })),
  updateFeedbackCase: (id: number, data: { status: string; comment?: string }) =>
    unwrap(api.put<ApiResponse<unknown>>(`/api/v1/plugin/feedback-cases/${id}`, data)),
};
