import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getValidToken } from '../App';
import { cognitoConfig } from '../cognitoConfig';
import StaffForm, { type StaffFormState } from '../components/StaffForm';

export const StaffEditPage: React.FC = () => {
  const { staffId } = useParams<{ staffId: string }>();
  const navigate = useNavigate();
  const isEditMode = !!staffId;

  const [loading, setLoading] = useState(isEditMode);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialForm: StaffFormState = {
    email: '',
    name: '',
    position: '',
    employmentModel: 'fulltime',
    taxCode: 'M',
    userGroup: '',
    irdNumber: '',
    hourlyRate: '',
    bankAccount: '',
  };

  const [form, setForm] = useState<StaffFormState>(initialForm);

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
          const model = data.employment_model || 'fulltime';
          const assignedGroup = (data.groups || []).includes('OWNER')
            ? 'OWNER'
            : ((data.groups || []).find((g: string) => g !== 'OWNER') || '');

          setForm({
            email: data.email || '',
            name: data.name || '',
            position: data.position || '',
            employmentModel: model === 'employee' ? 'fulltime' : model,
            taxCode: data.tax_code || 'M',
            userGroup: assignedGroup,
            irdNumber: data.ird_number || '',
            hourlyRate: String(data.hourly_rate || ''),
            bankAccount: data.bank_account || '',
          });
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
    if (form.employmentModel === 'contractor') {
      if (!['WT', 'STC', 'ND'].includes(form.taxCode)) {
        setForm((prev) => ({ ...prev, taxCode: 'WT' }));
      }
    } else {
      if (form.taxCode === 'WT') {
        setForm((prev) => ({ ...prev, taxCode: 'M' }));
      }
    }
  }, [form.employmentModel, form.taxCode]);

  // Validation rules
  const validateForm = (): boolean => {
    // 1. Email structure
    if (!isEditMode) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(form.email)) {
        setError('Please enter a valid email address.');
        return false;
      }
    }

    // 2. Name
    if (!form.name.trim()) {
      setError('Operative full name is required.');
      return false;
    }

    // 3. Position
    if (!form.position.trim()) {
      setError('Position/Role title is required.');
      return false;
    }

    // 4. IRD Number formatting e.g. 133-456-789
    const irdRegex = /^\d{2,3}-\d{3}-\d{3}$/;
    if (!irdRegex.test(form.irdNumber.trim())) {
      setError('Please provide a valid NZ IRD Number in format XXX-XXX-XXX.');
      return false;
    }

    // 5. Hourly rate numeric checks
    const rate = Number(form.hourlyRate);
    if (isNaN(rate) || rate <= 0) {
      setError('Hourly rate must be a valid positive number.');
      return false;
    }

    // 6. Bank Account format e.g. 06-0193-0843807-00 (15-16 digits with branch, bank, suffix)
    const bankRegex = /^\d{2}-\d{4}-\d{7,8}-\d{2,3}$/;
    if (!bankRegex.test(form.bankAccount.trim())) {
      setError('Please enter a valid routing bank account in format XX-XXXX-XXXXXXX-XX.');
      return false;
    }

    // 7. Employment Model vs IRD Tax Code alignment
    if (form.employmentModel === 'contractor') {
      if (!['WT', 'STC', 'ND'].includes(form.taxCode)) {
        setError('Contractors must be registered under WT, STC or ND tax codes.');
        return false;
      }
    } else {
      if (form.taxCode === 'WT') {
        setError('PAYE employees cannot use the WT (Schedular Payments) tax code.');
        return false;
      }
    }

    // 8. User Group is required
    if (!form.userGroup) {
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
        email: form.email.trim(),
        name: form.name.trim(),
        position: form.position.trim(),
        employment_model: form.employmentModel,
        tax_code: form.taxCode,
        ird_number: form.irdNumber.trim(),
        hourly_rate: Number(form.hourlyRate),
        bank_account: form.bankAccount.trim(),
        user_group: form.userGroup,
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
    <StaffForm
      isEditMode={isEditMode}
      form={form}
      setForm={setForm}
      error={error}
      submitting={submitting}
      onSubmit={handleSubmit}
      onCancel={() => navigate('/staff')}
      title={isEditMode ? `Updating ${form.name || 'Staff Profile'}` : 'Adding new staff member'}
      subtitle={isEditMode
        ? 'Edit secure compliance matrix, tax codes, and payroll routing parameters.'
        : 'Initialize credentials, set up Nz tax identifiers, and establish Hourly Rate.'}
    />
  );
};
export default StaffEditPage;
