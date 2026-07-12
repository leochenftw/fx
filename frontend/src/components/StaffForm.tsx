import React from 'react';
import { useTranslation } from 'react-i18next';

export type StaffFormState = {
  email: string;
  name: string;
  position: string;
  employmentModel: string;
  taxCode: string;
  userGroup: string;
  irdNumber: string;
  hourlyRate: string;
  bankAccount: string;
};

interface StaffFormProps {
  isEditMode: boolean;
  form: StaffFormState;
  setForm: (f: StaffFormState | ((prev: StaffFormState) => StaffFormState)) => void;
  error: string | null;
  submitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  title: string;
  subtitle: string;
}

export const StaffForm: React.FC<StaffFormProps> = ({
  isEditMode,
  form,
  setForm,
  error,
  submitting,
  onSubmit,
  onCancel,
  title,
  subtitle,
}) => {
  const { t } = useTranslation();

  const update = <K extends keyof StaffFormState>(key: K, value: StaffFormState[K]) => {
    setForm((prev: StaffFormState) => ({ ...prev, [key]: value }));
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6 w-full max-w-[1024px] pb-10">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">{title}</h1>
          <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm transition flex items-center justify-center space-x-1.5 shrink-0 cursor-pointer"
        >
          <span className="material-icons text-[14px] leading-none">arrow_back</span>
          <span>Cancel</span>
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-wider bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md select-none">
            Step 01
          </span>
          <h2 className="text-base font-black text-slate-900 mt-2 tracking-tight">Operative Settings</h2>
          <p className="text-xs text-slate-400 mt-0.5">Define core payroll and tax variables.</p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-xs font-semibold rounded-xl flex items-center space-x-2">
            <span className="material-icons text-sm leading-none">error_outline</span>
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4 text-sm">
          <div>
            <label className="block font-bold text-slate-600 mb-1.5">
              Invite Email Address
            </label>
            <input
              type="email"
              required
              disabled={isEditMode}
              placeholder="operative@company.nz"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              className={`w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition ${isEditMode ? 'opacity-60 cursor-not-allowed bg-slate-100' : ''}`}
            />
          </div>

          <div>
            <label className="block font-bold text-slate-600 mb-1.5">
              Full Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g. David King"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-600 mb-1.5">
              Role / Position Title
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Site Foreman"
              value={form.position}
              onChange={(e) => update('position', e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-600 mb-1.5">
                Employment Model
              </label>
              <select
                value={form.employmentModel}
                onChange={(e) => update('employmentModel', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
              >
                <option value="fulltime">{t('employment_models.fulltime', 'Full-time Employee (PAYE)')}</option>
                <option value="parttime">{t('employment_models.parttime', 'Part-time Employee (PAYE)')}</option>
                <option value="casual">{t('employment_models.casual', 'Casual Employee (PAYE)')}</option>
                <option value="contractor">{t('employment_models.contractor', 'Contractor (WT)')}</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-600 mb-1.5">
                IRD Tax Code
              </label>
              <select
                value={form.taxCode}
                onChange={(e) => update('taxCode', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
              >
                {form.employmentModel === 'contractor' ? (
                  <>
                    <option value="WT">{t('tax_codes.WT', 'WT - Schedular payments')}</option>
                    <option value="STC">{t('tax_codes.STC', 'STC - Special Tax Code')}</option>
                    <option value="ND">{t('tax_codes.ND', 'ND - Non-declaration')}</option>
                  </>
                ) : (
                  <>
                    <optgroup label={t('tax_codes.group_main', 'Main Job')}>
                      <option value="M">{t('tax_codes.M', 'M - Main job, no student loan')}</option>
                      <option value="M SL">{t('tax_codes.M_SL', 'M SL - Main job, with student loan')}</option>
                      <option value="ME">{t('tax_codes.ME', 'ME - Main job, no student loan, IETC')}</option>
                      <option value="ME SL">{t('tax_codes.ME_SL', 'ME SL - Main job, with student loan, IETC')}</option>
                    </optgroup>
                    <optgroup label={t('tax_codes.group_secondary', 'Secondary Job')}>
                      <option value="SB">{t('tax_codes.SB', 'SB - Secondary job, under $14,000, no student loan')}</option>
                      <option value="SB SL">{t('tax_codes.SB_SL', 'SB SL - Secondary job, under $14,000, with student loan')}</option>
                      <option value="S">{t('tax_codes.S', 'S - Secondary job, $14,001 - $48,000, no student loan')}</option>
                      <option value="S SL">{t('tax_codes.S_SL', 'S SL - Secondary job, $14,001 - $48,000, with student loan')}</option>
                      <option value="SH">{t('tax_codes.SH', 'SH - Secondary job, $48,001 - $70,000, no student loan')}</option>
                      <option value="SH SL">{t('tax_codes.SH_SL', 'SH SL - Secondary job, $48,001 - $70,000, with student loan')}</option>
                      <option value="ST">{t('tax_codes.ST', 'ST - Secondary job, $70,001 - $180,000, no student loan')}</option>
                      <option value="ST SL">{t('tax_codes.ST_SL', 'ST SL - Secondary job, $70,001 - $180,000, with student loan')}</option>
                      <option value="SA">{t('tax_codes.SA', 'SA - Secondary job, over $180,000, no student loan')}</option>
                      <option value="SA SL">{t('tax_codes.SA_SL', 'SA SL - Secondary job, over $180,000, with student loan')}</option>
                    </optgroup>
                    <optgroup label={t('tax_codes.group_special', 'Special & Casual')}>
                      <option value="STC">{t('tax_codes.STC', 'STC - Special Tax Code')}</option>
                      <option value="ND">{t('tax_codes.ND', 'ND - Non-declaration')}</option>
                      <option value="NSW">{t('tax_codes.NSW', 'NSW - Non-resident seasonal worker')}</option>
                      <option value="CAE">{t('tax_codes.CAE', 'CAE - Casual agricultural employee')}</option>
                      <option value="EDP">{t('tax_codes.EDP', 'EDP - Specified election day worker')}</option>
                    </optgroup>
                  </>
                )}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-600 mb-1.5">
              {t('user_groups.label', 'User Group')}
              {form.userGroup !== 'OWNER' && <span className="text-rose-500 ml-1">*</span>}
            </label>
            {form.userGroup === 'OWNER' ? (
              <div className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-500 font-medium select-none cursor-not-allowed">
                {t('user_groups.OWNER', 'Owner')}
              </div>
            ) : (
              <select
                required
                value={form.userGroup}
                onChange={(e) => update('userGroup', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
              >
                <option value="">{t('user_groups.placeholder', 'Select a role group')}</option>
                <option value="ADMIN">{t('user_groups.ADMIN', 'Admin')}</option>
                <option value="STAFF">{t('user_groups.STAFF', 'Staff')}</option>
              </select>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-600 mb-1.5">
                IRD Identification (NZ)
              </label>
              <input
                type="text"
                required
                placeholder="e.g. 133-456-789"
                value={form.irdNumber}
                onChange={(e) => update('irdNumber', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-mono font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-600 mb-1.5">
                Hourly Rate (NZD)
              </label>
              <div className="relative rounded-xl">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 font-mono text-xs select-none">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={form.hourlyRate}
                  onChange={(e) => update('hourlyRate', e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3.5 py-2.5 text-slate-900 font-mono font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-600 mb-1.5">
              Payroll Settlement Account (Routing Bank)
            </label>
            <input
              type="text"
              required
              placeholder="e.g. 06-0193-0843807-00"
              value={form.bankAccount}
              onChange={(e) => update('bankAccount', e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-mono font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
            />
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-extrabold text-sm py-3.5 rounded-xl shadow-md transition flex items-center justify-center space-x-2 cursor-pointer uppercase tracking-wider"
      >
        {submitting ? (
          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
        ) : (
          <>
            <span className="material-icons text-white text-sm mr-1 leading-none">
              {isEditMode ? 'save' : 'send'}
            </span>
            <span>
              {isEditMode ? 'Update Staff Member' : 'Invite Staff Member'}
            </span>
          </>
        )}
      </button>
    </form>
  );
};

export default StaffForm;
