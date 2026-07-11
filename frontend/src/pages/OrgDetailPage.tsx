import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getValidToken } from '../App';
import { cognitoConfig } from '../cognitoConfig';
import { getInitials } from '../utils/name';
import type { OrganisationDetail } from '../types';

// 50 mock transactions
const mockTransactionsData = Array.from({ length: 50 }, (_, idx) => {
  const isIncome = idx % 3 === 0;
  const amount = isIncome ? (150 + idx * 80) : -(45 + idx * 12);
  const desc = isIncome
    ? ['Payment from Fletchers NZ', 'Consulting invoice received', 'GST Refund received', 'Dividends payout'][idx % 4]
    : ['Bunnings Trade - Plywood', 'Z Energy Fuel - Petone', 'Spark NZ - Monthly Plan', 'Mico Plumbing Supply', 'Mitre 10 Petone'][idx % 5];
  const date = `${(10 - idx % 10) || 1} Jul`;
  return {
    date,
    desc: `${desc} #${idx + 1}`,
    amount,
    status: idx % 6 === 0 ? 'pending' : 'cleared'
  };
});

// 30 mock bills
const mockBillsData = Array.from({ length: 30 }, (_, idx) => {
  const amount = 200 + idx * 150;
  const vendor = ['The Warehouse Group', 'Mitre 10 Mega (Petone)', 'Placemakers Hutt City', 'Mico Plumbing', 'OfficeMax NZ'][idx % 5];
  const isOverdue = idx % 4 === 0;
  return {
    vendor,
    ref: `BILL-2026-${100 + idx}`,
    amount,
    due: isOverdue ? `Overdue ${idx + 1} days` : `Due in ${idx + 2} days`,
    urgent: isOverdue
  };
});

// 30 mock invoices
const mockInvoicesData = Array.from({ length: 30 }, (_, idx) => {
  const amount = 800 + idx * 300;
  const client = ['Fletcher Building NZ', 'Spark NZ Ltd', 'Goodman Property Trust', 'Meridian Energy', 'Xero NZ'][idx % 5];
  const paid = idx % 3 === 0;
  const status = paid ? 'Paid' : (idx % 3 === 1 ? 'Sent' : 'Draft');
  return {
    client,
    ref: `INV-2026-${200 + idx}`,
    amount,
    status,
    paid
  };
});

export const OrgDetailPage: React.FC = () => {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [org, setOrg] = useState<OrganisationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const fetchedRef = useRef<string | null>(null);

  // Derive activeTab from route location path
  const location = useLocation();
  const path = location.pathname;
  let activeTab: 'transactions' | 'bills' | 'invoices' = 'transactions';
  if (path.endsWith('/bills')) {
    activeTab = 'bills';
  } else if (path.endsWith('/invoices')) {
    activeTab = 'invoices';
  }

  // Navigate to target subroute to update URL and activate corresponding tab
  const handleTabChange = (tab: 'transactions' | 'bills' | 'invoices') => {
    if (orgId) {
      navigate(`/orgs/${orgId}/${tab}`);
    }
  };

  // Pagination limits, starting with 20 items per batch
  const [limits, setLimits] = useState({
    transactions: 20,
    bills: 20,
    invoices: 20
  });

  const handleLoadMore = (tab: 'transactions' | 'bills' | 'invoices') => {
    setLimits((prev) => ({
      ...prev,
      [tab]: prev[tab] + 20
    }));
  };

  useEffect(() => {
    if (fetchedRef.current === orgId) return;

    const fetchOrgDetail = async () => {
      if (!orgId) return;
      fetchedRef.current = orgId;
      setLoading(true);
      setError(null);

      // Add a tiny 300ms delay to satisfy user requirement: "进去的时候显示加载信息/动画"
      await new Promise((resolve) => setTimeout(resolve, 300));

      try {
        const activeToken = await getValidToken();
        const res = await fetch(`${cognitoConfig.OrgsApiUrl}orgs/${orgId}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${activeToken}`,
          },
        });

        const data = await res.json();
        if (res.ok) {
          // Backend directly flattens organisation metadata on success response
          setOrg(data);
        } else {
          if (res.status === 403) {
            setError(t('org_detail.forbidden', 'Access Denied: You do not have owner/admin permission to view this organisation.'));
          } else if (res.status === 404) {
            setError(t('org_detail.not_found', 'Organisation not found.'));
          } else {
            setError(data.error || 'Failed to fetch details.');
          }
        }
      } catch (err: any) {
        fetchedRef.current = null; // Reset latch on failure to allow retries
        setError(err.message || 'Network request failed.');
      } finally {
        setLoading(false);
      }
    };

    fetchOrgDetail();
  }, [orgId]);



  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center py-24 space-y-4">
        <div className="w-9 h-9 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
        <p className="text-xs font-semibold text-slate-400">Syncing ledger database...</p>
      </div>
    );
  }

  // 🚨 Auth Gate: Render access denied / error blocking banners
  if (error || !org) {
    return (
      <div className="space-y-6 w-full max-w-[1280px]">
        {/* Header with back button */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Security Alert</h1>
            <p className="text-xs text-slate-400 mt-1">Sovereign auth gate has rejected your access request.</p>
          </div>
          <button
            onClick={() => navigate('/orgs')}
            className="text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm transition flex items-center justify-center space-x-1.5 shrink-0 cursor-pointer"
          >
            <span className="material-icons text-[14px] leading-none">arrow_back</span>
            <span>Back to Portal</span>
          </button>
        </div>

        {/* Access Denied banner */}
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm text-center py-16 space-y-4">
          <div className="w-16 h-16 rounded-full bg-red-50 border border-red-100 text-red-600 flex items-center justify-center mx-auto shadow-inner">
            <span className="material-icons text-3xl">gpp_bad</span>
          </div>
          <h3 className="font-extrabold text-slate-900 text-sm">Access Denied</h3>
          <p className="text-xs text-red-500 max-w-sm mx-auto leading-relaxed font-medium">
            {error || 'You do not have access permission to this organization.'}
          </p>
        </div>
      </div>
    );
  }



  return (
    <div className="space-y-6 w-full max-w-[1280px] pb-12">
      {/* High-Fidelity Org Details Panel matching the original Dashboard screenshot design */}
      <div className="bg-white border border-slate-200 rounded-2xl px-6 pt-6 shadow-sm space-y-6">
        {/* Top Section: Name, UUID Meta & Role */}
        <div className={`flex justify-between items-center${expanded ? ' pb-4 border-b border-slate-100' : ''}`}>
          <div>
            <div className="flex items-center space-x-2.5">
              <span
                onClick={() => navigate('/orgs')}
                className="material-icons text-slate-400 hover:text-slate-700 text-2xl cursor-pointer transition select-none"
              >
                arrow_back
              </span>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">{org.name}</h2>
              <span className="bg-slate-50 border border-slate-200 text-slate-600 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider font-mono select-none mt-1 shrink-0">
                ROLE: {org.role || 'OWNER'}
              </span>
            </div>
            <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider font-mono">
              ID: {org.id} &nbsp;|&nbsp; IRD: {org.ird_number} &nbsp;|&nbsp; Type: {org.entity_type.toUpperCase()}
            </p>
          </div>
          <div>
            <button
              onClick={() => navigate(`/orgs/${org.id}/edit`)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-1.5 rounded-xl shadow-sm shadow-emerald-100 transition flex items-center justify-center space-x-1.5 shrink-0 cursor-pointer"
            >
              <span className="material-icons text-[14px] leading-none">settings</span>
              <span>Edit</span>
            </button>
          </div>
        </div>

        {/* Collapsible body: GST Settings, Bank Accounts, AR/AP */}
        {expanded && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 animate-in">
            {/* GST SETTINGS Box (占 4/12 宽) */}
            <div className="md:col-span-4 border border-slate-200/80 rounded-2xl p-5 bg-white space-y-4">
              <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-900 border-b border-slate-100 pb-2 select-none">
                GST SETTINGS
              </h3>
              <div className="space-y-2.5 text-xs font-semibold">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Registered:</span>
                  <span className="text-slate-900 font-black uppercase">{org.gst_registered ? 'YES' : 'NO'}</span>
                </div>
                {org.gst_registered && (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">GST Basis:</span>
                      <span className="text-slate-900 font-bold capitalize">{org.gst_basis || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">GST Period:</span>
                      <span className="text-slate-900 font-bold capitalize">
                        {org.gst_period ? org.gst_period.replace('_', ' ') : 'N/A'}
                      </span>
                    </div>
                  </>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Tax Year End:</span>
                  <span className="text-slate-900 font-black">March 31 (NZ)</span>
                </div>
              </div>
            </div>

            {/* ACTIVE BANK ACCOUNTS Box (占 8/12 宽) */}
            <div className="md:col-span-8 border border-slate-200/80 rounded-2xl p-5 bg-white space-y-4">
              <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-900 border-b border-slate-100 pb-2 select-none">
                ACTIVE BANK ACCOUNTS
              </h3>
              {!org.bank_accounts || org.bank_accounts.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No bank accounts registered.</p>
              ) : (
                <div className="space-y-3">
                  {org.bank_accounts.map((acc, index) => {
                    const accDetail = org.opening_balances?.bank_balances?.[acc.account_number];
                    const balance = accDetail ? accDetail.balance : undefined;
                    const hasBalance = balance !== undefined && !isNaN(balance);

                    return (
                      <div
                        key={index}
                        className="border border-slate-100 rounded-xl p-3 flex justify-between items-center bg-slate-50/50 hover:bg-slate-50 transition duration-150 text-xs font-semibold"
                      >
                        <div>
                          <h4 className="text-slate-800 font-bold">{acc.account_name}</h4>
                          <p className="text-slate-400 font-mono font-medium text-[9px] mt-0.5">
                            {acc.account_number}
                          </p>
                        </div>
                        <div>
                          {hasBalance ? (
                            <span className="text-slate-900 font-black font-mono">
                              {new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(balance)}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-300 font-bold uppercase tracking-wider select-none pr-2">
                              No balance
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {/* AR/AP balances cards (全宽 12/12) */}
            <div className="col-span-12 grid grid-cols-1 md:grid-cols-2 gap-6 border-slate-100">
              {/* AR balances card */}
              <div className="border border-slate-200/80 rounded-2xl p-5 bg-white space-y-4">
                <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-900 border-b border-slate-100 pb-2 select-none">
                  ACCOUNTS RECEIVABLE (AR) OPENING
                </h3>
                {!org.opening_balances?.ar_balances || Object.keys(org.opening_balances.ar_balances).length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-2">No opening debtor balances recorded.</p>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto pr-1 text-xs">
                    {Object.entries(org.opening_balances.ar_balances).map(([client, amount]) => (
                      <div key={client} className="flex justify-between py-2.5 font-semibold">
                        <span className="text-slate-700">{client}</span>
                        <span className="text-slate-900 font-bold">
                          {new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* AP balances card */}
              <div className="border border-slate-200/80 rounded-2xl p-5 bg-white space-y-4">
                <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-900 border-b border-slate-100 pb-2 select-none">
                  ACCOUNTS PAYABLE (AP) OPENING
                </h3>
                {!org.opening_balances?.ap_balances || Object.keys(org.opening_balances.ap_balances).length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-2">No opening creditor balances recorded.</p>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto pr-1 text-xs">
                    {Object.entries(org.opening_balances.ap_balances).map(([vendor, amount]) => (
                      <div key={vendor} className="flex justify-between py-2.5 font-semibold">
                        <span className="text-slate-700">{vendor}</span>
                        <span className="text-slate-900 font-bold">
                          {new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Toggle expand/collapse button */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center space-x-1.5 text-[10px] font-bold text-slate-400 hover:text-slate-600 uppercase tracking-wider py-2 border-t border-slate-100 transition cursor-pointer select-none"
        >
          <span className="material-icons text-sm leading-none">
            {expanded ? 'expand_less' : 'expand_more'}
          </span>
          <span>{expanded ? 'Collapse Details' : 'Expand Details'}</span>
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* LOWER HALF: 70/30 Asymmetric Dual-Column Layout                  */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── LEFT COLUMN (2/3 width) ── */}
        <div className="lg:col-span-2 space-y-6">

          {/* ▸ Block 1: Reconciliation Banner */}
          {org.bank_accounts && org.bank_accounts.length > 0 && (
            <div className="bg-gradient-to-r from-emerald-700 to-teal-800 rounded-2xl p-6 text-white shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <span className="bg-emerald-950/60 text-emerald-300 text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full tracking-wider border border-emerald-600/30 select-none">
                  Action Required
                </span>
                <h3 className="text-lg font-bold mt-2.5">
                  {org.bank_accounts[0].account_name} has 14 items to reconcile
                </h3>
                <p className="text-emerald-100 text-xs mt-0.5">
                  Match your bank statements with invoices to keep your GST return accurate.
                </p>
              </div>
              <button className="w-full sm:w-auto bg-white text-emerald-900 hover:bg-slate-100 font-bold text-xs px-5 py-3 rounded-xl shadow transition shrink-0 flex items-center justify-center space-x-2 cursor-pointer">
                <span>Reconcile (14)</span>
                <span className="material-icons text-sm leading-none">arrow_forward</span>
              </button>
            </div>
          )}

          {/* ▸ Block 2: Tabbed Data Panel (Transactions / Bills / Invoices) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
            {/* Tab Bar */}
            <div className="flex border-b border-slate-100 px-6 pt-4">
              {(['transactions', 'bills', 'invoices'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => handleTabChange(tab)}
                  className={`px-4 pb-3 text-xs font-bold uppercase tracking-wider transition border-b-2 cursor-pointer ${activeTab === tab
                    ? 'text-emerald-700 border-emerald-600'
                    : 'text-slate-400 border-transparent hover:text-slate-600'
                    }`}
                >
                  {tab === 'transactions' ? 'Transactions' : tab === 'bills' ? 'Bills' : 'Invoices'}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="p-6">
              {/* ── Transactions Tab ── */}
              {activeTab === 'transactions' && (
                <div className="divide-y divide-slate-100 text-xs">
                  {mockTransactionsData.slice(0, limits.transactions).map((tx, i) => {
                    const acctNo = tx.desc.includes('Bunnings') || tx.desc.includes('Fletchers') || tx.desc.includes('Spark')
                      ? (org.bank_accounts?.[0]?.account_number || '00-1004')
                      : (org.bank_accounts?.[1]?.account_number || org.bank_accounts?.[0]?.account_number || '00-2700');

                    return (
                      <div key={i} className="py-3.5 flex items-center justify-between animate-in content-visibility-auto">
                        <div className="flex items-center space-x-3">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${tx.amount >= 0 ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                          <div>
                            <p className="font-bold text-slate-900">{tx.desc}</p>
                            <p className="text-slate-400 text-[11px] mt-0.5">
                              {tx.date} · <span className="font-mono">••{acctNo.slice(-4)}</span>
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`font-black block text-sm ${tx.amount >= 0 ? 'text-emerald-700' : 'text-slate-900'}`}>
                            {tx.amount >= 0 ? '+' : ''}{new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(tx.amount)}
                          </span>
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${tx.status === 'cleared' ? 'text-slate-400' : 'text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded'
                            }`}>
                            {tx.status === 'cleared' ? 'Cleared' : 'Pending'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {limits.transactions < mockTransactionsData.length && (
                    <div className="pt-4 text-center">
                      <button
                        onClick={() => handleLoadMore('transactions')}
                        className="text-xs font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100/50 px-5 py-2 rounded-xl transition duration-200 cursor-pointer shadow-sm"
                      >
                        Load more ({limits.transactions} of {mockTransactionsData.length} shown)
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── Bills Tab ── */}
              {activeTab === 'bills' && (
                <div className="divide-y divide-slate-100 text-xs">
                  {mockBillsData.slice(0, limits.bills).map((bill, i) => (
                    <div key={i} className="py-3.5 flex items-center justify-between animate-in content-visibility-auto">
                      <div className="flex items-center space-x-3">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${bill.urgent ? 'bg-rose-500' : 'bg-amber-400'}`} />
                        <div>
                          <p className="font-bold text-slate-900">{bill.vendor}</p>
                          <p className="text-slate-400 text-[11px] mt-0.5">{bill.ref}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-black text-slate-900 block text-sm">
                          {new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(bill.amount)}
                        </span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${bill.urgent ? 'text-rose-600 bg-rose-50' : 'text-slate-400'
                          }`}>
                          {bill.due}
                        </span>
                      </div>
                    </div>
                  ))}
                  {limits.bills < mockBillsData.length && (
                    <div className="pt-4 text-center">
                      <button
                        onClick={() => handleLoadMore('bills')}
                        className="text-xs font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100/50 px-5 py-2 rounded-xl transition duration-200 cursor-pointer shadow-sm"
                      >
                        Load more ({limits.bills} of {mockBillsData.length} shown)
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── Invoices Tab ── */}
              {activeTab === 'invoices' && (
                <div className="divide-y divide-slate-100 text-xs">
                  {mockInvoicesData.slice(0, limits.invoices).map((inv, i) => (
                    <div key={i} className="py-3.5 flex items-center justify-between animate-in content-visibility-auto">
                      <div className="flex items-center space-x-3">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${inv.paid ? 'bg-emerald-500' : inv.status === 'Sent' ? 'bg-blue-400' : 'bg-slate-300'}`} />
                        <div>
                          <p className="font-bold text-slate-900">{inv.client}</p>
                          <p className="text-slate-400 text-[11px] mt-0.5">{inv.ref}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-black text-slate-900 block text-sm">
                          {new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(inv.amount)}
                        </span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${inv.paid ? 'text-emerald-600 bg-emerald-50' : inv.status === 'Sent' ? 'text-blue-600 bg-blue-50' : 'text-slate-400 bg-slate-50'
                          }`}>
                          {inv.status}
                        </span>
                      </div>
                    </div>
                  ))}
                  {limits.invoices < mockInvoicesData.length && (
                    <div className="pt-4 text-center">
                      <button
                        onClick={() => handleLoadMore('invoices')}
                        className="text-xs font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100/50 px-5 py-2 rounded-xl transition duration-200 cursor-pointer shadow-sm"
                      >
                        Load more ({limits.invoices} of {mockInvoicesData.length} shown)
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN (1/3 width) ── */}
        <div className="space-y-6">

          {/* ▸ Block 3: Upcoming Deadlines Timeline */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center space-x-2 mb-4">
              <span className="text-base">📅</span>
              <h3 className="font-extrabold text-slate-900 text-sm">Upcoming Deadlines</h3>
            </div>

            <div className="relative pl-5 space-y-5 before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              {/* Node 1: Urgent — GST Return */}
              <div className="relative">
                <div className="absolute -left-4.5 top-1 w-2.5 h-2.5 rounded-full bg-rose-600 ring-4 ring-rose-50" />
                <span className="text-[10px] font-black uppercase tracking-wider text-rose-600 bg-rose-50 px-2 py-0.5 rounded select-none">
                  Due in 7 days
                </span>
                <h4 className="text-xs font-bold text-slate-900 mt-1">GST Return (Period: Apr-May)</h4>
                <p className="text-[11px] font-semibold text-slate-500 mt-0.5">Amount: $3,420.00</p>
                <button className="mt-2.5 w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2 px-3 rounded-lg shadow-sm transition flex items-center justify-center space-x-1.5 cursor-pointer">
                  <span className="material-icons text-[12px] leading-none">send</span>
                  <span>File to IRD via Gateway</span>
                </button>
              </div>

              {/* Node 2: Mid-term — Bill Due */}
              <div className="relative opacity-60 hover:opacity-100 transition">
                <div className="absolute -left-4.5 top-1 w-2.5 h-2.5 rounded-full bg-amber-400" />
                <span className="text-[10px] font-bold text-slate-400 uppercase">12 July 2026</span>
                <h4 className="text-xs font-bold text-slate-900 mt-0.5">Bill — Mitre 10 Mega (Petone)</h4>
                <p className="text-[11px] font-semibold text-slate-500 mt-0.5">$1,850.00 due</p>
              </div>

              {/* Node 3: Long-term — Provisional Tax */}
              <div className="relative opacity-60 hover:opacity-100 transition">
                <div className="absolute -left-4.5 top-1 w-2.5 h-2.5 rounded-full bg-slate-300" />
                <span className="text-[10px] font-bold text-slate-400 uppercase">28 August 2026</span>
                <h4 className="text-xs font-bold text-slate-900 mt-0.5">Provisional Tax (1st Instalment)</h4>
              </div>
            </div>
          </div>

          {/* ▸ Block 3.5: Staff Access Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <span className="material-icons text-slate-400 text-base leading-none">people</span>
                <h3 className="font-extrabold text-slate-900 text-sm">Staff</h3>
              </div>
            </div>

            {/* List */}
            <div className="space-y-3.5">
              {!org.staff || org.staff.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No staff members have access to this organisation.</p>
              ) : (
                org.staff.map((member) => {

                  let avatarTheme = 'bg-slate-50 border-slate-200 text-slate-600';
                  let badgeTheme = 'bg-slate-50 border-slate-200 text-slate-600';
                  if (member.role === 'OWNER') {
                    avatarTheme = 'bg-amber-50 border-amber-200 text-amber-600';
                    badgeTheme = 'bg-amber-50 border-amber-200 text-amber-700';
                  } else if (member.role === 'ADMIN') {
                    avatarTheme = 'bg-blue-50 border-blue-200 text-blue-600';
                    badgeTheme = 'bg-blue-50 border-blue-100 text-blue-600';
                  } else if (member.role === 'STAFF') {
                    avatarTheme = 'bg-purple-50 border-purple-200 text-purple-600';
                    badgeTheme = 'bg-purple-50 border-purple-100 text-purple-600';
                  }

                  return (
                    <div key={member.id} className="flex items-center justify-between group">
                      <div className="flex items-center space-x-3">
                        <div className={`w-8 h-8 rounded-full border flex items-center justify-center font-bold text-xs shrink-0 ${avatarTheme}`}>
                          {getInitials(member.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-black text-slate-900 truncate leading-snug">{member.name}</div>
                          <div className="text-xs text-slate-400 font-semibold truncate max-w-[180px] mt-0.5">{member.email}</div>
                        </div>
                      </div>
                      <span className={`px-2.5 py-0.5 text-[10px] font-black border rounded uppercase tracking-wider shrink-0 ${badgeTheme}`}>
                        {t(`user_groups.${member.role}`, member.role)}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer link to manage access */}
            <div className="pt-2.5 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => navigate('/staff')}
                className="text-xs font-black text-slate-400 hover:text-slate-900 uppercase tracking-wider flex items-center transition-colors cursor-pointer bg-transparent border-0 outline-none p-0"
              >
                Manage Access
                <span className="material-icons text-sm ml-1 leading-none">arrow_forward</span>
              </button>
            </div>
          </div>

          {/* ▸ Block 4: Quick Actions */}
          <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-sm border border-slate-800">
            <h3 className="font-extrabold text-xs text-slate-400 uppercase tracking-wider mb-3 select-none">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2.5">
              {/* Upload/Snap Receipt — device responsive */}
              <label className="bg-slate-800 hover:bg-slate-700 p-3 rounded-xl text-left transition flex flex-col justify-between h-20 border border-slate-700/50 group cursor-pointer">
                <span className="material-icons text-emerald-400 text-lg group-hover:scale-110 transition">
                  {/* Desktop: upload_file, Mobile: photo_camera — CSS toggle */}
                  <span className="hidden md:inline">upload_file</span>
                  <span className="md:hidden">photo_camera</span>
                </span>
                <span className="text-xs font-bold text-slate-200">
                  <span className="hidden md:inline">Upload Receipt</span>
                  <span className="md:hidden">Snap Receipt</span>
                </span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                />
              </label>

              {/* Send Invoice — display only */}
              <div className="bg-slate-800 p-3 rounded-xl text-left flex flex-col justify-between h-20 border border-slate-700/50">
                <span className="material-icons text-blue-400 text-lg">request_quote</span>
                <span className="text-xs font-bold text-slate-200">Send Invoice</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
export default OrgDetailPage;
