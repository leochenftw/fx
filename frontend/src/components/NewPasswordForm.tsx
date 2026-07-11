import React from 'react';
import { useTranslation } from 'react-i18next';
import type { NewPasswordFormProps } from '../types';

export const NewPasswordForm: React.FC<NewPasswordFormProps> = ({
  onSubmit,
  newPassword,
  setNewPassword,
  error,
  loading,
}) => {
  const { t } = useTranslation();
  return (
    <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-6 relative overflow-hidden self-center">
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-600 to-emerald-400"></div>

      <div className="space-y-2">
        <h2 className="text-2xl font-black tracking-tight text-slate-900">{t('new_password.title')}</h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          {t('new_password.subtitle')}
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 text-xs">
        <div>
          <label className="block font-bold text-slate-600 mb-1.5">{t('new_password.password_label')}</label>
          <input
            type="password"
            required
            placeholder="••••••••"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl p-3">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-extrabold text-sm py-3 rounded-xl transition flex items-center justify-center space-x-2 shadow-sm cursor-pointer"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          ) : (
            <>
              <span className="material-icons text-emerald-400 text-sm mr-1 leading-none">lock</span>
              <span>{t('new_password.button_submit')}</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};
