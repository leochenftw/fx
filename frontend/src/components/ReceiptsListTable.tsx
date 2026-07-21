import React, { useMemo } from 'react';
import type { ReceiptsListTableProps, ReceiptStatus, PaymentMethod } from '../types';

export const ReceiptsListTable: React.FC<ReceiptsListTableProps> = ({
  receipts,
  searchQuery,
  statusFilter,
  onStatusChange,
}) => {
  // Filter logic
  const filteredReceipts = useMemo(() => {
    return receipts.filter(rcpt => {
      const matchesSearch =
        searchQuery === '' ||
        rcpt.merchant_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (rcpt.receipt_number && rcpt.receipt_number.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (rcpt.purchaser_name && rcpt.purchaser_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        rcpt.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (rcpt.notes && rcpt.notes.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesStatus =
        statusFilter === 'all' || rcpt.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [receipts, searchQuery, statusFilter]);

  // Compute Metrics
  const metrics = useMemo(() => {
    const pendingCount = receipts.filter(r => r.status === 'pending_review').length;
    
    const approvedSum = receipts
      .filter(r => r.status === 'approved')
      .reduce((sum, r) => sum + r.total_amount, 0);

    const reimbursedSum = receipts
      .filter(r => r.status === 'reimbursed')
      .reduce((sum, r) => sum + r.total_amount, 0);

    return { pendingCount, approvedSum, reimbursedSum };
  }, [receipts]);

  const getStatusBadge = (status: ReceiptStatus) => {
    switch (status) {
      case 'reimbursed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Reimbursed
          </span>
        );
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200/60">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
            Approved
          </span>
        );
      case 'pending_review':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200/60">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            Pending
          </span>
        );
      case 'rejected':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200/60">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
            Rejected
          </span>
        );
    }
  };

  const getPaymentMethodBadge = (method: PaymentMethod) => {
    switch (method) {
      case 'credit_card':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
            <span className="material-icons text-[12px] text-slate-500">credit_card</span>
            Credit Card
          </span>
        );
      case 'debit_card':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
            <span className="material-icons text-[12px] text-slate-500">payment</span>
            Debit Card
          </span>
        );
      case 'reimbursement':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md">
            <span className="material-icons text-[12px] text-indigo-500">account_balance_wallet</span>
            Reimbursement
          </span>
        );
      case 'cash':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
            <span className="material-icons text-[12px] text-slate-500">payments</span>
            Cash
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Key Metrics Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Pending Approvals
            </span>
            <div className="text-2xl font-black font-mono text-amber-600">
              {metrics.pendingCount} <span className="text-sm text-slate-400 font-normal">items</span>
            </div>
            <span className="text-[11px] font-semibold text-slate-400">
              Awaiting manager review
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
            <span className="material-icons">rate_review</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Approved Total
            </span>
            <div className="text-2xl font-black font-mono text-blue-600">
              ${metrics.approvedSum.toFixed(2)}
            </div>
            <span className="text-[11px] font-semibold text-slate-400">
              Ready for payout/reimbursement
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
            <span className="material-icons">task_alt</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Reimbursed Total
            </span>
            <div className="text-2xl font-black font-mono text-emerald-600">
              ${metrics.reimbursedSum.toFixed(2)}
            </div>
            <span className="text-[11px] font-semibold text-slate-400">
              Settled expense receipts
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <span className="material-icons">published_with_changes</span>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                <th className="py-3.5 px-5">Merchant & Receipt #</th>
                <th className="py-3.5 px-4">Date & Purchaser</th>
                <th className="py-3.5 px-4">Payment Method</th>
                <th className="py-3.5 px-4">Category</th>
                <th className="py-3.5 px-4 text-right">Amount (Total / GST)</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {filteredReceipts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 space-y-2">
                    <span className="material-icons text-3xl">receipt</span>
                    <p className="font-semibold text-sm">No expenses found matching filters.</p>
                  </td>
                </tr>
              ) : (
                filteredReceipts.map(rcpt => (
                  <tr
                    key={rcpt.id}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    {/* Merchant & Receipt # */}
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-bold shrink-0">
                          <span className="material-icons text-base">storefront</span>
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 text-sm">
                            {rcpt.merchant_name}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400">
                            {rcpt.receipt_number || 'No Rcpt #'}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Date & Purchaser */}
                    <td className="py-4 px-4">
                      <div className="font-mono text-slate-700 font-semibold">
                        {rcpt.purchase_date}
                      </div>
                      <div className="text-[11px] text-slate-400 font-medium">
                        By: <span className="text-slate-600 font-bold">{rcpt.purchaser_name || 'Staff'}</span>
                      </div>
                    </td>

                    {/* Payment Method */}
                    <td className="py-4 px-4">
                      {getPaymentMethodBadge(rcpt.payment_method)}
                    </td>

                    {/* Category */}
                    <td className="py-4 px-4">
                      <span className="inline-block px-2.5 py-1 rounded-lg bg-slate-100 font-bold text-slate-700 text-[11px]">
                        {rcpt.category}
                      </span>
                    </td>

                    {/* Amount */}
                    <td className="py-4 px-4 text-right">
                      <div className="font-mono font-black text-slate-900 text-sm">
                        ${rcpt.total_amount.toFixed(2)}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400">
                        GST: ${rcpt.gst_amount.toFixed(2)}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-4 px-4">{getStatusBadge(rcpt.status)}</td>

                    {/* Actions */}
                    <td className="py-4 px-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {rcpt.status === 'pending_review' && (
                          <button
                            onClick={() => onStatusChange?.(rcpt.id, 'approved')}
                            className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 text-[11px] font-bold transition cursor-pointer"
                          >
                            Approve
                          </button>
                        )}
                        {rcpt.status === 'approved' && (
                          <button
                            onClick={() => onStatusChange?.(rcpt.id, 'reimbursed')}
                            className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-[11px] font-bold transition cursor-pointer"
                          >
                            Reimburse
                          </button>
                        )}
                        {rcpt.status === 'reimbursed' && (
                          <span className="text-[11px] font-bold text-slate-400 italic">
                            Settled
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ReceiptsListTable;
