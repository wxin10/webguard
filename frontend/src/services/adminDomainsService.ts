import { api, unwrap } from './client';
import type { ApiResponse, DomainListItem, DomainListItemList } from '../types';

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
