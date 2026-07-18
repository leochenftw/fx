import React, { useState, useEffect } from 'react';
import { orgApi } from '../api/orgs';
import { parseCsv } from '../utils/csv';
import { calculateTransactionHash, checkDuplicates } from '../utils/indexeddb';

interface ImportGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: File | null;
  orgs: any[];
  onOrgUpdate: () => void;
  onNext: (payload: { orgId: string; bankAccount: string; mapping: any; transactions: any[] }) => void;
  loadingOrgs?: boolean;
}

export const ImportGuideModal: React.FC<ImportGuideModalProps> = ({
  isOpen,
  onClose,
  file,
  orgs,
  onOrgUpdate,
  onNext,
  loadingOrgs = false
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [parsing, setParsing] = useState<boolean>(false);
  
  // Helper to read full file as text
  const readFileText = (targetFile: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve((e.target?.result as string) || '');
      reader.onerror = () => reject(new Error('Failed to read selected CSV file.'));
      reader.readAsText(targetFile);
    });
  };

  // Helper to parse amount decimal strings securely into integer cents
  const parseAmountToCents = (amountStr: string): number => {
    const clean = amountStr.replace(/[^0-9.-]/g, '');
    const val = parseFloat(clean);
    if (isNaN(val)) return 0;
    return Math.round(val * 100);
  };
  
  // Organisations filter
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  
  // Bank accounts state
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [selectedBankAccount, setSelectedBankAccount] = useState<string>('');
  
  // Inline add bank account state
  const [showAddBank, setShowAddBank] = useState<boolean>(false);
  const [newBankName, setNewBankName] = useState<string>('');
  const [newAccName, setNewAccName] = useState<string>('');
  const [newAccNum, setNewAccNum] = useState<string>('');
  const [savingBank, setSavingBank] = useState<boolean>(false);

  // Mappings presets
  const [globalMappings, setGlobalMappings] = useState<any[]>([]);
  const [selectedMappingSk, setSelectedMappingSk] = useState<string>('');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [recommendedMapping, setRecommendedMapping] = useState<any>(null);

  // Visual Mapper current aligned columns state
  const [dateColumn, setDateColumn] = useState<string>('');
  const [amountColumn, setAmountColumn] = useState<string>('');
  const [vendorColumn, setVendorColumn] = useState<string>('');
  const [descriptionColumns, setDescriptionColumns] = useState<string[]>([]);
  const [indicatorMode, setIndicatorMode] = useState<'auto' | 'column'>('auto');
  const [indicatorColumn, setIndicatorColumn] = useState<string>('');
  const [debitValue, setDebitValue] = useState<string>('');
  const [creditValue, setCreditValue] = useState<string>('');

  // 1. 读取 CSV 首行表头并进行有效性校验
  const parseCsvHeader = (targetFile: File): Promise<string[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const firstLine = text.split('\n')[0] || '';
        const cleanLine = firstLine.replace(/^\uFEFF/, '').trim();
        if (!cleanLine) {
          reject(new Error('Format error: CSV file has an empty first row. Unable to read table headers.'));
          return;
        }
        const headers = cleanLine.split(',').map((h: string) => h.replace(/^["']|["']$/g, '').trim()).filter(Boolean);
        if (headers.length === 0) {
          reject(new Error('Format error: No valid column headers detected in the CSV file. Please check delimiters.'));
          return;
        }
        resolve(headers);
      };
      reader.onerror = () => reject(new Error('IO error: Failed to read selected file.'));
      reader.readAsText(targetFile.slice(0, 4096));
    });
  };

  // 获取用户有 OWNER/ADMIN 权限的组织
  const userGroups = React.useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user_groups') || '[]');
    } catch {
      return [];
    }
  }, []);
  const isSystemOwner = userGroups.includes('OWNER');

  const manageableOrgs = React.useMemo(() => {
    return orgs.filter((org: any) => isSystemOwner || org.role === 'OWNER' || org.role === 'ADMIN');
  }, [orgs, isSystemOwner]);

  // A. 初始加载：解析表头 + 拉取全局 Mappings + 默认组织
  useEffect(() => {
    if (!isOpen || !file) return;

    const initialize = async () => {
      setLoading(true);
      setError(null);
      try {
        // 1. 读取并解析表头
        const headers = await parseCsvHeader(file);
        setCsvHeaders(headers);

        // 2. 加载全局 Mappings 模版
        const mappings = await orgApi.getMappings();
        setGlobalMappings(mappings || []);

        // 3. 智能匹配推荐模版
        const cleanHeaders = headers.map((h: string) => h.toLowerCase().trim());
        let bestScore = -1;
        let bestMap = null;

        for (const mapping of mappings) {
          let score = 0;
          const mapCols = [
            mapping.date_column,
            mapping.amount_column,
            mapping.vendor_column,
            ...(mapping.description_columns || [])
          ].map((c: string) => c.toLowerCase().trim());

          for (const col of mapCols) {
            if (cleanHeaders.includes(col)) {
              score++;
            }
          }
          if (score > bestScore && score > 0) {
            bestScore = score;
            bestMap = mapping;
          }
        }

        setRecommendedMapping(bestMap);
        
        // 4. 解析当前 URL 中的 orgId 作为默认组织，否则默认选第一个
        const match = window.location.pathname.match(/^\/orgs\/([a-f0-9-]+)/);
        const urlOrgId = match ? match[1] : '';

        const isUrlOrgValid = manageableOrgs.some((o: any) => o.id === urlOrgId);
        if (isUrlOrgValid) {
          setSelectedOrgId(urlOrgId);
        } else if (manageableOrgs.length > 0) {
          setSelectedOrgId(manageableOrgs[0].id);
        } else {
          setSelectedOrgId('');
        }

        // 装载推荐的模板，如果没有匹配项，根据表头名做兜底智能猜测
        if (bestMap) {
          setSelectedMappingSk(bestMap.sk);
        } else {
          setSelectedMappingSk('custom');
          // 兜底智能猜测
          const dCol = headers.find((h: string) => h.toLowerCase().includes('date')) || '';
          const aCol = headers.find((h: string) => h.toLowerCase().includes('amount')) || '';
          const vCol = headers.find((h: string) => h.toLowerCase().includes('detail') || h.toLowerCase().includes('payee') || h.toLowerCase().includes('vendor') || h.toLowerCase().includes('desc')) || '';
          setDateColumn(dCol);
          setAmountColumn(aCol);
          setVendorColumn(vCol);
          setDescriptionColumns([]);
          setIndicatorMode('auto');
          setIndicatorColumn('');
          setDebitValue('');
          setCreditValue('');
        }
      } catch (err: any) {
        console.error('[ImportGuide] Error initializing:', err);
        setError(err.message || 'Failed to analyze CSV headers or load mapping configurations.');
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, [isOpen, file, manageableOrgs]);

  // B. 动态更新：当所选预设模板变化时，同步更新可视化字段匹配器对应的 state
  useEffect(() => {
    if (!selectedMappingSk || selectedMappingSk === 'custom') return;
    const m = globalMappings.find((x: any) => x.sk === selectedMappingSk);
    if (m) {
      setDateColumn(m.date_column || '');
      setAmountColumn(m.amount_column || '');
      setVendorColumn(m.vendor_column || '');
      setDescriptionColumns(m.description_columns || []);
      setIndicatorMode(m.indicator_mode || 'auto');
      setIndicatorColumn(m.indicator_column || '');
      setDebitValue(m.debit_value || '');
      setCreditValue(m.credit_value || '');
    }
  }, [selectedMappingSk, globalMappings]);

  // C. 动态更新：当选择组织变化时更新银行账户
  useEffect(() => {
    if (!selectedOrgId) {
      setBankAccounts([]);
      setSelectedBankAccount('');
      return;
    }
    const org = manageableOrgs.find((o: any) => o.id === selectedOrgId);
    const accounts = org?.bank_accounts || [];
    setBankAccounts(accounts);
    if (accounts.length > 0) {
      setSelectedBankAccount(accounts[0].account_number);
    } else {
      setSelectedBankAccount('');
    }
  }, [selectedOrgId, manageableOrgs]);

  if (!isOpen || !file) return null;

  // D. 就地创建银行账户逻辑
  const handleCreateBankAccount = async () => {
    const bName = newBankName.trim();
    const aName = newAccName.trim();
    const aNum = newAccNum.trim();

    if (!bName || !aName || !aNum) {
      alert('Please fill in all bank account fields.');
      return;
    }

    setSavingBank(true);
    try {
      const org = manageableOrgs.find((o: any) => o.id === selectedOrgId);
      if (!org) throw new Error('Target organisation not found.');

      const updatedAccounts = [
        ...(org.bank_accounts || []),
        { bank_name: bName, account_name: aName, account_number: aNum }
      ];

      // 调用后端更新 API 写入组织
      await orgApi.update(selectedOrgId, {
        name: org.name,
        ird_number: org.ird_number,
        entity_type: org.entity_type,
        gst_registered: org.gst_registered,
        gst_basis: org.gst_basis,
        gst_period: org.gst_period,
        categories: org.categories || [],
        static_rules: org.static_rules || [],
        bank_accounts: updatedAccounts,
        opening_balances: org.opening_balances || {},
      });

      // 同步外部状态
      await onOrgUpdate();

      setNewBankName('');
      setNewAccName('');
      setNewAccNum('');
      setShowAddBank(false);

      // 自动切换为当前新建的账户
      setTimeout(() => {
        setSelectedBankAccount(aNum);
      }, 100);

    } catch (err: any) {
      console.error('Failed to create bank account:', err);
      alert(err.message || 'Failed to save new bank account.');
    } finally {
      setSavingBank(false);
    }
  };

  const handleNext = async () => {
    if (!selectedOrgId) {
      alert('Please select a target organisation.');
      return;
    }
    if (!selectedBankAccount) {
      alert('Please select a target bank account.');
      return;
    }
    if (!dateColumn) {
      alert('Please map the Transaction Date column.');
      return;
    }
    if (!amountColumn) {
      alert('Please map the Gross Amount column.');
      return;
    }
    if (!vendorColumn) {
      alert('Please map the Vendor / Payee column.');
      return;
    }
    if (indicatorMode === 'column' && (!indicatorColumn || !debitValue || !creditValue)) {
      alert('Please configure all column indicator options.');
      return;
    }

    setParsing(true);
    try {
      // 1. Read full CSV content
      const text = await readFileText(file!);

      // 2. Parse using native FSM parser
      const rawRows = parseCsv(text);
      if (rawRows.length === 0) {
        throw new Error('The selected CSV file has no transactable rows.');
      }

      const activePreset = globalMappings.find((m: any) => m.sk === selectedMappingSk) || recommendedMapping;
      const isCredit = activePreset?.card_type === 'credit';

      // 3. Map to standard transaction entities
      const mappedTransactions: any[] = [];
      for (const row of rawRows) {
        const rawDate = row[dateColumn] || '';
        const rawAmount = row[amountColumn] || '';
        const rawVendor = row[vendorColumn] || '';

        if (!rawDate || !rawAmount) continue; // Skip incomplete blank lines

        const rawCents = parseAmountToCents(rawAmount);

        // Combine description columns
        const descVals = descriptionColumns
          .map((col: string) => row[col])
          .filter(Boolean)
          .map((v: string) => v.trim());
        const description = descVals.join(' - ');

        // Determine transaction type
        let txType: 'income' | 'expense' = 'expense';
        if (indicatorMode === 'auto') {
          // If the statement is credit card, positive values signify charges (expense) by default.
          if (isCredit) {
            txType = rawCents >= 0 ? 'expense' : 'income';
          } else {
            txType = rawCents >= 0 ? 'income' : 'expense';
          }
        } else if (indicatorMode === 'column' && indicatorColumn) {
          const colVal = (row[indicatorColumn] || '').trim().toLowerCase();
          const dVal = (debitValue || '').trim().toLowerCase();
          const cVal = (creditValue || '').trim().toLowerCase();

          if (colVal === cVal) {
            txType = 'income';
          } else if (colVal === dVal) {
            txType = 'expense';
          } else {
            if (isCredit) {
              txType = rawCents >= 0 ? 'expense' : 'income';
            } else {
              txType = rawCents >= 0 ? 'income' : 'expense';
            }
          }
        }

        // Force amount cents sign alignment to the resolved transaction direction:
        // Income is strictly positive, Expense is strictly negative
        const cents = txType === 'income' ? Math.abs(rawCents) : -Math.abs(rawCents);

        // Generate a stable raw hash input based on all physical column values (immune to mapping overrides)
        const rawHashString = Object.values(row)
          .map((v: any) => String(v).trim().toLowerCase())
          .filter(Boolean)
          .join('#');

        mappedTransactions.push({
          date: rawDate.trim(),
          vendor: rawVendor.trim(),
          amountCents: cents,
          description,
          type: txType,
          rawHashString,
          hash: '',
          isDuplicate: false
        });
      }

      if (mappedTransactions.length === 0) {
        throw new Error('Failed to align any columns to standard transaction fields. Please verify selections.');
      }

      // 4. Concurrently generate idempotent hashes & assign unique client row IDs & occurrence indexes
      const initOccurrences = new Map<string, number>();
      await Promise.all(mappedTransactions.map(async (tx, idx) => {
        tx.hash = await calculateTransactionHash(tx.rawHashString);
        tx.id = `${tx.hash}-${idx}`;
        
        const oIdx = initOccurrences.get(tx.hash) || 0;
        tx.occurIdx = oIdx;
        initOccurrences.set(tx.hash, oIdx + 1);
      }));

      // 5. Query local IndexedDB for dynamic watermarks
      const hashes = mappedTransactions.map((t: any) => t.hash);
      const watermarks = await checkDuplicates(selectedOrgId, hashes);

      console.log('[DEBUG DEDUP] Querying Watermarks in Step 1:', {
        queryOrgId: selectedOrgId,
        totalHashes: hashes.length,
        firstFewHashes: hashes.slice(0, 3),
        watermarksFetched: Array.from(watermarks.entries())
      });

      // 6. Label duplicates using dynamic watermark counting
      const currentOccurrences = new Map<string, number>();
      for (const tx of mappedTransactions) {
        const occurIdx = currentOccurrences.get(tx.hash) || 0;
        currentOccurrences.set(tx.hash, occurIdx + 1);

        const savedWatermark = watermarks.get(tx.hash) || 0;
        if (occurIdx < savedWatermark) {
          tx.isDuplicate = true;
        }
      }

      const currentPreset = globalMappings.find((m: any) => m.sk === selectedMappingSk);
      const finalMapping = {
        bank_name: currentPreset?.bank_name || recommendedMapping?.bank_name || 'Custom',
        card_type: currentPreset?.card_type || recommendedMapping?.card_type || 'debit',
        format_name: currentPreset?.format_name || 'Custom Alignment',
        date_column: dateColumn,
        amount_column: amountColumn,
        vendor_column: vendorColumn,
        description_columns: descriptionColumns,
        indicator_mode: indicatorMode,
        indicator_column: indicatorMode === 'column' ? indicatorColumn : undefined,
        debit_value: indicatorMode === 'column' ? debitValue : undefined,
        credit_value: indicatorMode === 'column' ? creditValue : undefined,
      };

      // 7. Fire onNext to load Review Preview screen
      onNext({
        orgId: selectedOrgId,
        bankAccount: selectedBankAccount,
        mapping: finalMapping,
        transactions: mappedTransactions
      });

    } catch (err: any) {
      console.error('CSV Import processing failed:', err);
      alert(err.message || 'Failed to parse and map statement file.');
    } finally {
      setParsing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-3xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span className="material-icons text-emerald-600 text-lg">settings_suggest</span>
              Import Bank Statement Guide
            </h3>
            <p className="text-xs text-slate-400 font-bold uppercase mt-1 tracking-wider font-mono">
              Step 1 of 2: Mapping accounts &amp; CSV templates
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <span className="material-icons text-lg">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-grow space-y-5 overflow-y-auto max-h-[70vh]">
          {(loading || loadingOrgs) ? (
            <div className="flex flex-col items-center justify-center py-10 space-y-3">
              <div className="w-8 h-8 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
              <span className="text-sm font-semibold text-slate-500">Analyzing CSV structures...</span>
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold rounded-xl flex items-start gap-2">
              <span className="material-icons text-sm mt-0.5">error</span>
              <span>{error}</span>
            </div>
          ) : (
            <>
              {/* File Info Card */}
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-extrabold text-slate-800 break-all">{file.name}</div>
                  <div className="text-xs text-slate-400 font-bold font-mono mt-1">
                    Size: {(file.size / 1024).toFixed(2)} KB
                  </div>
                </div>
                <span className="material-icons text-emerald-600 text-2xl">description</span>
              </div>

              {/* 0. Target Organisation */}
              <div className="space-y-1.5">
                <label className="block text-xs font-black uppercase text-slate-500 tracking-wider">
                  Target Organisation
                </label>
                {manageableOrgs.length === 0 ? (
                  <div className="p-3.5 bg-rose-50 border border-rose-100 text-rose-700 text-sm font-semibold rounded-xl flex items-center gap-2">
                    <span className="material-icons text-sm">warning</span>
                    <span>No organisations found where you have OWNER or ADMIN permission.</span>
                  </div>
                ) : (
                  <select
                    value={selectedOrgId}
                    onChange={(e) => setSelectedOrgId(e.target.value)}
                    className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 w-full focus:outline-none focus:ring-1 focus:ring-slate-400 cursor-pointer"
                  >
                    {manageableOrgs.map((org: any) => (
                      <option key={org.id} value={org.id}>
                        {org.name} ({org.role || 'OWNER'})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* 1. Target Account */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-black uppercase text-slate-500 tracking-wider">
                    Target Bank Account
                  </label>
                  {selectedOrgId && !showAddBank && (
                    <button
                      type="button"
                      onClick={() => setShowAddBank(true)}
                      className="text-xs font-black text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer flex items-center gap-0.5"
                    >
                      <span className="material-icons text-xs leading-none">add</span>
                      <span>Create New Account</span>
                    </button>
                  )}
                </div>

                {/* Inline account creator */}
                {showAddBank ? (
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 font-mono">
                      + Create New Bank Account
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-0.5">Bank Name</label>
                        <input
                          type="text"
                          placeholder="e.g. ANZ"
                          value={newBankName}
                          onChange={(e) => setNewBankName(e.target.value)}
                          className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 w-full focus:outline-none focus:ring-1 focus:ring-slate-400"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-0.5">Account Name</label>
                        <input
                          type="text"
                          placeholder="e.g. Main Cheque"
                          value={newAccName}
                          onChange={(e) => setNewAccName(e.target.value)}
                          className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 w-full focus:outline-none focus:ring-1 focus:ring-slate-400"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-0.5">Account Number</label>
                      <input
                        type="text"
                        placeholder="e.g. 01-0505-0780727-00"
                        value={newAccNum}
                        onChange={(e) => setNewAccNum(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 w-full focus:outline-none focus:ring-1 focus:ring-slate-400"
                      />
                    </div>
                    <div className="flex gap-2 justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => setShowAddBank(false)}
                        className="bg-white border border-slate-200 text-slate-600 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-slate-100 transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleCreateBankAccount}
                        disabled={savingBank}
                        className="bg-emerald-600 text-white text-xs font-bold px-4 py-1.5 rounded-lg hover:bg-emerald-500 disabled:bg-emerald-300 transition flex items-center gap-1"
                      >
                        {savingBank && <span className="material-icons animate-spin text-[12px]">sync</span>}
                        <span>Save Account</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {bankAccounts.length === 0 ? (
                      <div className="p-3.5 bg-rose-50 border border-rose-100 text-rose-700 text-sm font-semibold rounded-xl flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="material-icons text-sm">warning</span>
                          <span>No bank accounts associated with this organisation.</span>
                        </div>
                      </div>
                    ) : (
                      <select
                        value={selectedBankAccount}
                        onChange={(e) => setSelectedBankAccount(e.target.value)}
                        className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 w-full focus:outline-none focus:ring-1 focus:ring-slate-400 cursor-pointer"
                      >
                        {bankAccounts.map((acc: any) => (
                          <option key={acc.account_number} value={acc.account_number}>
                            {acc.account_name} ({acc.bank_name} ••{acc.account_number.slice(-4)})
                          </option>
                        ))}
                      </select>
                    )}
                  </>
                )}
              </div>

              {/* 2. Detected CSV Headers */}
              <div className="space-y-1.5">
                <label className="block text-xs font-black uppercase text-slate-500 tracking-wider">
                  2. Detected CSV Columns
                </label>
                <div className="flex flex-wrap gap-1.5 p-3 border border-slate-100 rounded-xl bg-slate-50/40 max-h-[100px] overflow-y-auto">
                  {csvHeaders.map((header: string, idx: number) => (
                    <span
                      key={idx}
                      className="bg-white border border-slate-200 text-slate-600 text-xs font-bold px-2.5 py-1 rounded-xl shadow-sm"
                    >
                      {header}
                    </span>
                  ))}
                </div>
              </div>

              {/* 3. CSV Field Template & Alignment */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-black uppercase text-slate-500 tracking-wider">
                    3. Statement Format Alignment
                  </label>
                  {recommendedMapping && (
                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2.5 py-1 rounded-full flex items-center gap-0.5 animate-pulse">
                      <span className="material-icons text-[11px] leading-none">auto_awesome</span>
                      <span>Smart Match Recommended</span>
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <select
                    value={selectedMappingSk}
                    onChange={(e) => setSelectedMappingSk(e.target.value)}
                    className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 w-full focus:outline-none focus:ring-1 focus:ring-slate-400 cursor-pointer"
                  >
                    <option value="" disabled>-- Select Preset Template --</option>
                    {globalMappings.map((m: any) => (
                      <option key={m.sk} value={m.sk}>
                        Preset: {m.format_name} ({m.bank_name} - {m.card_type})
                      </option>
                    ))}
                    <option value="custom">-- Custom Mapping (Adjust Below) --</option>
                  </select>
                </div>

                {/* Visual Field Mapper Grid */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 font-mono border-b border-slate-200 pb-2 flex justify-between items-center">
                    <span>Align System Fields to CSV Columns</span>
                    <span className="text-emerald-600 font-bold">Visual Mapper</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Date Field */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="material-icons text-slate-400 text-sm">calendar_month</span>
                        <span className="text-xs font-black text-slate-600">Transaction Date</span>
                        <span className="text-[9px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-mono font-bold">LOCKED</span>
                      </div>
                      <select
                        value={dateColumn}
                        onChange={(e) => {
                          setDateColumn(e.target.value);
                          setSelectedMappingSk('custom');
                        }}
                        className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 w-full focus:outline-none focus:ring-1 focus:ring-slate-400 cursor-pointer"
                      >
                        <option value="">-- Choose Column --</option>
                        {csvHeaders.map((h: string) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>

                    {/* Amount Field */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="material-icons text-slate-400 text-sm">payments</span>
                        <span className="text-xs font-black text-slate-600">Gross Amount</span>
                        <span className="text-[9px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-mono font-bold">LOCKED</span>
                      </div>
                      <select
                        value={amountColumn}
                        onChange={(e) => {
                          setAmountColumn(e.target.value);
                          setSelectedMappingSk('custom');
                        }}
                        className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 w-full focus:outline-none focus:ring-1 focus:ring-slate-400 cursor-pointer"
                      >
                        <option value="">-- Choose Column --</option>
                        {csvHeaders.map((h: string) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>

                    {/* Vendor Field */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="material-icons text-slate-400 text-sm">storefront</span>
                        <span className="text-xs font-black text-slate-600">Vendor / Payee</span>
                        <span className="text-[9px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-mono font-bold">LOCKED</span>
                      </div>
                      <select
                        value={vendorColumn}
                        onChange={(e) => {
                          setVendorColumn(e.target.value);
                          setSelectedMappingSk('custom');
                        }}
                        className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 w-full focus:outline-none focus:ring-1 focus:ring-slate-400 cursor-pointer"
                      >
                        <option value="">-- Choose Column --</option>
                        {csvHeaders.map((h: string) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>

                    {/* Indicator Mode */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="material-icons text-slate-400 text-sm">sync_alt</span>
                        <span className="text-xs font-black text-slate-600">Debit/Credit Detection</span>
                      </div>
                      <select
                        value={indicatorMode}
                        onChange={(e) => {
                          setIndicatorMode(e.target.value as 'auto' | 'column');
                          setSelectedMappingSk('custom');
                        }}
                        className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 w-full focus:outline-none focus:ring-1 focus:ring-slate-400 cursor-pointer"
                      >
                        <option value="auto">Auto-detect by Amount Sign (+/-)</option>
                        <option value="column">By Specific Column Value</option>
                      </select>
                    </div>
                  </div>

                  {/* Dynamic fields for Column Indicator Mode */}
                  {indicatorMode === 'column' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase">Indicator Column</label>
                        <select
                          value={indicatorColumn}
                          onChange={(e) => {
                            setIndicatorColumn(e.target.value);
                            setSelectedMappingSk('custom');
                          }}
                          className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 w-full focus:outline-none"
                        >
                          <option value="">-- Select Column --</option>
                          {csvHeaders.map((h: string) => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase">Debit (Expense) Value</label>
                        <input
                          type="text"
                          placeholder="e.g. DEBIT"
                          value={debitValue}
                          onChange={(e) => {
                            setDebitValue(e.target.value);
                            setSelectedMappingSk('custom');
                          }}
                          className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 w-full focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase">Credit (Income) Value</label>
                        <input
                          type="text"
                          placeholder="e.g. CREDIT"
                          value={creditValue}
                          onChange={(e) => {
                            setCreditValue(e.target.value);
                            setSelectedMappingSk('custom');
                          }}
                          className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 w-full focus:outline-none"
                        />
                      </div>
                    </div>
                  )}

                  {/* Description checklist */}
                  <div className="space-y-1.5 pt-2 border-t border-slate-200">
                    <div className="flex items-center gap-1.5">
                      <span className="material-icons text-slate-400 text-sm">sticky_note_2</span>
                      <span className="text-xs font-black text-slate-600">Select Columns to Combine as Transaction Description</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {csvHeaders.map((header: string) => {
                        const isChecked = descriptionColumns.includes(header);
                        return (
                          <label
                            key={header}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition cursor-pointer ${
                              isChecked
                                ? 'bg-slate-900 border-slate-900 text-white'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="hidden"
                              checked={isChecked}
                              onChange={() => {
                                setSelectedMappingSk('custom');
                                if (isChecked) {
                                  setDescriptionColumns((prev: string[]) => prev.filter((x: string) => x !== header));
                                } else {
                                  setDescriptionColumns((prev: string[]) => [...prev, header]);
                                }
                              }}
                            />
                            <span>{header}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        {!loading && !error && (
          <div className="p-6 border-t border-slate-100 flex gap-3 justify-end">
            <button
              onClick={onClose}
              className="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 font-bold text-sm px-6 py-3 rounded-2xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleNext}
              disabled={bankAccounts.length === 0 || showAddBank || manageableOrgs.length === 0 || parsing}
              className="bg-slate-900 hover:bg-slate-800 disabled:bg-slate-100 disabled:text-slate-300 text-white font-bold text-sm px-6 py-3 rounded-2xl shadow-sm transition cursor-pointer"
            >
              {parsing ? 'Processing...' : 'Next: Review Transactions'}
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
export default ImportGuideModal;
