import React, { useState, useRef, useEffect } from 'react';
import { billsApi } from '../api/bills';
import type { UploadExpenseModalProps, ReceiptStatus, PaymentMethod } from '../types';

const DEFAULT_CATEGORIES = [
  'Motor Vehicle Expenses',
  'Entertainment',
  'Office Supplies & Post',
  'Travel & Accommodation',
  'Repairs & Maintenance',
  'Software & IT Services',
  'Utilities & Comm',
  'Consulting & Professional',
  'Advertising & Marketing',
  'Wages & Salaries',
  'Other Expenses'
];

const DEFAULT_STAFF = ['Leo Chen', 'Sarah Jenkins', 'Alex Wong', 'Company Cardholder'];

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
    console.error('[Magic Bytes] Error reading receipt file header:', err);
    return 'unsupported';
  }
};

export const UploadExpenseModal: React.FC<UploadExpenseModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  categories = DEFAULT_CATEGORIES,
  staffMembers = DEFAULT_STAFF,
  organisations = [],
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [selectedOrgId, setSelectedOrgId] = useState(organisations[0]?.id || '');
  const [merchantName, setMerchantName] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [purchaserName, setPurchaserName] = useState(staffMembers[0] || 'Leo Chen');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('credit_card');
  const [category, setCategory] = useState(categories[0] || 'Motor Vehicle Expenses');
  const [subtotal, setSubtotal] = useState<string>('');
  const [gstAmount, setGstAmount] = useState<string>('');
  const [totalAmount, setTotalAmount] = useState<string>('');
  const [status, setStatus] = useState<ReceiptStatus>('pending_review');
  const [notes, setNotes] = useState('');

  // Error & File States
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileFormat, setFileFormat] = useState<'pdf' | 'png' | 'jpeg' | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [ocrScanning, setOcrScanning] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedOrgId(organisations[0]?.id || '');
      setMerchantName('');
      setReceiptNumber('');
      setPurchaseDate(new Date().toISOString().split('T')[0]);
      setPurchaserName(staffMembers[0] || 'Leo Chen');
      setPaymentMethod('credit_card');
      setCategory(categories[0] || 'Motor Vehicle Expenses');
      setSubtotal('');
      setGstAmount('');
      setTotalAmount('');
      setStatus('pending_review');
      setNotes('');
      setFormError(null);
      setSelectedFile(null);
      setFileFormat(null);
      setFileError(null);
      setOcrScanning(false);
      setAutoFilled(false);
      setDragActive(false);
    }
  }, [isOpen, categories, staffMembers]);

  const [tempS3Key, setTempS3Key] = useState<string | undefined>(undefined);
  const [uploadingTemp, setUploadingTemp] = useState(false);

  if (!isOpen) return null;

  // Handle File Selection with Magic Bytes Validation & Auto S3 Presigned Direct Upload
  const handleFileSelected = async (file: File) => {
    setFileError(null);
    const detectedFormat = await validateMagicBytes(file);

    if (detectedFormat === 'unsupported') {
      setFileError(
        `Invalid or corrupted file header for "${file.name}". File signature does not match genuine PDF/PNG/JPEG format.`
      );
      setSelectedFile(null);
      setFileFormat(null);
      setTempS3Key(undefined);
      return;
    }

    setSelectedFile(file);
    setFileFormat(detectedFormat);
    setAutoFilled(false);
    setOcrScanning(false);
    setUploadingTemp(true);

    try {
      const fileMime = file.type || 'image/png';
      // 1. Get S3 Presigned PUT URL from backend
      const presignRes = await billsApi.getTempUploadUrl(selectedOrgId, {
        file_name: file.name,
        mime_type: fileMime,
      });

      // 2. Direct Raw Binary Upload via fetch PUT directly to S3 Bucket
      const uploadRes = await fetch(presignRes.upload_url, {
        method: 'PUT',
        headers: {
          'Content-Type': fileMime,
        },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error(`S3 presigned direct upload failed with HTTP ${uploadRes.status}`);
      }

      setTempS3Key(presignRes.temp_s3_key);
    } catch (err: any) {
      console.error('[S3 Presigned Direct Upload Receipt Error]:', err);
      setFileError('Failed to pre-upload receipt attachment directly to S3. Please try re-attaching.');
    } finally {
      setUploadingTemp(false);
    }
  };

  // Explicitly Trigger AI Scan for Receipts via S3 temp_s3_key
  const handleTriggerOcr = async () => {
    if (!selectedFile || !selectedOrgId) return;
    if (!tempS3Key) {
      if (uploadingTemp) {
        setFileError('Receipt file is currently uploading to S3, please wait a second...');
      } else {
        setFileError('Temporary S3 key missing. Please re-attach receipt file.');
      }
      return;
    }

    setOcrScanning(true);
    setAutoFilled(false);
    setFileError(null);

    try {
      const res = await billsApi.parseExpense(selectedOrgId, {
        temp_s3_key: tempS3Key,
      });

      const data = res.extracted_data || {};
      if (data.merchant_name) setMerchantName(data.merchant_name);
      if (data.receipt_number) setReceiptNumber(data.receipt_number);
      if (data.purchase_date) setPurchaseDate(data.purchase_date);
      if (data.payment_method) setPaymentMethod(data.payment_method as PaymentMethod);
      if (data.subtotal !== undefined) setSubtotal(String(data.subtotal));
      if (data.gst_amount !== undefined) setGstAmount(String(data.gst_amount));
      if (data.total_amount !== undefined) setTotalAmount(String(data.total_amount));
      if (data.category) setCategory(data.category);
      if (data.notes) setNotes(data.notes);

      setAutoFilled(true);
    } catch (err: any) {
      console.error('[AI OCR Receipt Error]:', err);
      setFileError(err.message || 'AI Receipt Scan failed. Please enter details manually.');
    } finally {
      setOcrScanning(false);
    }
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
    setTempS3Key(undefined);
    setAutoFilled(false);
    setOcrScanning(false);
    setUploadingTemp(false);
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
    setFormError(null);

    if (!selectedOrgId) {
      setFormError('Please select a target organisation for this expense.');
      return;
    }
    if (!merchantName.trim()) {
      setFormError('Please enter a merchant or store name.');
      return;
    }

    const parsedSub = parseFloat(subtotal) || 0;
    const parsedGst = parseFloat(gstAmount) || 0;
    const parsedTot = parseFloat(totalAmount) || (parsedSub + parsedGst);

    if (isNaN(parsedTot) || parsedTot <= 0) {
      setFormError('Total Expense Amount must be a valid positive number.');
      return;
    }

    if (selectedFile && uploadingTemp) {
      setFormError('Receipt file is still uploading to S3, please wait a moment...');
      return;
    }

    onSubmit({
      org_id: selectedOrgId,
      receipt_number: receiptNumber.trim() || `RCP-${Date.now().toString().slice(-6)}`,
      merchant_name: merchantName.trim(),
      purchase_date: purchaseDate,
      payment_method: paymentMethod,
      purchaser_name: purchaserName,
      total_amount: parsedTot,
      gst_amount: parsedGst,
      currency: 'NZD',
      category: category,
      status: status,
      notes: notes.trim() || undefined,
      image_url: selectedFile ? selectedFile.name : undefined,
      temp_s3_key: tempS3Key,
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
        
        {/* Header - Indigo Theme */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-indigo-50/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
              <span className="material-icons text-xl">receipt</span>
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">
                Upload Expense Receipt
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Attach receipt photo or PDF, scan with AI, or fill details manually below.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
          >
            <span className="material-icons text-xl leading-none">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          {/* Form Validation Error Banner */}
          {formError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-rose-700 text-xs font-bold animate-in fade-in">
              <div className="flex items-center gap-2">
                <span className="material-icons text-base text-rose-500">warning</span>
                <span>{formError}</span>
              </div>
              <button
                type="button"
                onClick={() => setFormError(null)}
                className="text-rose-400 hover:text-rose-600 cursor-pointer"
              >
                <span className="material-icons text-sm">close</span>
              </button>
            </div>
          )}
          
          {/* Dropzone Zone - Indigo Style */}
          <div>
            <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-2">
              Receipt Attachment (Binary Header Validated Dropzone)
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
                    ? 'border-indigo-500 bg-indigo-50/50'
                    : 'border-slate-200 hover:border-indigo-500/50 bg-slate-50/50 hover:bg-slate-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                  <span className="material-icons text-xl">cloud_upload</span>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-700">
                    <span className="text-indigo-600 hover:underline">Click to attach receipt photo</span> or drag and drop
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                    Binary validated: Genuine PNG, JPEG, or PDF
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black">
                      <span className="material-icons text-lg">
                        {fileFormat === 'pdf' ? 'picture_as_pdf' : 'image'}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-slate-800 truncate max-w-[240px]">
                          {selectedFile.name}
                        </p>
                        <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.2 bg-indigo-100 text-indigo-800 rounded font-mono">
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

                {/* Explicit AI Scan Button (Indigo Styled) */}
                {!ocrScanning && !autoFilled && (
                  <div className="pt-1 flex items-center justify-between bg-indigo-50/70 border border-indigo-100 p-2.5 rounded-xl gap-3">
                    <div>
                      <span className="text-[11px] font-bold text-indigo-900 block">
                        Want AI to read this receipt photo and fill fields?
                      </span>
                      <span className="text-[10px] font-mono font-semibold text-indigo-600 block mt-0.5">
                        Est. Size: {estTokens} • Est. Cost: {estCost}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleTriggerOcr}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-extrabold px-3 py-1.5 rounded-lg shadow-xs transition flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <span className="material-icons text-xs">auto_awesome</span>
                      <span>Let AI scan & autofill</span>
                    </button>
                  </div>
                )}

                {/* Simulated AI Parsing Indicator */}
                {ocrScanning && (
                  <div className="flex items-center gap-2 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-3 py-2 rounded-xl animate-pulse">
                    <span className="material-icons text-sm animate-spin">sync</span>
                    <span>AI is scanning & extracting receipt details...</span>
                  </div>
                )}

                {/* AI Extracted Success Banner */}
                {!ocrScanning && autoFilled && (
                  <div className="flex items-center justify-between text-xs font-bold text-indigo-700 bg-indigo-50/80 border border-indigo-200/60 px-3 py-2 rounded-xl">
                    <div className="flex items-center gap-2">
                      <span className="material-icons text-sm text-indigo-600">auto_awesome</span>
                      <span>Receipt details extracted! Review fields below.</span>
                    </div>
                    <span className="text-[10px] font-extrabold text-indigo-600 uppercase font-mono">
                      Auto-Filled
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-slate-100 pt-2"></div>

          {/* Expense Form Fields Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Target Organisation */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-extrabold text-slate-700 mb-1">
                Target Organisation / Business Unit *
              </label>
              <select
                value={selectedOrgId}
                onChange={e => setSelectedOrgId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition cursor-pointer"
              >
                {organisations.map(org => (
                  <option key={org.id} value={org.id}>
                    {org.name} ({org.id})
                  </option>
                ))}
              </select>
            </div>
            
            {/* Merchant Name */}
            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1 flex items-center justify-between">
                <span>Merchant / Store Name *</span>
                {autoFilled && (
                  <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200/60 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                    <span className="material-icons text-[10px]">auto_awesome</span>
                    Auto-filled
                  </span>
                )}
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Z Energy Whitby"
                value={merchantName}
                onChange={e => setMerchantName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
              />
            </div>

            {/* Receipt Number */}
            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1 flex items-center justify-between">
                <span>Receipt / Voucher Number</span>
                {autoFilled && (
                  <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200/60 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                    <span className="material-icons text-[10px]">auto_awesome</span>
                    Auto-filled
                  </span>
                )}
              </label>
              <input
                type="text"
                placeholder="e.g. ZE-88410"
                value={receiptNumber}
                onChange={e => setReceiptNumber(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
              />
            </div>

            {/* Purchase Date */}
            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1">
                Purchase Date
              </label>
              <input
                type="date"
                required
                value={purchaseDate}
                onChange={e => setPurchaseDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
              />
            </div>

            {/* Purchaser / Staff Member */}
            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1">
                Purchaser / Staff Member
              </label>
              <select
                value={purchaserName}
                onChange={e => setPurchaserName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition cursor-pointer"
              >
                {staffMembers.map(staff => (
                  <option key={staff} value={staff}>
                    {staff}
                  </option>
                ))}
              </select>
            </div>

            {/* Payment Method */}
            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1">
                Payment Method
              </label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition cursor-pointer"
              >
                <option value="credit_card">Company Credit Card</option>
                <option value="debit_card">Company Debit Card</option>
                <option value="reimbursement">Personal Reimbursement (Staff Out-of-pocket)</option>
                <option value="cash">Cash / Petty Cash</option>
              </select>
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition cursor-pointer"
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Initial Review Status */}
            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1">
                Initial Status
              </label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as ReceiptStatus)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition cursor-pointer"
              >
                <option value="pending_review">Pending Review</option>
                <option value="approved">Approved</option>
                <option value="reimbursed">Reimbursed</option>
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
                    className="w-full pl-6 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
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
                    className="w-full pl-6 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                  Total Amount (NZD)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-indigo-600">$</span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={totalAmount}
                    onChange={e => setTotalAmount(e.target.value)}
                    className="w-full pl-6 pr-3 py-1.5 bg-white border border-indigo-300 rounded-lg text-xs font-mono font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                  />
                </div>
              </div>
            </div>

            {/* Notes / Business Purpose */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-extrabold text-slate-700 mb-1">
                Notes / Business Purpose
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Fuel for company delivery van, coffee meeting with accountant..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
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
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold shadow-sm transition cursor-pointer flex items-center gap-1.5"
              >
                <span className="material-icons text-sm">check</span>
                <span>Save Expense</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UploadExpenseModal;
