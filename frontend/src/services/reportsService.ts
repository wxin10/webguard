import { api, unwrap } from './client';
import type { AnalysisReport, ApiResponse, ReportActionItem, ScanRecordList, ScanResult } from '../types';

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
