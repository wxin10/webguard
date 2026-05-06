import { api, unwrap } from './client';
import type { ApiResponse, DomainListItem, DomainListItemList } from '../types';

type DomainListType = 'trusted' | 'blocked' | 'temp_bypass';

interface MyDomainPayload {
  host: string;
  list_type: DomainListType;
  source?: string;
  reason?: string;
  expires_at?: string;
  minutes?: number;
}

export const domainsService = {
  getMyDomains: (params: { list_type?: string } = {}) =>
    unwrap(api.get<ApiResponse<DomainListItemList>>('/api/v1/my/domains', { params })),
  createMyDomain: (data: MyDomainPayload) =>
    unwrap(api.post<ApiResponse<DomainListItem>>('/api/v1/my/domains', data)),
  updateMyDomain: (id: number, data: Partial<DomainListItem>) =>
    unwrap(api.patch<ApiResponse<DomainListItem>>(`/api/v1/my/domains/${id}`, data)),
  deleteMyDomain: (id: number) =>
    unwrap(api.delete<ApiResponse<{ id: number }>>(`/api/v1/my/domains/${id}`)),
};
