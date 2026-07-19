import React from 'react';
import { CategoryCombobox } from './CategoryCombobox';

export interface TransactionTableItem {
  id: string; // unique row id
  date: string;
  vendor: string;
  description?: string;
  category: string;
  amountCents?: number; // use cents (for import preview)
  gross_amount?: number; // or decimal dollars (for standard database item)
  type: 'income' | 'expense';
  isDuplicate?: boolean;
  reconciled?: boolean;
}

interface TransactionTableProps {
  transactions: TransactionTableItem[];
  selectedIds?: Set<string>;
  onToggleSelectAll?: () => void;
  onToggleRow?: (id: string) => void;
  onRowCategoryChange?: (id: string, newCat: string) => void;
  onSingleAiCategorize?: (vendor: string, id: string) => void;
  onRowClick?: (tx: TransactionTableItem) => void;
  aiUpdatingId?: string | null;
  categories: string[];
  showSelection?: boolean;
  showStatus?: boolean;
  showCategorySelect?: boolean;
  showDescription?: boolean;
}

export const TransactionTable: React.FC<TransactionTableProps> = ({
  transactions,
  selectedIds,
  onToggleSelectAll,
  onToggleRow,
  onRowCategoryChange,
  onSingleAiCategorize,
  onRowClick,
  aiUpdatingId = null,
  categories,
  showSelection = false,
  showStatus = false,
  showCategorySelect = false,
  showDescription = true
}) => {
  const allSelected = showSelection && transactions.length > 0 && selectedIds && transactions.every(t => selectedIds.has(t.id));

  return (
    <table className="w-full text-left border-collapse">
      <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 z-10">
        <tr>
          {showSelection && (
            <th className="p-4 w-12 text-center">
              <input
                type="checkbox"
                checked={allSelected || false}
                onChange={onToggleSelectAll}
                className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4 cursor-pointer"
              />
            </th>
          )}
          <th className="p-4 text-xs font-black uppercase text-slate-500 tracking-wider font-mono">Date</th>
          <th className="p-4 text-xs font-black uppercase text-slate-500 tracking-wider font-mono">Vendor / Payee</th>
          {showDescription && <th className="p-4 text-xs font-black uppercase text-slate-500 tracking-wider font-mono">Description</th>}
          <th className="p-4 text-xs font-black uppercase text-slate-500 tracking-wider font-mono w-64">Category</th>
          <th className="p-4 text-xs font-black uppercase text-slate-500 tracking-wider font-mono text-right">Amount</th>
          {showStatus && <th className="p-4 text-xs font-black uppercase text-slate-500 tracking-wider font-mono text-center">Status</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {transactions.map((tx) => {
          const isSelected = selectedIds?.has(tx.id) ?? false;
          const amount = tx.gross_amount !== undefined ? tx.gross_amount : (tx.amountCents ? tx.amountCents / 100 : 0);
          const isIncome = tx.type === 'income';

          const handleRowClickAction = () => {
            if (showSelection && onToggleRow) {
              onToggleRow(tx.id);
            } else if (onRowClick) {
              onRowClick(tx);
            }
          };

          return (
            <tr
              key={tx.id}
              onClick={handleRowClickAction}
              className={`hover:bg-slate-55/80 transition ${onToggleRow || onRowClick ? 'cursor-pointer' : ''} ${
                tx.isDuplicate
                  ? 'bg-amber-50/30 text-slate-400'
                  : isSelected
                    ? 'bg-emerald-50/20'
                    : 'bg-white'
              }`}
            >
              {showSelection && (
                <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleRow?.(tx.id)}
                    className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4 cursor-pointer"
                  />
                </td>
              )}
              <td className="p-4 text-xs font-bold font-mono whitespace-nowrap">{tx.date}</td>
              <td className="p-4 text-xs font-extrabold max-w-[180px] truncate">{tx.vendor}</td>
              {showDescription && (
                <td className="p-4 text-xs font-semibold text-slate-500 max-w-[240px] truncate">
                  {tx.description || '-'}
                </td>
              )}
              <td className="p-4 w-64" onClick={(e) => e.stopPropagation()}>
                {showCategorySelect && onRowCategoryChange ? (
                  <CategoryCombobox
                    value={tx.category}
                    onChange={(newCat) => onRowCategoryChange(tx.id, newCat)}
                    onAskAi={onSingleAiCategorize ? () => onSingleAiCategorize(tx.vendor, tx.id) : undefined}
                    aiLoading={aiUpdatingId === tx.id}
                    categories={categories}
                  />
                ) : (
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                    tx.category === 'Uncategorized'
                      ? 'bg-rose-50 text-rose-600 border-rose-200'
                      : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}>
                    {tx.category || 'Uncategorized'}
                  </span>
                )}
              </td>
              <td className={`p-4 text-xs font-black text-right font-mono whitespace-nowrap ${
                isIncome ? 'text-emerald-600' : 'text-slate-800'
              }`}>
                {isIncome ? '+' : '-'}${Math.abs(amount).toFixed(2)}
              </td>
              {showStatus && (
                <td className="p-4 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  {tx.isDuplicate ? (
                    <span className="inline-flex items-center gap-0.5 bg-amber-100 text-amber-800 text-[10px] font-black px-2 py-0.5 rounded-full">
                      <span className="material-icons text-[11px]">history</span>
                      <span>Duplicate</span>
                    </span>
                  ) : tx.reconciled !== undefined ? (
                    tx.reconciled ? (
                      <span className="inline-flex items-center bg-slate-100 text-slate-600 text-[9px] font-black px-2.5 py-0.5 rounded-full border border-slate-200/50">
                        CLEARED
                      </span>
                    ) : (
                      <span className="inline-flex items-center bg-amber-50 text-amber-700 text-[9px] font-black px-2.5 py-0.5 rounded-full border border-amber-200/50">
                        PENDING
                      </span>
                    )
                  ) : (
                    <span className="inline-flex items-center gap-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full">
                      <span className="material-icons text-[11px]">bolt</span>
                      <span>Ready</span>
                    </span>
                  )}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};
