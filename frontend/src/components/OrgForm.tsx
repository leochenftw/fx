import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { OrgFormProps } from '../types';

export const OrgForm: React.FC<OrgFormProps> = ({
  onSubmit,
  orgName,
  setOrgName,
  entityType,
  setEntityType,
  irdNumber,
  setIrdNumber,
  gstRegistered,
  setGstRegistered,
  gstBasis,
  setGstBasis,
  gstPeriod,
  setGstPeriod,
  bankAccounts,
  addBankAccount,
  updateBankAccount,
  removeBankAccount,

  arItems,
  addArItem,
  updateArItem,
  removeArItem,

  apItems,
  addApItem,
  updateApItem,
  removeApItem,

  error,
  loading,
  isEdit = false,
  orgId,
  nzbn = '',
  setNzbn,
  address = '',
  setAddress,
  payrollCycle = 'weekly',
  setPayrollCycle,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <form onSubmit={onSubmit} className="space-y-6 w-full max-w-[1024px] pb-10">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            {isEdit ? `Updating ${orgName}` : t('setup.adding_title', 'Adding new organisation')}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {isEdit ? `Edit your organisation details, tax settings, and opening balances.` : t('setup.adding_subheading', 'Initialize your organisation details, tax settings, and opening balances.')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate(isEdit ? `/orgs/${orgId}` : '/orgs')}
          className="text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm transition flex items-center justify-center space-x-1.5 shrink-0 cursor-pointer"
        >
          <span className="material-icons text-[14px] leading-none">arrow_back</span>
          <span>{t('common.cancel', 'Cancel')}</span>
        </button>
      </div>
      {/* Step 1: Profile */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-wider bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md">
            Step 01
          </span>
          <h2 className="text-base font-black text-slate-900 mt-2 tracking-tight">{t('setup.section_info')}</h2>
          <p className="text-xs text-slate-400 mt-0.5">{t('setup.subtitle')}</p>
        </div>

        <div className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-600 mb-1.5">{t('setup.org_name_label')}</label>
            <input
              type="text"
              required
              placeholder="e.g. Acme Plumbing (NZ) Ltd"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-600 mb-1.5">{t('setup.entity_type_label')}</label>
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
              >
                <option value="company">{t('setup.entity_company')}</option>
                <option value="sole_trader">{t('setup.entity_sole_trader')}</option>
                <option value="ltc">{t('setup.entity_ltc')}</option>
                <option value="trust">{t('setup.entity_trust')}</option>
                <option value="partnership">{t('setup.entity_partnership')}</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-600 mb-1.5">{t('setup.ird_label')}</label>
              <input
                type="text"
                required
                placeholder="123-456-789"
                value={irdNumber}
                onChange={(e) => setIrdNumber(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-mono font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
              />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="block font-bold text-slate-900">{t('setup.gst_registered')}</label>
                <p className="text-[14px] text-slate-400">{t('setup.gst_registered_subtitle', 'Does this entity claim/pay GST to IRD?')}</p>
              </div>
              <input
                type="checkbox"
                checked={gstRegistered}
                onChange={(e) => setGstRegistered(e.target.checked)}
                className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500 cursor-pointer"
              />
            </div>

            {gstRegistered && (
              <div className="grid grid-cols-2 gap-3 animate-fadeIn">
                <div>
                  <label className="block font-bold text-slate-600 mb-1.5">{t('setup.gst_basis_label')}</label>
                  <select
                    value={gstBasis}
                    onChange={(e) => setGstBasis(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
                  >
                    <option value="payments">{t('setup.gst_basis_payments')}</option>
                    <option value="invoice">{t('setup.gst_basis_invoice')}</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1.5">{t('setup.gst_period_label')}</label>
                  <select
                    value={gstPeriod}
                    onChange={(e) => setGstPeriod(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
                  >
                    <option value="2_months">{t('setup.gst_period_2m')}</option>
                    <option value="1_month">{t('setup.gst_period_1m')}</option>
                    <option value="6_months">{t('setup.gst_period_6m')}</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {isEdit && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md">
              Step 02
            </span>
            <h2 className="text-base font-black text-slate-900 mt-2 tracking-tight">Organisation Profile & Access</h2>
            <p className="text-xs text-slate-400 mt-0.5">Update NZBN, business address, and employee payroll cycle settings.</p>
          </div>

          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-600 mb-1.5">NZ Business Number (NZBN)</label>
                <input
                  type="text"
                  maxLength={13}
                  placeholder="Enter 13-digit NZBN"
                  value={nzbn}
                  onChange={(e) => setNzbn && setNzbn(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-mono font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-600 mb-1.5">Payroll Cycle Settings</label>
                <select
                  value={payrollCycle}
                  onChange={(e) => setPayrollCycle && setPayrollCycle(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition cursor-pointer"
                >
                  <option value="weekly">Weekly (每周)</option>
                  <option value="fortnightly">Fortnightly (每两周)</option>
                  <option value="monthly">Monthly (每月)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-600 mb-1.5">Legal Business Address</label>
              <input
                type="text"
                placeholder="e.g. 5 Topsail Way, Wellington, NZ"
                value={address}
                onChange={(e) => setAddress && setAddress(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
              />
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Accounts & Balances */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex justify-between items-center border-b border-slate-100 pb-4">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-md">
              {isEdit ? 'Step 03' : 'Step 02'}
            </span>
            <h2 className="text-base font-black text-slate-900 mt-2 tracking-tight">{t('setup.bank_balances_title')}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {t('setup.bank_balances_subtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={addBankAccount}
            className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-3.5 py-2 rounded-xl flex items-center space-x-1.5 transition cursor-pointer"
          >
            <span className="material-icons text-emerald-400 text-[12px] mr-1.5 leading-none">add</span>
            <span>{t('setup.button_add_account')}</span>
          </button>
        </div>

        <div className="space-y-4">
          {bankAccounts.map((acc, index) => (
            <div
              key={index}
              className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-4 items-center text-xs"
            >
              <div>
                <label className="block font-bold text-slate-500 mb-1">{t('setup.account_name_label')}</label>
                <input
                  type="text"
                  required
                  value={acc.account_name}
                  onChange={(e) => updateBankAccount(index, 'account_name', e.target.value)}
                  placeholder="e.g. Main Trading Account"
                  className="w-full bg-white border border-slate-200 font-semibold rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-500 mb-1">{t('setup.account_number_label')}</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={acc.account_number}
                    onChange={(e) => updateBankAccount(index, 'account_number', e.target.value)}
                    placeholder="xx-xxxx-xxxxxx-xx"
                    className="w-full bg-white border border-slate-200 font-mono font-semibold rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <span className="material-icons absolute right-3 top-2.5 text-slate-300 text-lg">account_balance</span>
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-500 mb-1">{t('setup.balance_label')}</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={acc.balance ?? ''}
                  onChange={(e) => updateBankAccount(index, 'balance', e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-white border border-slate-200 font-bold rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-500 mb-1">{t('setup.conversion_date_label')}</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="date"
                    required
                    value={acc.conversion_date}
                    onChange={(e) => updateBankAccount(index, 'conversion_date', e.target.value)}
                    className="flex-grow bg-white border border-slate-200 font-mono rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  {bankAccounts.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeBankAccount(index)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-lg transition cursor-pointer"
                      title={t('setup.remove_account_title') || undefined}
                    >
                      <span className="material-icons text-[16px] leading-none">delete</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AR & AP inputs (Dynamic Grid Rows) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* AR Box */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between text-xs min-h-[220px]">
          <div>
            <div className="flex justify-between items-start border-b border-slate-100 pb-3 mb-4">
              <div className="mr-1">
                <h3 className="font-extrabold text-slate-900 text-sm">{t('setup.ar_title')}</h3>
                <p className="text-[14px] text-slate-400 mt-0.5">{t('setup.ar_subtitle')}</p>
              </div>
              <button
                type="button"
                onClick={addArItem}
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-[10px] px-2.5 py-1.5 rounded-lg flex items-center transition cursor-pointer"
              >
                <span className="material-icons text-emerald-400 text-[10px] mr-1 leading-none font-bold">add</span>
                <span className="text-nowrap">{t('setup.button_add_client')}</span>
              </button>
            </div>

            {arItems.length === 0 ? (
              <div className="text-slate-400 italic text-center py-6 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                {t('setup.click_to_add_debtor')}
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {arItems.map((item, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <input
                      type="text"
                      required
                      placeholder={t('setup.client_name_label') || ''}
                      value={item.name}
                      onChange={(e) => updateArItem(index, 'name', e.target.value)}
                      className="flex-grow bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white text-[14px]"
                    />
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="0.00"
                      value={item.amount ?? ''}
                      onChange={(e) => updateArItem(index, 'amount', e.target.value)}
                      className="w-24 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white text-[14px]"
                    />
                    <button
                      type="button"
                      onClick={() => removeArItem(index)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-lg transition cursor-pointer"
                    >
                      <span className="material-icons text-sm leading-none">delete</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* AP Box */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between text-xs min-h-[220px]">
          <div>
            <div className="flex justify-between items-start border-b border-slate-100 pb-3 mb-4">
              <div className="mr-1">
                <h3 className="font-extrabold text-slate-900 text-sm">{t('setup.ap_title')}</h3>
                <p className="text-[14px] text-slate-400 mt-0.5">{t('setup.ap_subtitle')}</p>
              </div>
              <button
                type="button"
                onClick={addApItem}
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-[10px] px-2.5 py-1.5 rounded-lg flex items-center transition cursor-pointer"
              >
                <span className="material-icons text-emerald-400 text-[10px] mr-1 leading-none font-bold">add</span>
                <span className="text-nowrap">{t('setup.button_add_supplier')}</span>
              </button>
            </div>

            {apItems.length === 0 ? (
              <div className="text-slate-400 italic text-center py-6 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                {t('setup.click_to_add_creditor')}
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {apItems.map((item, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <input
                      type="text"
                      required
                      placeholder={t('setup.supplier_name_label') || ''}
                      value={item.name}
                      onChange={(e) => updateApItem(index, 'name', e.target.value)}
                      className="flex-grow bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white text-[14px]"
                    />
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="0.00"
                      value={item.amount ?? ''}
                      onChange={(e) => updateApItem(index, 'amount', e.target.value)}
                      className="w-24 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white text-[14px]"
                    />
                    <button
                      type="button"
                      onClick={() => removeApItem(index)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-lg transition cursor-pointer"
                    >
                      <span className="material-icons text-sm leading-none">delete</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
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
        className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-extrabold text-sm py-3.5 rounded-xl shadow-md transition flex items-center justify-center space-x-2 cursor-pointer uppercase tracking-wider"
      >
        {loading ? (
          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
        ) : (
          <>
            <span className="material-icons text-white text-sm mr-1 leading-none">
              {isEdit ? 'save' : 'layers'}
            </span>
            <span>
              {isEdit
                ? t('setup.button_submit_edit', 'Update Organisation')
                : t('setup.button_submit', 'Create Organisation')}
            </span>
          </>
        )}
      </button>
    </form>
  );
};
export default OrgForm;
