import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { transactionApi } from '../api/transactions';
import { orgApi } from '../api/orgs';
import { TransactionTable } from '../components/TransactionTable';
import type { TransactionTableItem } from '../components/TransactionTable';

export const TransactionsPage: React.FC = () => {
  const { t } = useTranslation();

  // Core Page States
  const [transactions, setTransactions] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastKey, setLastKey] = useState<string | null>(null);

  // Filter States
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Inline Category Update Helper state
  const [aiUpdatingId, setAiUpdatingId] = useState<string | null>(null);

  // 1. Fetch initial global transactions and categories config on mount
  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [txRes, configRes] = await Promise.all([
          transactionApi.listGlobal({ limit: 50 }),
          orgApi.getWorkflowConfig()
        ]);
        setTransactions(txRes.transactions || []);
        setLastKey(txRes.last_evaluated_key || null);
        setCategories(configRes.categories || []);
      } catch (err: any) {
        console.error('Failed to load global transactions:', err);
        setError(err.message || 'Failed to retrieve transactions.');
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, []);

  // 2. Fetch next page of global transactions
  const handleLoadMore = async () => {
    if (!lastKey || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await transactionApi.listGlobal({
        limit: 50,
        exclusive_start_key: lastKey
      });
      setTransactions((prev) => [...prev, ...(res.transactions || [])]);
      setLastKey(res.last_evaluated_key || null);
    } catch (err: any) {
      console.error('Failed to load more transactions:', err);
      alert(`Failed to load more transactions: ${err.message || 'Error occurred'}`);
    } finally {
      setLoadingMore(false);
    }
  };

  // 3. Client-side filtering & search matching (instant response)
  const filteredTxs = useMemo(() => {
    return transactions.filter(tx => {
      // 3.1 Type Filter
      if (filterType !== 'all' && tx.type !== filterType) {
        return false;
      }

      // 3.2 Date Filter
      if (startDate && tx.date < startDate) {
        return false;
      }
      if (endDate && tx.date > endDate) {
        return false;
      }

      // 3.3 Search Query Filter (Matches vendor, description, or category)
      if (searchQuery.trim()) {
        const term = searchQuery.toLowerCase();
        const matchesVendor = tx.vendor?.toLowerCase().includes(term);
        const matchesDesc = tx.description?.toLowerCase().includes(term);
        const matchesCat = tx.category?.toLowerCase().includes(term);
        if (!matchesVendor && !matchesDesc && !matchesCat) {
          return false;
        }
      }

      return true;
    });
  }, [transactions, filterType, startDate, endDate, searchQuery]);

  // 4. Calculate Dashboard Stats dynamically
  const stats = useMemo(() => {
    let inflow = 0;
    let outflow = 0;

    // We calculate stats based on the dates and queries currently filtered (but ignoring the Type tab filter
    // so the dashboard always represents the global totals of the active date window)
    const baseTxsForStats = transactions.filter(tx => {
      if (startDate && tx.date < startDate) return false;
      if (endDate && tx.date > endDate) return false;
      if (searchQuery.trim()) {
        const term = searchQuery.toLowerCase();
        const matchesVendor = tx.vendor?.toLowerCase().includes(term);
        const matchesDesc = tx.description?.toLowerCase().includes(term);
        const matchesCat = tx.category?.toLowerCase().includes(term);
        return matchesVendor || matchesDesc || matchesCat;
      }
      return true;
    });

    baseTxsForStats.forEach(tx => {
      if (tx.category === 'Transfer') return;
      const amt = Math.abs(tx.gross_amount || 0);
      if (tx.type === 'income') {
        inflow += amt;
      } else {
        outflow += amt;
      }
    });

    return {
      inflow,
      outflow,
      net: inflow - outflow
    };
  }, [transactions, startDate, endDate, searchQuery]);

  // 5. Handle inline category updates
  const handleCategoryChange = async (txId: string, newCat: string) => {
    // Find the transaction record locally to get its metadata details
    const targetTx = transactions.find(t => t.id === txId);
    if (!targetTx) return;

    const originalCategory = targetTx.category;
    const orgId = targetTx.org_id;

    // Optimistic UI Update
    setTransactions(prev => prev.map(t => t.id === txId ? { ...t, category: newCat } : t));

    try {
      await transactionApi.update(orgId, targetTx.date, txId, {
        category: newCat
      });
    } catch (err: any) {
      console.error('Failed to update category on cloud:', err);
      alert(`Failed to save category: ${err.message || 'Network error'}`);
      // Rollback
      setTransactions(prev => prev.map(t => t.id === txId ? { ...t, category: originalCategory } : t));
    }
  };

  // 6. Handle single AI categorization trigger
  const handleSingleAiCategorize = async (vendor: string, txId: string) => {
    const targetTx = transactions.find(t => t.id === txId);
    if (!targetTx) return;

    // Prompt estimate cost before execution to satisfy UX security
    const confirmed = window.confirm(
      `This will send 1 unique vendor name "${vendor.trim()}" to AWS Bedrock to analyze context and estimate standard bookkeeping categories.\n\n` +
      `Estimated size: ~450 tokens\n` +
      `Estimated cost: ~$0.00020 USD\n\n` +
      `Do you want to proceed?`
    );
    if (!confirmed) return;

    setAiUpdatingId(txId);
    try {
      const res = await orgApi.categoriseVendors([vendor.trim()]);
      const matchedCat = res.categories?.[vendor.trim()];
      if (matchedCat) {
        await handleCategoryChange(txId, matchedCat);
      } else {
        alert('AI Assistant could not determine a category for this vendor.');
      }
    } catch (err: any) {
      console.error('[AI Single Categorise] Error:', err);
      alert(`AI Assistant error: ${err.message || 'Service unavailable'}`);
    } finally {
      setAiUpdatingId(null);
    }
  };

  // 7. Clear date filters helper
  const handleClearDateFilters = () => {
    setStartDate('');
    setEndDate('');
  };

  // Map to TransactionTableItem structure
  const tableItems: TransactionTableItem[] = useMemo(() => {
    return filteredTxs.map(tx => ({
      id: tx.id,
      date: tx.date,
      vendor: tx.vendor || 'Unknown',
      description: tx.description,
      category: tx.category || 'Uncategorized',
      gross_amount: tx.gross_amount,
      type: tx.type,
      reconciled: !!tx.matched_bank_statement_id || tx.reconciled === true
    }));
  }, [filteredTxs]);

  return (
    <div className="space-y-6 w-full max-w-[1280px]">
      {/* Title block */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-5 gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            {t('sidebar.transactions', 'Transactions')}
          </h1>
          <p className="text-xs text-slate-400 mt-1 font-semibold">
            Audit and classify your global cash ledgers across all business entities.
          </p>
        </div>
      </div>

      {/* KPI Cards Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Inflow */}
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl shadow-md p-5 border border-emerald-400/20 text-white flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider opacity-80">Total Inflow (Income)</span>
            <div className="text-2xl font-black font-mono">+${stats.inflow.toFixed(2)}</div>
          </div>
          <span className="material-icons text-3xl opacity-30">trending_up</span>
        </div>

        {/* Total Outflow */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl shadow-md p-5 border border-slate-700 text-white flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider opacity-80">Total Outflow (Expense)</span>
            <div className="text-2xl font-black font-mono">-${stats.outflow.toFixed(2)}</div>
          </div>
          <span className="material-icons text-3xl opacity-30">trending_down</span>
        </div>

        {/* Net Cashflow */}
        <div className="bg-white rounded-2xl shadow-sm p-5 border border-slate-200 text-slate-800 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Net Cashflow</span>
            <div className={`text-2xl font-black font-mono ${stats.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {stats.net >= 0 ? '+' : '-'}${Math.abs(stats.net).toFixed(2)}
            </div>
          </div>
          <span className={`material-icons text-3xl ${stats.net >= 0 ? 'text-emerald-500/20' : 'text-rose-500/20'}`}>
            account_balance_wallet
          </span>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          {/* Left Side: Type Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-xl w-fit self-start">
            <button
              onClick={() => setFilterType('all')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition ${
                filterType === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              All Flows
            </button>
            <button
              onClick={() => setFilterType('income')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition ${
                filterType === 'income' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-emerald-600'
              }`}
            >
              Inflow
            </button>
            <button
              onClick={() => setFilterType('expense')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition ${
                filterType === 'expense' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Outflow
            </button>
          </div>

          {/* Right Side: Search and Date Selectors */}
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            {/* Search Input */}
            <div className="relative flex-grow sm:flex-grow-0 sm:w-64">
              <input
                type="text"
                placeholder="Search vendor or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
              />
              <span className="material-icons absolute left-3 top-2.5 text-slate-400 text-sm">search</span>
            </div>

            {/* Start Date */}
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
              <span>From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
              />
            </div>

            {/* End Date */}
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
              <span>To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
              />
            </div>

            {/* Clear Dates Button */}
            {(startDate || endDate) && (
              <button
                onClick={handleClearDateFilters}
                className="bg-slate-100 hover:bg-slate-200 text-slate-600 p-2 rounded-xl transition flex items-center"
                title="Clear date filters"
              >
                <span className="material-icons text-sm">close</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[300px]">
        {loading ? (
          <div className="flex-grow flex flex-col justify-center items-center py-20 space-y-3">
            <div className="w-8 h-8 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
            <p className="text-xs font-bold text-slate-400">Loading transactions...</p>
          </div>
        ) : error ? (
          <div className="flex-grow flex flex-col items-center justify-center py-20 text-rose-500 gap-2">
            <span className="material-icons text-4xl">error_outline</span>
            <span className="text-sm font-bold">Failed to load transactions</span>
            <span className="text-xs font-medium">{error}</span>
          </div>
        ) : tableItems.length === 0 ? (
          <div className="flex-grow flex flex-col items-center justify-center py-20 text-slate-400 space-y-2">
            <span className="material-icons text-4xl">receipt_long</span>
            <span className="text-sm font-bold">No Transactions Found</span>
            <span className="text-xs">No transaction records found in database. Try importing some bank statements first!</span>
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <TransactionTable
              transactions={tableItems}
              onRowCategoryChange={handleCategoryChange}
              onSingleAiCategorize={handleSingleAiCategorize}
              aiUpdatingId={aiUpdatingId}
              categories={categories}
              showSelection={false}
              showStatus={true}
              showCategorySelect={true}
            />
          </div>
        )}
        
        {/* Load More Button & Footer Row */}
        {!loading && !error && tableItems.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex-shrink-0 flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 font-mono">
              SHOWING {tableItems.length} OF {transactions.length} LOADED ITEMS
            </span>
            {lastKey && (
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="bg-emerald-50 hover:bg-emerald-100 disabled:bg-slate-50 text-emerald-700 disabled:text-slate-300 font-bold text-xs px-4 py-1.5 rounded-xl border border-emerald-100/50 transition cursor-pointer flex items-center gap-1.5"
              >
                {loadingMore ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-emerald-600/30 border-t-emerald-600 rounded-full animate-spin"></div>
                    <span>Loading...</span>
                  </>
                ) : (
                  <>
                    <span className="material-icons text-xs leading-none">expand_more</span>
                    <span>Load More</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TransactionsPage;
