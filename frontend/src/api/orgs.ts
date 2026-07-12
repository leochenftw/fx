import { api } from './client';

export interface BootstrapResponse {
  genesis_done: boolean;
  config?: {
    gst_rate?: number;
  };
}

export interface OrgListResponse {
  orgs?: Array<{
    id: string;
    name: string;
    role?: string;
    [key: string]: unknown;
  }>;
  lastKey?: string | null;
}

export interface OrgDetailResponse {
  id: string;
  name: string;
  ird_number: string;
  entity_type: string;
  gst_registered: boolean;
  gst_basis?: string;
  gst_period?: string;
  role?: string;
  bank_accounts?: Array<{
    account_name: string;
    account_number: string;
    bank_name: string;
  }>;
  opening_balances?: {
    bank_balances?: Record<string, { balance: number; conversion_date: string }>;
    ar_balances?: Record<string, number>;
    ap_balances?: Record<string, number>;
  };
}

export const orgApi = {
  bootstrap: () => api.get<BootstrapResponse>('bootstrap'),
  bootstrapComplete: () => api.post<unknown>('bootstrap'),
  list: (lastKey?: string | null) => api.get<OrgListResponse>(lastKey ? `orgs?lastKey=${lastKey}` : 'orgs'),
  get: (orgId: string) => api.get<OrgDetailResponse>(`orgs/${orgId}`),
  create: (payload: unknown) => api.post<unknown>('orgs', payload),
  update: (orgId: string, payload: unknown) => api.put<unknown>(`orgs/${orgId}`, payload),
};
