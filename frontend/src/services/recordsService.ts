import { api, unwrap } from './client';
import type { ApiResponse, ScanRecordItem, ScanRecordList } from '../types';

export interface RecordQuery {
  label?: string;
  source?: string;
  q?: string;
  page?: number;
  page_size?: number;
}

export const recordsService = {
  getRecords: (params: RecordQuery = {}) =>
    unwrap(api.get<ApiResponse<ScanRecordList>>('/api/v1/records', { params })),
  getMyRecords: (params: RecordQuery = {}) =>
    unwrap(api.get<ApiResponse<ScanRecordList>>('/api/v1/records/me', { params })),
  getMine: (params: RecordQuery = {}) =>
    unwrap(api.get<ApiResponse<ScanRecordList>>('/api/v1/records/me', { params })),
  getRecordById: (id: number) =>
    unwrap(api.get<ApiResponse<ScanRecordItem>>(`/api/v1/records/${id}`)),
};
