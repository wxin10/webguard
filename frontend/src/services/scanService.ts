import { api, unwrap } from './client';
import type { ApiResponse, PageScanRequest, ScanResult, UrlScanRequest } from '../types';

export const scanService = {
  scanUrl: (data: UrlScanRequest) =>
    unwrap(api.post<ApiResponse<ScanResult>>('/api/v1/scan/url', data)),
  scanPage: (data: PageScanRequest) =>
    unwrap(api.post<ApiResponse<ScanResult>>('/api/v1/scan/page', data)),
};

export type ScanService = typeof scanService;
