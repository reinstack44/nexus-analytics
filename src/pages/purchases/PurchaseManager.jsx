import { useState, useEffect, useCallback, forwardRef } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useModal } from '../../context/ModalContext';
import { useTranslation } from 'react-i18next';
import { Users, Plus, FileText, Calendar, Wallet, ArrowRightLeft, Edit2, Trash2, X, ChevronDown, Sigma } from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

const CustomDateInput = forwardRef(({ value, onClick, placeholder }, ref) => (
  <button
    type="button"
    onClick={onClick}
    ref={ref}
    className="flex items-center px-4 py-2 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-all duration-200 text-sm font-semibold text-slate-700 dark:text-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-500/50 cursor-pointer w-full sm:w-auto justify-between"
  >
    <div className="flex items-center">
      <Calendar size={16} className="text-blue-500 mr-2 shrink-0" />
      {value || placeholder}
    </div>
    <ChevronDown size={14} className="text-slate-400 dark:text-slate-500 ml-3 shrink-0" />
  </button>
));
CustomDateInput.displayName = "CustomDateInput";

const FormDateInput = forwardRef(({ value, onClick, className }, ref) => (
  <button type="button" onClick={onClick} ref={ref} className={`${className} flex justify-between items-center text-left cursor-pointer w-full`}>
    <span>{value}</span>
    <Calendar size={16} className="text-slate-400 shrink-0" />
  </button>
));
FormDateInput.displayName = "FormDateInput";

const safeRound = (value) => {
  return Math.round((value + Number.EPSILON) * 100) / 100;
};

export default function PurchaseManager() {
  const { showAlert, showConfirm } = useModal();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('ledger'); 
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [traders, setTraders] = useState([]);
  const [selectedTraderId, setSelectedTraderId] = useState('');
  const [ledgerRows, setStockLedgerRows] = useState([]);

  const [filterStartDate, setFilterStartDate] = useState(() => {
    const saved = sessionStorage.getItem('global_startDate');
    return saved ? new Date(saved) : new Date();
  });
  const [filterEndDate, setFilterEndDate] = useState(() => {
    const saved = sessionStorage.getItem('global_endDate');
    return saved ? new Date(saved) : new Date();
  });

  useEffect(() => {
    if (filterStartDate) sessionStorage.setItem('global_startDate', filterStartDate.toISOString());
    if (filterEndDate) sessionStorage.setItem('global_endDate', filterEndDate.toISOString());
  }, [filterStartDate, filterEndDate]);

  useEffect(() => {
    const channel = supabase
      .channel('purchasemanager-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'traders' }, () => setRefreshTrigger(prev => prev + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trader_transactions' }, () => setRefreshTrigger(prev => prev + 1))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const [isEditTxModalOpen, setIsEditTxModalOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState(null);
  const [editTxForm, setEditTxForm] = useState({
    date: '',
    purchaseAmount: '',
    paidAmount: '',
    manualRemaining: ''
  });

  const [traderForm, setTraderForm] = useState({
    name: ''
  });
  
  const savedFormDate = localStorage.getItem('purchaseManagerDate');
  const initialFormDate = savedFormDate ? savedFormDate : new Date().toISOString().split('T')[0];

  const [ledgerForm, setLedgerForm] = useState({
    date: initialFormDate,
    purchaseAmount: '',
    paidAmount: '',
    manualRemaining: '', 
  });

  const parseDBDate = (str) => { 
    if (!str) return new Date(); 
    const [y, m, d] = str.split('-'); 
    return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10)); 
  };
  
  const formatForDB = (date) => { 
    if (!date) return ''; 
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0'); 
  };
  
  const formatAsDDMMYY = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
  };

  const handleEntryDateChange = (date) => {
    const formattedDBDate = formatForDB(date);
    setLedgerForm({ ...ledgerForm, date: formattedDBDate });
    localStorage.setItem('purchaseManagerDate', formattedDBDate); 
  };

  const fetchTraders = useCallback(async () => {
    setLoading(true);
    const { data: tData } = await supabase.from('traders').select('*').order('trader_name', { ascending: true });
    if (tData) {
      setTraders(tData);
      if (tData.length > 0 && !selectedTraderId) {
        setSelectedTraderId(tData[0].id);
      }
    }
    setLoading(false);
  }, [selectedTraderId]);

  const fetchTraderLedger = useCallback(async () => {
    if (!selectedTraderId || !filterStartDate || !filterEndDate) return;
    setLoading(true);

    const startStr = formatForDB(filterStartDate);
    const endStr = formatForDB(filterEndDate);

    const { data: transactions } = await supabase
      .from('trader_transactions')
      .select('*')
      .eq('trader_id', selectedTraderId)
      .lte('date', endStr) 
      .order('date', { ascending: true })
      .order('created_at', { ascending: true });

    const computedLedger = [];
    let currentRemaining = 0; 

    if (transactions) {
      transactions.forEach(tx => {
        const pAmt = parseFloat(tx.purchase_amount) || 0;
        const paidAmt = parseFloat(tx.paid_amount) || 0;
        
        if (tx.manual_remaining !== null && tx.manual_remaining !== undefined) {
          currentRemaining = parseFloat(tx.manual_remaining);
        } else {
          currentRemaining = safeRound(currentRemaining + pAmt - paidAmt);
        }

        if (tx.date >= startStr) {
          computedLedger.push({
            id: tx.id,
            date: tx.date,
            purchase_amount: pAmt,
            paid_amount: paidAmt,
            manual_remaining: tx.manual_remaining,
            remaining_amount: currentRemaining
          });
        }
      });
    }

    setStockLedgerRows(computedLedger);
    setLoading(false);
  }, [selectedTraderId, filterStartDate, filterEndDate]);

  useEffect(() => {
    let isMounted = true;
    const executeFetch = async () => {
      await Promise.resolve();
      if (isMounted) {
        fetchTraders();
      }
    };
    executeFetch();
    return () => { isMounted = false; };
  }, [fetchTraders, refreshTrigger]);

  useEffect(() => {
    let isMounted = true;
    const executeFetch = async () => {
      await Promise.resolve();
      if (isMounted && selectedTraderId) {
        fetchTraderLedger();
      }
    };
    executeFetch();
    return () => { isMounted = false; };
  }, [selectedTraderId, fetchTraderLedger, refreshTrigger]);

  const handleAddTrader = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const { error } = await supabase.from('traders').insert([{ 
      trader_name: traderForm.name
    }]);

    if (error) {
      showAlert({ title: "Error Adding Trader", message: error.message, type: "error" });
    } else {
      setTraderForm({ name: '' });
      setRefreshTrigger(prev => prev + 1);
      showAlert({ title: "Trader Registered", message: "Trader account successfully registered.", type: "success" });
    }
    setIsSubmitting(false);
  };

  const handleAddLedgerEntry = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    const pAmt = ledgerForm.purchaseAmount === '' ? 0 : parseFloat(ledgerForm.purchaseAmount) || 0;
    const paidAmt = ledgerForm.paidAmount === '' ? 0 : parseFloat(ledgerForm.paidAmount) || 0;
    const manualRem = ledgerForm.manualRemaining === '' ? null : parseFloat(ledgerForm.manualRemaining);

    const { error } = await supabase.from('trader_transactions').insert([{
      date: ledgerForm.date,
      trader_id: selectedTraderId,
      purchase_amount: pAmt,
      paid_amount: paidAmt,
      manual_remaining: manualRem
    }]);

    if (error) {
      showAlert({ title: "Error Saving Entry", message: error.message, type: "error" });
    } else {
      setLedgerForm({ ...ledgerForm, purchaseAmount: '', paidAmount: '', manualRemaining: '' });
      setRefreshTrigger(prev => prev + 1);
      showAlert({ title: "Entry Saved", message: "Transaction recorded in trader account statement.", type: "success" });
    }
    setIsSubmitting(false);
  };

  const handleDeleteTx = (txId) => {
    showConfirm({
      title: "Delete Transaction?",
      message: "Are you sure you want to delete this transaction entry from the statement ledger?",
      isDanger: true,
      confirmText: "Delete Entry",
      onConfirm: async () => {
        setIsSubmitting(true);
        const { error } = await supabase
          .from('trader_transactions')
          .delete()
          .eq('id', txId);

        if (error) {
          showAlert({ title: "Delete Failed", message: error.message, type: "error" });
        } else {
          setRefreshTrigger(prev => prev + 1);
          showAlert({ title: "Deleted", message: "Ledger transaction deleted successfully.", type: "success" });
        }
        setIsSubmitting(false);
      }
    });
  };

  const handleEditTxClick = (tx) => {
    setSelectedTx(tx);
    setEditTxForm({
      date: tx.date,
      purchaseAmount: tx.purchase_amount === 0 ? '' : tx.purchase_amount,
      paidAmount: tx.paid_amount === 0 ? '' : tx.paid_amount,
      manualRemaining: tx.manual_remaining !== null && tx.manual_remaining !== undefined ? tx.manual_remaining : ''
    });
    setIsEditTxModalOpen(true);
  };

  const handleEditTxSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    const updatedPAmt = editTxForm.purchaseAmount === '' ? 0 : parseFloat(editTxForm.purchaseAmount) || 0;
    const updatedPaidAmt = editTxForm.paidAmount === '' ? 0 : parseFloat(editTxForm.paidAmount) || 0;
    const updatedManualRem = editTxForm.manualRemaining === '' ? null : parseFloat(editTxForm.manualRemaining);

    const { error } = await supabase
      .from('trader_transactions')
      .update({
        date: editTxForm.date,
        purchase_amount: updatedPAmt,
        paid_amount: updatedPaidAmt,
        manual_remaining: updatedManualRem
      })
      .eq('id', selectedTx.id);

    if (error) {
      showAlert({ title: "Update Error", message: error.message, type: "error" });
    } else {
      setIsEditTxModalOpen(false);
      setRefreshTrigger(prev => prev + 1);
      showAlert({ title: "Updated", message: "Transaction updated successfully.", type: "success" });
    }
    
    setIsSubmitting(false);
  };

  const totalPurchase = ledgerRows.reduce((sum, row) => safeRound(sum + row.purchase_amount), 0);
  const totalPaid = ledgerRows.reduce((sum, row) => safeRound(sum + row.paid_amount), 0);
  const finalRemainingBalance = ledgerRows.length > 0 ? ledgerRows[ledgerRows.length - 1].remaining_amount : 0;

  const inputClass = "w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all duration-300 text-sm";

  return (
    <div className="space-y-6 transition-colors duration-300 relative z-10">
      
      {/* Exact CSS from Dashboard.jsx */}
      <style>{`
        .react-datepicker-wrapper { display: block; width: 100%; }
        .react-datepicker-popper { 
          z-index: 99999 !important; 
        }
        .react-datepicker { 
          background-color: #ffffff !important; border: 1px solid #e2e8f0 !important; 
          border-radius: 1.25rem !important; box-shadow: 0 20px 30px -5px rgba(0, 0, 0, 0.3) !important; 
          font-family: inherit !important; padding: 0.75rem !important; overflow: hidden;
        }
        .react-datepicker__month-container { background-color: #ffffff !important; }
        .react-datepicker__header { 
          background-color: #ffffff !important; border-bottom: 1px solid #f8fafc !important; 
          padding-top: 0.25rem !important;
        }
        .react-datepicker__current-month { 
          color: #1e293b; font-weight: 700; font-size: 1rem; margin-bottom: 1rem !important; 
        }
        .react-datepicker__header select {
          background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 0.5rem;
          padding: 0.25rem 0.5rem; font-weight: 600; color: #1e293b; outline: none;
          cursor: pointer; margin: 0 0.25rem 0.75rem 0.25rem;
        }
        .react-datepicker__header select:focus { border-color: #3b82f6; }
        .react-datepicker__day-name { color: #64748b !important; font-weight: 600 !important; width: 2.25rem !important; margin: 0.1rem !important; }
        .react-datepicker__day { 
          color: #334155 !important; border-radius: 50% !important; width: 2.25rem !important;
          line-height: 2.25rem !important; transition: all 0.2s ease !important; margin: 0.1rem !important; background-color: transparent !important;
        }
        .react-datepicker__day:hover { background-color: #f1f5f9 !important; color: #0f172a !important; }
        .react-datepicker__day--selected, .react-datepicker__day--keyboard-selected { 
          background-color: #2563eb !important; color: #ffffff !important; font-weight: 600 !important; 
          box-shadow: 0 4px 6px -1px rgb(37 99 235 / 0.4) !important;
        }
        .react-datepicker__triangle { display: none !important; }

        .dark .react-datepicker { background-color: #0f172a !important; border-color: #1e293b !important; }
        .dark .react-datepicker__month-container { background-color: #0f172a !important; }
        .dark .react-datepicker__header { background-color: #0f172a !important; border-color: #1e293b !important; }
        .dark .react-datepicker__current-month { color: #f8fafc !important; }
        .dark .react-datepicker__header select { background-color: #1e293b !important; color: #f8fafc !important; border-color: #334155 !important; }
        .dark .react-datepicker__day-name { color: #64748b !important; }
        .dark .react-datepicker__day { color: #cbd5e1 !important; }
        .dark .react-datepicker__day:hover { background-color: #1e293b !important; color: #f8fafc !important; }
        .dark .react-datepicker__day--selected, .dark .react-datepicker__day--keyboard-selected { 
          background-color: #3b82f6 !important; color: #ffffff !important; box-shadow: none !important; 
        }
      `}</style>

      {/* Tabs Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-40">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">{t('purchaseManager.title', 'Traders & Account Ledgers')}</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{t('purchaseManager.description', 'Track financial transaction histories, credits, and remaining balance sheets.')}</p>
        </div>
        
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 w-fit">
          <button 
            type="button"
            onClick={() => setActiveTab('ledger')}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-300 cursor-pointer ${activeTab === 'ledger' ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
          >
            <ArrowRightLeft size={16} /> {t('purchaseManager.accountLedgerTab', 'Account Ledger')}
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('traders')}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-300 cursor-pointer ${activeTab === 'traders' ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
          >
            <Users size={16} /> {t('purchaseManager.manageTradersTab', 'Manage Traders')}
          </button>
        </div>
      </div>

      {activeTab === 'ledger' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
          {/* Form Side - Assigned relative z-50 to overcome stacking context issues */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 h-fit relative z-50">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-5 flex items-center gap-2 border-b border-slate-50 dark:border-slate-800 pb-4">
              <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                <Wallet size={18} />
              </div>
              {t('purchaseManager.recordTransactionTitle', 'Record Transaction')}
            </h3>
            
            <form onSubmit={handleAddLedgerEntry} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">{t('purchaseManager.selectTraderLabel', 'Select Trader')}</label>
                <select value={selectedTraderId} onChange={(e) => setSelectedTraderId(e.target.value)} className={inputClass} required>
                  <option value="" disabled>{t('purchaseManager.selectTraderPlaceholder', '-- Choose Registered Trader --')}</option>
                  {traders.map(tItem => <option key={tItem.id} value={tItem.id}>{tItem.trader_name}</option>)}
                </select>
              </div>

              <div className="relative z-50">
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">{t('purchaseManager.transactionDateLabel', 'Transaction Date')}</label>
                <DatePicker 
                  selected={parseDBDate(ledgerForm.date)} 
                  onChange={handleEntryDateChange} 
                  dateFormat="dd/MM/yy" 
                  customInput={<FormDateInput className={inputClass} />} 
                  showMonthDropdown
                  showYearDropdown
                  dropdownMode="select" 
                  wrapperClassName="w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">{t('purchaseManager.purchaseAmountLabel', 'Purchase Amount (₹)')} <span className="text-slate-400 font-normal text-[10px]">{t('purchaseManager.optional', '(Optional)')}</span></label>
                <input type="number" min="0" step="any" value={ledgerForm.purchaseAmount} onChange={(e) => setLedgerForm({ ...ledgerForm, purchaseAmount: e.target.value })} className={inputClass} placeholder="0" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">{t('purchaseManager.paidAmountLabel', 'Paid Amount (₹)')} <span className="text-slate-400 font-normal text-[10px]">{t('purchaseManager.optional', '(Optional)')}</span></label>
                <input type="number" min="0" step="any" value={ledgerForm.paidAmount} onChange={(e) => setLedgerForm({ ...ledgerForm, paidAmount: e.target.value })} className={inputClass} placeholder="0" />
              </div>

              <div className="border-t border-dashed border-slate-200 dark:border-slate-800 pt-3">
                <label className="block text-xs font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-wider mb-1.5">{t('purchaseManager.directRemainingLabel', 'Direct Remaining Amount (₹)')} <span className="text-slate-400 font-normal text-[10px]">{t('purchaseManager.optional', '(Optional)')}</span></label>
                <input type="number" min="0" step="any" value={ledgerForm.manualRemaining} onChange={(e) => setLedgerForm({ ...ledgerForm, manualRemaining: e.target.value })} className={`${inputClass} border-indigo-200 dark:indigo-900/60 focus:ring-indigo-500`} placeholder={t('purchaseManager.directRemainingPlaceholder', 'Set custom balance')} />
              </div>

              <button type="submit" disabled={isSubmitting || !selectedTraderId} className="w-full mt-2 bg-blue-600 text-white font-medium py-2.5 px-4 rounded-xl hover:bg-blue-700 transition-all duration-300 disabled:opacity-50 flex justify-center items-center gap-2 shadow-sm cursor-pointer">
                {t('purchaseManager.saveLedgerEntryButton', 'Save Ledger Entry')}
              </button>
            </form>
          </div>

          {/* Table Ledger Display - Assigned relative z-40 so form popper correctly floats over it */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 h-fit flex flex-col relative z-40">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row justify-between sm:items-center gap-4 rounded-t-2xl">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-2 sm:mb-0">
                <FileText size={18} className="text-slate-400 dark:text-slate-500" />
                {t('purchaseManager.statementAccountTitle', 'Statement Account Ledger')}
              </h3>
              
              <div className="flex flex-col sm:flex-row items-center gap-2 bg-white/60 dark:bg-slate-900/60 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm backdrop-blur-sm relative z-40 w-full sm:w-auto">
                <DatePicker
                  selected={filterStartDate}
                  onChange={(date) => setFilterStartDate(date)}
                  maxDate={new Date()}
                  dateFormat="dd/MM/yy"
                  customInput={<CustomDateInput />}
                  showMonthDropdown
                  showYearDropdown
                  dropdownMode="select"
                  popperPlacement="bottom-start"
                  wrapperClassName="w-full sm:w-auto"
                />
                <span className="text-slate-400 font-medium px-1">{t('common.to', 'to')}</span>
                <DatePicker
                  selected={filterEndDate}
                  onChange={(date) => setFilterEndDate(date)}
                  minDate={filterStartDate}
                  maxDate={new Date()}
                  dateFormat="dd/MM/yy"
                  customInput={<CustomDateInput />}
                  showMonthDropdown
                  showYearDropdown
                  dropdownMode="select"
                  popperPlacement="bottom-end"
                  wrapperClassName="w-full sm:w-auto"
                />
              </div>
            </div>
            
            <div className="overflow-x-auto flex-1 rounded-b-2xl">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50/80 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-semibold uppercase text-xs tracking-wider border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="px-6 py-4">{t('common.date', 'Date')}</th>
                    <th className="px-6 py-4 text-right">{t('purchaseManager.purchaseAmountHeader', 'Purchase Amount')}</th>
                    <th className="px-6 py-4 text-right">{t('purchaseManager.paidAmountHeader', 'Paid Amount')}</th>
                    <th className="px-6 py-4 text-right text-indigo-600 dark:text-indigo-400">{t('purchaseManager.remainingBalanceHeader', 'Remaining Balance')}</th>
                    <th className="px-4 py-4 text-center">{t('common.actions', 'Actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <tr><td colSpan="5" className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">{t('purchaseManager.loadingLedger', 'Compiling account nodes...')}</td></tr>
                  ) : ledgerRows.length === 0 ? (
                    <tr><td colSpan="5" className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">{t('purchaseManager.noTransactions', 'No transactions recorded for this period.')}</td></tr>
                  ) : (
                    ledgerRows.map((row) => (
                      <tr key={row.id} className="transition-colors duration-200 hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                        <td className="px-6 py-4 font-medium whitespace-nowrap">
                          {formatAsDDMMYY(row.date)}
                        </td>
                        <td className="px-6 py-4 text-right font-semibold text-red-600 dark:text-red-400">
                          {row.purchase_amount > 0 ? `₹${row.purchase_amount.toLocaleString()}` : '-'}
                        </td>
                        <td className="px-6 py-4 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                          {row.paid_amount > 0 ? `₹${row.paid_amount.toLocaleString()}` : '-'}
                        </td>
                        <td className="px-6 py-4 text-right font-black text-slate-900 dark:text-white bg-slate-50/30 dark:bg-slate-950/20 text-base">
                          ₹{row.remaining_amount.toLocaleString()}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button 
                              type="button"
                              onClick={() => handleEditTxClick(row)}
                              title={t('common.edit', 'Edit')} 
                              className="p-1.5 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors outline-none cursor-pointer"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button 
                              type="button"
                              onClick={() => handleDeleteTx(row.id)}
                              title={t('common.delete', 'Delete')} 
                              className="p-1.5 text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors outline-none cursor-pointer"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                
                {ledgerRows.length > 0 && !loading && (
                  <tfoot className="bg-slate-100/80 dark:bg-slate-800/80 border-t-2 border-slate-200 dark:border-slate-700">
                    <tr>
                      <td className="px-6 py-4">
                        <div className="font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                          <Sigma size={16} className="text-blue-600" /> {t('common.totals', 'TOTALS')}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-black text-red-600 dark:text-red-400 text-base">
                        ₹{totalPurchase.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right font-black text-emerald-600 dark:text-emerald-400 text-base">
                        ₹{totalPaid.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right font-black text-slate-900 dark:text-white text-base">
                        ₹{finalRemainingBalance.toLocaleString()}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* EDIT TRANSACTION MODAL */}
      {isEditTxModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 9999 }}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center p-5 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Edit2 size={18} className="text-blue-500" /> {t('purchaseManager.editLedgerTitle', 'Edit Ledger Entry')}
              </h3>
              <button type="button" onClick={() => setIsEditTxModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 outline-none cursor-pointer"><X size={20} /></button>
            </div>
            
            <form onSubmit={handleEditTxSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">{t('purchaseManager.transactionDateLabel', 'Transaction Date')}</label>
                <DatePicker 
                  selected={parseDBDate(editTxForm.date)} 
                  onChange={(date) => setEditTxForm({ ...editTxForm, date: formatForDB(date) })} 
                  dateFormat="dd/MM/yy" 
                  customInput={<FormDateInput className={inputClass} />} 
                  showMonthDropdown
                  showYearDropdown
                  dropdownMode="select" 
                  wrapperClassName="w-full"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">{t('purchaseManager.purchaseAmountLabel', 'Purchase Amount (₹)')}</label>
                <input type="number" min="0" step="any" value={editTxForm.purchaseAmount} onChange={(e) => setEditTxForm({ ...editTxForm, purchaseAmount: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">{t('purchaseManager.paidAmountLabel', 'Paid Amount (₹)')}</label>
                <input type="number" min="0" step="any" value={editTxForm.paidAmount} onChange={(e) => setEditTxForm({ ...editTxForm, paidAmount: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-wider mb-1.5">{t('purchaseManager.directRemainingOverrideLabel', 'Direct Remaining Amount Override (₹)')}</label>
                <input type="number" min="0" step="any" value={editTxForm.manualRemaining} onChange={(e) => setEditTxForm({ ...editTxForm, manualRemaining: e.target.value })} className={inputClass} placeholder={t('purchaseManager.directRemainingOverridePlaceholder', 'Leave empty for auto math')} />
              </div>
              
              <button type="submit" disabled={isSubmitting} className="w-full mt-2 bg-blue-600 text-white font-medium py-2.5 rounded-xl hover:bg-blue-700 transition-colors cursor-pointer">
                {isSubmitting ? t('purchaseManager.updating', 'Updating...') : t('purchaseManager.updateTransactionButton', 'Update Transaction')}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TRADERS TAB */}
      {activeTab === 'traders' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 h-fit relative z-50">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-5 flex items-center gap-2 border-b border-slate-50 dark:border-slate-800 pb-4">
              <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
                <Users size={18} />
              </div>
              {t('purchaseManager.addTraderTitle', 'Add New Trader')}
            </h3>
            <form onSubmit={handleAddTrader} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">{t('purchaseManager.traderNameLabel', 'Trader Name / Agency')}</label>
                <input type="text" required value={traderForm.name} onChange={(e) => setTraderForm({...traderForm, name: e.target.value})} className={inputClass} placeholder={t('purchaseManager.traderNamePlaceholder', 'e.g., Sai Traders')} />
              </div>
              <button type="submit" disabled={isSubmitting} className="w-full mt-2 bg-indigo-600 text-white font-medium py-2.5 px-4 rounded-xl hover:bg-indigo-700 transition-all duration-300 flex justify-center items-center gap-2 shadow-sm cursor-pointer">
                <Plus size={18} /> {t('purchaseManager.registerTraderButton', 'Register Trader')}
              </button>
            </form>
          </div>

          <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden h-fit flex flex-col relative z-40">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Users size={18} className="text-slate-400 dark:text-slate-500" /> {t('purchaseManager.registeredTradersTitle', 'Registered Traders')}
              </h3>
            </div>
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50/80 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-semibold uppercase text-xs tracking-wider">
                  <tr>
                    <th className="px-6 py-4">{t('dashboard.traderName', 'Trader Name')}</th>
                    <th className="px-6 py-4 text-right">{t('purchaseManager.registeredOn', 'Registered On')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {traders.length === 0 ? (
                    <tr><td colSpan="2" className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">{t('purchaseManager.noTraders', 'No traders registered.')}</td></tr>
                  ) : (
                    traders.map((tItem) => (
                      <tr key={tItem.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-6 py-4 font-bold text-slate-800 dark:text-slate-100">{tItem.trader_name}</td>
                        <td className="px-6 py-4 text-right">{formatAsDDMMYY(tItem.created_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}