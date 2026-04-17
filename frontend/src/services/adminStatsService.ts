import { api, unwrap } from './client';
import type {
  ApiResponse,
  FeedbackTrend,
  RiskDistributionResponse,
  SourceDistributionResponse,
  StatsOverview,
  TrendStats,
} from '../types';

export const adminStatsService = {
  getOverview: () => unwrap(api.get<ApiResponse<StatsOverview>>('/api/v1/stats/overview')),
  getTrend: () => unwrap(api.get<ApiResponse<TrendStats>>('/api/v1/stats/trend')),
  getRiskDistribution: () =>
    unwrap(api.get<ApiResponse<RiskDistributionResponse>>('/api/v1/stats/risk-distribution')),
  getSourceDistribution: () =>
    unwrap(api.get<ApiResponse<SourceDistributionResponse>>('/api/v1/stats/source-distribution')),
  getFeedbackTrend: () =>
    unwrap(api.get<ApiResponse<FeedbackTrend>>('/api/v1/stats/feedback-trend')),
};
