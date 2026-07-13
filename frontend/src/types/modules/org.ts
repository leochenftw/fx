import type { FormEvent } from 'react';
import type { BankAccount, OpeningBalanceItem, Organisation } from '../domain';

export interface OrgListProps {
  orgs: Organisation[];
  loading: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
}

export interface OrgFormProps {
  onSubmit: (e: FormEvent) => void;
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
  arItems: OpeningBalanceItem[];
  addArItem: () => void;
  updateArItem: (index: number, key: keyof OpeningBalanceItem, val: any) => void;
  removeArItem: (index: number) => void;
  apItems: OpeningBalanceItem[];
  addApItem: () => void;
  updateApItem: (index: number, key: keyof OpeningBalanceItem, val: any) => void;
  removeApItem: (index: number) => void;
  error: string | null;
  loading: boolean;
  isEdit?: boolean;
  orgId?: string;
  nzbn?: string;
  setNzbn?: (val: string) => void;
  address?: string;
  setAddress?: (val: string) => void;
  payrollCycle?: 'weekly' | 'fortnightly' | 'monthly';
  setPayrollCycle?: (val: 'weekly' | 'fortnightly' | 'monthly') => void;
}

export interface HomePageProps {
  orgs?: any[];
}

export interface OrgEditPageProps {
  onEditSuccess: () => void;
}

export interface OrgListPageProps {
  orgs: Organisation[];
  loading: boolean;
  onMount: () => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
}

export interface SetupPageProps {
  onSetupSuccess: () => void;
}
