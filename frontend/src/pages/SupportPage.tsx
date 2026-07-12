import React from 'react';
import { useTranslation } from 'react-i18next';

export const SupportPage: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="space-y-6 w-full max-w-[1280px]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-5 gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            {t('sidebar.support', 'Support')}
          </h1>
          <p className="text-xs text-slate-400 mt-1 font-semibold">
            {t('support.subtitle', 'Support and help centre content area.')}
          </p>
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm h-[420px] flex items-center justify-center text-slate-400 text-sm">
        {t('page.placeholder', 'Content area reserved for future implementation.')}
      </div>
    </div>
  );
};

export default SupportPage;
