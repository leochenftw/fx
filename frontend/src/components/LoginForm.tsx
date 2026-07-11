import React from 'react';
import { useTranslation } from 'react-i18next';
import type { LoginFormProps } from '../types';

export const LoginForm: React.FC<LoginFormProps> = ({
  onSubmit,
  email,
  setEmail,
  password,
  setPassword,
  error,
  successMessage,
  loading,
  onForgotPasswordClick,
}) => {
  const { t } = useTranslation();
  return (
    <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-6 relative overflow-hidden self-center">
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-600 to-emerald-400"></div>

      <div className="space-y-2">
        <h1 className="text-2xl font-black tracking-tight text-slate-900">{t('login.title')}</h1>
        <p className="text-xs text-slate-400 leading-relaxed">
          {t('login.subtitle')}
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 text-xs">
        {successMessage && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl p-3 animate-fadeIn">
            {successMessage}
          </div>
        )}

        <div>
          <label className="block font-bold text-slate-600 mb-1.5">{t('login.email_label')}</label>
          <div className="relative">
            <input
              type="email"
              required
              placeholder="your@company.co.nz"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
            />
            <span className="material-icons absolute right-3 top-2.5 text-slate-300 text-lg">email</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label className="block font-bold text-slate-600">{t('login.password_label')}</label>
            <button
              type="button"
              onClick={onForgotPasswordClick}
              className="text-[14px] text-slate-400 hover:text-emerald-600 font-bold transition cursor-pointer"
            >
              {t('login.forgot_password')}
            </button>
          </div>
          <div className="relative">
            <input
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
            />
            <span className="material-icons absolute right-3 top-2.5 text-slate-300 text-lg">lock</span>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl p-3">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-extrabold text-sm py-3.5 rounded-xl transition flex items-center justify-center space-x-2 shadow-sm uppercase tracking-wide cursor-pointer"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          ) : (
            <>
              <span className="material-icons text-emerald-400 text-sm mr-1 animate-pulse leading-none">power_settings_new</span>
              <span>{t('login.button_submit')}</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};
