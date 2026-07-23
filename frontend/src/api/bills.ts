import { api } from './client';

export interface PresignedUrlResponse {
  upload_url: string;
  temp_s3_key: string;
}

export interface ParseDocumentResponse {
  temp_s3_key: string;
  extracted_data: Record<string, any>;
}

export const billsApi = {
  /**
   * 1. Request S3 Presigned Upload URL for Direct Raw Binary Upload (Zero Base64)
   */
  getTempUploadUrl: (orgId: string, payload: { file_name: string; mime_type: string }) =>
    api.post<PresignedUrlResponse>(`orgs/${orgId}/temp-upload-url`, payload),

  /**
   * 2. Send temp_s3_key to AI OCR Bedrock scanner (POST /orgs/:orgId/bills/parse)
   */
  parseBill: (orgId: string, payload: { temp_s3_key: string }) =>
    api.post<ParseDocumentResponse>(`orgs/${orgId}/bills/parse`, payload),

  /**
   * 3. Send temp_s3_key for Expense Receipt AI OCR Bedrock scanner (POST /orgs/:orgId/expenses/parse)
   */
  parseExpense: (orgId: string, payload: { temp_s3_key: string }) =>
    api.post<ParseDocumentResponse>(`orgs/${orgId}/expenses/parse`, payload),

  /**
   * 4. Finalize and Save Bill (Accounts Payable) record (POST /orgs/:orgId/bills)
   */
  createBill: (orgId: string, payload: Record<string, any>) =>
    api.post<Record<string, any>>(`orgs/${orgId}/bills`, payload),

  /**
   * 5. Finalize and Save Expense (Petty Cash/Receipt) record (POST /orgs/:orgId/expenses)
   */
  createExpense: (orgId: string, payload: Record<string, any>) =>
    api.post<Record<string, any>>(`orgs/${orgId}/expenses`, payload),
};
