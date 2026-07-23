import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getValidToken } from '../App';
import { cognitoConfig } from '../cognitoConfig';
import type { StaffMember } from '../types';

export const StaffListPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStaffList = async () => {
    setLoading(true);
    setError(null);
    try {
      const activeToken = await getValidToken();
      const res = await fetch(`${cognitoConfig.OrgsApiUrl}staff`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${activeToken}`,
        },
      });

      const data = await res.json();
      if (res.ok) {
        setStaff(data.staff || []);
      } else {
        if (res.status === 403) {
          setError(t('staff.forbidden', 'Access Denied: You do not have OWNER or ADMIN permission to manage staff members.'));
        } else {
          setError(data.error || 'Failed to fetch staff list.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Network request failed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaffList();
  }, []);

  const handleDelete = async (staffId: string, name: string) => {
    const confirmed = window.confirm(
      t('staff.delete_confirm', `Are you sure you want to permanently deprovision and delete ${name}? This action is irreversible.`)
    );
    if (!confirmed) return;

    try {
      const activeToken = await getValidToken();
      const res = await fetch(`${cognitoConfig.OrgsApiUrl}staff/${staffId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${activeToken}`,
        },
      });

      const data = await res.json();
      if (res.ok) {
        fetchStaffList();
      } else {
        alert(data.error || 'Failed to delete staff member.');
      }
    } catch (err: any) {
      alert(err.message || 'Network error occurred during deletion.');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center py-24 space-y-4 max-w-[1280px]">
        <div className="w-9 h-9 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
        <p className="text-xs font-semibold text-slate-400">Loading payroll ledger...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 w-full max-w-[1280px]">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Security Alert</h1>
            <p className="text-xs text-slate-400 mt-1">Sovereign auth gate has rejected your access request.</p>
          </div>
        </div>
        <div className="p-6 bg-red-50 border border-red-200 text-red-800 rounded-2xl flex items-start space-x-3.5 shadow-sm">
          <span className="material-icons text-2xl leading-none mt-0.5">lock_person</span>
          <div className="space-y-1">
            <h4 className="text-sm font-bold uppercase tracking-wider">Access Denied</h4>
            <p className="text-xs font-semibold leading-relaxed text-red-700/90">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const activeCount = staff.filter(s => s.status === 'active').length;

  return (
    <div className="space-y-6 w-full max-w-[1280px]">

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-5 gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Staff Management</h1>
          <p className="text-xs text-slate-400 mt-1 font-semibold">Sovereign payroll node, tax codes tracking, and resource allocation.</p>
        </div>
        <div>
          <button
            onClick={() => navigate('/staff/new')}
            className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-sm transition flex items-center justify-center space-x-2 shrink-0 cursor-pointer"
          >
            <span className="material-icons text-[14px] text-emerald-400 leading-none">add</span>
            <span>Add New Member</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm flex items-center justify-between hover:border-slate-300 transition duration-150">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Operatives</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{activeCount} {activeCount === 1 ? 'Member' : 'Members'}</p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <span className="material-icons text-xl leading-none">people</span>
          </div>
        </div>
        <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm flex items-center justify-between hover:border-slate-300 transition duration-150">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Next Pay Execution</p>
            <p className="text-2xl font-black text-amber-600 mt-1">15 July 2026</p>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <span className="material-icons text-xl leading-none">event_note</span>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-slate-500 uppercase tracking-widest font-black text-xs bg-slate-50/50">
                <th className="px-6 py-4">Operative / Position</th>
                <th className="px-6 py-4">Tax Code</th>
                <th className="px-6 py-4">IRD Number</th>
                <th className="px-6 py-4">Hourly Rate</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-600 font-bold">
              {staff.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 font-semibold">
                    No active staff members registered. Click "+ Add New Member" to invite.
                  </td>
                </tr>
              ) : (
                staff.map((member) => (
                  <tr key={member.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        <span className="font-black text-slate-950 text-base">{member.name}</span>
                        {(member.groups || []).map((group) => {
                          let badgeStyle = 'bg-slate-50 border border-slate-200 text-slate-700';
                          if (group === 'OWNER') {
                            badgeStyle = 'bg-amber-50 border border-amber-200 text-amber-700';
                          } else if (group === 'ADMIN') {
                            badgeStyle = 'bg-emerald-50 border border-emerald-200 text-emerald-700';
                          } else if (group === 'STAFF') {
                            badgeStyle = 'bg-blue-50 border border-blue-200 text-blue-700';
                          }
                          return (
                            <span key={group} className={`px-1.5 py-0.5 text-[9px] font-black rounded uppercase tracking-wider ${badgeStyle}`}>
                              {t(`user_groups.${group}`, group)}
                            </span>
                          );
                        })}
                      </div>
                      <div className="text-xs text-slate-400 font-semibold mt-0.5">{member.position}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 font-black border border-blue-200 bg-blue-50 text-blue-600 rounded text-xs uppercase">
                        {member.tax_code} ({member.employment_model === 'contractor' ? 'WT' : 'PAYE'})
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-500 tracking-wide text-sm">{member.ird_number}</td>
                    <td className="px-6 py-4 text-slate-950 font-mono text-sm">
                      ${Number(member.hourly_rate).toFixed(2)} / hr
                    </td>
                    <td className="px-6 py-4">
                      {member.status === 'active' ? (
                        <span className="inline-flex items-center px-2.5 py-1 font-black border border-emerald-200 bg-emerald-50 text-emerald-600 rounded-full text-xs uppercase tracking-wide">
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-1.5 animate-pulse"></span>
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 font-black border border-slate-200 bg-slate-50 text-slate-400 rounded-full text-xs uppercase tracking-wide">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right space-x-3.5 font-black uppercase tracking-wider text-xs">
                      <button
                        onClick={() => navigate(`/staff/${member.id}`)}
                        className="text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                      >
                        View
                      </button>
                      <button
                        onClick={() => navigate(`/staff/${member.id}/edit`)}
                        className="text-emerald-600 hover:text-emerald-700 transition-colors cursor-pointer"
                      >
                        Edit
                      </button>
                      {member.id === localStorage.getItem('user_sub') || member.is_owner ? (
                        <span
                          className="text-slate-300 select-none cursor-not-allowed"
                          title={member.is_owner ? "OWNER group members cannot be deleted" : "You cannot delete your own profile"}
                        >
                          Delete
                        </span>
                      ) : (
                        <button
                          onClick={() => handleDelete(member.id, member.name)}
                          className="text-red-500 hover:text-red-700 transition-colors cursor-pointer"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
export default StaffListPage;
