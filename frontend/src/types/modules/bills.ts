export type BillStatus = 'draft' | 'unpaid' | 'overdue' | 'paid';
export type ReceiptStatus = 'pending_review' | 'approved' | 'reimbursed' | 'rejected';
export type PaymentMethod = 'cash' | 'credit_card' | 'debit_card' | 'reimbursement';
export type BillsTabType = 'bills' | 'expenses';

export interface BillItem {
  id: string;
  org_id?: string;
  bill_number: string;
  vendor_name: string;
  issue_date: string;
  due_date: string;
  subtotal: number;
  gst_amount: number;
  total_amount: number;
  currency: string;
  status: BillStatus;
  category: string;
  description: string;
  attachment_url?: string;
  temp_s3_key?: string;
}

export interface ReceiptItem {
  id: string;
  org_id?: string;
  receipt_number?: string;
  merchant_name: string;
  purchase_date: string;
  payment_method: PaymentMethod;
  purchaser_name?: string;
  total_amount: number;
  gst_amount: number;
  currency: string;
  category: string;
  status: ReceiptStatus;
  notes?: string;
  image_url?: string;
  temp_s3_key?: string;
}

export interface BillsListTableProps {
  bills: BillItem[];
  searchQuery: string;
  statusFilter: string;
  onStatusChange?: (id: string, newStatus: BillStatus) => void;
}

export interface ReceiptsListTableProps {
  receipts: ReceiptItem[];
  searchQuery: string;
  statusFilter: string;
  onStatusChange?: (id: string, newStatus: ReceiptStatus) => void;
}

export interface CreateBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (newBill: Omit<BillItem, 'id'>) => void;
  categories?: string[];
  organisations?: Array<{ id: string; name: string }>;
}

export interface UploadExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (newExpense: Omit<ReceiptItem, 'id'>) => void;
  categories?: string[];
  staffMembers?: string[];
  organisations?: Array<{ id: string; name: string }>;
}
