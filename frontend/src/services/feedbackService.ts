import { api, unwrap } from './client';
import type { ApiResponse, FeedbackCaseList } from '../types';

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
