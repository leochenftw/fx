import React from 'react';
import { Link } from 'react-router-dom';
import type { HeaderProps } from '../types';

export const Header: React.FC<HeaderProps> = ({ isLoggedIn = false, onImportFileSelect, orgs = [] }) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // 1. Check extension
      if (!file.name.toLowerCase().endsWith('.csv')) {
        alert('Invalid file format. Only bank statement files in .csv format are supported.');
        e.target.value = '';
        return;
      }

      // 2. Check empty file
      if (file.size === 0) {
        alert('The selected CSV file is empty.');
        e.target.value = '';
        return;
      }

      // 3. Limit size (prevent loading huge binary files that cause page freeze, 5MB is more than enough for transactions)
      if (file.size > 5 * 1024 * 1024) {
        alert('File size exceeds the limit. Statement file must be smaller than 5MB.');
        e.target.value = '';
        return;
      }

      onImportFileSelect?.(file);
      e.target.value = '';
    }
  };

  const userGroups = React.useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user_groups') || '[]');
    } catch {
      return [];
    }
  }, [isLoggedIn]);

  const isSystemOwner = userGroups.includes('OWNER');

  const currentOrgId = React.useMemo(() => {
    const match = window.location.pathname.match(/^\/orgs\/([a-f0-9-]+)/);
    return match ? match[1] : '';
  }, [window.location.pathname]);

  const hasImportAccess = React.useMemo(() => {
    if (isSystemOwner) return true;
    if (currentOrgId) {
      const currentOrg = orgs.find(o => o.id === currentOrgId);
      return currentOrg?.role === 'OWNER' || currentOrg?.role === 'ADMIN';
    }
    return orgs.some(org => org.role === 'OWNER' || org.role === 'ADMIN');
  }, [isSystemOwner, orgs, currentOrgId]);
  // Pure JavaScript timezone converter (100% dependency-free & immune to supply-chain vulnerabilities)
  const getLocalTime = (utcStr: string): string => {
    try {
      const d = new Date(utcStr);
      if (isNaN(d.getTime())) return utcStr;

      const pad = (num: number) => String(num).padStart(2, '0');

      const year = d.getFullYear();
      const month = pad(d.getMonth() + 1);
      const date = pad(d.getDate());
      const hours = pad(d.getHours());
      const minutes = pad(d.getMinutes());

      return `${year}-${month}-${date} ${hours}:${minutes}`;
    } catch {
      return utcStr;
    }
  };

  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 px-6 py-3.5 flex items-center justify-between sticky top-0 z-50 text-xs">

      {/* ── LEFT SECTION: Logo, Last Login ── */}
      <div className="flex items-center space-x-3.5">
        <Link
          to="/"
          className="text-lg font-black tracking-tight text-white hover:opacity-80 transition cursor-pointer flex items-center"
        >
          F<span className="text-emerald-400">X</span>
        </Link>

        {isLoggedIn && (
          <>
            <span className="h-4 w-px bg-slate-800 hidden sm:inline"></span>

            {/* Last Login Schedule Placeholder */}
            <div className="hidden sm:flex items-center space-x-1 text-[10px] text-slate-400 font-medium">
              <span className="material-icons text-[14px] leading-none text-slate-400">schedule</span>
              <span>Last login: {getLocalTime('2026-07-06T21:28:00Z')}</span>
            </div>
          </>
        )}
      </div>

      {/* ── CENTER SECTION: Disabled Search Input ── */}
      <div className="relative w-40 md:w-60 lg:w-72 hidden xs:block">
        <input
          type="text"
          placeholder="Search transactions..."
          className="w-full bg-slate-800 border-none rounded-lg py-1.5 pl-3.5 pr-8 text-[10px] text-slate-200 font-medium cursor-not-allowed focus:outline-none placeholder-slate-400"
        />
        <span className="material-icons absolute right-2.5 top-1.5 text-slate-400 text-base leading-none">search</span>
      </div>

      {/* ── RIGHT SECTION: Actions, Billing, Bell Notification ── */}
      <div className="flex items-center space-x-3.5">

        {isLoggedIn && (
          <>
            {/* Call to Action: Import statements */}
            {hasImportAccess && (
              <>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept=".csv"
                  onChange={handleFileChange}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-4 py-1.5 rounded-lg flex items-center space-x-1 shadow-sm transition cursor-pointer"
                >
                  <span className="material-icons text-sm leading-none">add</span>
                  <span>Import Statements</span>
                </button>

                <span className="h-4 w-px bg-slate-800"></span>
              </>
            )}

            {/* AWS Estimate Bill Badge */}
            <div
              className="relative group cursor-pointer p-1.5 hover:bg-slate-800 rounded-lg transition"
              title="AWS Daily Billing Estimate"
            >
              <span className="material-icons text-slate-400 group-hover:text-slate-200 text-[17px] leading-none">request_quote</span>
              <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[12px] font-black px-1.5 py-0.5 rounded-full scale-90 leading-none">
                $0.02
              </span>
            </div>

            {/* Unreconciled Items Bell */}
            <div
              className="relative group cursor-pointer p-1.5 hover:bg-slate-800 rounded-lg transition"
              title="Unreconciled Bank Transactions"
            >
              <span className="material-icons text-slate-400 group-hover:text-slate-200 text-[17px] leading-none">notifications</span>
              <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[12px] font-black px-1.5 py-0.5 rounded-full scale-90 leading-none">
                3
              </span>
            </div>
          </>
        )}
      </div>
    </header>
  );
};
export default Header;
