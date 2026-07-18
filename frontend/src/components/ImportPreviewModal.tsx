import React, { useState, useMemo } from 'react';
import { transactionApi } from '../api/transactions';
import { saveFingerprints } from '../utils/indexeddb';
import { orgApi } from '../api/orgs';

const STANDARD_CATEGORIES = [
  'Advertising & Marketing',
  'Bank Fees & Interest',
  'Consulting & Professional',
  'Entertainment',
  'Insurance',
  'Motor Vehicle Expenses',
  'Office Supplies & Post',
  'Rent & Lease',
  'Repairs & Maintenance',
  'Software & IT Services',
  'Subscriptions & Memberships',
  'Travel & Accommodation',
  'Utilities & Comm',
  'Wages & Salaries',
  'Sales & Revenue',
  'Other Income',
  'Cost of Goods Sold',
  'Uncategorized'
];

interface CategoryComboboxProps {
  value: string;
  onChange: (val: string) => void;
  onAskAi: () => void;
  aiLoading?: boolean;
  categories: string[];
}

const CategoryCombobox: React.FC<CategoryComboboxProps> = ({
  value,
  onChange,
  onAskAi,
  aiLoading = false,
  categories
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setSearch(value);
  }, [value]);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch(value);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [value]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return categories;
    return categories.filter(c => c.toLowerCase().includes(term));
  }, [search, categories]);

  const handleSelect = (val: string) => {
    onChange(val);
    setSearch(val);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const trimmed = search.trim();
      if (trimmed) {
        handleSelect(trimmed);
      }
    }
  };

  return (
    <div ref={containerRef} className="relative w-full min-w-[200px]" onClick={e => e.stopPropagation()}>
      <div className={`flex items-center gap-1.5 bg-white border rounded-xl px-2.5 py-1.5 transition ${value === 'Uncategorized' ? 'border-rose-400 hover:border-rose-500' : 'border-slate-200 hover:border-slate-300'}`}>
        <input
          type="text"
          value={search}
          onChange={e => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          className={`text-[11px] font-extrabold focus:outline-none min-w-0 flex-grow bg-transparent placeholder-slate-400 ${value === 'Uncategorized' ? 'text-rose-500' : 'text-slate-800'}`}
          placeholder="Type or select..."
        />
        {search.trim() !== '' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSearch('');
            }}
            title="Clear category"
            className="flex items-center justify-center w-3.5 h-3.5 rounded-full text-slate-500 hover:text-slate-700 transition flex-shrink-0"
          >
            <span className="material-icons text-[9px] leading-none">close</span>
          </button>
        )}
        {aiLoading ? (
          <span className="material-icons text-slate-400 text-[10px] animate-spin">sync</span>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAskAi();
            }}
            title="Ask AI to categorize"
            className="text-slate-400 hover:text-emerald-600 transition flex items-center cursor-pointer"
          >
            <span className="material-icons text-xs">auto_awesome</span>
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 shadow-xl rounded-2xl py-1.5 max-h-48 overflow-y-auto z-50 animate-in fade-in slide-in-from-top-1 duration-150">
          {filtered.map(cat => (
            <button
              key={cat}
              onClick={() => handleSelect(cat)}
              className={`w-full text-left px-3.5 py-1.5 text-xs font-semibold transition hover:bg-slate-50 ${cat === value ? 'text-slate-900 font-black bg-slate-50' : 'text-slate-600'
                }`}
            >
              {cat}
            </button>
          ))}

          {search.trim() && !categories.some(c => c.toLowerCase() === search.toLowerCase().trim()) && (
            <button
              onClick={() => handleSelect(search.trim())}
              className="w-full text-left px-3.5 py-2 text-xs font-bold text-slate-400 hover:bg-slate-50 border-t border-slate-100 italic flex items-center gap-1"
            >
              <span className="material-icons text-[11px]">add</span>
              <span>Use Custom: "{search.trim()}"</span>
            </button>
          )}

          {/* Ask AI to classify option - positioned at the end of the list */}
          <button
            onClick={() => {
              onAskAi();
              setIsOpen(false);
            }}
            disabled={aiLoading}
            className="w-full text-left px-3.5 py-2.5 text-xs font-bold text-emerald-600 hover:bg-emerald-50 flex items-center gap-1.5 border-t border-slate-100"
          >
            <span className="material-icons text-[11px] animate-pulse">auto_awesome</span>
            <span>Ask AI to classify this...</span>
          </button>
        </div>
      )}
    </div>
  );
};

function parseToISODate(dateStr: string): string {
  const clean = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }
  const parts = clean.split(/[-/]/);
  if (parts.length === 3) {
    const p0 = parts[0];
    const p1 = parts[1];
    const p2 = parts[2];
    if (p2.length === 4) {
      return `${p2}-${p1.padStart(2, '0')}-${p0.padStart(2, '0')}`;
    }
    if (p0.length === 4) {
      return `${p0}-${p1.padStart(2, '0')}-${p2.padStart(2, '0')}`;
    }
  }
  return clean;
}

interface TransactionItem {
  id: string; // Front-end unique row ID: `${hash}-${idx}`
  date: string;
  vendor: string;
  amountCents: number;
  description: string;
  type: 'income' | 'expense';
  hash: string;
  occurIdx: number; // The static occurrence count of the hash in the CSV file
  isDuplicate: boolean;
}

interface ImportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  orgName: string;
  bankAccount: string;
  transactions: TransactionItem[];
  onImportComplete: () => void;
}

export const ImportPreviewModal: React.FC<ImportPreviewModalProps> = ({
  isOpen,
  onClose,
  orgId,
  orgName,
  bankAccount,
  transactions,
  onImportComplete
}) => {
  const [hideDuplicates, setHideDuplicates] = useState<boolean>(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [importing, setImporting] = useState<boolean>(false);
  const [importedCount, setImportedCount] = useState<number>(0);
  const [importError, setImportError] = useState<string | null>(null);
  const [forceInsertIds, setForceInsertIds] = useState<Set<string>>(new Set());

  const [previewTxs, setPreviewTxs] = useState<Array<TransactionItem & { category: string }>>([]);
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [aiConfirm, setAiConfirm] = useState<{
    isOpen: boolean;
    vendors: string[];
    onConfirm: () => void;
  } | null>(null);

  // Sync initial selection and load org entities
  React.useEffect(() => {
    if (!isOpen) return;

    const initializeTransactions = async () => {
      try {
        const configRes = await orgApi.getWorkflowConfig();
        const fetchedCats = configRes.categories || [];
        setCategories(fetchedCats.length > 0 ? fetchedCats : STANDARD_CATEGORIES);

        // Apply initial matching (default to Uncategorized until AI or user sets it)
        const initial = transactions.map(tx => ({
          ...tx,
          category: 'Uncategorized'
        }));
        setPreviewTxs(initial);

        // Sync selection
        const initialSelected = new Set<string>();
        transactions.forEach(tx => {
          if (!tx.isDuplicate) {
            initialSelected.add(tx.id);
          }
        });
        setSelectedIds(initialSelected);
        setForceInsertIds(new Set());
        setImportError(null);
        setImportedCount(0);
      } catch (err) {
        console.error('Failed to load organisation cached entities:', err);
        setPreviewTxs(transactions.map(tx => ({ ...tx, category: 'Uncategorized' })));
      }
    };

    initializeTransactions();
  }, [isOpen, transactions, orgId]);

  // Filtered transactions to display in table
  const visibleTxs = useMemo(() => {
    if (hideDuplicates) {
      return previewTxs.filter(t => !t.isDuplicate);
    }
    return previewTxs;
  }, [previewTxs, hideDuplicates]);

  // Count totals
  const totalCount = previewTxs.length;
  const duplicateCount = previewTxs.filter(t => t.isDuplicate).length;
  const readyCount = totalCount - duplicateCount;
  const selectedCount = selectedIds.size;

  // Uncategorized count among visible transactions
  const uncategorizedCount = useMemo(() => {
    return previewTxs.filter(t => t.category === 'Uncategorized' && (!hideDuplicates || !t.isDuplicate)).length;
  }, [previewTxs, hideDuplicates]);

  const handleToggleSelectAll = () => {
    const allVisibleIds = visibleTxs.map(t => t.id);
    const areAllVisibleSelected = allVisibleIds.every(id => selectedIds.has(id));

    const updated = new Set(selectedIds);
    if (areAllVisibleSelected) {
      allVisibleIds.forEach(id => updated.delete(id));
    } else {
      allVisibleIds.forEach(id => updated.add(id));
    }
    setSelectedIds(updated);
  };

  const handleToggleRow = (id: string) => {
    const updated = new Set(selectedIds);
    if (updated.has(id)) {
      updated.delete(id);
      const updatedForce = new Set(forceInsertIds);
      updatedForce.delete(id);
      setForceInsertIds(updatedForce);
    } else {
      const tx = previewTxs.find(t => t.id === id);
      if (tx?.isDuplicate) {
        const confirmed = window.confirm(
          `"${tx.vendor}" on ${tx.date} ($${(Math.abs(tx.amountCents) / 100).toFixed(2)}) has already been imported.\n\nDo you want to force import this as a new transaction anyway?`
        );
        if (!confirmed) return;
        const updatedForce = new Set(forceInsertIds);
        updatedForce.add(id);
        setForceInsertIds(updatedForce);
      }
      updated.add(id);
    }
    setSelectedIds(updated);
  };

  // Bottom-level AI executor
  const executeBatchAiCategorize = async (vendors: string[]) => {
    setAiLoading(true);
    setImportError(null);
    try {
      const res = await orgApi.categoriseVendors(vendors);
      const aiMap = res.categories || {};

      setPreviewTxs(prev => prev.map(tx => {
        const cleanVendor = tx.vendor.trim();
        const matchedCat = aiMap[cleanVendor];
        if (tx.category === 'Uncategorized' && matchedCat) {
          return { ...tx, category: matchedCat };
        }
        return tx;
      }));
    } catch (err: any) {
      console.error('[AI Batch Categorise] Error:', err);
      setImportError(err.message || 'AI Assistant failed to classify. Check model settings.');
    } finally {
      setAiLoading(false);
    }
  };

  const executeSingleAiCategorize = async (vendor: string, txId: string) => {
    setAiLoading(true);
    try {
      const res = await orgApi.categoriseVendors([vendor.trim()]);
      const matchedCat = res.categories?.[vendor.trim()];
      if (matchedCat) {
        setPreviewTxs(prev => prev.map(tx => {
          if (tx.id === txId) {
            return { ...tx, category: matchedCat };
          }
          return tx;
        }));
      }
    } catch (err: any) {
      console.error('[AI Single Categorise] Error:', err);
    } finally {
      setAiLoading(false);
    }
  };

  // Triggers that prompt estimation modal before execution
  const handleBatchAiCategorize = () => {
    const targetTxs = previewTxs.filter(t => t.category === 'Uncategorized' && (!hideDuplicates || !t.isDuplicate));
    const uniqueVendors = Array.from(new Set(targetTxs.map(t => t.vendor.trim()))).filter(Boolean);

    if (uniqueVendors.length === 0) return;

    setAiConfirm({
      isOpen: true,
      vendors: uniqueVendors,
      onConfirm: () => {
        setAiConfirm(null);
        executeBatchAiCategorize(uniqueVendors);
      }
    });
  };

  const handleSingleAiCategorize = (vendor: string, txId: string) => {
    if (!vendor) return;
    setAiConfirm({
      isOpen: true,
      vendors: [vendor.trim()],
      onConfirm: () => {
        setAiConfirm(null);
        executeSingleAiCategorize(vendor, txId);
      }
    });
  };

  const handleRowCategoryChange = (txId: string, newCat: string) => {
    setPreviewTxs(prev => prev.map(tx => {
      if (tx.id === txId) {
        return { ...tx, category: newCat };
      }
      return tx;
    }));
  };

  const handleImportSubmit = async () => {
    if (selectedIds.size === 0) {
      alert('Please select at least one transaction to import.');
      return;
    }

    const txsToImport = previewTxs.filter(tx => selectedIds.has(tx.id));
    setImporting(true);
    setImportedCount(0);
    setImportError(null);

    try {
      // Build the batch payload as a single JSON array
      const payload = txsToImport.map(tx => ({
        date: parseToISODate(tx.date),
        vendor: tx.vendor,
        description: tx.description || undefined,
        type: tx.type,
        gross_amount: tx.type === 'income'
          ? Math.abs(tx.amountCents) / 100
          : -Math.abs(tx.amountCents) / 100,
        gst_type: tx.type === 'income' ? 'output_tax' as 'output_tax' : 'input_tax' as 'input_tax',
        category: tx.category || 'Uncategorized',
        source: 'Bank Statement Import' as const,
        hash: tx.hash,
        occur_idx: tx.occurIdx,
        force_insert: forceInsertIds.has(tx.id) || undefined,
      }));

      // Single HTTP request to backend batch import endpoint
      const result = await transactionApi.createBatch(orgId, payload);

      console.log('[BATCH IMPORT] Cloud response:', result);
      setImportedCount(txsToImport.length);

      if (result.imported === 0 && result.skipped > 0) {
        throw new Error(`All ${result.skipped} transactions were detected as duplicates by the cloud. Nothing was imported.`);
      }
      if (result.imported === 0 && result.errors > 0) {
        throw new Error('All transaction records failed to upload. Check Console for detail API payload errors.');
      }

      // Collect successfully imported hashes for local IndexedDB fingerprint storage
      const successfulHashes = result.details
        .filter((d: any) => d.status === 'imported')
        .map((d: any) => d.hash)
        .filter(Boolean) as string[];

      if (successfulHashes.length > 0) {
        console.log('[DEBUG DEDUP] Saving Successful Hashes in Step 2:', {
          saveOrgId: orgId,
          hashesToSaveCount: successfulHashes.length,
          firstFewHashes: successfulHashes.slice(0, 3),
          firstFewKeys: successfulHashes.slice(0, 3).map((h: string) => `${orgId}#${h}`)
        });
        await saveFingerprints(orgId, successfulHashes);
      }

      // Success Callback
      onImportComplete();
    } catch (err: any) {
      console.error('Fatal batch import error:', err);
      setImportError(err.message || 'Bulk import failed. Please verify network connections.');
    } finally {
      setImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-3xl shadow-xl w-full max-w-4xl h-[85vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span className="material-icons text-emerald-600 text-lg">preview</span>
              Import Review: {orgName}
            </h3>
            <p className="text-xs text-slate-400 font-bold uppercase mt-1 tracking-wider font-mono">
              Step 2 of 2: Confirming transactions &amp; local duplication filters ({bankAccount})
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={importing}
            className="text-slate-400 hover:text-slate-600 disabled:opacity-50 cursor-pointer"
          >
            <span className="material-icons text-lg">close</span>
          </button>
        </div>

        {/* Filters Panel */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4 flex-shrink-0">
          <div className="flex items-center gap-4 text-xs font-bold text-slate-500 font-mono">
            <div>Parsed: <span className="text-slate-800 font-black">{totalCount}</span></div>
            <div className="w-1.5 h-1.5 bg-slate-300 rounded-full"></div>
            <div>Ready: <span className="text-emerald-600 font-black">{readyCount}</span></div>
            <div className="w-1.5 h-1.5 bg-slate-300 rounded-full"></div>
            <div>Duplicates: <span className="text-amber-600 font-black">{duplicateCount}</span></div>
          </div>

          {/* AI Assistant Quick Tool */}
          {uncategorizedCount > 0 && (
            <div className="flex items-center gap-2 bg-emerald-50/50 border border-emerald-100/60 rounded-2xl py-1.5 px-3 animate-in fade-in slide-in-from-left-2 duration-300">
              <span className="material-icons text-emerald-600 text-xs animate-pulse">auto_awesome</span>
              <span className="text-[10px] text-emerald-700 font-extrabold uppercase font-mono tracking-wider">
                {uncategorizedCount} Uncategorized Remaining
              </span>
              <button
                onClick={handleBatchAiCategorize}
                disabled={aiLoading}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-[9px] font-black uppercase px-2.5 py-1 rounded-xl shadow-sm transition flex items-center gap-1 cursor-pointer"
              >
                {aiLoading ? (
                  <>
                    <span className="material-icons animate-spin text-[10px] leading-none">sync</span>
                    <span>Asking AI...</span>
                  </>
                ) : (
                  <>
                    <span className="material-icons text-[10px] leading-none">auto_awesome</span>
                    <span>Ask AI to help</span>
                  </>
                )}
              </button>
            </div>
          )}

          <label className="flex items-center gap-2 text-xs font-black text-slate-600 uppercase tracking-wider cursor-pointer">
            <input
              type="checkbox"
              checked={hideDuplicates}
              onChange={(e) => setHideDuplicates(e.target.checked)}
              className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
            />
            <span>Hide Duplicated Transactions ({duplicateCount})</span>
          </label>
        </div>

        {/* Content - Transactions Table */}
        <div className="flex-grow overflow-auto">
          {visibleTxs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-2">
              <span className="material-icons text-4xl">rule</span>
              <span className="text-sm font-bold">No transactions left to review.</span>
              <span className="text-xs">All records might have been filtered as duplicates. Toggle "Hide Duplicates" to review.</span>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 z-10">
                <tr>
                  <th className="p-4 w-12 text-center">
                    <input
                      type="checkbox"
                      checked={visibleTxs.length > 0 && visibleTxs.every(t => selectedIds.has(t.id))}
                      onChange={handleToggleSelectAll}
                      className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4 cursor-pointer"
                    />
                  </th>
                  <th className="p-4 text-xs font-black uppercase text-slate-500 tracking-wider font-mono">Date</th>
                  <th className="p-4 text-xs font-black uppercase text-slate-500 tracking-wider font-mono">Vendor / Payee</th>
                  <th className="p-4 text-xs font-black uppercase text-slate-500 tracking-wider font-mono">Description</th>
                  <th className="p-4 text-xs font-black uppercase text-slate-500 tracking-wider font-mono w-64">Category</th>
                  <th className="p-4 text-xs font-black uppercase text-slate-500 tracking-wider font-mono text-right">Amount</th>
                  <th className="p-4 text-xs font-black uppercase text-slate-500 tracking-wider font-mono text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleTxs.map((tx) => {
                  const isSelected = selectedIds.has(tx.id);
                  return (
                    <tr
                      key={tx.id}
                      onClick={() => handleToggleRow(tx.id)}
                      className={`hover:bg-slate-50/80 transition cursor-pointer ${tx.isDuplicate
                          ? 'bg-amber-50/30 text-slate-400'
                          : isSelected
                            ? 'bg-emerald-50/20'
                            : 'bg-white'
                        }`}
                    >
                      <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleRow(tx.id)}
                          className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4 cursor-pointer"
                        />
                      </td>
                      <td className="p-4 text-xs font-bold font-mono whitespace-nowrap">{tx.date}</td>
                      <td className="p-4 text-xs font-extrabold max-w-[180px] truncate">{tx.vendor}</td>
                      <td className="p-4 text-xs font-semibold text-slate-500 max-w-[240px] truncate">
                        {tx.description || '-'}
                      </td>
                      <td className="p-4 w-64" onClick={(e) => e.stopPropagation()}>
                        <CategoryCombobox
                          value={tx.category}
                          onChange={(newCat) => handleRowCategoryChange(tx.id, newCat)}
                          onAskAi={() => handleSingleAiCategorize(tx.vendor, tx.id)}
                          aiLoading={aiLoading}
                          categories={categories}
                        />
                      </td>
                      <td className={`p-4 text-xs font-black text-right font-mono whitespace-nowrap ${tx.type === 'income' ? 'text-emerald-600' : 'text-slate-800'
                        }`}>
                        {tx.type === 'income' ? '+' : '-'}${(Math.abs(tx.amountCents) / 100).toFixed(2)}
                      </td>
                      <td className="p-4 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {tx.isDuplicate ? (
                          <span className="inline-flex items-center gap-0.5 bg-amber-100 text-amber-800 text-[10px] font-black px-2 py-0.5 rounded-full">
                            <span className="material-icons text-[11px]">history</span>
                            <span>Duplicate</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full">
                            <span className="material-icons text-[11px]">bolt</span>
                            <span>Ready</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-6 border-t border-slate-100 bg-white flex-shrink-0 flex items-center justify-between">
          <div className="text-xs text-slate-500 font-bold font-mono">
            Selected: <span className="text-slate-900 font-black">{selectedCount}</span> of {visibleTxs.length} shown
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={importing}
              className="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 font-bold text-sm px-6 py-3 rounded-2xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleImportSubmit}
              disabled={selectedCount === 0 || importing}
              className="bg-slate-900 hover:bg-slate-800 disabled:bg-slate-100 disabled:text-slate-300 text-white font-bold text-sm px-6 py-3 rounded-2xl shadow-sm transition cursor-pointer flex items-center gap-2"
            >
              {importing ? (
                <>
                  <span className="material-icons animate-spin text-sm">sync</span>
                  <span>Importing ({importedCount}/{selectedCount})...</span>
                </>
              ) : (
                <span>Import Selected ({selectedCount})</span>
              )}
            </button>
          </div>
        </div>

        {/* Loading Overlay */}
        {importing && (
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px] flex flex-col items-center justify-center z-50">
            <div className="bg-white border border-slate-100 rounded-3xl p-8 max-w-sm w-full mx-4 shadow-2xl flex flex-col items-center space-y-4 animate-in fade-in zoom-in-95 duration-200">
              <div className="relative flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
                <span className="material-icons text-emerald-600 absolute text-lg">cloud_upload</span>
              </div>
              <div className="text-center">
                <h4 className="text-sm font-black text-slate-900">Importing Transactions...</h4>
                <p className="text-xs text-slate-400 font-bold font-mono mt-1">
                  Progress: {importedCount} / {selectedCount} ({Math.round((importedCount / selectedCount) * 100)}%)
                </p>
              </div>
              {/* Simple progress bar */}
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${(importedCount / selectedCount) * 100}%` }}
                ></div>
              </div>
            </div>
          </div>
        )}

        {/* Error Notification */}
        {importError && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 max-w-md w-full px-4 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold rounded-2xl shadow-xl flex items-start gap-2">
              <span className="material-icons text-sm mt-0.5">error</span>
              <div className="flex-grow">
                <div>Import Failed</div>
                <div className="text-xs text-rose-500 mt-1 font-mono font-normal">{importError}</div>
              </div>
              <button onClick={() => setImportError(null)} className="text-rose-400 hover:text-rose-600">
                <span className="material-icons text-xs">close</span>
              </button>
            </div>
          </div>
        )}

        {/* AI Estimation Confirmation Modal */}
        {aiConfirm?.isOpen && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="bg-white border border-slate-100 rounded-3xl p-6 max-w-md w-full shadow-2xl flex flex-col space-y-5 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0">
                  <span className="material-icons animate-pulse text-lg">auto_awesome</span>
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900">AI Assistant Categorization</h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider font-mono mt-0.5">AWS Bedrock • Amazon Nova Lite</p>
                </div>
              </div>

              <div className="text-xs text-slate-600 font-medium leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100">
                This will send <span className="font-black text-slate-800 font-mono">{aiConfirm.vendors.length}</span> unique uncategorized vendor name(s) to AWS Bedrock. The AI model analyzes context to assign standard bookkeeping categories.
              </div>

              {/* Cost calculator card */}
              <div className="bg-emerald-50/40 border border-emerald-100/50 rounded-2xl p-4 flex flex-col space-y-1.5">
                <div className="flex justify-between items-center text-xs font-bold text-slate-500">
                  <span>Unique Merchant Names:</span>
                  <span className="text-slate-900 font-mono">{aiConfirm.vendors.length}</span>
                </div>
                <div className="flex justify-between items-center text-xs font-bold text-slate-500">
                  <span>Estimated Total Tokens:</span>
                  <span className="text-slate-900 font-mono">
                    ~{(400 + aiConfirm.vendors.length * 50)} tokens
                  </span>
                </div>
                <div className="border-t border-emerald-200/40 my-1"></div>
                <div className="flex justify-between items-center text-xs">
                  <span className="font-extrabold text-emerald-800">Estimated Cost:</span>
                  <span className="font-mono font-black text-emerald-600">
                    ${(((400 + aiConfirm.vendors.length * 25) * 0.00032 + (aiConfirm.vendors.length * 25) * 0.00263) / 1000).toFixed(5)} USD
                  </span>
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-1">
                <button
                  onClick={() => setAiConfirm(null)}
                  className="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 font-bold text-xs px-4 py-2.5 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={aiConfirm.onConfirm}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-sm hover:shadow transition cursor-pointer"
                >
                  Agree & Run AI
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
export default ImportPreviewModal;
