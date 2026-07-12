import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getValidToken } from '../App';
import { cognitoConfig } from '../cognitoConfig';
import type { Organisation, StaffDetails } from '../types';
import { getInitials } from '../utils/name';

export const StaffDetailPage: React.FC = () => {
  const { staffId } = useParams<{ staffId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [details, setDetails] = useState<StaffDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [allOrgs, setAllOrgs] = useState<Organisation[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [assignRole, setAssignRole] = useState('STAFF');
  const [assigning, setAssigning] = useState(false);

  const fetchedRef = useRef<string | undefined>(undefined);



  const getEntityTheme = (type: string) => {
    const cleanType = (type || '').toLowerCase();
    if (cleanType.includes('trading') || cleanType.includes('co') || cleanType.includes('company')) {
      return {
        bg: 'bg-emerald-50 border-emerald-100',
        text: 'text-emerald-700',
        labelBg: 'bg-slate-100 text-slate-600 border border-slate-200',
        label: 'Trading',
      };
    }
    if (cleanType.includes('ltc') || cleanType.includes('property') || cleanType.includes('holdings')) {
      return {
        bg: 'bg-blue-50 border-blue-100',
        text: 'text-blue-700',
        labelBg: 'bg-blue-50 text-blue-700 border border-blue-100',
        label: 'Property',
      };
    }
    if (cleanType.includes('trust')) {
      return {
        bg: 'bg-purple-50 border-purple-100',
        text: 'text-purple-700',
        labelBg: 'bg-purple-50 text-purple-700 border border-purple-100',
        label: 'Trust',
      };
    }
    return {
      bg: 'bg-slate-50 border-slate-200',
      text: 'text-slate-700',
      labelBg: 'bg-slate-100 text-slate-600 border border-slate-200',
      label: type.toUpperCase() || 'Business',
    };
  };

  const loadStaffProfile = async () => {
    if (!staffId) return;
    setLoading(true);
    setError(null);
    try {
      const activeToken = await getValidToken();

      // A. Fetch staff details
      const res = await fetch(`${cognitoConfig.OrgsApiUrl}staff/${staffId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${activeToken}`,
        },
      });

      const data = await res.json();
      if (res.ok) {
        setDetails(data);
      } else {
        setError(data.error || 'Failed to retrieve staff profile.');
      }

      // B. Fetch all managed organisations
      const orgsRes = await fetch(`${cognitoConfig.OrgsApiUrl}orgs`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${activeToken}`,
        },
      });
      const orgsData = await orgsRes.json();
      if (orgsRes.ok) {
        setAllOrgs(orgsData.orgs || []);
      }
    } catch (err: any) {
      setError(err.message || 'Network error occurred.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (fetchedRef.current === staffId) return;
    fetchedRef.current = staffId;
    loadStaffProfile();
  }, [staffId]);

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId) return;
    setAssigning(true);
    try {
      const activeToken = await getValidToken();
      const res = await fetch(`${cognitoConfig.OrgsApiUrl}staff/${staffId}/orgs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify({
          org_id: selectedOrgId,
          role: assignRole,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowAssignModal(false);
        setSelectedOrgId('');
        setAssignRole('STAFF');
        await loadStaffProfile();
      } else {
        alert(data.error || 'Failed to assign staff member.');
      }
    } catch (err: any) {
      alert(err.message || 'Network assignment error.');
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassign = async (orgId: string, orgName: string) => {
    const confirmed = window.confirm(`Are you sure you want to revoke this user's access to ${orgName}?`);
    if (!confirmed) return;
    try {
      const activeToken = await getValidToken();
      const res = await fetch(`${cognitoConfig.OrgsApiUrl}staff/${staffId}/orgs/${orgId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${activeToken}`,
        },
      });
      const data = await res.json();
      if (res.ok) {
        await loadStaffProfile();
      } else {
        alert(data.error || 'Failed to revoke access.');
      }
    } catch (err: any) {
      alert(err.message || 'Network revoking error.');
    }
  };

  const assignedOrgIds = new Set((details?.organisations || []).map(o => o.id));
  const assignableOrgs = allOrgs.filter(org => !assignedOrgIds.has(org.id));

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center py-24 space-y-4 max-w-[1280px]">
        <div className="w-9 h-9 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
        <p className="text-xs font-semibold text-slate-400">Loading profile capsules...</p>
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="space-y-6 w-full max-w-[1280px]">
        <div className="flex items-center space-x-3.5 mb-6">
          <button
            onClick={() => navigate('/staff')}
            className="p-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 rounded-xl transition duration-150 shadow-sm cursor-pointer"
          >
            <span className="material-icons text-sm leading-none">arrow_back</span>
          </button>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Staff Account Error</h1>
            <p className="text-xs text-slate-400 mt-1">Failed to read secure operative token.</p>
          </div>
        </div>
        <div className="p-5 bg-red-50 border border-red-200 text-red-800 rounded-2xl text-xs font-semibold shadow-sm">
          {error || 'The requested staff member profile could not be found.'}
        </div>
      </div>
    );
  }

  // Format bank account for display masking e.g. 06-0193-XXXXXXX-00
  const maskBankAccount = (accNum: string) => {
    if (!accNum) return 'N/A';
    const parts = accNum.trim().split('-');
    if (parts.length >= 3) {
      const branch = parts[0];
      const bank = parts[1];
      const suffix = parts[parts.length - 1];
      return `${branch}-${bank}-XXXXXXX-${suffix}`;
    }
    return accNum.substring(0, 7) + '...';
  };

  return (
    <div className="space-y-6 w-full max-w-[1280px]">

      {/* Return & Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-5 gap-4">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/staff')}
            className="p-2.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 rounded-xl transition duration-150 shadow-sm cursor-pointer flex items-center justify-center"
          >
            <span className="material-icons text-sm leading-none">arrow_back</span>
          </button>
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-black text-slate-950 tracking-tight">{details.name}</h1>
              {details.status === 'active' ? (
                <span className="px-2.5 py-0.5 text-xs font-black border border-emerald-200 bg-emerald-50 text-emerald-600 rounded-full tracking-wider uppercase">
                  Active
                </span>
              ) : (
                <span className="px-2.5 py-0.5 text-xs font-black border border-slate-200 bg-slate-50 text-slate-400 rounded-full tracking-wider uppercase">
                  Inactive
                </span>
              )}
            </div>
            <p className="text-sm text-slate-400 mt-1 font-semibold uppercase tracking-wider">
              {details.position} // {details.employment_model === 'employee' ? t('employment_models.fulltime') : t(`employment_models.${details.employment_model}`, details.employment_model)}
            </p>
          </div>
        </div>
        <div>
          <button
            onClick={() => navigate(`/staff/${details.id}/edit`)}
            className="inline-flex items-center justify-center px-4 py-2.5 text-sm font-bold uppercase tracking-widest text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-all shadow-sm cursor-pointer"
          >
            Edit Profile
          </button>
        </div>
      </div>

      {/* Profile Main Body */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        {/* Compliance Matrix Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4 hover:border-slate-300 transition duration-150">
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-3">
            Compliance Matrix
          </h2>
          <div className="space-y-4 text-sm font-semibold text-slate-600">
            <div className="flex justify-between items-center">
              <span className="text-slate-400 font-semibold uppercase">Email Address</span>
              <span className="text-slate-950 font-mono tracking-wide">{details.email}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 font-semibold uppercase">IRD Number</span>
              <span className="text-slate-950 font-mono tracking-wider">{details.ird_number}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 font-semibold uppercase">Tax Code</span>
              <span className="px-2 py-0.5 border border-slate-200 bg-slate-50 text-slate-700 rounded text-xs">
                {details.tax_code} ({details.employment_model === 'contractor' ? 'WT' : 'PAYE'})
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 font-semibold uppercase">Hourly Rate</span>
              <span className="text-emerald-600 font-mono">${Number(details.hourly_rate).toFixed(2)} NZD</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 font-semibold uppercase">Routing Bank</span>
              <span className="text-slate-500 font-mono tracking-wider text-xs">{maskBankAccount(details.bank_account)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 font-semibold uppercase">{t('user_groups.label', 'User Group')}</span>
              <span className="px-2 py-0.5 border border-slate-200 bg-slate-50 text-slate-700 rounded text-xs font-mono">
                {(details.groups || []).map(g => t(`user_groups.${g}`, g)).join(', ') || t('user_groups.none', 'No Group')}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column Stack */}
        <div className="lg:col-span-2 space-y-6">
          {/* Execution History Table */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden hover:border-slate-300 transition duration-150">
            <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4 flex justify-between items-center">
              <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">Execution History</h2>
              <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest">
                Ledger data // recent capsules
              </span>
            </div>
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-black uppercase tracking-widest text-xs bg-slate-50/20">
                  <th className="px-6 py-3">Pay Cycle</th>
                  <th className="px-6 py-3">Gross Allocation</th>
                  <th className="px-6 py-3">PAYE Tax Skim</th>
                  <th className="px-6 py-3">Net Cleared</th>
                  <th className="px-6 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600 font-bold font-mono">
                {!details.execution_history || details.execution_history.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-400 font-sans font-semibold">
                      No pay cycles executed for this member yet.
                    </td>
                  </tr>
                ) : (
                  details.execution_history.map((record, index) => (
                    <tr key={index} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 text-slate-900 font-sans font-bold">{record.cycle}</td>
                      <td className="px-6 py-4 text-slate-950">${Number(record.gross).toFixed(2)}</td>
                      <td className="px-6 py-4 text-red-500">-${Number(record.paye).toFixed(2)}</td>
                      <td className="px-6 py-4 font-black text-emerald-600">${Number(record.net).toFixed(2)}</td>
                      <td className="px-6 py-4 text-right">
                        <span className="px-2.5 py-1 border border-emerald-200 bg-emerald-50 text-emerald-600 text-xs font-black font-sans rounded uppercase tracking-wider">
                          {record.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Organisation Access List Card */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4 hover:border-slate-300 transition duration-150">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 gap-4">
              <div>
                <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  Assigned Organisations
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Business ledgers this operative has active authorization to read or write.
                </p>
              </div>
              {!details.is_owner && assignableOrgs.length > 0 && (
                <button
                  onClick={() => setShowAssignModal(true)}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-sm transition flex items-center justify-center space-x-2 shrink-0 cursor-pointer"
                >
                  <span className="material-icons text-[14px] text-emerald-400 leading-none">add</span>
                  <span>Assign to Organisation</span>
                </button>
              )}
            </div>

            <div className="space-y-4">
              {!details.organisations || details.organisations.length === 0 ? (
                <div className="bg-slate-50 border border-slate-150 border-dashed rounded-xl p-8 text-center space-y-3">
                  <span className="material-icons text-slate-300 text-3xl">corporate_fare</span>
                  <p className="text-xs text-slate-400 font-semibold">No assigned organisations yet.</p>
                </div>
              ) : (
                details.organisations.map((org) => {
                  const initials = getInitials(org.name);
                  const theme = getEntityTheme(org.entity_type);

                  const firstAcc = org.bank_accounts?.[0];
                  let displayBalance = '$0.00';
                  let displayAccountDetails = 'No Bank Account';

                  if (firstAcc) {
                    displayAccountDetails = `${firstAcc.bank_name} ••${firstAcc.account_number.replace(/[^0-9]/g, '').slice(-4) || 'Account'}`;
                    const accBal = org.opening_balances?.bank_balances?.[firstAcc.account_number];
                    if (accBal) {
                      const rawBal = accBal.balance;
                      const amt = typeof rawBal === 'number' ? rawBal : parseFloat(rawBal);
                      if (!isNaN(amt)) {
                        displayBalance = `$${new Intl.NumberFormat('en-NZ', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }).format(amt)}`;
                      }
                    }
                  }

                  return (
                    <div
                      key={org.id}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border border-slate-200 rounded-xl bg-white transition hover:shadow-sm gap-4"
                    >
                      <div className="flex items-center space-x-3.5">
                        <div
                          className={`w-11 h-11 rounded-lg border flex items-center justify-center text-base font-black shrink-0 ${theme.bg} ${theme.text}`}
                        >
                          {initials}
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <h3 className="font-extrabold text-slate-900 text-sm">{org.name}</h3>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${theme.labelBg}`}>
                              {theme.label}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[11px] font-semibold text-slate-400">
                            <span>Role: <strong className="text-slate-600 font-bold">{org.role}</strong></span>
                            <span>•</span>
                            <span>GST: <strong className="text-slate-600 font-bold">{org.gst_registered ? org.gst_basis?.toUpperCase() : 'N/A'}</strong></span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end space-x-4">
                        <div className="text-left sm:text-right shrink-0">
                          <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block select-none">
                            {displayAccountDetails}
                          </span>
                          <span className="text-sm font-black text-slate-900 block mt-0.5">
                            {displayBalance}
                          </span>
                        </div>

                        {!details.is_owner && (
                          <button
                            onClick={() => handleUnassign(org.id, org.name)}
                            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-50 text-rose-700 hover:bg-rose-600 hover:text-white transition duration-200 flex items-center space-x-1 cursor-pointer shrink-0"
                          >
                            <span>Remove</span>
                            <span className="material-icons text-sm leading-none">close</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Assign Modal Overlay */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-lg overflow-hidden animate-fadeIn p-6 space-y-4">
            <h3 className="text-lg font-black text-slate-900 tracking-tight">Assign to Organisation</h3>
            <p className="text-xs text-slate-400">
              Grant this staff member active permissions to access and configure organization ledger parameters.
            </p>

            <form onSubmit={handleAssign} className="space-y-4 text-sm font-semibold">
              <div>
                <label className="block font-bold text-slate-600 mb-1.5">Select Organisation</label>
                <select
                  required
                  value={selectedOrgId}
                  onChange={(e) => setSelectedOrgId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
                >
                  <option value="">Select an organisation</option>
                  {assignableOrgs.map(org => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1.5">Role / Permission Level</label>
                <select
                  value={assignRole}
                  onChange={(e) => setAssignRole(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
                >
                  <option value="STAFF">Staff (Write Transactions only)</option>
                  <option value="ADMIN">Admin (Full Ledger configuration)</option>
                </select>
              </div>

              <div className="flex space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAssignModal(false);
                    setSelectedOrgId('');
                    setAssignRole('STAFF');
                  }}
                  className="flex-1 border border-slate-200 text-slate-500 hover:bg-slate-50 font-bold text-xs py-3 rounded-xl transition cursor-pointer text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assigning}
                  className="flex-1 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold text-xs py-3 rounded-xl transition cursor-pointer text-center"
                >
                  {assigning ? 'Assigning...' : 'Assign Permission'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
export default StaffDetailPage;
