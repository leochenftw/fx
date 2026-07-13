import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { OrgForm } from '../components/OrgForm';
import { cognitoConfig } from '../cognitoConfig';
import { getValidToken } from '../App';
import type { BankAccount, OpeningBalanceItem, OrgEditPageProps, BankOpeningDetail } from '../types';

export const OrgEditPage: React.FC<OrgEditPageProps> = ({ onEditSuccess }) => {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();

  // Control state aligned with SetupPage
  const [orgName, setOrgName] = useState('');
  const [entityType, setEntityType] = useState('company');
  const [irdNumber, setIrdNumber] = useState('');
  const [gstRegistered, setGstRegistered] = useState(true);
  const [gstBasis, setGstBasis] = useState('payments');
  const [gstPeriod, setGstPeriod] = useState('2_months');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  // Bank Accounts state
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  // AR & AP Input state
  const [arItems, setArItems] = useState<OpeningBalanceItem[]>([]);
  const [apItems, setApItems] = useState<OpeningBalanceItem[]>([]);

  // Settings States
  const [nzbn, setNzbn] = useState('');
  const [address, setAddress] = useState('');
  const [payrollCycle, setPayrollCycle] = useState<'weekly' | 'fortnightly' | 'monthly'>('weekly');
  const [categories, setCategories] = useState<string[]>([]);
  const [staticRules, setStaticRules] = useState<{ pattern: string; category: string }[]>([]);

  // 1. Fetch existing organisation configuration on mount
  useEffect(() => {
    const fetchExistingData = async () => {
      if (!orgId) return;
      setPageLoading(true);
      setError(null);

      try {
        const activeToken = await getValidToken();
        const res = await fetch(`${cognitoConfig.OrgsApiUrl}orgs/${orgId}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${activeToken}`,
          },
        });

        const data = await res.json();
        if (res.ok) {
          // Prepopulate States with actual Cloud data
          setOrgName(data.name || '');
          setEntityType(data.entity_type || 'company');
          setIrdNumber(data.ird_number || '');
          setGstRegistered(!!data.gst_registered);
          setGstBasis(data.gst_basis || 'payments');
          setGstPeriod(data.gst_period || '2_months');
          setNzbn(data.nzbn || '');
          setAddress(data.address || '');
          setPayrollCycle(data.payroll_cycle || 'weekly');
          setCategories(data.categories || []);
          setStaticRules(data.static_rules || []);

          // Map bank accounts
          if (data.bank_accounts && Array.isArray(data.bank_accounts)) {
            const list = data.bank_accounts.map((acc: any) => {
              const detail = data.opening_balances?.bank_balances?.[acc.account_number];
              return {
                account_name: acc.account_name || '',
                account_number: acc.account_number || '',
                bank_name: acc.bank_name || '',
                balance: detail ? detail.balance : undefined,
                conversion_date: detail ? detail.conversion_date : '2026-04-01',
              };
            });
            setBankAccounts(list);
          } else {
            setBankAccounts([]);
          }

          // Map AR balances
          if (data.opening_balances?.ar_balances) {
            const items = Object.entries(data.opening_balances.ar_balances).map(([name, amount]) => ({
              name,
              amount: Number(amount),
            }));
            setArItems(items);
          } else {
            setArItems([]);
          }

          // Map AP balances
          if (data.opening_balances?.ap_balances) {
            const items = Object.entries(data.opening_balances.ap_balances).map(([name, amount]) => ({
              name,
              amount: Number(amount),
            }));
            setApItems(items);
          } else {
            setApItems([]);
          }
        } else {
          setError(data.error || 'Failed to fetch existing organisation configuration.');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load details.');
      } finally {
        setPageLoading(false);
      }
    };

    fetchExistingData();
  }, [orgId]);

  // Dynamic bank account helpers
  const addBankAccount = () => {
    setBankAccounts([
      ...bankAccounts,
      { account_name: '', account_number: '', bank_name: '', balance: undefined, conversion_date: '2026-04-01' },
    ]);
  };

  const updateBankAccount = (index: number, key: keyof BankAccount, val: any) => {
    const updated = [...bankAccounts];
    if (key === 'balance') {
      updated[index][key] = val === '' ? undefined : Number(val);
    } else {
      updated[index][key] = val;
    }
    setBankAccounts(updated);
  };

  const removeBankAccount = (index: number) => {
    setBankAccounts(bankAccounts.filter((_, i) => i !== index));
  };

  // Dynamic AR helpers
  const addArItem = () => {
    setArItems([...arItems, { name: '', amount: undefined }]);
  };

  const updateArItem = (index: number, key: keyof OpeningBalanceItem, val: any) => {
    const updated = [...arItems];
    if (key === 'amount') {
      updated[index][key] = val === '' ? undefined : Number(val);
    } else {
      updated[index][key] = val;
    }
    setArItems(updated);
  };

  const removeArItem = (index: number) => {
    setArItems(arItems.filter((_, i) => i !== index));
  };

  // Dynamic AP helpers
  const addApItem = () => {
    setApItems([...apItems, { name: '', amount: undefined }]);
  };

  const updateApItem = (index: number, key: keyof OpeningBalanceItem, val: any) => {
    const updated = [...apItems];
    if (key === 'amount') {
      updated[index][key] = val === '' ? undefined : Number(val);
    } else {
      updated[index][key] = val;
    }
    setApItems(updated);
  };

  const removeApItem = (index: number) => {
    setApItems(apItems.filter((_, i) => i !== index));
  };

  // 2. Submit PUT edit ledger request to Backend
  const handleEditOrganisation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;

    if (!orgName || !irdNumber) {
      setError('Organisation Name and IRD Number are required.');
      return;
    }
    setLoading(true);
    setError(null);

    const bank_balances: Record<string, BankOpeningDetail> = {};
    const accountsInfo = bankAccounts.map((acc) => {
      if (acc.account_number && acc.balance !== undefined && acc.conversion_date) {
        bank_balances[acc.account_number] = {
          balance: Number(acc.balance),
          conversion_date: acc.conversion_date,
        };
      }

      // Identify NZ bank brand prefix
      const cleanNum = acc.account_number.replace(/[^0-9]/g, '');
      const prefix = cleanNum.substring(0, 2);
      let derivedBank = 'Other Bank';
      switch (prefix) {
        case '01':
        case '06': derivedBank = 'ANZ'; break;
        case '12': derivedBank = 'ASB'; break;
        case '03': derivedBank = 'Westpac'; break;
        case '02': derivedBank = 'BNZ'; break;
        case '38': derivedBank = 'Kiwibank'; break;
        case '15': derivedBank = 'TSB'; break;
      }

      return {
        account_name: acc.account_name,
        account_number: acc.account_number,
        bank_name: derivedBank,
      };
    });

    const ar_balances: Record<string, number> = {};
    arItems.forEach((item) => {
      if (item.name && item.amount !== undefined) {
        ar_balances[item.name.trim()] = Number(item.amount);
      }
    });

    const ap_balances: Record<string, number> = {};
    apItems.forEach((item) => {
      if (item.name && item.amount !== undefined) {
        ap_balances[item.name.trim()] = Number(item.amount);
      }
    });

    const payload = {
      name: orgName,
      entity_type: entityType,
      ird_number: irdNumber,
      gst_registered: gstRegistered,
      gst_basis: gstRegistered ? gstBasis : undefined,
      gst_period: gstRegistered ? gstPeriod : undefined,
      bank_accounts: accountsInfo,
      nzbn,
      address,
      payroll_cycle: payrollCycle,
      categories,
      static_rules: staticRules,
      opening_balances: {
        bank_balances,
        ar_balances,
        ap_balances,
      },
    };

    try {
      const activeToken = await getValidToken();
      const res = await fetch(`${cognitoConfig.OrgsApiUrl}orgs/${orgId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        // Fetch new data globally and return back to the details page
        onEditSuccess();
        navigate(`/orgs/${orgId}`);
      } else {
        throw new Error(data.error || 'Failed to update organization settings.');
      }
    } catch (err: any) {
      setError(err.message || 'Request failed.');
    } finally {
      setLoading(false);
    }
  };

  if (pageLoading) {
    return (
      <div className="flex flex-col justify-center items-center py-24 space-y-4">
        <div className="w-9 h-9 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
        <p className="text-xs font-semibold text-slate-400 font-medium">Loading existing configuration...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full max-w-[1024px]">
      <OrgForm
        onSubmit={handleEditOrganisation}
        orgName={orgName}
        setOrgName={setOrgName}
        entityType={entityType}
        setEntityType={setEntityType}
        irdNumber={irdNumber}
        setIrdNumber={setIrdNumber}
        gstRegistered={gstRegistered}
        setGstRegistered={setGstRegistered}
        gstBasis={gstBasis}
        setGstBasis={setGstBasis}
        gstPeriod={gstPeriod}
        setGstPeriod={setGstPeriod}
        bankAccounts={bankAccounts}
        addBankAccount={addBankAccount}
        updateBankAccount={updateBankAccount}
        removeBankAccount={removeBankAccount}
        arItems={arItems}
        addArItem={addArItem}
        updateArItem={updateArItem}
        removeArItem={removeArItem}
        apItems={apItems}
        addApItem={addApItem}
        updateApItem={updateApItem}
        removeApItem={removeApItem}
        error={error}
        loading={loading}
        isEdit={true}
        orgId={orgId}
        nzbn={nzbn}
        setNzbn={setNzbn}
        address={address}
        setAddress={setAddress}
        payrollCycle={payrollCycle}
        setPayrollCycle={setPayrollCycle}
      />
    </div>
  );
};
export default OrgEditPage;
