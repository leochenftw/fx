import { api } from './client';

export interface StaffListResponse {
  staff?: Array<{
    id: string;
    name: string;
    email: string;
    role?: string;
    status?: string;
    position?: string;
    employment_model?: string;
    [key: string]: unknown;
  }>;
}

export interface StaffDetailResponse {
  id: string;
  name: string;
  email: string;
  position?: string;
  employment_model?: string;
  tax_code?: string;
  ird_number?: string;
  hourly_rate?: number;
  bank_account?: string;
  status?: string;
  groups?: string[];
  organisations?: Array<{ id: string; name?: string }>;
}

export const staffApi = {
  list: () => api.get<StaffListResponse>('staff'),
  get: (staffId: string) => api.get<StaffDetailResponse>(`staff/${staffId}`),
  create: (payload: unknown) => api.post<unknown>('staff', payload),
  update: (staffId: string, payload: unknown) => api.put<unknown>(`staff/${staffId}`, payload),
  delete: (staffId: string) => api.del<unknown>(`staff/${staffId}`),
  assignOrg: (staffId: string, payload: unknown) => api.post<unknown>(`staff/${staffId}/orgs`, payload),
  unassignOrg: (staffId: string, orgId: string) => api.del<unknown>(`staff/${staffId}/orgs/${orgId}`),
};
