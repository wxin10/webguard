import { api, unwrap } from './client';
import type { ApiResponse, FeedbackCaseList } from '../types';

export const adminFeedbackService = {
  getFeedback: (params: { status?: string } = {}) =>
    unwrap(api.get<ApiResponse<FeedbackCaseList>>('/api/v1/admin/feedback', { params })),
  updateFeedback: (id: number, data: { status: string; comment?: string }) =>
    unwrap(api.patch<ApiResponse<unknown>>(`/api/v1/admin/feedback/${id}`, data)),
};
