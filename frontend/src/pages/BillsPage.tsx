import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { billsApi } from '../api/bills';
import mockData from '../data/dummyBillsData.json';
import { BillsListTable } from '../components/BillsListTable';
import { ReceiptsListTable } from '../components/ReceiptsListTable';
import { CreateBillModal } from '../components/CreateBillModal';
import { UploadExpenseModal } from '../components/UploadExpenseModal';
import type { BillItem, ReceiptItem, BillsTabType, BillStatus, ReceiptStatus, Organisation } from '../types';

interface BillsPageProps {
  orgs?: Organisation[];
}

export const BillsPage: React.FC<BillsPageProps> = ({ orgs = [] }) => {
  const { t } = useTranslation();

  // Format real cloud organisations for modal dropdowns
  const formattedOrgs = orgs.map(o => ({
    id: o.id,
    name: o.name,
  }));

  // Tab State
  const [activeTab, setActiveTab] = useState<BillsTabType>('bills');

  // Modal States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Interactive Mock Data State
  const [billsData, setBillsData] = useState<BillItem[]>(mockData.bills as BillItem[]);
  const [receiptsData, setReceiptsData] = useState<ReceiptItem[]>(mockData.expenses as ReceiptItem[]);

  // Status Handler for Bills
  const handleBillStatusChange = (id: string, newStatus: BillStatus) => {
    setBillsData(prev =>
      prev.map(item => (item.id === id ? { ...item, status: newStatus } : item))
    );
  };

  // Status Handler for Receipts (Expenses)
  const handleReceiptStatusChange = (id: string, newStatus: ReceiptStatus) => {
    setReceiptsData(prev =>
      prev.map(item => (item.id === id ? { ...item, status: newStatus } : item))
    );
  };

  // Create New Bill Submission Handler (Connected to AWS Backend API)
  const handleCreateBillSubmit = async (newBillData: Omit<BillItem, 'id'>) => {
    const targetOrgId = newBillData.org_id || formattedOrgs[0]?.id;
    if (!targetOrgId) {
      console.warn('No target organisation selected for bill creation.');
      return;
    }

    try {
      const savedBill = await billsApi.createBill(targetOrgId, newBillData);
      const createdItem = (savedBill as unknown as BillItem) || {
        id: `bill-${Date.now().toString().slice(-6)}`,
        ...newBillData,
      };
      setBillsData(prev => [createdItem, ...prev]);
    } catch (err) {
      console.error('Failed to save bill to backend DynamoDB API:', err);
      // Fallback local update
      const fallbackItem: BillItem = {
        id: `bill-${Date.now().toString().slice(-6)}`,
        ...newBillData,
      };
      setBillsData(prev => [fallbackItem, ...prev]);
    }
  };

  // Create New Expense Submission Handler (Connected to AWS Backend API)
  const handleCreateExpenseSubmit = async (newExpenseData: Omit<ReceiptItem, 'id'>) => {
    const targetOrgId = newExpenseData.org_id || formattedOrgs[0]?.id;
    if (!targetOrgId) {
      console.warn('No target organisation selected for expense creation.');
      return;
    }

    try {
      const savedExpense = await billsApi.createExpense(targetOrgId, newExpenseData);
      const createdItem = (savedExpense as unknown as ReceiptItem) || {
        id: `rcp-${Date.now().toString().slice(-6)}`,
        ...newExpenseData,
      };
      setReceiptsData(prev => [createdItem, ...prev]);
    } catch (err) {
      console.error('Failed to save expense to backend DynamoDB API:', err);
      // Fallback local update
      const fallbackItem: ReceiptItem = {
        id: `rcp-${Date.now().toString().slice(-6)}`,
        ...newExpenseData,
      };
      setReceiptsData(prev => [fallbackItem, ...prev]);
    }
  };

  // Reset status filter when switching tabs
  const handleTabSwitch = (tab: BillsTabType) => {
    setActiveTab(tab);
    setStatusFilter('all');
  };

  return (
    <div className="space-y-6 w-full max-w-[1280px]">
      {/* Title & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-5 gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            {t('sidebar.bills', 'Bills & Expenses')}
          </h1>
          <p className="text-xs text-slate-400 mt-1 font-semibold">
            {activeTab === 'bills'
              ? 'Manage accounts payable, vendor invoices, and payment schedules.'
              : 'Track petty cash vouchers, staff reimbursements, and instant receipts.'}
          </p>
        </div>

        {/* Create/Upload Button */}
        <div className="flex items-center gap-3">
          {activeTab === 'bills' ? (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold px-4 py-2.5 rounded-xl shadow-sm transition flex items-center gap-2 cursor-pointer"
            >
              <span className="material-icons text-base">add</span>
              <span>+ Create Bill</span>
            </button>
          ) : (
            <button
              onClick={() => setIsExpenseModalOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold px-4 py-2.5 rounded-xl shadow-sm transition flex items-center gap-2 cursor-pointer"
            >
              <span className="material-icons text-base">cloud_upload</span>
              <span>+ Upload Expense</span>
            </button>
          )}
        </div>
      </div>

      {/* Navigation Toolbar (Tabs + Filter Bar) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          {/* Left: Tab Switcher (Bills vs Expenses) */}
          <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
            <button
              onClick={() => handleTabSwitch('bills')}
              className={`px-5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition flex items-center gap-2 cursor-pointer ${
                activeTab === 'bills'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span className="material-icons text-base">receipt_long</span>
              <span>Bills</span>
              <span
                className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                  activeTab === 'bills'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {billsData.length}
              </span>
            </button>

            <button
              onClick={() => handleTabSwitch('expenses')}
              className={`px-5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition flex items-center gap-2 cursor-pointer ${
                activeTab === 'expenses'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span className="material-icons text-base">storefront</span>
              <span>Expenses</span>
              <span
                className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                  activeTab === 'expenses'
                    ? 'bg-indigo-100 text-indigo-800'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {receiptsData.length}
              </span>
            </button>
          </div>

          {/* Right: Search & Filter Toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative">
              <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                search
              </span>
              <input
                type="text"
                placeholder={
                  activeTab === 'bills'
                    ? 'Search vendor, bill #...'
                    : 'Search merchant, receipt #...'
                }
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/20 focus:border-slate-400 transition w-56 sm:w-64"
              />
            </div>

            {/* Status Dropdown Filter */}
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400/20 focus:border-slate-400 transition cursor-pointer"
            >
              <option value="all">All Statuses</option>
              {activeTab === 'bills' ? (
                <>
                  <option value="unpaid">Unpaid</option>
                  <option value="overdue">Overdue</option>
                  <option value="paid">Paid</option>
                  <option value="draft">Draft</option>
                </>
              ) : (
                <>
                  <option value="pending_review">Pending Review</option>
                  <option value="approved">Approved</option>
                  <option value="reimbursed">Reimbursed</option>
                </>
              )}
            </select>
          </div>
        </div>
      </div>

      {/* Tab Content Display */}
      {activeTab === 'bills' ? (
        <BillsListTable
          bills={billsData}
          searchQuery={searchQuery}
          statusFilter={statusFilter}
          onStatusChange={handleBillStatusChange}
        />
      ) : (
        <ReceiptsListTable
          receipts={receiptsData}
          searchQuery={searchQuery}
          statusFilter={statusFilter}
          onStatusChange={handleReceiptStatusChange}
        />
      )}

      {/* Create Bill Modal */}
      <CreateBillModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateBillSubmit}
        organisations={formattedOrgs.length > 0 ? formattedOrgs : undefined}
      />

      {/* Upload Expense Modal */}
      <UploadExpenseModal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        onSubmit={handleCreateExpenseSubmit}
        organisations={formattedOrgs.length > 0 ? formattedOrgs : undefined}
      />
    </div>
  );
};

export default BillsPage;
