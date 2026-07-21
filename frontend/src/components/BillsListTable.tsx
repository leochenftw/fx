import React, { useMemo } from 'react';
import type { BillsListTableProps, BillStatus } from '../types';

export const BillsListTable: React.FC<BillsListTableProps> = ({
  bills,
  searchQuery,
  statusFilter,
  onStatusChange,
}) => {
  // Filter logic
  const filteredBills = useMemo(() => {
    return bills.filter(bill => {
      const matchesSearch =
        searchQuery === '' ||
        bill.vendor_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        bill.bill_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        bill.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        bill.description.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === 'all' || bill.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [bills, searchQuery, statusFilter]);

  // Compute Metrics
  const metrics = useMemo(() => {
    const unpaid = bills
      .filter(b => b.status === 'unpaid')
      .reduce((sum, b) => sum + b.total_amount, 0);

    const overdue = bills
      .filter(b => b.status === 'overdue')
      .reduce((sum, b) => sum + b.total_amount, 0);

    const paid = bills
      .filter(b => b.status === 'paid')
      .reduce((sum, b) => sum + b.total_amount, 0);

    return { unpaid, overdue, paid };
  }, [bills]);

  const getStatusBadge = (status: BillStatus) => {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Paid
          </span>
        );
      case 'overdue':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200/60">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
            Overdue
          </span>
        );
      case 'unpaid':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200/60">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            Unpaid
          </span>
        );
      case 'draft':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
            Draft
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
              Total Unpaid
            </span>
            <div className="text-2xl font-black font-mono text-amber-600">
              ${metrics.unpaid.toFixed(2)}
            </div>
            <span className="text-[11px] font-semibold text-slate-400">
              {bills.filter(b => b.status === 'unpaid').length} bills awaiting payment
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
            <span className="material-icons">pending_actions</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Overdue Amount
            </span>
            <div className="text-2xl font-black font-mono text-rose-600">
              ${metrics.overdue.toFixed(2)}
            </div>
            <span className="text-[11px] font-semibold text-rose-500">
              {bills.filter(b => b.status === 'overdue').length} bills past due date
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
            <span className="material-icons">warning</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Paid Total
            </span>
            <div className="text-2xl font-black font-mono text-emerald-600">
              ${metrics.paid.toFixed(2)}
            </div>
            <span className="text-[11px] font-semibold text-slate-400">
              {bills.filter(b => b.status === 'paid').length} settled bills
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <span className="material-icons">check_circle</span>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                <th className="py-3.5 px-5">Vendor & Bill #</th>
                <th className="py-3.5 px-4">Dates (Issue / Due)</th>
                <th className="py-3.5 px-4">Category</th>
                <th className="py-3.5 px-4 text-right">Amount (Excl. / GST / Total)</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {filteredBills.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 space-y-2">
                    <span className="material-icons text-3xl">receipt_long</span>
                    <p className="font-semibold text-sm">No bills found matching filters.</p>
                  </td>
                </tr>
              ) : (
                filteredBills.map(bill => (
                  <tr
                    key={bill.id}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    {/* Vendor & Bill # */}
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center font-black text-slate-600 uppercase text-sm shrink-0">
                          {bill.vendor_name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 text-sm">
                            {bill.vendor_name}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400">
                            {bill.bill_number}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Dates */}
                    <td className="py-4 px-4">
                      <div className="font-mono text-slate-600 font-semibold">
                        {bill.issue_date}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400">
                        Due: <span className={bill.status === 'overdue' ? 'text-rose-600 font-bold' : ''}>{bill.due_date}</span>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-4 px-4">
                      <span className="inline-block px-2.5 py-1 rounded-lg bg-slate-100 font-bold text-slate-700 text-[11px]">
                        {bill.category}
                      </span>
                    </td>

                    {/* Amount */}
                    <td className="py-4 px-4 text-right">
                      <div className="font-mono font-black text-slate-900 text-sm">
                        ${bill.total_amount.toFixed(2)}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400">
                        GST: ${bill.gst_amount.toFixed(2)}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-4 px-4">{getStatusBadge(bill.status)}</td>

                    {/* Actions */}
                    <td className="py-4 px-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {bill.status !== 'paid' && (
                          <button
                            onClick={() => onStatusChange?.(bill.id, 'paid')}
                            className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-[11px] font-bold transition cursor-pointer"
                          >
                            Mark Paid
                          </button>
                        )}
                        {bill.status === 'paid' && (
                          <button
                            onClick={() => onStatusChange?.(bill.id, 'unpaid')}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 text-[11px] font-bold transition cursor-pointer"
                          >
                            Mark Unpaid
                          </button>
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

export default BillsListTable;
