import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getInitials } from '../utils/name';
import type { SidebarProps } from '../types';

export const Sidebar: React.FC<SidebarProps> = ({ onLogout }) => {
  const { t, i18n } = useTranslation();
  const location = useLocation();

  const [firstName, setFirstName] = useState(localStorage.getItem('user_firstname') || '');
  const [lastName, setLastName] = useState(localStorage.getItem('user_lastname') || '');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Synchronize profile name updates immediately
  useEffect(() => {
    const interval = setInterval(() => {
      const f = localStorage.getItem('user_firstname') || '';
      const l = localStorage.getItem('user_lastname') || '';
      if (f !== firstName || l !== lastName) {
        setFirstName(f);
        setLastName(l);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [firstName, lastName]);

  const email = localStorage.getItem('user_email') || 'your@company.co.nz';
  const isChinese = i18n.language?.startsWith('zh');

  const fullName = firstName || lastName
    ? isChinese
      ? `${lastName.trim()}${firstName.trim()}`.trim()
      : `${firstName.trim()} ${lastName.trim()}`.trim()
    : email.split('@')[0];

  const initial = getInitials(fullName);

  // Core navigation items config
  const orgRelated = [
    {
      path: '/orgs',
      label: 'sidebar.organisations',
      defaultLabel: 'Organisations',
      icon: 'corporate_fare',
      badge: null,
    },
    {
      path: '/staff',
      label: 'sidebar.staff_members',
      defaultLabel: 'Staff Members',
      icon: 'people',
      badge: null,
    },
  ];

  const financeRelated = [
    {
      path: '/transactions',
      label: 'sidebar.transactions',
      defaultLabel: 'Transactions',
      icon: 'receipt_long',
      badge: 3,
    },
    {
      path: '/invoices',
      label: 'sidebar.invoices',
      defaultLabel: 'Invoices',
      icon: 'request_quote',
      badge: null,
    },
    {
      path: '/bills',
      label: 'sidebar.bills',
      defaultLabel: 'Bills',
      icon: 'payments',
      badge: null,
    },
  ];

  const reportRelated = [
    {
      path: '/reports',
      label: 'sidebar.reports',
      defaultLabel: 'Reports',
      icon: 'assessment',
      badge: null,
    },
  ];

  const settingsAndSupport = [
    {
      path: '/settings',
      label: 'sidebar.settings',
      defaultLabel: 'Settings',
      icon: 'settings',
      badge: null,
    },
    {
      path: '/support',
      label: 'sidebar.support',
      defaultLabel: 'Support',
      icon: 'support_agent',
    }
  ];

  return (
    <aside className="hidden md:flex w-full md:w-60 flex-shrink-0 flex-col space-y-4 h-full py-8">

      {/* 1. User Account Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-sm relative overflow-hidden md:h-[var(--widgets-height)] motion-height--slow min-height--75">
        <div className="flex items-center space-x-3">

          {/* Avatar circle containing first name initial */}
          <div className="w-10 h-10 bg-emerald-600 text-white font-black text-sm rounded-full flex items-center justify-center shadow-inner select-none flex-shrink-0">
            {initial}
          </div>

          <div className="min-w-0">
            <div
              className="font-extrabold text-slate-900 text-[14px] truncate max-w-[110px]"
              title={fullName}
            >
              {fullName}
            </div>
            <Link
              to="/profile"
              className="text-emerald-600 hover:text-emerald-500 font-bold hover:underline cursor-pointer text-[10px] block mt-0.5"
            >
              {t('sidebar.view_profile')}
            </Link>
          </div>
        </div>

        {/* Inline Logout Confirmation Control */}
        {!showLogoutConfirm ? (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowLogoutConfirm(true);
            }}
            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition cursor-pointer flex items-center justify-center flex-shrink-0"
            title={t('sidebar.log_out')}
          >
            <span className="material-icons text-base leading-none">logout</span>
          </button>
        ) : (
          <div className="flex items-center space-x-1 flex-shrink-0 animate-fadeIn">
            {/* Confirm check */}
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onLogout();
              }}
              className="p-1 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-lg transition cursor-pointer flex items-center justify-center"
              title={t('sidebar.confirm_log_out')}
            >
              <span className="material-icons text-xs leading-none font-bold">check</span>
            </button>
            {/* Cancel cross */}
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowLogoutConfirm(false);
              }}
              className="p-1 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-lg transition cursor-pointer flex items-center justify-center"
              title={t('sidebar.cancel')}
            >
              <span className="material-icons text-xs leading-none font-bold">close</span>
            </button>
          </div>
        )}
      </div>

      {/* 2. Navigation Actions Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-2.5 shadow-sm space-y-1 flex-grow flex flex-col">
        {/* Main Menu Links Group */}
        <div className="space-y-1">
          <Link
            to="/"
            className={`flex items-center space-x-2.5 px-3.5 py-2.5 rounded-xl transition font-bold text-[14px] ${location.pathname === "/"
              ? 'bg-emerald-50 text-emerald-700 font-extrabold'
              : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`}
          >
            <span className={`material-icons text-[15px] leading-none ${location.pathname === "/" ? 'text-emerald-600 font-black' : 'text-slate-400'}`}>
              speed
            </span>
            <span>{t('sidebar.dashboard')}</span>
          </Link>

          <hr className="border-slate-100 my-2" />

          {orgRelated.map((item) => {
            // Exact matching for '/' or standard prefix matching for subroutes
            const isActive = item.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path);

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl transition font-bold text-[14px] ${isActive
                  ? 'bg-emerald-50 text-emerald-700 font-extrabold shadow-sm/5'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                  }`}
              >
                <div className="flex items-center space-x-2.5">
                  <span className={`material-icons text-[15px] leading-none ${isActive ? 'text-emerald-600 font-black' : 'text-slate-400'}`}>
                    {item.icon}
                  </span>
                  <span>{t(item.label, item.defaultLabel)}</span>
                </div>

                {/* Optional outstanding action alert badges */}
                {item.badge && (
                  <span className="bg-rose-500 text-white text-[12px] font-black px-1.5 py-0.5 rounded-full scale-90 leading-none shadow-sm shadow-rose-200">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        <hr className="border-slate-100 my-2" />
        {financeRelated.map((item) => {
          // Exact matching for '/' or standard prefix matching for subroutes
          const isActive = item.path === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(item.path);

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl transition font-bold text-[14px] ${isActive
                ? 'bg-emerald-50 text-emerald-700 font-extrabold shadow-sm/5'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                }`}
            >
              <div className="flex items-center space-x-2.5">
                <span className={`material-icons text-[15px] leading-none ${isActive ? 'text-emerald-600 font-black' : 'text-slate-400'}`}>
                  {item.icon}
                </span>
                <span>{t(item.label, item.defaultLabel)}</span>
              </div>

              {/* Optional outstanding action alert badges */}
              {item.badge && (
                <span className="bg-rose-500 text-white text-[12px] font-black px-1.5 py-0.5 rounded-full scale-90 leading-none shadow-sm shadow-rose-200">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}

        <hr className="border-slate-100 my-2" />
        {reportRelated.map((item) => {
          // Exact matching for '/' or standard prefix matching for subroutes
          const isActive = item.path === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(item.path);

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl transition font-bold text-[14px] ${isActive
                ? 'bg-emerald-50 text-emerald-700 font-extrabold shadow-sm/5'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                }`}
            >
              <div className="flex items-center space-x-2.5">
                <span className={`material-icons text-[15px] leading-none ${isActive ? 'text-emerald-600 font-black' : 'text-slate-400'}`}>
                  {item.icon}
                </span>
                <span>{t(item.label, item.defaultLabel)}</span>
              </div>

              {/* Optional outstanding action alert badges */}
              {item.badge && (
                <span className="bg-rose-500 text-white text-[12px] font-black px-1.5 py-0.5 rounded-full scale-90 leading-none shadow-sm shadow-rose-200">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}

        {/* Bottom Support Link (mt-auto pushes this element to card bottom) */}
        <div className="pt-2">
          <hr className="border-slate-100 my-2" />
          {settingsAndSupport.map((item) => {
            // Exact matching for '/' or standard prefix matching for subroutes
            const isActive = item.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path);

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl transition font-bold text-[14px] ${isActive
                  ? 'bg-emerald-50 text-emerald-700 font-extrabold shadow-sm/5'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                  }`}
              >
                <div className="flex items-center space-x-2.5">
                  <span className={`material-icons text-[15px] leading-none ${isActive ? 'text-emerald-600 font-black' : 'text-slate-400'}`}>
                    {item.icon}
                  </span>
                  <span>{t(item.label, item.defaultLabel)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

    </aside>
  );
};
export default Sidebar;
