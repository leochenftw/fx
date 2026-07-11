import React from 'react';
import { Link } from 'react-router-dom';
import type { HeaderProps } from '../types';

export const Header: React.FC<HeaderProps> = ({ isLoggedIn = false }) => {
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

        {/* Call to Action: Import statements */}
        {isLoggedIn && (
          <>
            <button
              disabled
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-90 text-white font-semibold text-xs px-4 py-1.5 rounded-lg flex items-center space-x-1 shadow-sm transition cursor-not-allowed"
              title="Import Bank Statements (Coming Soon)"
            >
              <span className="material-icons text-sm leading-none">add</span>
              <span>Import Statements</span>
            </button>

            <span className="h-4 w-px bg-slate-800"></span>

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
