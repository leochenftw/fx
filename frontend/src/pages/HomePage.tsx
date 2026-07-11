import React, { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { HomePageProps } from '../types';

export const HomePage: React.FC<HomePageProps> = ({ orgs = [] }) => {
  const { t } = useTranslation();
  const activeOrgId = localStorage.getItem('active_org_id');
  const widgetsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = widgetsRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const rectHeight = entry.target.getBoundingClientRect().height;
        document.documentElement.style.setProperty('--widgets-height', `${rectHeight}px`);
      }
    });

    observer.observe(element);
    return () => {
      observer.disconnect();
      document.documentElement.style.setProperty('--widgets-height', '0px');
    };
  }, []);

  // ── Find current active organisation detail ──
  const activeOrg = orgs.find(o => o.id === activeOrgId);

  // ── Compute bank balance card data with live linkage & fallback ──
  let displayBankName = 'ANZ';
  let displayLastFour = '1248';
  let displayBalance = 42500.20;
  let hasRealData = false;

  if (activeOrg) {
    const firstAcc = activeOrg.bank_accounts?.[0];
    if (firstAcc) {
      displayBankName = firstAcc.bank_name || 'Bank';
      const fullAccNumber = firstAcc.account_number || '';
      const cleanAcc = fullAccNumber.replace(/[^0-9]/g, '');
      if (cleanAcc.length >= 4) {
        displayLastFour = cleanAcc.slice(-4);
      } else {
        displayLastFour = cleanAcc || 'XXXX';
      }

      // Read balance from opening_balances mapping
      const bankBalances = activeOrg.opening_balances?.bank_balances;
      if (bankBalances && bankBalances[firstAcc.account_number]) {
        const amtStr = bankBalances[firstAcc.account_number].balance;
        const amt = parseFloat(amtStr);
        if (!isNaN(amt)) {
          displayBalance = amt;
          hasRealData = true;
        }
      }
    }
  }

  // ── Stable Currency Formatter ──
  const formatCurrency = (val: number): string => {
    const parts = new Intl.NumberFormat('en-NZ', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(val);
    return `$${parts}`;
  };

  // ── Permission Gate: only ADMIN and OWNER can view the full dashboard ──
  const userGroups: string[] = JSON.parse(localStorage.getItem('user_groups') || '[]');
  const hasAdminAccess = userGroups.includes('ADMIN') || userGroups.includes('OWNER');

  if (!hasAdminAccess) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center px-6">
        <h1 className="sr-only">{t('sidebar.dashboard', 'Dashboard')}</h1>
        <span className="material-icons text-5xl text-slate-300 mb-4">lock</span>
        <h2 className="text-lg font-black text-slate-700 mb-2">Access Restricted</h2>
        <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
          You do not have admin access to view this dashboard. Please contact your system administrator to be assigned the appropriate permissions.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="sr-only">
        {t('sidebar.dashboard', 'Dashboard')}
      </h1>

      {/* ── 1. THE BIG FOUR FINANCIAL WIDGETS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {/* Card 1: Bank Balance */}
        <div ref={widgetsRef} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between hover:border-emerald-500 transition duration-200">
          <div className="flex justify-between items-start">
            <span className="text-xs font-black uppercase tracking-wider text-slate-500">Bank Balance</span>
            <span className="bg-slate-100 text-slate-600 text-xs font-extrabold px-2 py-0.5 rounded font-mono">
              {displayBankName} ••{displayLastFour}
            </span>
          </div>
          <div className="my-3">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              {formatCurrency(displayBalance)}
            </h2>
          </div>
          <span className="text-xs font-bold text-slate-500">
            {hasRealData ? 'Synced moments ago via Live Bank Feed' : 'Synced 2h ago via Bank Feed'}
          </span>
        </div>

        {/* Card 2: Money Coming In */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between hover:border-slate-300 transition duration-200">
          <div className="flex justify-between items-start">
            <span className="text-xs font-black uppercase tracking-wider text-slate-500">Money Coming In</span>
            <span className="material-icons text-emerald-600 text-sm leading-none">arrow_downward</span>
          </div>
          <div className="my-3">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">$14,200.00</h2>
          </div>
          <div className="flex items-center space-x-1 bg-rose-50 text-rose-700 px-2 py-0.5 rounded w-fit border border-rose-100">
            <span className="material-icons text-xs leading-none shrink-0">error_outline</span>
            <span className="text-xs font-extrabold">$3,100 overdue</span>
          </div>
        </div>

        {/* Card 3: Money Going Out */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between hover:border-slate-300 transition duration-200">
          <div className="flex justify-between items-start">
            <span className="text-xs font-black uppercase tracking-wider text-slate-500">Money Going Out</span>
            <span className="material-icons text-rose-500 text-sm leading-none">arrow_upward</span>
          </div>
          <div className="my-3">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">$5,100.50</h2>
          </div>
          <div className="flex items-center space-x-1 bg-amber-50 text-amber-800 px-2 py-0.5 rounded w-fit border border-amber-200">
            <span className="material-icons text-xs leading-none shrink-0">schedule</span>
            <span className="text-xs font-extrabold">Due this wk: $1,200</span>
          </div>
        </div>

        {/* Card 4: Est. GST (15%) - Option A Deep Aurora Navy */}
        <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-sm flex flex-col justify-between relative overflow-hidden border border-slate-800 hover:border-slate-700 transition duration-200">
          <div className="absolute -right-3 -bottom-5 text-slate-800 opacity-20 text-6xl font-black select-none pointer-events-none">GST</div>
          <div className="flex justify-between items-start z-10">
            <span className="text-xs font-black uppercase tracking-wider text-emerald-400">Est. GST (15%)</span>
            <span className="bg-slate-800 text-slate-300 text-xs font-extrabold px-2 py-0.5 rounded font-mono">Apr-May</span>
          </div>
          <div className="my-3 z-10">
            <h2 className="text-2xl font-black tracking-tight text-white">$3,420.00</h2>
          </div>
          <span className="text-xs text-slate-300 z-10">
            Filing due: <strong className="text-white font-bold">28 Jun</strong>
          </span>
        </div>
      </div>

      {/* ── 2. VISUALIZATION CANVAS: FINAL REPORT & CASH FLOW TREND ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

        {/* Left Widget: Final Report (占 5/12 宽度) */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-5 text-slate-800 shadow-sm flex flex-col justify-between relative overflow-hidden space-y-4 hover:border-slate-300 transition duration-200">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2">
              <span className="w-7 h-7 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center material-icons text-sm">bar_chart</span>
              <span className="font-extrabold text-sm text-slate-900">Final report</span>
            </div>
            <button className="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 text-xs font-extrabold px-2.5 py-1.5 rounded-lg flex items-center space-x-1 transition select-none cursor-pointer">
              <span className="material-icons text-[10px]">cloud_download</span>
              <span>.xlsx</span>
            </button>
          </div>

          {/* SVG Circles Container (电脑端 1x4 一字排开) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-6 gap-x-2 py-2">

            {/* Circle 1: Refund amount */}
            <div className="flex flex-col items-center space-y-4">
              {/* 顶部彩色圆点与文本 */}
              <div className="text-center flex flex-col items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mb-1.5"></span>
                <p className="text-xs font-bold text-slate-800 truncate max-w-[110px] leading-tight">Refund amount</p>
                <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mt-0.5">Percents - 50%</p>
              </div>
              {/* 下方自适应圆环 */}
              <div className="relative w-full max-w-[120px] aspect-square flex items-center justify-center">
                <svg className="absolute w-full h-full rotate-[-90deg]" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="44" stroke="rgba(15,23,42,0.04)" strokeWidth="6" fill="transparent" />
                  <circle cx="50" cy="50" r="44" stroke="#10b981" strokeWidth="6" fill="transparent"
                    strokeDasharray="276.4" strokeDashoffset="138.2" strokeLinecap="round" />
                </svg>
                <span className="text-base font-black text-slate-900">50%</span>
              </div>
            </div>

            {/* Circle 2: Refund of interest */}
            <div className="flex flex-col items-center space-y-4">
              {/* 顶部彩色圆点与文本 */}
              <div className="text-center flex flex-col items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mb-1.5"></span>
                <p className="text-xs font-bold text-slate-800 truncate max-w-[110px] leading-tight">Refund of interest</p>
                <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mt-0.5">Percents - 25%</p>
              </div>
              {/* 下方自适应圆环 */}
              <div className="relative w-full max-w-[120px] aspect-square flex items-center justify-center">
                <svg className="absolute w-full h-full rotate-[-90deg]" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="44" stroke="rgba(15,23,42,0.04)" strokeWidth="6" fill="transparent" />
                  <circle cx="50" cy="50" r="44" stroke="#f59e0b" strokeWidth="6" fill="transparent"
                    strokeDasharray="276.4" strokeDashoffset="207.3" strokeLinecap="round" />
                </svg>
                <span className="text-base font-black text-slate-900">25%</span>
              </div>
            </div>

            {/* Circle 3: Main debt */}
            <div className="flex flex-col items-center space-y-4">
              {/* 顶部彩色圆点与文本 */}
              <div className="text-center flex flex-col items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mb-1.5"></span>
                <p className="text-xs font-bold text-slate-800 truncate max-w-[110px] leading-tight">Main debt</p>
                <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mt-0.5">Percents - 10%</p>
              </div>
              {/* 下方自适应圆环 */}
              <div className="relative w-full max-w-[120px] aspect-square flex items-center justify-center">
                <svg className="absolute w-full h-full rotate-[-90deg]" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="44" stroke="rgba(15,23,42,0.04)" strokeWidth="6" fill="transparent" />
                  <circle cx="50" cy="50" r="44" stroke="#818cf8" strokeWidth="6" fill="transparent"
                    strokeDasharray="276.4" strokeDashoffset="41.5" strokeLinecap="round" />
                </svg>
                <span className="text-base font-black text-slate-900">85%</span>
              </div>
            </div>

            {/* Circle 4: Return of fines */}
            <div className="flex flex-col items-center space-y-4">
              {/* 顶部彩色圆点与文本 */}
              <div className="text-center flex flex-col items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mb-1.5"></span>
                <p className="text-xs font-bold text-slate-800 truncate max-w-[110px] leading-tight">Return of fines</p>
                <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mt-0.5">Percents - 70%</p>
              </div>
              {/* 下方自适应圆环 */}
              <div className="relative w-full max-w-[120px] aspect-square flex items-center justify-center">
                <svg className="absolute w-full h-full rotate-[-90deg]" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="44" stroke="rgba(15,23,42,0.04)" strokeWidth="6" fill="transparent" />
                  <circle cx="50" cy="50" r="44" stroke="#3b82f6" strokeWidth="6" fill="transparent"
                    strokeDasharray="276.4" strokeDashoffset="110.6" strokeLinecap="round" />
                </svg>
                <span className="text-base font-black text-slate-900">60%</span>
              </div>
            </div>

          </div>
        </div>

        {/* Right Widget: Cash Flow Trend Waves (占 7/12 宽度) */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-5 text-slate-800 shadow-sm flex flex-col justify-between relative overflow-hidden space-y-4 hover:border-slate-300 transition duration-200">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2">
              <span className="w-7 h-7 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center material-icons text-sm">trending_up</span>
              <span className="font-extrabold text-sm text-slate-900">Cash Flow Trend</span>
            </div>
            <span className="material-icons text-slate-500 text-base cursor-pointer hover:text-slate-700 select-none">remove</span>
          </div>

          {/* High-Fidelity SVG Dual Area Waves Line Chart */}
          <div className="relative w-full h-44">
            <svg className="w-full h-full" viewBox="0 0 500 160" preserveAspectRatio="none">

              {/* Gradients definitions */}
              <defs>
                {/* Emerald Inflow Gradient */}
                <linearGradient id="inflow-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.14" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                </linearGradient>
                {/* Indigo Outflow Gradient */}
                <linearGradient id="outflow-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity="0.10" />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line x1="0" y1="30" x2="500" y2="30" stroke="rgba(15,23,42,0.04)" strokeWidth="1" />
              <line x1="0" y1="70" x2="500" y2="70" stroke="rgba(15,23,42,0.04)" strokeWidth="1" />
              <line x1="0" y1="110" x2="500" y2="110" stroke="rgba(15,23,42,0.04)" strokeWidth="1" />

              {/* Interactive Selected Date Column (Day 22 Highlight Overlay) */}
              <rect x="180" y="10" width="35" height="140" fill="rgba(99,102,241,0.03)" rx="4" />
              <line x1="197.5" y1="10" x2="197.5" y2="150" stroke="rgba(99,102,241,0.12)" strokeWidth="1" strokeDasharray="3 3" />

              {/* ────────────────── 1. OUTFLOW WAVE (Indigo - Bottom Layer) ────────────────── */}
              {/* Wave Area */}
              <path d="M 10 130 Q 72.5 100 135 110 T 260 120 T 385 80 T 490 90 L 490 150 L 10 150 Z" fill="url(#outflow-grad)" />
              {/* Wave Line */}
              <path d="M 10 130 Q 72.5 100 135 110 T 260 120 T 385 80 T 490 90" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" />

              {/* ────────────────── 2. INFLOW WAVE (Emerald - Top Layer) ────────────────── */}
              {/* Wave Area */}
              <path d="M 10 110 Q 72.5 50 135 90 T 260 70 T 385 100 T 490 60 L 490 150 L 10 150 Z" fill="url(#inflow-grad)" />
              {/* Wave Line */}
              <path d="M 10 110 Q 72.5 50 135 90 T 260 70 T 385 100 T 490 60" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" />

              {/* Highlighting Dots with outer shadows */}
              {/* Highlight Dot for Inflow selected point */}
              <circle cx="260" cy="70" r="4.5" fill="white" stroke="#10b981" strokeWidth="2.5" />
              {/* Highlight Dot for Outflow selected point */}
              <circle cx="260" cy="120" r="4.5" fill="white" stroke="#6366f1" strokeWidth="2.5" />

            </svg>

            {/* X Axis Dates Overlay */}
            <div className="absolute left-0 right-0 bottom-0 flex justify-between px-2.5 text-xs text-slate-500 font-bold select-none">
              <span>19</span>
              <span>20</span>
              <span>21</span>
              <span className="text-white bg-indigo-600/85 px-1.5 py-0.5 rounded leading-none text-xs">22</span>
              <span>23</span>
              <span>24</span>
              <span>25</span>
              <span>26</span>
              <span>27</span>
            </div>

          </div>
        </div>
      </div>

      {/* ── 3. RECENT TRANSACTIONS TABLE WIDGET ── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 text-slate-800 shadow-sm flex flex-col justify-between relative overflow-hidden space-y-5 hover:border-slate-300 transition duration-200">

        {/* Card Header */}
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <span className="w-7 h-7 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center material-icons text-sm">receipt_long</span>
            <span className="font-extrabold text-sm text-slate-900">Recent Transactions</span>
          </div>
          <div className="flex items-center space-x-3 text-slate-500 select-none">
            <span className="text-xs font-extrabold bg-amber-50 text-amber-800 border border-amber-100 px-2 py-0.5 rounded-full">3 unreconciled</span>
            <span className="material-icons text-base cursor-pointer hover:text-slate-600">remove</span>
          </div>
        </div>

        {/* Table Container */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                <th className="py-3 pl-3 w-16"></th>
                <th className="py-3 px-3">Description / Payee</th>
                <th className="py-3 px-3 w-32">Date</th>
                <th className="py-3 px-3 w-40">Bank Account</th>
                <th className="py-3 px-3 text-right w-32">Amount</th>
                <th className="py-3 pr-3 text-center w-36">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">

              {/* Row 1: OfficeMax (NEW) */}
              <tr className="hover:bg-slate-50 transition duration-150">
                <td className="py-3.5 pl-3">
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded uppercase leading-none tracking-wide select-none">NEW</span>
                </td>
                <td className="py-3.5 px-3 font-bold text-slate-800 hover:underline cursor-pointer">
                  OfficeMax New Zealand
                </td>
                <td className="py-3.5 px-3 text-slate-500 font-medium">2026-07-06</td>
                <td className="py-3.5 px-3 text-slate-500 font-mono">ANZ Business ••1248</td>
                <td className="py-3.5 px-3 text-right font-black text-rose-600">-$128.50</td>
                <td className="py-3.5 pr-3 text-center">
                  <span className="bg-amber-50 text-amber-800 border border-amber-100 px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider">
                    Unreconciled
                  </span>
                </td>
              </tr>

              {/* Row 2: Spark (✕) */}
              <tr className="hover:bg-slate-50 transition duration-150">
                <td className="py-3.5 pl-3">
                  <span className="w-5 h-5 bg-rose-100 text-rose-800 text-[11px] font-black rounded-full flex items-center justify-center leading-none select-none">✕</span>
                </td>
                <td className="py-3.5 px-3 font-bold text-slate-800 hover:underline cursor-pointer">
                  Spark Digital NZ
                </td>
                <td className="py-3.5 px-3 text-slate-500 font-medium">2026-07-05</td>
                <td className="py-3.5 px-3 text-slate-500 font-mono">ANZ Business ••1248</td>
                <td className="py-3.5 px-3 text-right font-black text-rose-600">-$89.90</td>
                <td className="py-3.5 pr-3 text-center">
                  <span className="bg-rose-50 text-rose-700 border border-rose-100 px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider">
                    Unmatched
                  </span>
                </td>
              </tr>

              {/* Row 3: Xero (Dot) */}
              <tr className="hover:bg-slate-50 transition duration-150">
                <td className="py-3.5 pl-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300 block mx-auto"></span>
                </td>
                <td className="py-3.5 px-3 font-bold text-slate-800 hover:underline cursor-pointer">
                  Xero Subscription
                </td>
                <td className="py-3.5 px-3 text-slate-500 font-medium">2026-07-03</td>
                <td className="py-3.5 px-3 text-slate-500 font-mono">ANZ Business ••1248</td>
                <td className="py-3.5 px-3 text-right font-black text-rose-600">-$55.00</td>
                <td className="py-3.5 pr-3 text-center">
                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider">
                    Reconciled
                  </span>
                </td>
              </tr>

              {/* Row 4: Foxy Tech Invoice (Dot) */}
              <tr className="hover:bg-slate-50 transition duration-150">
                <td className="py-3.5 pl-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300 block mx-auto"></span>
                </td>
                <td className="py-3.5 px-3 font-bold text-slate-800 hover:underline cursor-pointer">
                  Foxy Tech Invoice INV-004
                </td>
                <td className="py-3.5 px-3 text-slate-500 font-medium">2026-07-02</td>
                <td className="py-3.5 px-3 text-slate-500 font-mono">ANZ Business ••1248</td>
                <td className="py-3.5 px-3 text-right font-black text-emerald-600">+$1,200.00</td>
                <td className="py-3.5 pr-3 text-center">
                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider">
                    Reconciled
                  </span>
                </td>
              </tr>

              {/* Row 5: Mitre 10 (Pulse Dot) */}
              <tr className="hover:bg-slate-50 transition duration-150">
                <td className="py-3.5 pl-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse block mx-auto"></span>
                </td>
                <td className="py-3.5 px-3 font-bold text-slate-800 hover:underline cursor-pointer">
                  Mitre 10 Auckland
                </td>
                <td className="py-3.5 px-3 text-slate-500 font-medium">2026-07-01</td>
                <td className="py-3.5 px-3 text-slate-500 font-mono">ANZ Business ••1248</td>
                <td className="py-3.5 px-3 text-right font-black text-rose-600">-$245.00</td>
                <td className="py-3.5 pr-3 text-center">
                  <span className="bg-amber-50 text-amber-800 border border-amber-100 px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider">
                    Unreconciled
                  </span>
                </td>
              </tr>

            </tbody>
          </table>
        </div>

        {/* Footer Actions / Pagination */}
        <div className="flex flex-col sm:flex-row justify-between items-center pt-3 border-t border-slate-100 gap-3">

          {/* Show on Page selector */}
          <div className="flex items-center space-x-2 text-xs text-slate-500 font-extrabold select-none">
            <span>SHOW ON PAGE</span>
            <select className="bg-slate-50 border border-slate-200 text-slate-600 rounded px-2 py-1 focus:outline-none cursor-pointer hover:bg-slate-100 transition">
              <option>5</option>
              <option>10</option>
              <option>50</option>
            </select>
          </div>

          {/* High-Fidelity Pagination Blocks */}
          <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden text-xs font-extrabold text-slate-600 shadow-sm select-none">
            <button className="px-2.5 py-1.5 hover:bg-slate-50 border-r border-slate-200 transition cursor-pointer flex items-center">
              <span className="material-icons text-xs leading-none">chevron_left</span>
            </button>
            <button className="px-3 py-1.5 hover:bg-slate-50 border-r border-slate-200 transition cursor-pointer">1</button>
            <button className="px-3 py-1.5 hover:bg-slate-50 border-r border-slate-200 transition cursor-pointer">2</button>
            <button className="px-3 py-1.5 bg-indigo-600 text-white border-r border-indigo-600 transition cursor-pointer">3</button>
            <span className="px-2 py-1.5 border-r border-slate-200 bg-slate-50 text-slate-400">...</span>
            <button className="px-3 py-1.5 hover:bg-slate-50 border-r border-slate-200 transition cursor-pointer">8</button>
            <button className="px-3 py-1.5 hover:bg-slate-50 border-r border-slate-200 transition cursor-pointer">9</button>
            <button className="px-2.5 py-1.5 hover:bg-slate-50 transition cursor-pointer flex items-center">
              <span className="material-icons text-xs leading-none">chevron_right</span>
            </button>
          </div>

        </div>

      </div>

    </div>
  );
};
export default HomePage;
