import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { orgApi } from '../api/orgs';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GstPeriod {
  rate: number;
  effective_from: string;
  effective_to: string | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const SettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const s = (key: string, fallback?: string) => t(`settings_page.${key}`, fallback ?? key);

  // ── Compliance & Tax ──────────────────────────────────────────────────────
  const [gstHistory, setGstHistory] = useState<GstPeriod[]>([]);
  const [newGstRate, setNewGstRate] = useState<string>('15');
  const [newGstFrom, setNewGstFrom] = useState<string>('');
  const [newGstTo, setNewGstTo] = useState<string>('');
  const [editingGstIdx, setEditingGstIdx] = useState<number | null>(null);

  // ── Workflow & Automation ─────────────────────────────────────────────────
  const [categories, setCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState<string>('');

  // ── Merchant Mapping Directory (FxForeignEntitiesTable) ───────────────────
  const [activeEntityTab, setActiveEntityTab] = useState<'Supplier' | 'Customer'>('Supplier');
  const [suppliers, setSuppliers] = useState<Array<{ entity_id: string; entity_type: 'Supplier' | 'Customer'; entity_name: string; default_category: string; ird_number?: string; created_at?: string }>>([]);
  const [customers, setCustomers] = useState<Array<{ entity_id: string; entity_type: 'Supplier' | 'Customer'; entity_name: string; default_category: string; ird_number?: string; created_at?: string }>>([]);
  const [entitiesLoading, setEntitiesLoading] = useState<boolean>(false);
  const [newEntityName, setNewEntityName] = useState<string>('');
  const [newEntityIrd, setNewEntityIrd] = useState<string>('');
  const [newEntityCategory, setNewEntityCategory] = useState<string>('');

  // Inline editing state
  const [editingEntityId, setEditingEntityId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editIrd, setEditIrd] = useState<string>('');
  const [editCategory, setEditCategory] = useState<string>('');

  // ── UI state ──────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState<string>('compliance');

  // ── Section refs for scroll-spy ───────────────────────────────────────────
  const complianceRef = useRef<HTMLDivElement>(null);
  const automationRef = useRef<HTMLDivElement>(null);

  const initFetched = useRef<boolean>(false);

  // ── Bootstrap: load configurations ───────────────────────────────────────
  useEffect(() => {
    if (initFetched.current) return;
    initFetched.current = true;

    const bootstrap = async () => {
      setLoading(true);
      setError(null);
      try {
        const [gstConfig, workflowConfig] = await Promise.all([
          orgApi.getGstConfig(),
          orgApi.getWorkflowConfig(),
        ]);
        setGstHistory(gstConfig?.rate_history || []);
        const cats = workflowConfig.categories || [];
        setCategories(cats);
        setNewEntityCategory(cats[0] || '');

        setEntitiesLoading(true);
        try {
          const { entities: all } = await orgApi.getAllEntities();
          setSuppliers(all.filter(e => e.entity_type === 'Supplier'));
          setCustomers(all.filter(e => e.entity_type === 'Customer'));
        } catch (entErr) {
          console.error('Failed to load merchant mappings:', entErr);
        } finally {
          setEntitiesLoading(false);
        }
      } catch (err: any) {
        console.error('[Settings] Bootstrap error:', err);
        setError(err.message || 'Failed to load configuration');
      } finally {
        setLoading(false);
      }
    };

    bootstrap();
  }, []);

  // ── Scroll-spy ────────────────────────────────────────────────────────────
  useEffect(() => {
    const container = document.getElementById('settings-scroll-area');
    if (!container) return;
    const onScroll = () => {
      const automationTop = automationRef.current?.getBoundingClientRect().top ?? Infinity;
      setActiveNav(automationTop < 200 ? 'automation' : 'compliance');
    };
    container.addEventListener('scroll', onScroll);
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>, nav: string) => {
    setActiveNav(nav);
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ── GST helpers ───────────────────────────────────────────────────────────
  const handleAddGstPeriod = () => {
    if (!newGstFrom) { setError('Effective From date is required.'); return; }
    const rateVal = parseFloat(newGstRate) / 100;
    if (isNaN(rateVal) || rateVal < 0 || rateVal > 1) {
      setError('Please enter a valid GST rate between 0 and 100.');
      return;
    }
    if (newGstTo && newGstFrom.localeCompare(newGstTo) > 0) {
      setError('Effective From cannot be after Effective To.');
      return;
    }

    const newS = newGstFrom;
    const newE = newGstTo || '9999-12-31';
    for (let i = 0; i < gstHistory.length; i++) {
      if (i === editingGstIdx) continue;
      const existing = gstHistory[i];
      const exS = existing.effective_from;
      const exE = existing.effective_to || '9999-12-31';
      if (newS <= exE && exS <= newE) {
        setError(
          `This period [${newGstFrom} → ${newGstTo || 'open-ended'}] overlaps with existing period ` +
          `[${existing.effective_from} → ${existing.effective_to || 'open-ended'}]. ` +
          `Please close the existing open-ended period first.`
        );
        return;
      }
    }

    setError(null);
    const period = { rate: rateVal, effective_from: newGstFrom, effective_to: newGstTo || null };

    if (editingGstIdx !== null) {
      const updated = gstHistory
        .map((p, i) => (i === editingGstIdx ? period : p))
        .sort((a, b) => a.effective_from.localeCompare(b.effective_from));
      setGstHistory(updated);
      setEditingGstIdx(null);
    } else {
      const updated = [
        ...gstHistory,
        period,
      ].sort((a, b) => a.effective_from.localeCompare(b.effective_from));
      setGstHistory(updated);
    }
    setNewGstFrom('');
    setNewGstTo('');
    setNewGstRate('15');
  };

  const handleEditGstPeriod = (idx: number) => {
    const p = gstHistory[idx];
    setNewGstRate(String((p.rate * 100).toFixed(1)));
    setNewGstFrom(p.effective_from);
    setNewGstTo(p.effective_to || '');
    setEditingGstIdx(idx);
    setError(null);
  };

  const handleCancelEditGst = () => {
    setEditingGstIdx(null);
    setNewGstRate('15');
    setNewGstFrom('');
    setNewGstTo('');
    setError(null);
  };

  const handleRemoveGstPeriod = (idx: number) =>
    setGstHistory(gstHistory.filter((_, i) => i !== idx));

  // ── Category helpers ──────────────────────────────────────────────────────
  const handleAddCategory = () => {
    const clean = newCategory.trim();
    if (!clean) return;
    if (categories.includes(clean)) { setError('Category already exists.'); return; }
    setCategories([...categories, clean]);
    setNewCategory('');
  };

  const handleRemoveCategory = (cat: string) => {
    setCategories(categories.filter(c => c !== cat));
  };

  // ── Merchant mapping API helpers ──────────────────────────────────────────
  const handleAddEntity = async () => {
    setError(null);
    setSuccessMsg(null);
    const cleanName = newEntityName.trim();
    const cleanIrd = newEntityIrd.trim();
    const category = newEntityCategory || categories[0];
    if (!cleanName || !category) {
      setError('Merchant Name and Default Category are required.');
      return;
    }
    try {
      const created = await orgApi.createEntity(activeEntityTab, {
        entity_name: cleanName,
        default_category: category,
        ird_number: cleanIrd
      });
      if (activeEntityTab === 'Supplier') {
        setSuppliers([...suppliers, created]);
      } else {
        setCustomers([...customers, created]);
      }
      setNewEntityName('');
      setNewEntityIrd('');
      setSuccessMsg('Merchant mapping created successfully.');
    } catch (err: any) {
      console.error('Failed to create merchant mapping:', err);
      setError(err.message || 'Failed to create merchant mapping');
    }
  };

  const handleStartEditEntity = (ent: any) => {
    setEditingEntityId(ent.entity_id);
    setEditName(ent.entity_name);
    setEditIrd(ent.ird_number || '');
    setEditCategory(ent.default_category);
    setError(null);
    setSuccessMsg(null);
  };

  const handleCancelEditEntity = () => {
    setEditingEntityId(null);
    setError(null);
  };

  const handleSaveEntityEdit = async (ent: any) => {
    setError(null);
    setSuccessMsg(null);
    const cleanName = editName.trim();
    if (!cleanName || !editCategory) {
      setError('Merchant Name and Default Category are required.');
      return;
    }
    try {
      const updated = await orgApi.updateEntity(activeEntityTab, ent.entity_id, {
        entity_name: cleanName,
        default_category: editCategory,
        ird_number: editIrd.trim(),
        created_at: ent.created_at
      });
      if (activeEntityTab === 'Supplier') {
        setSuppliers(suppliers.map(e => e.entity_id === ent.entity_id ? updated : e));
      } else {
        setCustomers(customers.map(e => e.entity_id === ent.entity_id ? updated : e));
      }
      setEditingEntityId(null);
      setSuccessMsg('Merchant mapping updated successfully.');
    } catch (err: any) {
      console.error('Failed to update merchant mapping:', err);
      setError(err.message || 'Failed to update merchant mapping');
    }
  };

  const handleRemoveEntity = async (entityId: string) => {
    setError(null);
    setSuccessMsg(null);
    try {
      await orgApi.deleteEntity(activeEntityTab, entityId);
      if (activeEntityTab === 'Supplier') {
        setSuppliers(suppliers.filter(e => e.entity_id !== entityId));
      } else {
        setCustomers(customers.filter(e => e.entity_id !== entityId));
      }
      setSuccessMsg('Merchant mapping removed successfully.');
    } catch (err: any) {
      console.error('Failed to delete merchant mapping:', err);
      setError(err.message || 'Failed to remove merchant mapping');
    }
  };

  // ── Save global workflow categories ──────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await Promise.all([
        orgApi.saveGstConfig({ rate_history: gstHistory }),
        orgApi.saveWorkflowConfig({ categories, static_rules: [] }),
      ]);
      setSuccessMsg('System configurations saved successfully.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      console.error('[Settings] Save error:', err);
      setError(err.message || 'Failed to save configurations');
    } finally {
      setSaving(false);
    }
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] text-slate-400 font-semibold space-y-4">
        <span className="material-icons animate-spin text-3xl text-slate-300">sync</span>
        <span>{t('common.loading', 'Loading...')}</span>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 w-full max-w-[1280px]">

      {/* ── Page header ── */}
      <div className="border-b border-slate-100 pb-5">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">
          {s('title', 'System Settings')}
        </h1>
        <p className="text-xs text-slate-400 mt-1 font-bold uppercase tracking-wider font-mono">
          {s('subtitle', 'Configure system compliance tax rates and classification rules')}
        </p>
      </div>

      {/* ── Notifications ── */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold px-4 py-3 rounded-xl flex items-center space-x-2">
          <span className="material-icons text-sm">error</span>
          <span>{error}</span>
        </div>
      )}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold px-4 py-3 rounded-xl flex items-center space-x-2">
          <span className="material-icons text-sm">check_circle</span>
          <span>{successMsg}</span>
        </div>
      )}

      {/* ── Two-column layout ── */}
      <div className="flex gap-6 items-start">

        {/* ── Left anchor sub-nav ── */}
        <div className="w-48 flex-shrink-0 sticky top-23">
          <nav className="bg-white border border-slate-200 rounded-2xl shadow-sm p-2 space-y-1">
            <button
              onClick={() => scrollTo(complianceRef, 'compliance')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-left transition cursor-pointer ${activeNav === 'compliance'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-50'
                }`}
            >
              <span className="material-icons text-base">balance</span>
              <span>{s('nav_compliance', 'Compliance & Tax')}</span>
            </button>
            <button
              onClick={() => scrollTo(automationRef, 'automation')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-left transition cursor-pointer ${activeNav === 'automation'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-50'
                }`}
            >
              <span className="material-icons text-base">tune</span>
              <span>{s('nav_automation', 'Workflow & Automation')}</span>
            </button>
          </nav>
        </div>

        {/* ── Right scrollable content ── */}
        <div id="settings-scroll-area" className="flex-1 space-y-6">

          {/* ══ Section: Financial & Tax Compliance ══ */}
          <div ref={complianceRef} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-5">

            <h2 className="text-base font-black text-slate-900 tracking-tight border-b border-slate-100 pb-3">
              {s('compliance_title', 'Financial & Tax Compliance')}
            </h2>

            <div>
              <div className="text-sm font-extrabold text-slate-700 mb-1">
                {s('gst_label', 'GST Rate (%)')}
              </div>
              <p className="text-xs font-semibold text-slate-400 mb-3">
                {s('gst_desc', 'GST rates apply system-wide based on transaction dates. Configure New Zealand GST rate periods:')}
              </p>

              {/* GST table */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs font-semibold text-slate-700">
                  <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">{s('gst_col_rate', 'GST Rate')}</th>
                      <th className="px-4 py-3">{s('gst_col_from', 'Effective From')}</th>
                      <th className="px-4 py-3">{s('gst_col_to', 'Effective To')}</th>
                      <th className="px-4 py-3 text-right">{s('gst_col_actions', 'Actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {gstHistory.map((p, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/40">
                        <td className="px-4 py-3 font-black text-slate-900">{(p.rate * 100).toFixed(1)}%</td>
                        <td className="px-4 py-3 font-mono text-slate-600">{p.effective_from}</td>
                        <td className="px-4 py-3 font-mono text-slate-500">
                          {p.effective_to ?? s('gst_open_ended', 'Open-ended (Current)')}
                        </td>
                        <td className="px-4 py-3 text-right space-x-3">
                          <button
                            type="button"
                            onClick={() => handleEditGstPeriod(idx)}
                            className="text-slate-500 hover:text-slate-800 font-bold cursor-pointer text-xs hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveGstPeriod(idx)}
                            className="text-rose-500 hover:text-rose-700 font-bold cursor-pointer text-xs hover:underline"
                          >
                            {s('gst_remove', 'Remove')}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {gstHistory.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-5 text-center text-slate-400 font-semibold text-xs">
                          {s('gst_empty', 'No GST history configured. Defaults to 15%.')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Add / Edit GST Period form */}
              <div className={`mt-4 border rounded-xl p-4 space-y-3 ${editingGstIdx !== null ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100'}`}>
                <div className="text-[10px] font-black uppercase tracking-wider font-mono text-slate-500">
                  {editingGstIdx !== null
                    ? `Editing Period #${editingGstIdx + 1}`
                    : s('gst_add_title', '+ Add New GST Rate Period')}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-3">
                    <label className="block text-[10px] font-extrabold uppercase text-slate-400 mb-1">
                      {s('gst_rate_label', 'Rate (%)')}
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={newGstRate}
                      onChange={(e) => setNewGstRate(e.target.value)}
                      placeholder="15"
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 w-full focus:outline-none focus:ring-1 focus:ring-slate-400"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <label className="block text-[10px] font-extrabold uppercase text-slate-400 mb-1">
                      {s('gst_from_label', 'Effective From')}
                    </label>
                    <input
                      type="date"
                      value={newGstFrom}
                      onChange={(e) => setNewGstFrom(e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 w-full focus:outline-none focus:ring-1 focus:ring-slate-400"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[10px] font-extrabold uppercase text-slate-400 mb-1">
                      {s('gst_to_label', 'Effective To (Optional)')}
                    </label>
                    <input
                      type="date"
                      value={newGstTo}
                      onChange={(e) => setNewGstTo(e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 w-full focus:outline-none focus:ring-1 focus:ring-slate-400"
                    />
                  </div>
                  <div className="sm:col-span-2 flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={handleAddGstPeriod}
                      className={`text-white text-xs font-bold py-2 w-full rounded-lg transition cursor-pointer ${editingGstIdx !== null
                        ? 'bg-amber-600 hover:bg-amber-500'
                        : 'bg-slate-900 hover:bg-slate-700'
                        }`}
                    >
                      {editingGstIdx !== null ? 'Update' : s('gst_add_btn', 'Add Period')}
                    </button>
                    {editingGstIdx !== null && (
                      <button
                        type="button"
                        onClick={handleCancelEditGst}
                        className="bg-white border border-slate-200 text-slate-600 hover:border-slate-400 text-xs font-bold py-2 w-full rounded-lg transition cursor-pointer"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ══ Section: Workflow & Automation ══ */}
          <div ref={automationRef} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-5">

            <h2 className="text-base font-black text-slate-900 tracking-tight border-b border-slate-100 pb-3">
              {s('automation_title', 'Workflow & Automation')}
            </h2>

            {/* Categories */}
            <div className="space-y-3">
              <div>
                <div className="text-sm font-extrabold text-slate-700 mb-0.5">
                  {s('tags_label', 'Tags / Expense Categories')}
                </div>
                <p className="text-xs font-semibold text-slate-400">
                  {s('tags_desc', 'Define tags used for manual matching or context parameters for transaction classifications:')}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 p-3 border border-slate-100 rounded-xl bg-slate-50/40 min-h-[48px]">
                {categories.map((cat) => (
                  <span
                    key={cat}
                    className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm hover:border-rose-200 transition"
                  >
                    {cat}
                    <button
                      type="button"
                      onClick={() => handleRemoveCategory(cat)}
                      className="text-slate-400 hover:text-rose-500 text-sm leading-none cursor-pointer focus:outline-none"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {categories.length === 0 && (
                  <span className="text-slate-400 text-xs font-semibold py-1">
                    {s('tags_empty', 'No tags yet.')}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder={s('tags_add_placeholder', 'New tag name (e.g. Subsidy)')}
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                  className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400 w-64"
                />
                <button
                  type="button"
                  onClick={handleAddCategory}
                  className="bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition cursor-pointer"
                >
                  {s('tags_add_btn', '+ Add Tag')}
                </button>
              </div>
            </div>

            {/* Merchant Mapping Directory */}
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <div>
                <div className="text-sm font-extrabold text-slate-700 mb-0.5">
                  Merchant Category Directory
                </div>
                <p className="text-xs font-semibold text-slate-400">
                  Manage default bookkeeping categories and IRD tax details mapped to Suppliers and Customers:
                </p>
              </div>

              {/* Tab switcher */}
              <div className="flex border-b border-slate-100 gap-6">
                {(['Supplier', 'Customer'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => { setActiveEntityTab(tab); handleCancelEditEntity(); setError(null); }}
                    className={`pb-2.5 text-[11px] font-black uppercase tracking-wider font-mono border-b-2 transition-all ${
                      activeEntityTab === tab
                        ? 'border-emerald-500 text-emerald-600'
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    {tab === 'Supplier' ? `Suppliers (${suppliers.length})` : `Customers (${customers.length})`}
                  </button>
                ))}
              </div>

              {(() => {
                const currentList = activeEntityTab === 'Supplier' ? suppliers : customers;
                return (
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs font-semibold text-slate-700">
                  <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Merchant / Entity Name</th>
                      <th className="px-4 py-3 w-32">IRD Number</th>
                      <th className="px-4 py-3 w-48">Default Category</th>
                      <th className="px-4 py-3 text-right w-36">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {currentList.map((ent) => {
                      const isEditing = editingEntityId === ent.entity_id;
                      return (
                        <tr key={ent.entity_id} className="hover:bg-slate-50/40">
                          <td className="px-4 py-3 font-bold text-slate-900">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="bg-white border border-slate-200 rounded px-2 py-1 text-xs font-semibold text-slate-800 w-full focus:outline-none focus:ring-1 focus:ring-slate-400"
                              />
                            ) : (
                              ent.entity_name
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editIrd}
                                onChange={(e) => setEditIrd(e.target.value)}
                                className="bg-white border border-slate-200 rounded px-2 py-1 text-xs font-semibold font-mono text-slate-800 w-full focus:outline-none focus:ring-1 focus:ring-slate-400"
                              />
                            ) : (
                              <span className="font-mono text-slate-500 font-bold">{ent.ird_number || '-'}</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {isEditing ? (
                              <select
                                value={editCategory}
                                onChange={(e) => setEditCategory(e.target.value)}
                                className="bg-white border border-slate-200 rounded px-2 py-1 text-xs font-semibold text-slate-800 w-full focus:outline-none focus:ring-1 focus:ring-slate-400"
                              >
                                {categories.map((c) => (
                                  <option key={c} value={c}>{c}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-bold px-2.5 py-1 rounded-full">
                                {ent.default_category}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {isEditing ? (
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleSaveEntityEdit(ent)}
                                  className="text-emerald-600 hover:text-emerald-700 font-bold text-xs"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCancelEditEntity}
                                  className="text-slate-400 hover:text-slate-600 font-bold text-xs"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleStartEditEntity(ent)}
                                  className="text-slate-600 hover:text-slate-800 font-bold text-xs"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveEntity(ent.entity_id)}
                                  className="text-rose-500 hover:text-rose-700 font-bold text-xs"
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {currentList.length === 0 && !entitiesLoading && (
                      <tr>
                        <td colSpan={4} className="px-4 py-5 text-center text-slate-400 font-semibold text-xs">
                          No {activeEntityTab.toLowerCase()} mappings yet. They will auto-populate during CSV imports.
                        </td>
                      </tr>
                    )}
                    {entitiesLoading && (
                      <tr>
                        <td colSpan={4} className="px-4 py-5 text-center text-slate-400 font-semibold text-xs animate-pulse">
                          Loading merchant mapping database...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
                );
              })()}

              {/* Add New Entity Form */}
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-3">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 font-mono">
                  + Add {activeEntityTab} Mapping
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-5">
                    <label className="block text-[10px] font-extrabold uppercase text-slate-400 mb-1">
                      Merchant / Entity Name (Exact case matching)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Woolworths"
                      value={newEntityName}
                      onChange={(e) => setNewEntityName(e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 w-full focus:outline-none focus:ring-1 focus:ring-slate-400"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-extrabold uppercase text-slate-400 mb-1">
                      IRD Number
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 088-080-738"
                      value={newEntityIrd}
                      onChange={(e) => setNewEntityIrd(e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold font-mono text-slate-800 w-full focus:outline-none focus:ring-1 focus:ring-slate-400"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[10px] font-extrabold uppercase text-slate-400 mb-1">
                      Default Category
                    </label>
                    <select
                      value={newEntityCategory}
                      onChange={(e) => setNewEntityCategory(e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 w-full focus:outline-none focus:ring-1 focus:ring-slate-400 cursor-pointer"
                    >
                      <option value="">-- Choose Category --</option>
                      {categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      onClick={handleAddEntity}
                      className="bg-slate-900 hover:bg-slate-700 text-white text-xs font-bold py-2 w-full rounded-lg transition cursor-pointer"
                    >
                      Add Rule
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Save all ── */}
          <div className="flex justify-end pb-6">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-400 text-white font-bold text-sm py-3 px-8 rounded-xl shadow-sm transition flex items-center space-x-2 cursor-pointer"
            >
              {saving ? (
                <>
                  <span className="material-icons animate-spin text-base">sync</span>
                  <span>{s('saving_btn', 'Saving...')}</span>
                </>
              ) : (
                <>
                  <span className="material-icons text-base">save</span>
                  <span>{s('save_btn', 'Save All Settings')}</span>
                </>
              )}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
