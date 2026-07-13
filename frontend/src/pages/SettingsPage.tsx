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
  const [staticRules, setStaticRules] = useState<{ pattern: string; category: string }[]>([]);
  const [newRulePattern, setNewRulePattern] = useState<string>('');
  const [newRuleCategory, setNewRuleCategory] = useState<string>('');

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

  // ── Bootstrap: load global config (zero org requests) ────────────────────
  useEffect(() => {
    if (initFetched.current) return;
    initFetched.current = true;

    const bootstrap = async () => {
      setLoading(true);
      setError(null);
      try {
        // Both calls are global config — zero org requests
        const [gstConfig, workflowConfig] = await Promise.all([
          orgApi.getGstConfig(),
          orgApi.getWorkflowConfig(),
        ]);
        setGstHistory(gstConfig?.rate_history || []);
        setCategories(workflowConfig.categories || []);
        setStaticRules(workflowConfig.static_rules || []);
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

    // Overlap check — same logic as backend (s1 <= e2 && s2 <= e1)
    // Skip the row currently being edited to avoid self-collision
    const newS = newGstFrom;
    const newE = newGstTo || '9999-12-31';
    for (let i = 0; i < gstHistory.length; i++) {
      if (i === editingGstIdx) continue; // skip self when editing
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
      // Replace the edited row in-place, then re-sort
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
    setStaticRules(staticRules.filter(r => r.category !== cat));
  };

  // ── Static rule helpers ───────────────────────────────────────────────────
  const handleAddRule = () => {
    const clean = newRulePattern.trim();
    const cat = newRuleCategory || categories[0];
    if (!clean || !cat) { setError('Both pattern and category are required.'); return; }
    if (staticRules.some(r => r.pattern.toLowerCase() === clean.toLowerCase())) {
      setError('A rule with this pattern already exists.');
      return;
    }
    setStaticRules([...staticRules, { pattern: clean, category: cat }]);
    setNewRulePattern('');
  };

  const handleRemoveRule = (idx: number) =>
    setStaticRules(staticRules.filter((_, i) => i !== idx));

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      // Both saves are global config — zero org requests
      await Promise.all([
        orgApi.saveGstConfig({ rate_history: gstHistory }),
        orgApi.saveWorkflowConfig({ categories, static_rules: staticRules }),
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

            {/* Static Rules */}
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <div>
                <div className="text-sm font-extrabold text-slate-700 mb-0.5">
                  {s('rules_label', 'Static Bank Rules')}
                </div>
                <p className="text-xs font-semibold text-slate-400">
                  {s('rules_desc', 'Automatically classify imported transactions matching pattern strings to a specific category:')}
                </p>
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs font-semibold text-slate-700">
                  <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">{s('rules_col_pattern', 'If Description Contains')}</th>
                      <th className="px-4 py-3">{s('rules_col_category', 'Map to Category')}</th>
                      <th className="px-4 py-3 text-right">{s('rules_col_actions', 'Actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {staticRules.map((rule, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/40">
                        <td className="px-4 py-3 font-mono text-slate-900 font-bold">"{rule.pattern}"</td>
                        <td className="px-4 py-3">
                          <span className="bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-bold px-2.5 py-1 rounded-full">
                            {rule.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveRule(idx)}
                            className="text-rose-500 hover:text-rose-700 font-bold cursor-pointer text-xs hover:underline"
                          >
                            {s('rules_delete', 'Delete')}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {staticRules.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-5 text-center text-slate-400 font-semibold text-xs">
                          {s('rules_empty', 'No auto-matching rules configured.')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-3">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 font-mono">
                  {s('rules_add_title', '+ Add Routing Rule')}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-5">
                    <label className="block text-[10px] font-extrabold uppercase text-slate-400 mb-1">
                      {s('rules_pattern_label', 'Pattern (case-insensitive contains)')}
                    </label>
                    <input
                      type="text"
                      placeholder={s('rules_pattern_placeholder', 'e.g. Woolworths')}
                      value={newRulePattern}
                      onChange={(e) => setNewRulePattern(e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 w-full focus:outline-none focus:ring-1 focus:ring-slate-400"
                    />
                  </div>
                  <div className="sm:col-span-5">
                    <label className="block text-[10px] font-extrabold uppercase text-slate-400 mb-1">
                      {s('rules_category_label', 'Assign Category')}
                    </label>
                    <select
                      value={newRuleCategory}
                      onChange={(e) => setNewRuleCategory(e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 w-full focus:outline-none focus:ring-1 focus:ring-slate-400 cursor-pointer"
                    >
                      <option value="">{s('rules_category_placeholder', '-- Choose Category --')}</option>
                      {categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      onClick={handleAddRule}
                      className="bg-slate-900 hover:bg-slate-700 text-white text-xs font-bold py-2 w-full rounded-lg transition cursor-pointer"
                    >
                      {s('rules_add_btn', 'Add Rule')}
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
