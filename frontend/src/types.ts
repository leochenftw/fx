import { CognitoUser, CognitoUserPool } from 'amazon-cognito-identity-js';
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

export interface OrgListProps {
  orgs: Organisation[];
  loading: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
}

export interface OpeningBalanceItem {
  name: string;
  amount?: number;
}

export interface SidebarProps {
  onLogout: () => void;
}

export interface SetupOrgFormProps {
  onSubmit: (e: React.FormEvent) => void;
  orgName: string;
  setOrgName: (val: string) => void;
  entityType: string;
  setEntityType: (val: string) => void;
  irdNumber: string;
  setIrdNumber: (val: string) => void;
  gstRegistered: boolean;
  setGstRegistered: (val: boolean) => void;
  gstBasis: string;
  setGstBasis: (val: string) => void;
  gstPeriod: string;
  setGstPeriod: (val: string) => void;
  bankAccounts: BankAccount[];
  addBankAccount: () => void;
  updateBankAccount: (index: number, key: keyof BankAccount, val: any) => void;
  removeBankAccount: (index: number) => void;

  // AR Dynamic Props
  arItems: OpeningBalanceItem[];
  addArItem: () => void;
  updateArItem: (index: number, key: keyof OpeningBalanceItem, val: any) => void;
  removeArItem: (index: number) => void;

  // AP Dynamic Props
  apItems: OpeningBalanceItem[];
  addApItem: () => void;
  updateApItem: (index: number, key: keyof OpeningBalanceItem, val: any) => void;
  removeApItem: (index: number) => void;

  error: string | null;
  loading: boolean;
  isEdit?: boolean;
  orgId?: string;
}

export interface HeaderProps {
  statusText?: string;
  statusIcon?: string;
  showLogout?: boolean;
  onLogout?: () => void;
  isLoggedIn?: boolean;
}

export interface LoginFormProps {
  onSubmit: (e: React.FormEvent) => void;
  email: string;
  setEmail: (val: string) => void;
  password: string;
  setPassword: (val: string) => void;
  error: string | null;
  successMessage?: string | null;
  loading: boolean;
  onForgotPasswordClick: () => void;
}

export interface NewPasswordFormProps {
  onSubmit: (e: React.FormEvent) => void;
  newPassword: string;
  setNewPassword: (val: string) => void;
  error: string | null;
  loading: boolean;
}

export interface HomePageProps {
  orgs?: any[];
}

export interface LoginPageProps {
  userPool: CognitoUserPool;
  onLoginSuccess: () => void;
  onNewPasswordRequired: (user: CognitoUser) => void;
}

export interface BankOpeningDetail {
  balance: number;
  conversion_date: string;
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

export interface OrgEditPageProps {
  onEditSuccess: () => void;
}

export interface BankOpeningDetail {
  balance: number;
  conversion_date: string;
}

export interface OrgListPageProps {
  orgs: Organisation[];
  loading: boolean;
  onMount: () => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
}

export interface ResetPasswordPageProps {
  cognitoUserInstance: CognitoUser | null;
  onResetSuccess: () => void;
}

export interface SetupPageProps {
  onSetupSuccess: () => void;
}

export interface BankOpeningDetail {
  balance: number;
  conversion_date: string;
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