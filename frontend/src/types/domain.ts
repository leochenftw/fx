import type { CognitoUser, CognitoUserPool } from 'amazon-cognito-identity-js';

export interface BankOpeningDetail {
  balance: number;
  conversion_date: string;
}

export interface BankAccount {
  account_name: string;
  account_number: string;
  bank_name: string;
  balance?: number;
  conversion_date?: string;
}

export interface Organisation {
  id: string;
  name: string;
  ird_number: string;
  entity_type: string;
  gst_registered: boolean;
  gst_basis?: string;
  gst_period?: string;
  tax_year_end_month: number;
  bank_accounts: BankAccount[];
  role?: string;
  opening_balances?: {
    bank_balances?: Record<string, BankOpeningDetail>;
    ar_balances?: Record<string, number>;
    ap_balances?: Record<string, number>;
  };
}

export interface OpeningBalanceItem {
  name: string;
  amount?: number;
}

export interface OrganisationDetail {
  id: string;
  name: string;
  ird_number: string;
  entity_type: 'sole_trader' | 'company' | 'ltc' | 'trust' | 'partnership';
  gst_registered: boolean;
  gst_basis?: 'payments' | 'invoice';
  gst_period?: '1_month' | '2_months' | '6_months';
  created_at: string;
  role?: string;
  bank_accounts?: {
    account_name: string;
    account_number: string;
    bank_name: string;
  }[];
  opening_balances?: {
    bank_balances?: Record<string, BankOpeningDetail>;
    ar_balances?: Record<string, number>;
    ap_balances?: Record<string, number>;
  };
  staff?: {
    id: string;
    name: string;
    email: string;
    role: string;
  }[];
}

export interface ExecutionRecord {
  cycle: string;
  gross: number;
  paye: number;
  net: number;
  status: string;
}

export interface StaffDetails {
  id: string;
  name: string;
  email: string;
  position: string;
  employment_model: string;
  tax_code: string;
  ird_number: string;
  hourly_rate: number;
  bank_account: string;
  status: string;
  created_at: string;
  groups?: string[];
  organisations?: Organisation[];
  is_owner?: boolean;
  execution_history?: ExecutionRecord[];
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  position: string;
  employment_model: string;
  tax_code: string;
  ird_number: string;
  hourly_rate: number;
  bank_account: string;
  status: string;
  created_at: string;
  is_owner?: boolean;
  groups?: string[];
}

export interface AuthSessionUser {
  userPool: CognitoUserPool;
  onLoginSuccess: () => void;
  onNewPasswordRequired: (user: CognitoUser) => void;
}
