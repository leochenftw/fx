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
  entity_type: 'sole_trader' | 'company' | 'ltc' | 'trust' | 'partnership';
  gst_registered: boolean;
  gst_basis?: 'payments' | 'invoice';
  gst_period?: '1_month' | '2_months' | '6_months';
  role?: string;
  created_at: string;
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
  nzbn?: string;
  address?: string;
  payroll_cycle?: 'weekly' | 'fortnightly' | 'monthly';
  categories?: string[];
  static_rules?: Array<{ pattern: string; category: string }>;
  tax_year_end_month?: number;
}

export const orgApi = {
  bootstrap: () => api.get<BootstrapResponse>('bootstrap'),
  bootstrapComplete: () => api.post<unknown>('bootstrap'),
  list: (lastKey?: string | null) => api.get<OrgListResponse>(lastKey ? `orgs?lastKey=${lastKey}` : 'orgs'),
  get: (orgId: string) => api.get<OrgDetailResponse>(`orgs/${orgId}`),
  create: (payload: unknown) => api.post<unknown>('orgs', payload),
  update: (orgId: string, payload: unknown) => api.put<unknown>(`orgs/${orgId}`, payload),
  getGstConfig: () => api.get<any>('config/gst'),
  saveGstConfig: (payload: any) => api.put<unknown>('config/gst', payload),
  getMappings: () => api.get<any[]>('config/mappings'),
  saveMapping: (bankName: string, cardType: string, payload: any) =>
    api.put<unknown>(`config/mappings/${encodeURIComponent(bankName)}/${encodeURIComponent(cardType)}`, payload),
  getWorkflowConfig: () => api.get<{ categories: string[]; static_rules: Array<{ pattern: string; category: string }> }>('config/workflow'),
  saveWorkflowConfig: (payload: { categories: string[]; static_rules: Array<{ pattern: string; category: string }> }) =>
    api.put<unknown>('config/workflow', payload),
};
