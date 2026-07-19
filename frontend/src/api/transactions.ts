import { api } from './client';

export interface CreateTransactionPayload {
  date: string; // YYYY-MM-DD
  vendor: string;
  description?: string;
  type: 'income' | 'expense';
  gross_amount: number; // Decimal dollar value (positive for income, negative for expense)
  gst_type?: 'input_tax' | 'output_tax' | 'zero_rated' | 'exempt' | 'non_taxable';
  category?: string;
  gst_amount?: number;
  receipt_s3_key?: string;
  source?: string;
  hash?: string;
  occur_idx?: number;
  force_insert?: boolean;
}

export const transactionApi = {
  /**
   * Post a single transaction record to the specified organisation.
   */
  create: (orgId: string, payload: CreateTransactionPayload) =>
    api.post<any>(`orgs/${orgId}/transactions`, payload),

  /**
   * Batch import multiple transactions in a single HTTP request.
   * The backend handles cloud-side dedup via hash + occur_idx conditional writes.
   */
  createBatch: (orgId: string, payload: CreateTransactionPayload[]) =>
    api.post<{ imported: number; skipped: number; errors: number; details: any[] }>(
      `orgs/${orgId}/transactions`,
      payload
    ),

  /**
   * Fetch transactions list for the specified organisation with optional filters.
   */
  list: (orgId: string, params?: { start_date?: string; end_date?: string; type?: 'income' | 'expense' }) => {
    let query = '';
    if (params) {
      const q = new URLSearchParams(params as any).toString();
      if (q) query = `?${q}`;
    }
    return api.get<{ transactions: any[] }>(`orgs/${orgId}/transactions${query}`);
  },

  /**
   * Fetch transactions globally across all organisations via table scan, paginated.
   */
  listGlobal: (params?: { limit?: number; exclusive_start_key?: string }) => {
    let query = '';
    if (params) {
      const q = new URLSearchParams(params as any).toString();
      if (q) query = `?${q}`;
    }
    return api.get<{ transactions: any[]; last_evaluated_key?: string }>(`transactions${query}`);
  },

  /**
   * Update a specific transaction details.
   */
  update: (orgId: string, date: string, txId: string, payload: Partial<CreateTransactionPayload>) =>
    api.put<any>(`orgs/${orgId}/transactions/${date}/${txId}`, payload),

  /**
   * Delete a specific transaction.
   */
  delete: (orgId: string, date: string, txId: string) =>
    api.delete<any>(`orgs/${orgId}/transactions/${date}/${txId}`)
};
