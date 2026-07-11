import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getValidToken } from '../App';
import { cognitoConfig } from '../cognitoConfig';

export const StaffFormPage: React.FC = () => {
  const { staffId } = useParams<{ staffId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isEditMode = !!staffId;

  const [loading, setLoading] = useState(isEditMode);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form Fields
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [employmentModel, setEmploymentModel] = useState('fulltime');
  const [taxCode, setTaxCode] = useState('M');
  const [userGroup, setUserGroup] = useState('');
  const [irdNumber, setIrdNumber] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [bankAccount, setBankAccount] = useState('');

  const fetchedRef = useRef<string | undefined>(undefined);

  // Load existing profile details in Edit Mode
  useEffect(() => {
    if (!isEditMode) return;
    if (fetchedRef.current === staffId) return;
    fetchedRef.current = staffId;

    const loadStaffProfile = async () => {
      setLoading(true);
      setError(null);
      try {
        const activeToken = await getValidToken();
        const res = await fetch(`${cognitoConfig.OrgsApiUrl}staff/${staffId}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${activeToken}`,
          },
        });

        const data = await res.json();
        if (res.ok) {
          setName(data.name || '');
          setEmail(data.email || '');
          setPosition(data.position || '');
          const model = data.employment_model || 'fulltime';
          setEmploymentModel(model === 'employee' ? 'fulltime' : model);
          setTaxCode(data.tax_code || 'M');
          setIrdNumber(data.ird_number || '');
          setHourlyRate(String(data.hourly_rate || ''));
          setBankAccount(data.bank_account || '');
          // Populate user group from Cognito groups (pick OWNER if present, otherwise first non-OWNER group)
          const groups: string[] = data.groups || [];
          const assignedGroup = groups.includes('OWNER')
            ? 'OWNER'
            : (groups.find((g: string) => g !== 'OWNER') || '');
          setUserGroup(assignedGroup);
        } else {
          setError(data.error || 'Failed to fetch staff details.');
        }
      } catch (err: any) {
        setError(err.message || 'Error loading profile.');
      } finally {
        setLoading(false);
      }
    };

    loadStaffProfile();
  }, [staffId, isEditMode]);

  // Synchronize and restrict tax code choices when employment model flips
  useEffect(() => {
    if (employmentModel === 'contractor') {
      if (!['WT', 'STC', 'ND'].includes(taxCode)) {
        setTaxCode('WT');
      }
    } else {
      if (taxCode === 'WT') {
        setTaxCode('M');
      }
    }
  }, [employmentModel, taxCode]);

  // Validation rules
  const validateForm = (): boolean => {
    // 1. Email structure
    if (!isEditMode) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        setError('Please enter a valid email address.');
        return false;
      }
    }

    // 2. Name
    if (!name.trim()) {
      setError('Operative full name is required.');
      return false;
    }

    // 3. Position
    if (!position.trim()) {
      setError('Position/Role title is required.');
      return false;
    }

    // 4. IRD Number formatting e.g. 133-456-789
    const irdRegex = /^\d{2,3}-\d{3}-\d{3}$/;
    if (!irdRegex.test(irdNumber.trim())) {
      setError('Please provide a valid NZ IRD Number in format XXX-XXX-XXX.');
      return false;
    }

    // 5. Hourly rate numeric checks
    const rate = Number(hourlyRate);
    if (isNaN(rate) || rate <= 0) {
      setError('Hourly rate must be a valid positive number.');
      return false;
    }

    // 6. Bank Account format e.g. 06-0193-0843807-00 (15-16 digits with branch, bank, suffix)
    const bankRegex = /^\d{2}-\d{4}-\d{7,8}-\d{2,3}$/;
    if (!bankRegex.test(bankAccount.trim())) {
      setError('Please enter a valid routing bank account in format XX-XXXX-XXXXXXX-XX.');
      return false;
    }

    // 7. Employment Model vs IRD Tax Code alignment
    if (employmentModel === 'contractor') {
      if (!['WT', 'STC', 'ND'].includes(taxCode)) {
        setError('Contractors must be registered under WT, STC or ND tax codes.');
        return false;
      }
    } else {
      if (taxCode === 'WT') {
        setError('PAYE employees cannot use the WT (Schedular Payments) tax code.');
        return false;
      }
    }

    // 8. User Group is required
    if (!userGroup) {
      setError('Please assign a User Group (Admin or Staff) to this staff member.');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateForm()) return;

    setSubmitting(true);
    try {
      const activeToken = await getValidToken();
      const payload = {
        email: email.trim(),
        name: name.trim(),
        position: position.trim(),
        employment_model: employmentModel,
        tax_code: taxCode,
        ird_number: irdNumber.trim(),
        hourly_rate: Number(hourlyRate),
        bank_account: bankAccount.trim(),
        user_group: userGroup,
      };

      const url = isEditMode
        ? `${cognitoConfig.OrgsApiUrl}staff/${staffId}`
        : `${cognitoConfig.OrgsApiUrl}staff`;

      const method = isEditMode ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        navigate(isEditMode ? `/staff/${staffId}` : '/staff');
      } else {
        setError(data.error || 'Failed to submit staff attributes.');
      }
    } catch (err: any) {
      setError(err.message || 'Network submission error.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center py-24 space-y-4 max-w-[1024px]">
        <div className="w-9 h-9 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
        <p className="text-xs font-semibold text-slate-400">Loading form parameters...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 w-full max-w-[1024px] pb-10">

      {/* Top Action Header aligned with OrgEditPage */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            {isEditMode ? `Updating ${name || 'Staff Profile'}` : 'Adding new staff member'}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {isEditMode
              ? 'Edit secure compliance matrix, tax codes, and payroll routing parameters.'
              : 'Initialize credentials, set up Nz tax identifiers, and establish Hourly Rate.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/staff')}
          className="text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm transition flex items-center justify-center space-x-1.5 shrink-0 cursor-pointer"
        >
          <span className="material-icons text-[14px] leading-none">arrow_back</span>
          <span>Cancel</span>
        </button>
      </div>

      {/* Main Body Card Grid */}
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

          {/* Email Invite (Cognito Identity Username) */}
          <div>
            <label className="block font-bold text-slate-600 mb-1.5">
              Invite Email Address
            </label>
            <input
              type="email"
              required
              disabled={isEditMode}
              placeholder="operative@company.nz"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition ${isEditMode ? 'opacity-60 cursor-not-allowed bg-slate-100' : ''
                }`}
            />
          </div>

          {/* Full Name */}
          <div>
            <label className="block font-bold text-slate-600 mb-1.5">
              Full Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g. David King"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
            />
          </div>

          {/* Position Title */}
          <div>
            <label className="block font-bold text-slate-600 mb-1.5">
              Role / Position Title
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Site Foreman"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
            />
          </div>

          {/* Grid 1: Employment Model & Tax Code */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-600 mb-1.5">
                Employment Model
              </label>
              <select
                value={employmentModel}
                onChange={(e) => setEmploymentModel(e.target.value)}
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
                value={taxCode}
                onChange={(e) => setTaxCode(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
              >
                {employmentModel === 'contractor' ? (
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

          {/* User Group */}
          <div>
            <label className="block font-bold text-slate-600 mb-1.5">
              {t('user_groups.label', 'User Group')}
              {userGroup !== 'OWNER' && <span className="text-rose-500 ml-1">*</span>}
            </label>
            {userGroup === 'OWNER' ? (
              <div className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-500 font-medium select-none cursor-not-allowed">
                {t('user_groups.OWNER', 'Owner')}
              </div>
            ) : (
              <select
                required
                value={userGroup}
                onChange={(e) => setUserGroup(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
              >
                <option value="">{t('user_groups.placeholder', 'Select a role group')}</option>
                <option value="ADMIN">{t('user_groups.ADMIN', 'Admin')}</option>
                <option value="STAFF">{t('user_groups.STAFF', 'Staff')}</option>
              </select>
            )}
          </div>

          {/* Grid 2: IRD Number & Hourly rate */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-600 mb-1.5">
                IRD Identification (NZ)
              </label>
              <input
                type="text"
                required
                placeholder="e.g. 133-456-789"
                value={irdNumber}
                onChange={(e) => setIrdNumber(e.target.value)}
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
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3.5 py-2.5 text-slate-900 font-mono font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
                />
              </div>
            </div>
          </div>

          {/* Routing Bank Account */}
          <div>
            <label className="block font-bold text-slate-600 mb-1.5">
              Payroll Settlement Account (Routing Bank)
            </label>
            <input
              type="text"
              required
              placeholder="e.g. 06-0193-0843807-00"
              value={bankAccount}
              onChange={(e) => setBankAccount(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-mono font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
            />
          </div>

        </div>
      </div>

      {/* Submit Button aligned with SetupOrgForm */}
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
export default StaffFormPage;
