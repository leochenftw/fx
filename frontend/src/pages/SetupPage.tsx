import React, { useState } from 'react';
import { SetupOrgForm } from '../components/SetupOrgForm';
import { cognitoConfig } from '../cognitoConfig';
import { getValidToken } from '../App';
import type { BankAccount, OpeningBalanceItem, SetupPageProps, BankOpeningDetail } from '../types';

export const SetupPage: React.FC<SetupPageProps> = ({ onSetupSuccess }) => {
  const [orgName, setOrgName] = useState('');
  const [entityType, setEntityType] = useState('company');
  const [irdNumber, setIrdNumber] = useState('');
  const [gstRegistered, setGstRegistered] = useState(true);
  const [gstBasis, setGstBasis] = useState('payments');
  const [gstPeriod, setGstPeriod] = useState('2_months');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Bank Accounts Opening Balances state
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([
    {
      account_name: '',
      account_number: '',
      bank_name: '',
      balance: undefined,
      conversion_date: '2026-04-01',
    },
  ]);

  // AR & AP Input state (structured arrays)
  const [arItems, setArItems] = useState<OpeningBalanceItem[]>([]);
  const [apItems, setApItems] = useState<OpeningBalanceItem[]>([]);

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

  const handleSetupOrganisation = async (e: React.FormEvent) => {
    e.preventDefault();
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

      // Automatically identify NZ bank brand from account prefix
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
      opening_balances: {
        bank_balances,
        ar_balances,
        ap_balances,
      },
    };

    try {
      const activeToken = await getValidToken();
      const res = await fetch(`${cognitoConfig.OrgsApiUrl}orgs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        onSetupSuccess();
      } else {
        throw new Error(data.error || 'Failed to initialise organisation.');
      }
    } catch (err: any) {
      setError(err.message || 'Request failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SetupOrgForm
      onSubmit={handleSetupOrganisation}
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
    />
  );
};
export default SetupPage;
