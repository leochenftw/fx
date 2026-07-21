import React, { useState, useRef, useEffect } from 'react';
import type { CreateBillModalProps, BillStatus } from '../types';

const DEFAULT_CATEGORIES = [
  'Utilities & Comm',
  'Cost of Goods Sold',
  'Repairs & Maintenance',
  'Office Supplies & Post',
  'Software & IT Services',
  'Advertising & Marketing',
  'Consulting & Professional',
  'Insurance',
  'Rent & Lease',
  'Taxes',
  'Travel & Accommodation',
  'Wages & Salaries',
  'Other Expenses'
];

/**
 * Validate binary file magic bytes (file signature) to detect genuine file format.
 */
const validateMagicBytes = async (file: File): Promise<'pdf' | 'png' | 'jpeg' | 'unsupported'> => {
  try {
    const blob = file.slice(0, 8);
    const buffer = await blob.arrayBuffer();
    const uint8 = new Uint8Array(buffer);
    const hex = Array.from(uint8)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .toLowerCase();

    if (hex.startsWith('25504446')) return 'pdf';   // %PDF
    if (hex.startsWith('89504e47')) return 'png';   // \x89PNG
    if (hex.startsWith('ffd8ff')) return 'jpeg';    // JPEG SOI
    return 'unsupported';
  } catch (err) {
    console.error('[Magic Bytes] Error reading file header:', err);
    return 'unsupported';
  }
};

export const CreateBillModal: React.FC<CreateBillModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  categories = DEFAULT_CATEGORIES,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [vendorName, setVendorName] = useState('');
  const [billNumber, setBillNumber] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [subtotal, setSubtotal] = useState<string>('');
  const [gstAmount, setGstAmount] = useState<string>('');
  const [totalAmount, setTotalAmount] = useState<string>('');
  const [category, setCategory] = useState(categories[0] || 'Utilities & Comm');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<BillStatus>('unpaid');

  // File & Magic Bytes States
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileFormat, setFileFormat] = useState<'pdf' | 'png' | 'jpeg' | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [ocrScanning, setOcrScanning] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setVendorName('');
      setBillNumber('');
      setIssueDate(new Date().toISOString().split('T')[0]);
      setDueDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
      setSubtotal('');
      setGstAmount('');
      setTotalAmount('');
      setCategory(categories[0] || 'Utilities & Comm');
      setDescription('');
      setStatus('unpaid');
      setSelectedFile(null);
      setFileFormat(null);
      setFileError(null);
      setOcrScanning(false);
      setAutoFilled(false);
      setDragActive(false);
    }
  }, [isOpen, categories]);

  if (!isOpen) return null;

  // Handle File Selection with Magic Bytes Validation
  const handleFileSelected = async (file: File) => {
    setFileError(null);
    const detectedFormat = await validateMagicBytes(file);

    if (detectedFormat === 'unsupported') {
      setFileError(
        `Invalid or corrupted file header for "${file.name}". File signature does not match genuine PDF/PNG/JPEG format.`
      );
      setSelectedFile(null);
      setFileFormat(null);
      return;
    }

    setSelectedFile(file);
    setFileFormat(detectedFormat);
    setAutoFilled(false);
    setOcrScanning(false);
  };

  // Explicitly Trigger AI Scan by User Action
  const handleTriggerOcr = () => {
    if (!selectedFile) return;
    setOcrScanning(true);
    setAutoFilled(false);

    setTimeout(() => {
      setOcrScanning(false);
      setAutoFilled(true);

      // Populate mock OCR data based on file name or format
      const cleanName = selectedFile.name.toLowerCase();
      if (cleanName.includes('spark') || cleanName.includes('telecom')) {
        setVendorName('Spark New Zealand Ltd');
        setBillNumber(`INV-${Math.floor(100000 + Math.random() * 900000)}`);
        setSubtotal('180.00');
        setGstAmount('27.00');
        setTotalAmount('207.00');
        setCategory('Utilities & Comm');
        setDescription('Fibre Broadband & Mobile Business Plan');
      } else if (cleanName.includes('bunnings') || cleanName.includes('timber')) {
        setVendorName('Bunnings Trade Porirua');
        setBillNumber(`BNZ-${Math.floor(1000 + Math.random() * 9000)}-01`);
        setSubtotal('340.00');
        setGstAmount('51.00');
        setTotalAmount('391.00');
        setCategory('Repairs & Maintenance');
        setDescription('Timber & Building Repair Supplies');
      } else {
        setVendorName('OfficeMax New Zealand');
        setBillNumber(`OMX-${Math.floor(10000 + Math.random() * 90000)}`);
        setSubtotal('120.00');
        setGstAmount('18.00');
        setTotalAmount('138.00');
        setCategory('Office Supplies & Post');
        setDescription('Office Paper & Printing Supplies');
      }
    }, 1200);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setFileFormat(null);
    setFileError(null);
    setAutoFilled(false);
    setOcrScanning(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Recalculate totals when user edits subtotal manually
  const handleSubtotalChange = (val: string) => {
    setSubtotal(val);
    const num = parseFloat(val);
    if (!isNaN(num)) {
      const gst = (num * 0.15).toFixed(2);
      const tot = (num * 1.15).toFixed(2);
      setGstAmount(gst);
      setTotalAmount(tot);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorName.trim()) {
      alert('Please enter a vendor name.');
      return;
    }

    const parsedSub = parseFloat(subtotal) || 0;
    const parsedGst = parseFloat(gstAmount) || 0;
    const parsedTot = parseFloat(totalAmount) || (parsedSub + parsedGst);

    onSubmit({
      bill_number: billNumber.trim() || `BILL-${Date.now().toString().slice(-6)}`,
      vendor_name: vendorName.trim(),
      issue_date: issueDate,
      due_date: dueDate,
      subtotal: parsedSub,
      gst_amount: parsedGst,
      total_amount: parsedTot,
      currency: 'NZD',
      status: status,
      category: category,
      description: description.trim() || 'No description provided.',
      attachment_url: selectedFile ? selectedFile.name : undefined,
    });

    onClose();
  };

  // Calculate estimated tokens & cost based on verified Magic Bytes format
  const isPdf = fileFormat === 'pdf';
  const estTokens = isPdf ? '~450 tokens' : '~1,200 tokens';
  const estCost = isPdf ? '< $0.0001 USD' : '~$0.0001 USD';

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden my-8">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              Create New Bill
            </h2>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Upload an invoice to hold as attachment, use AI to scan, or fill details manually below.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
          >
            <span className="material-icons text-xl leading-none">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          
          {/* Dropzone Zone */}
          <div>
            <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-2">
              Invoice Attachment (Binary Header Validated Dropzone)
            </label>

            {fileError && (
              <div className="mb-3 p-3 bg-rose-50 border border-rose-200/80 rounded-xl flex items-center justify-between text-rose-700 text-xs font-bold animate-in fade-in">
                <div className="flex items-center gap-2">
                  <span className="material-icons text-base text-rose-500">error</span>
                  <span>{fileError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setFileError(null)}
                  className="text-rose-400 hover:text-rose-600"
                >
                  <span className="material-icons text-sm">close</span>
                </button>
              </div>
            )}

            {!selectedFile ? (
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-5 text-center transition cursor-pointer flex flex-col items-center justify-center gap-2 ${
                  dragActive
                    ? 'border-emerald-500 bg-emerald-50/50'
                    : 'border-slate-200 hover:border-emerald-500/50 bg-slate-50/50 hover:bg-slate-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                  <span className="material-icons text-xl">cloud_upload</span>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-700">
                    <span className="text-emerald-600 hover:underline">Click to attach file</span> or drag and drop
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                    Binary validated: Genuine PDF (%PDF), PNG, or JPEG
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-black">
                      <span className="material-icons text-lg">
                        {fileFormat === 'pdf' ? 'picture_as_pdf' : 'image'}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-slate-800 truncate max-w-[240px]">
                          {selectedFile.name}
                        </p>
                        <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded font-mono">
                          {fileFormat} Verified
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {(selectedFile.size / 1024).toFixed(1)} KB • Binary magic header match
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveFile}
                    className="text-xs font-bold text-slate-400 hover:text-rose-600 transition px-2 py-1 rounded-lg hover:bg-rose-50 cursor-pointer"
                  >
                    Remove
                  </button>
                </div>

                {/* Explicit AI Scan Button + Token & Cost Forecast Banner */}
                {!ocrScanning && !autoFilled && (
                  <div className="pt-1 flex items-center justify-between bg-emerald-50/70 border border-emerald-100 p-2.5 rounded-xl gap-3">
                    <div>
                      <span className="text-[11px] font-bold text-emerald-800 block">
                        Want AI to read this file and fill the form?
                      </span>
                      <span className="text-[10px] font-mono font-semibold text-emerald-600 block mt-0.5">
                        Est. Size: {estTokens} • Est. Cost: {estCost}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleTriggerOcr}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-extrabold px-3 py-1.5 rounded-lg shadow-xs transition flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <span className="material-icons text-xs">auto_awesome</span>
                      <span>Let AI scan & autofill</span>
                    </button>
                  </div>
                )}

                {/* Simulated AI Parsing Indicator */}
                {ocrScanning && (
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-xl animate-pulse">
                    <span className="material-icons text-sm animate-spin">sync</span>
                    <span>AI is scanning & extracting bill details...</span>
                  </div>
                )}

                {/* AI Extracted Success Banner */}
                {!ocrScanning && autoFilled && (
                  <div className="flex items-center justify-between text-xs font-bold text-emerald-700 bg-emerald-50/80 border border-emerald-200/60 px-3 py-2 rounded-xl">
                    <div className="flex items-center gap-2">
                      <span className="material-icons text-sm text-emerald-600">auto_awesome</span>
                      <span>Details extracted! Review fields below.</span>
                    </div>
                    <span className="text-[10px] font-extrabold text-emerald-600 uppercase font-mono">
                      Auto-Filled
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-slate-100 pt-2"></div>

          {/* Form Fields Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Vendor Name */}
            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1 flex items-center justify-between">
                <span>Vendor / Supplier Name *</span>
                {autoFilled && (
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                    <span className="material-icons text-[10px]">auto_awesome</span>
                    Auto-filled
                  </span>
                )}
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Spark New Zealand Ltd"
                value={vendorName}
                onChange={e => setVendorName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
              />
            </div>

            {/* Bill Number */}
            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1 flex items-center justify-between">
                <span>Bill / Invoice Number</span>
                {autoFilled && (
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                    <span className="material-icons text-[10px]">auto_awesome</span>
                    Auto-filled
                  </span>
                )}
              </label>
              <input
                type="text"
                placeholder="e.g. INV-2026-089"
                value={billNumber}
                onChange={e => setBillNumber(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
              />
            </div>

            {/* Issue Date */}
            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1">
                Issue Date
              </label>
              <input
                type="date"
                required
                value={issueDate}
                onChange={e => setIssueDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
              />
            </div>

            {/* Due Date */}
            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1">
                Due Date
              </label>
              <input
                type="date"
                required
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition cursor-pointer"
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1">
                Initial Status
              </label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as BillStatus)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition cursor-pointer"
              >
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
                <option value="draft">Draft</option>
              </select>
            </div>

            {/* Amounts Grid */}
            <div className="sm:col-span-2 grid grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
              <div>
                <label className="block text-[11px] font-extrabold text-slate-500 mb-1">
                  Subtotal (Excl.)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">$</span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={subtotal}
                    onChange={e => handleSubtotalChange(e.target.value)}
                    className="w-full pl-6 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold text-slate-500 mb-1">
                  GST (15%)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">$</span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={gstAmount}
                    onChange={e => setGstAmount(e.target.value)}
                    className="w-full pl-6 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                  Total Amount (NZD)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-emerald-600">$</span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={totalAmount}
                    onChange={e => setTotalAmount(e.target.value)}
                    className="w-full pl-6 pr-3 py-1.5 bg-white border border-emerald-300 rounded-lg text-xs font-mono font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                  />
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-extrabold text-slate-700 mb-1">
                Description / Line Items Note
              </label>
              <textarea
                rows={2}
                placeholder="Add service description or line item details..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="border-t border-slate-100 pt-4 flex items-center justify-between">
            <div className="text-[11px] font-semibold text-slate-400">
              {selectedFile ? `📎 Attachment: ${selectedFile.name}` : 'No file attached'}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-sm transition cursor-pointer flex items-center gap-1.5"
              >
                <span className="material-icons text-sm">check</span>
                <span>Save Bill</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateBillModal;
