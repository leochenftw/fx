import React, { useState, useMemo } from 'react';
import { transactionApi } from '../api/transactions';
import { saveFingerprints } from '../utils/indexeddb';

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    // By default, auto-select all non-duplicate transactions based on unique row IDs
    const initialSelected = new Set<string>();
    transactions.forEach(tx => {
      if (!tx.isDuplicate) {
        initialSelected.add(tx.id);
      }
    });
    return initialSelected;
  });

  const [importing, setImporting] = useState<boolean>(false);
  const [importedCount, setImportedCount] = useState<number>(0);
  const [importError, setImportError] = useState<string | null>(null);
  const [forceInsertIds, setForceInsertIds] = useState<Set<string>>(new Set());

  // Sync initial selection if transactions change
  React.useEffect(() => {
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
  }, [transactions]);

  // Filtered transactions to display in table
  const visibleTxs = useMemo(() => {
    if (hideDuplicates) {
      return transactions.filter(t => !t.isDuplicate);
    }
    return transactions;
  }, [transactions, hideDuplicates]);

  // Count totals
  const totalCount = transactions.length;
  const duplicateCount = transactions.filter(t => t.isDuplicate).length;
  const readyCount = totalCount - duplicateCount;
  const selectedCount = selectedIds.size;

  const handleToggleSelectAll = () => {
    const allVisibleIds = visibleTxs.map(t => t.id);
    const areAllVisibleSelected = allVisibleIds.every(id => selectedIds.has(id));

    const updated = new Set(selectedIds);
    if (areAllVisibleSelected) {
      // Deselect all visible
      allVisibleIds.forEach(id => updated.delete(id));
    } else {
      // Select all visible
      allVisibleIds.forEach(id => updated.add(id));
    }
    setSelectedIds(updated);
  };

  const handleToggleRow = (id: string) => {
    const updated = new Set(selectedIds);
    if (updated.has(id)) {
      updated.delete(id);
      // Also remove from forceInsertIds if it was there
      const updatedForce = new Set(forceInsertIds);
      updatedForce.delete(id);
      setForceInsertIds(updatedForce);
    } else {
      // Check if this row is a duplicate — if so, require explicit confirmation
      const tx = transactions.find(t => t.id === id);
      if (tx?.isDuplicate) {
        const confirmed = window.confirm(
          `"${tx.vendor}" on ${tx.date} ($${(Math.abs(tx.amountCents) / 100).toFixed(2)}) has already been imported.\n\nDo you want to force import this as a new transaction anyway?`
        );
        if (!confirmed) return; // User cancelled — do not select
        // Mark as force insert
        const updatedForce = new Set(forceInsertIds);
        updatedForce.add(id);
        setForceInsertIds(updatedForce);
      }
      updated.add(id);
    }
    setSelectedIds(updated);
  };

  const handleImportSubmit = async () => {
    if (selectedIds.size === 0) {
      alert('Please select at least one transaction to import.');
      return;
    }

    const txsToImport = transactions.filter(tx => selectedIds.has(tx.id));
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
        category: 'Uncategorized',
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
                      className={`hover:bg-slate-50/80 transition cursor-pointer ${
                        tx.isDuplicate 
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
                      <td className={`p-4 text-xs font-black text-right font-mono whitespace-nowrap ${
                        tx.type === 'income' ? 'text-emerald-600' : 'text-slate-800'
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

      </div>
    </div>
  );
};
export default ImportPreviewModal;
