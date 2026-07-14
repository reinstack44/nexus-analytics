import { useState, useEffect, useRef, forwardRef } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { Package, Calendar, Save, Calculator, AlertCircle, CheckCircle2, GripVertical, ChevronDown, Landmark, Plus, ArrowDownCircle, Receipt, X, Sigma, IndianRupee } from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

const CustomDateInput = forwardRef(({ value, onClick, placeholder }, ref) => (
  <button type="button" onClick={onClick} ref={ref} className="flex items-center px-4 py-2 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-all duration-200 text-sm font-bold text-slate-700 dark:text-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-500/50 whitespace-nowrap w-full sm:w-auto">
    <Calendar size={16} className="text-blue-500 mr-2 shrink-0" />
    {value || placeholder}
    <ChevronDown size={14} className="text-slate-400 dark:text-slate-500 ml-3 shrink-0" />
  </button>
));
CustomDateInput.displayName = "CustomDateInput";

const FormDateInput = forwardRef(({ value, onClick, className }, ref) => (
  <button type="button" onClick={onClick} ref={ref} className={`${className} flex justify-between items-center text-left`}>
    <span>{value}</span>
    <Calendar size={16} className="text-slate-400" />
  </button>
));
FormDateInput.displayName = "FormDateInput";

export default function DailyStock() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);

  const [selectedDate, setSelectedDate] = useState(() => {
    const saved = sessionStorage.getItem('ds_selectedDate');
    return saved ? new Date(saved) : new Date();
  });

  useEffect(() => {
    if (selectedDate) sessionStorage.setItem('ds_selectedDate', selectedDate.toISOString());
  }, [selectedDate]);

  const [stockRows, setStockRows] = useState([]);
  const [dailySummary, setDailySummary] = useState({ totalSalesQty: 0, totalRevenue: 0, totalExpenses: 0, totalCollections: 0 });

  // --- NEW PURCHASE MODAL STATE ---
  const [purchaseModal, setPurchaseModal] = useState({ isOpen: false, brand: null, qty: '', price: '' });

  // --- POPUP STATES ---
  const [isBankDepositOpen, setIsBankDepositOpen] = useState(false);
  const [popupTab, setPopupTab] = useState('expense');
  const [expenses, setExpenses] = useState([]);
  const [collections, setCollections] = useState([]);

  const [expenseForm, setExpenseForm] = useState({ date: new Date(), description: '', amount: '' });
  const [collectionForm, setCollectionForm] = useState({ date: new Date(), description: 'Transferred to Bank', amount: '', mode: 'UPI/Bank' });
  const [popupDate, setPopupDate] = useState(new Date());

  const dragItem = useRef(null);
  const dragOverItem = useRef(null);

  const formatDateForDB = (dateObj) => {
    if (!dateObj) return '';
    const d = new Date(dateObj);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // --- FETCH MAIN DAILY STOCK ---
  const handleFetchTrigger = () => {
    let isMounted = true;
    const fetchDailyData = async () => {
      setLoading(true);
      setSaveMessage(null);

      const currentDateStr = formatDateForDB(selectedDate);
      const prevDate = new Date(selectedDate);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = formatDateForDB(prevDate);

      const { data: brandsData } = await supabase.from('brands').select('*').order('display_order', { ascending: true }).order('brand_name', { ascending: true });
      const { data: stockData } = await supabase.from('daily_stock').select('*').eq('date', currentDateStr);
      const { data: prevStockData } = await supabase.from('daily_stock').select('*').eq('date', prevDateStr);
      
      const { data: expData } = await supabase.from('expenses').select('amount').eq('date', currentDateStr);
      const { data: collData } = await supabase.from('owner_withdrawals').select('amount').eq('date', currentDateStr);

      if (!isMounted) return;

      let tExp = 0; if (expData) expData.forEach(e => tExp += parseFloat(e.amount));
      let tColl = 0; if (collData) collData.forEach(c => tColl += parseFloat(c.amount));

      if (brandsData) {
        const stockMap = {};
        if (stockData) stockData.forEach(s => stockMap[s.brand_id] = s);

        const prevStockMap = {};
        if (prevStockData) prevStockData.forEach(s => prevStockMap[s.brand_id] = s);

        let totalQty = 0;
        let totalRev = 0;

        const rows = brandsData.map(brand => {
          const existingStock = stockMap[brand.id];
          const prevStock = prevStockMap[brand.id];
          
          let baseOpening = 0;
          if (prevStock && prevStock.closing_balance !== null && prevStock.closing_balance !== undefined) {
            baseOpening = prevStock.closing_balance;
          }

          let purchaseQty = 0; 
          let opening = baseOpening;

          if (existingStock && existingStock.opening_balance !== null && existingStock.opening_balance !== undefined) {
            opening = existingStock.opening_balance;
            purchaseQty = opening - baseOpening;
            if (purchaseQty < 0) purchaseQty = 0; 
          }

          const closing = existingStock?.closing_balance !== null && existingStock?.closing_balance !== undefined ? existingStock.closing_balance : ''; 
          
          let salesQty = 0;
          let salesAmount = 0;
          if (closing !== '') {
            salesQty = opening - parseInt(closing);
            salesQty = salesQty < 0 ? 0 : salesQty; 
            salesAmount = salesQty * brand.selling_price;
            totalQty += salesQty;
            totalRev += salesAmount;
          }

          return {
            brand_id: brand.id,
            brand_name: brand.brand_name,
            bottle_size: brand.bottle_size,
            selling_price: brand.selling_price,
            purchase_price: brand.selling_price, 
            base_opening: baseOpening,
            purchase_qty: purchaseQty,
            opening_balance: opening,
            closing_balance: closing,
            sales_qty: salesQty,
            sales_amount: salesAmount,
          };
        });

        setStockRows(rows);
        setDailySummary({ totalSalesQty: totalQty, totalRevenue: totalRev, totalExpenses: tExp, totalCollections: tColl });
      }
      setLoading(false);
    };
    
    fetchDailyData();
    return () => { isMounted = false; };
  };

  useEffect(() => {
    const cleanup = handleFetchTrigger();
    return cleanup;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // --- FETCH POPUP DATA ---
  const handleFetchPopupTrigger = () => {
    let isMounted = true;
    const fetchPopupData = async () => {
      const dateStr = formatDateForDB(popupDate);
      const { data: expData } = await supabase.from('expenses').select('*').eq('date', dateStr).order('created_at', { ascending: false });
      const { data: collData } = await supabase.from('owner_withdrawals').select('*').eq('date', dateStr).order('created_at', { ascending: false });
      
      if (isMounted) {
        if (expData) setExpenses(expData);
        if (collData) setCollections(collData);
      }
    };
    fetchPopupData();
    return () => { isMounted = false; };
  };

  useEffect(() => {
    if (!isBankDepositOpen) return;
    const cleanup = handleFetchPopupTrigger();
    return cleanup;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBankDepositOpen, popupDate]);

  // --- FIFO CALCULATION ENGINE ---
  const recalculateRow = (row) => {
    let sQty = 0;
    let sAmt = 0;
    
    if (row.closing_balance !== '') {
      sQty = parseInt(row.opening_balance) - parseInt(row.closing_balance);
      sQty = sQty < 0 ? 0 : sQty;
      
      let remainingSales = sQty;
      
      // 1. Sell from Base Opening (Old Stock) first
      const qtyFromOld = Math.min(remainingSales, parseInt(row.base_opening));
      sAmt += qtyFromOld * parseFloat(row.selling_price);
      remainingSales -= qtyFromOld;

      // 2. Sell from New Purchase (New Stock) second
      if (remainingSales > 0 && parseInt(row.purchase_qty) > 0) {
        const qtyFromNew = Math.min(remainingSales, parseInt(row.purchase_qty));
        sAmt += qtyFromNew * parseFloat(row.purchase_price);
      }
    }
    
    return { ...row, sales_qty: sQty, sales_amount: sAmt };
  };

  // --- HANDLERS ---
  const handleOpenBankDeposit = () => {
    setIsBankDepositOpen(true);
    setPopupDate(selectedDate);
    setExpenseForm(prev => ({ ...prev, date: selectedDate }));
    setCollectionForm(prev => ({ ...prev, date: selectedDate }));
  };

  const handleSort = async () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    if (dragItem.current === dragOverItem.current) return; 

    let _stockRows = [...stockRows];
    const draggedItemContent = _stockRows.splice(dragItem.current, 1)[0];
    _stockRows.splice(dragOverItem.current, 0, draggedItemContent);
    setStockRows(_stockRows);

    try {
      const updatePromises = _stockRows.map((row, index) => supabase.from('brands').update({ display_order: index }).eq('id', row.brand_id));
      await Promise.all(updatePromises);
    } catch (error) {
      console.error("Error saving new sequence to database:", error);
    }
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const handleInputChange = (brandId, field, value) => {
    const numericValue = value === '' ? '' : parseInt(value) || 0;

    setStockRows(prevRows => {
      const updatedRows = prevRows.map(row => {
        if (row.brand_id === brandId) {
          let updatedRow = { ...row, [field]: numericValue };
          
          if (field === 'purchase_qty') {
            const currentPurchase = value === '' ? 0 : parseInt(value) || 0;
            updatedRow.opening_balance = updatedRow.base_opening + currentPurchase;
          }

          updatedRow = recalculateRow(updatedRow);
          return updatedRow;
        }
        return row;
      });

      let tQty = 0; let tRev = 0;
      updatedRows.forEach(r => { tQty += r.sales_qty; tRev += r.sales_amount; });
      setDailySummary(prev => ({ ...prev, totalSalesQty: tQty, totalRevenue: tRev }));
      return updatedRows;
    });
  };

  // --- PURCHASE MODAL HANDLERS ---
  const openPurchaseModal = (row) => {
    setPurchaseModal({
      isOpen: true,
      brand: row,
      qty: row.purchase_qty || '',
      price: row.purchase_price || row.selling_price
    });
  };

  const handlePurchaseSubmit = (e) => {
    e.preventDefault();
    const newQty = parseInt(purchaseModal.qty) || 0;
    const newPrice = parseFloat(purchaseModal.price) || purchaseModal.brand.selling_price;

    setStockRows(prevRows => {
      const updatedRows = prevRows.map(row => {
        if (row.brand_id === purchaseModal.brand.brand_id) {
          let updatedRow = { 
            ...row, 
            purchase_qty: newQty, 
            purchase_price: newPrice,
            opening_balance: row.base_opening + newQty 
          };
          updatedRow = recalculateRow(updatedRow);
          return updatedRow;
        }
        return row;
      });

      let tQty = 0; let tRev = 0;
      updatedRows.forEach(r => { tQty += r.sales_qty; tRev += r.sales_amount; });
      setDailySummary(prev => ({ ...prev, totalSalesQty: tQty, totalRevenue: tRev }));
      return updatedRows;
    });

    setPurchaseModal({ isOpen: false, brand: null, qty: '', price: '' });
  };

  const handleSaveStock = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    const currentDateStr = formatDateForDB(selectedDate);
    const upsertData = stockRows.map(row => ({
      user_id: user.id, date: currentDateStr, brand_id: row.brand_id,
      opening_balance: parseInt(row.opening_balance) || 0,
      closing_balance: row.closing_balance === '' ? null : parseInt(row.closing_balance),
    }));

    const { error } = await supabase.from('daily_stock').upsert(upsertData, { onConflict: 'date, brand_id, user_id' });
    if (error) {
      setSaveMessage({ type: 'error', text: 'Failed to save stock: ' + error.message });
    } else {
      setSaveMessage({ type: 'success', text: 'Stock ledger updated successfully!' });
      setTimeout(() => setSaveMessage(null), 3000);
    }
    setIsSaving(false);
  };

  // --- POPUP SUBMITS ---
  const handleAddExpense = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    const { error } = await supabase.from('expenses').insert([{
      user_id: user.id, date: formatDateForDB(expenseForm.date),
      description: expenseForm.description, amount: parseFloat(expenseForm.amount)
    }]);
    if (!error) { 
      setExpenseForm({ ...expenseForm, description: '', amount: '' }); 
      handleFetchPopupTrigger(); 
      handleFetchTrigger(); 
    }
    setIsSubmitting(false);
  };

  const handleAddCollection = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    const { error } = await supabase.from('owner_withdrawals').insert([{
      user_id: user.id, date: formatDateForDB(collectionForm.date),
      description: collectionForm.description, amount: parseFloat(collectionForm.amount), withdrawal_mode: collectionForm.mode
    }]);
    if (!error) { 
      setCollectionForm({ ...collectionForm, description: '', amount: '' }); 
      handleFetchPopupTrigger();
      handleFetchTrigger(); 
    }
    setIsSubmitting(false);
  };

  // --- CALCULATE TABLE TOTALS ---
  const tableTotalOpening = stockRows.reduce((acc, row) => acc + (parseInt(row.opening_balance) || 0), 0);
  const tableTotalPurchases = stockRows.reduce((acc, row) => acc + (parseInt(row.purchase_qty) || 0), 0);
  const tableTotalClosing = stockRows.reduce((acc, row) => acc + (parseInt(row.closing_balance) || 0), 0);

  const inputClass = "w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all duration-300 text-sm font-semibold";
  const numInputClass = "w-20 px-2 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all duration-300 text-sm text-center font-bold";

  return (
    <div className="space-y-6 transition-colors duration-300 relative">
      
      {/* Premium Unified DatePicker Styles */}
      <style>{`
        .header-date-picker .react-datepicker-wrapper { display: inline-block; width: auto; }
        .form-date-picker .react-datepicker-wrapper { display: block; width: 100%; }
        .react-datepicker-popper { z-index: 99999 !important; }
        .react-datepicker { 
          background-color: #ffffff !important; 
          border: 1px solid #e2e8f0 !important; 
          border-radius: 1rem !important; 
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1) !important; 
          font-family: inherit !important; 
          padding: 0.5rem !important;
        }
        .react-datepicker__month-container { background-color: #ffffff !important; }
        .react-datepicker__header { 
          background-color: #ffffff !important; 
          border-bottom: 1px solid #f1f5f9 !important; 
          padding-top: 0.5rem !important;
        }
        .react-datepicker__current-month, .react-datepicker-time__header, .react-datepicker-year-header { 
          color: #0f172a !important; font-weight: 700 !important; font-size: 0.95rem !important; margin-bottom: 0.5rem !important;
        }
        .react-datepicker__header select {
          background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 0.5rem;
          padding: 0.2rem 0.5rem; font-weight: 600; color: #1e293b; cursor: pointer;
          margin: 0 0.25rem 0.5rem 0.25rem; outline: none;
        }
        .react-datepicker__day-name { color: #64748b !important; font-weight: 600 !important; width: 2.25rem !important; margin: 0.1rem !important; }
        .react-datepicker__day { 
          color: #334155 !important; border-radius: 0.5rem !important; width: 2.25rem !important;
          line-height: 2.25rem !important; transition: all 0.2s ease !important; margin: 0.1rem !important;
        }
        .react-datepicker__day:hover { background-color: #f1f5f9 !important; color: #0f172a !important; }
        .react-datepicker__day--selected, .react-datepicker__day--keyboard-selected { 
          background-color: #3b82f6 !important; color: #ffffff !important; font-weight: bold !important; 
        }
        .react-datepicker__triangle { display: none !important; }

        /* Dark Mode Overrides */
        .dark .react-datepicker { background-color: #1e293b !important; border-color: #334155 !important; }
        .dark .react-datepicker__month-container { background-color: #1e293b !important; }
        .dark .react-datepicker__header { background-color: #1e293b !important; border-bottom-color: #334155 !important; }
        .dark .react-datepicker__current-month, .dark .react-datepicker-time__header, .dark .react-datepicker-year-header { color: #f8fafc !important; }
        .dark .react-datepicker__header select { background-color: #334155 !important; color: #f8fafc !important; border-color: #475569 !important; }
        .dark .react-datepicker__day-name { color: #94a3b8 !important; }
        .dark .react-datepicker__day { color: #e2e8f0 !important; }
        .dark .react-datepicker__day:hover { background-color: #334155 !important; color: #ffffff !important; }
        .dark .react-datepicker__day--selected, .dark .react-datepicker__day--keyboard-selected { background-color: #3b82f6 !important; color: #ffffff !important; }
      `}</style>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 z-50 relative">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
            <Package className="text-blue-500" /> Daily Stock Ledger
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Reconcile opening stock, purchases, and closing stock to generate sales.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="header-date-picker flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-inner">
            <DatePicker 
              selected={selectedDate} 
              onChange={(date) => setSelectedDate(date)} 
              maxDate={new Date()} 
              dateFormat="dd/MM/yy" 
              customInput={<CustomDateInput />} 
              showMonthDropdown
              showYearDropdown
              dropdownMode="select"
            />
          </div>
          
          <button onClick={handleOpenBankDeposit} className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all shadow-sm">
            <Landmark size={18} /> Expenses & Bank Deposit Entry
          </button>

          <button onClick={handleSaveStock} disabled={isSaving} className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-sm disabled:opacity-50">
            <Save size={18} /> {isSaving ? 'Saving...' : 'Save Ledger'}
          </button>
        </div>
      </div>

      {saveMessage && (
        <div className={`flex items-center gap-2 p-4 rounded-xl border ${saveMessage.type === 'success' ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'} animate-in fade-in slide-in-from-top-2`}>
          {saveMessage.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <span className="font-semibold">{saveMessage.text}</span>
        </div>
      )}

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 relative z-10">
        <div className="bg-linear-to-br from-indigo-500 to-indigo-700 p-6 rounded-2xl shadow-sm text-white relative overflow-hidden group">
          <div className="absolute right-0 top-0 opacity-10 transform translate-x-1/4 -translate-y-1/4"><Calculator size={120} /></div>
          <p className="text-indigo-100 font-medium text-sm tracking-wider uppercase mb-2 relative z-10">Total Sales Qty (Auto)</p>
          <h3 className="text-4xl font-black relative z-10">{dailySummary.totalSalesQty} <span className="text-lg font-medium opacity-80">Units</span></h3>
        </div>

        <div className="bg-linear-to-br from-emerald-500 to-emerald-700 p-6 rounded-2xl shadow-sm text-white relative overflow-hidden group">
          <div className="absolute right-0 top-0 opacity-10 transform translate-x-1/4 -translate-y-1/4"><Calculator size={120} /></div>
          <p className="text-emerald-100 font-medium text-sm tracking-wider uppercase mb-2 relative z-10">Generated Revenue (Auto)</p>
          <h3 className="text-4xl font-black relative z-10">₹{dailySummary.totalRevenue.toLocaleString()}</h3>
        </div>

        <div className="bg-linear-to-br from-red-500 to-red-700 p-6 rounded-2xl shadow-sm text-white relative overflow-hidden group">
          <div className="absolute right-0 top-0 opacity-10 transform translate-x-1/4 -translate-y-1/4"><Receipt size={120} /></div>
          <p className="text-red-100 font-medium text-sm tracking-wider uppercase mb-2 relative z-10">Expenses (Auto)</p>
          <h3 className="text-4xl font-black relative z-10">₹{dailySummary.totalExpenses.toLocaleString()}</h3>
        </div>
      </div>

      {/* Main Calculation Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden relative z-10">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
            <thead className="bg-slate-50/80 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-semibold uppercase text-[11px] tracking-wider border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-3 py-4 w-10"></th> 
                <th className="px-3 py-4">Brand Details</th>
                <th className="px-4 py-4 text-center">Opening Bal.<br/><span className="text-slate-400 dark:text-slate-500 text-[10px] font-normal">(Editable)</span></th>
                <th className="px-4 py-4 text-center">Purchases Qty<br/><span className="text-slate-400 dark:text-slate-500 text-[10px] font-normal">(Click to Add)</span></th>
                <th className="px-4 py-4 text-center">Closing Bal.<br/><span className="text-slate-400 dark:text-slate-500 text-[10px] font-normal">(Input)</span></th>
                <th className="px-4 py-4 text-center text-indigo-600 dark:text-indigo-400">Sale Qty<br/><span className="text-slate-400 dark:text-slate-500 text-[10px] font-normal">(Auto)</span></th>
                <th className="px-6 py-4 text-right text-emerald-600 dark:text-emerald-400">Sale Amount<br/><span className="text-slate-400 dark:text-slate-500 text-[10px] font-normal">(Auto FIFO)</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr><td colSpan="7" className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">Syncing stock data...</td></tr>
              ) : stockRows.length === 0 ? (
                <tr><td colSpan="7" className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">No brands found. Go to Brand Master to add items.</td></tr>
              ) : (
                stockRows.map((row, index) => (
                  <tr key={row.brand_id} draggable onDragStart={() => (dragItem.current = index)} onDragEnter={() => (dragOverItem.current = index)} onDragEnd={handleSort} onDragOver={(e) => e.preventDefault()} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/80 transition-colors group bg-white dark:bg-slate-900">
                    <td className="px-3 py-4 text-center cursor-move"><GripVertical size={16} className="text-slate-300 dark:text-slate-600 group-hover:text-blue-500 transition-colors" /></td>
                    <td className="px-3 py-4">
                      <div className="font-bold text-slate-800 dark:text-slate-100">{row.brand_name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-500 dark:text-slate-400">{row.bottle_size} | ₹{row.selling_price} base rate</span>
                        {row.purchase_qty > 0 && row.purchase_price !== row.selling_price && (
                          <span className="text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-500 px-1.5 py-0.5 rounded-md">New: ₹{row.purchase_price}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <input type="number" value={row.opening_balance} onChange={(e) => handleInputChange(row.brand_id, 'opening_balance', e.target.value)} className={`${numInputClass} border-amber-300 dark:border-amber-800 focus:ring-amber-500`} />
                    </td>
                    <td className="px-4 py-4 text-center">
                      <button 
                        onClick={() => openPurchaseModal(row)}
                        className={`w-20 px-2 py-2 rounded-lg text-sm text-center font-bold transition-all border outline-none ${row.purchase_qty > 0 ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-600 hover:text-blue-600 dark:hover:text-blue-400'}`}
                      >
                        {row.purchase_qty === 0 ? '+ Add' : row.purchase_qty}
                      </button>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <input type="number" min="0" placeholder="Qty" value={row.closing_balance} onChange={(e) => handleInputChange(row.brand_id, 'closing_balance', e.target.value)} className={`${numInputClass} border-blue-300 dark:border-blue-700 bg-blue-50/30 dark:bg-blue-900/10 focus:ring-blue-500`} />
                    </td>
                    <td className="px-4 py-4 text-center font-black text-indigo-600 dark:text-indigo-400 text-lg">
                      {row.closing_balance === '' ? '-' : row.sales_qty}
                    </td>
                    <td className="px-6 py-4 text-right font-black text-emerald-600 dark:text-emerald-400 text-lg">
                      {row.closing_balance === '' ? '-' : `₹${row.sales_amount.toLocaleString()}`}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {/* ENHANCED FOOTER WITH NET CASH CALCULATIONS */}
            {stockRows.length > 0 && !loading && (
              <tfoot className="bg-slate-100/80 dark:bg-slate-800/80 border-t-2 border-slate-200 dark:border-slate-700">
                <tr>
                  <td colSpan="2" className="px-3 py-4 text-right">
                    <div className="font-black text-slate-800 dark:text-slate-100 flex justify-end items-center gap-2"><Sigma size={16} className="text-blue-600" /> TOTALS</div>
                  </td>
                  <td className="px-4 py-4 text-center font-black text-slate-800 dark:text-slate-200">{tableTotalOpening}</td>
                  <td className="px-4 py-4 text-center font-black text-slate-800 dark:text-slate-200">{tableTotalPurchases}</td>
                  <td className="px-4 py-4 text-center font-black text-slate-800 dark:text-slate-200">{tableTotalClosing}</td>
                  <td className="px-4 py-4 text-center font-black text-indigo-600 dark:text-indigo-400">{dailySummary.totalSalesQty}</td>
                  <td className="px-6 py-4 text-right font-black text-emerald-600 dark:text-emerald-400">₹{dailySummary.totalRevenue.toLocaleString()}</td>
                </tr>
                <tr>
                  <td colSpan="6" className="px-4 py-2 text-right font-bold text-red-500 dark:text-red-400">Business Expenses :</td>
                  <td className="px-6 py-2 text-right font-bold text-red-500 dark:text-red-400">- ₹{dailySummary.totalExpenses.toLocaleString()}</td>
                </tr>
                <tr>
                  <td colSpan="6" className="px-4 py-2 text-right font-bold text-red-500 dark:text-red-400">Online Collected :</td>
                  <td className="px-6 py-2 text-right font-bold text-red-500 dark:text-red-400">- ₹{dailySummary.totalCollections.toLocaleString()}</td>
                </tr>
                <tr className="bg-emerald-50/50 dark:bg-emerald-900/10 border-t border-slate-200 dark:border-slate-700">
                  <td colSpan="6" className="px-4 py-4 text-right font-black text-emerald-700 dark:text-emerald-400 text-sm uppercase tracking-wider">Net In-Hand Cash :</td>
                  <td className="px-6 py-4 text-right font-black text-emerald-700 dark:text-emerald-400 text-xl">
                    ₹{(dailySummary.totalRevenue - dailySummary.totalExpenses - dailySummary.totalCollections).toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* --- ADD PURCHASE MODAL (FIFO ENGINE) --- */}
      {purchaseModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 99999 }}>
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Package size={20} className="text-blue-500" /> Record New Purchase
              </h3>
              <button onClick={() => setPurchaseModal({ isOpen: false, brand: null, qty: '', price: '' })} className="p-2 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-red-500 hover:text-white rounded-full transition-colors outline-none"><X size={20} /></button>
            </div>
            
            <form onSubmit={handlePurchaseSubmit} className="p-6 space-y-5">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-900/30">
                <h4 className="font-bold text-slate-800 dark:text-slate-100 text-lg">{purchaseModal.brand?.brand_name}</h4>
                <p className="text-sm text-slate-500 dark:text-slate-400">{purchaseModal.brand?.bottle_size} • Base Rate: ₹{purchaseModal.brand?.selling_price}</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">New Quantity Added</label>
                <input 
                  type="number" 
                  required min="0" 
                  value={purchaseModal.qty} 
                  onChange={(e) => setPurchaseModal({...purchaseModal, qty: e.target.value})} 
                  className={inputClass} 
                  placeholder="e.g., 240" 
                  autoFocus
                />
              </div>

              <div>
                <label className="flex justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  <span>Selling Price for New Stock (₹)</span>
                  <span className="text-[10px] text-blue-500 bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 rounded-md">FIFO Applied</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><IndianRupee size={16}/></span>
                  <input 
                    type="number" 
                    required min="0" step="any" 
                    value={purchaseModal.price} 
                    onChange={(e) => setPurchaseModal({...purchaseModal, price: e.target.value})} 
                    className={`${inputClass} pl-10 font-bold`} 
                  />
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                  * Note: Previous stock will continue to sell at the old rate. This new rate will only apply to these {purchaseModal.qty || '0'} newly added bottles.
                </p>
              </div>

              <button type="submit" className="w-full mt-2 bg-blue-600 text-white font-bold py-3 px-4 rounded-xl hover:bg-blue-700 transition-all duration-300 shadow-md hover:shadow-lg flex justify-center items-center gap-2">
                <CheckCircle2 size={18} /> Confirm Addition
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- BANK DEPOSIT & EXPENSES POPUP (MODAL) --- */}
      {isBankDepositOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 99999 }}>
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-6xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
            
            <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-4">
                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Landmark size={24} className="text-blue-500" /> Bank & Ledger Operations
                </h3>
              </div>
              <button onClick={() => setIsBankDepositOpen(false)} className="p-2 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-red-500 hover:text-white rounded-full transition-colors outline-none"><X size={20} /></button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                <div className="bg-white dark:bg-slate-950 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 h-fit overflow-hidden">
                  <div className="flex border-b border-slate-100 dark:border-slate-800">
                    <button onClick={() => setPopupTab('expense')} className={`flex-1 py-4 text-sm font-bold text-center transition-colors ${popupTab === 'expense' ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-b-2 border-red-600' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>Business Expense</button>
                    <button onClick={() => setPopupTab('collection')} className={`flex-1 py-4 text-sm font-bold text-center transition-colors ${popupTab === 'collection' ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>Online Collection</button>
                  </div>

                  <div className="p-6">
                    {popupTab === 'expense' ? (
                      <form onSubmit={handleAddExpense} className="space-y-4 animate-in fade-in zoom-in duration-200">
                        <div className="form-date-picker">
                          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Date</label>
                          <DatePicker 
                            selected={expenseForm.date} 
                            onChange={(date) => { setExpenseForm({ ...expenseForm, date }); setPopupDate(date); }} 
                            dateFormat="dd/MM/yy" 
                            className={inputClass} 
                            customInput={<FormDateInput className={inputClass} />} 
                            showMonthDropdown
                            showYearDropdown
                            dropdownMode="select"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Description</label>
                          <input type="text" required value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} className={inputClass} placeholder="e.g., Light Bill" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Amount (₹)</label>
                          <input type="number" required min="1" step="any" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} className={inputClass} placeholder="0.00" />
                        </div>
                        <button type="submit" disabled={isSubmitting} className="w-full mt-2 bg-red-600 text-white font-medium py-2.5 rounded-xl hover:bg-red-700 transition-colors flex items-center justify-center gap-2"><Plus size={18}/> Add Expense</button>
                      </form>
                    ) : (
                      <form onSubmit={handleAddCollection} className="space-y-4 animate-in fade-in zoom-in duration-200">
                        <div className="form-date-picker">
                          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Date</label>
                          <DatePicker 
                            selected={collectionForm.date} 
                            onChange={(date) => { setCollectionForm({ ...collectionForm, date }); setPopupDate(date); }} 
                            dateFormat="dd/MM/yy" 
                            className={inputClass} 
                            customInput={<FormDateInput className={inputClass} />} 
                            showMonthDropdown
                            showYearDropdown
                            dropdownMode="select"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Description</label>
                          <input type="text" required value={collectionForm.description} onChange={(e) => setCollectionForm({ ...collectionForm, description: e.target.value })} className={inputClass} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Amount (₹)</label>
                            <input type="number" required min="1" value={collectionForm.amount} onChange={(e) => setCollectionForm({ ...collectionForm, amount: e.target.value })} className={inputClass} placeholder="0.00" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Mode</label>
                            <select value={collectionForm.mode} onChange={(e) => setCollectionForm({ ...collectionForm, mode: e.target.value })} className={inputClass}>
                              <option value="UPI/Bank">UPI/Bank</option>
                              <option value="Cash">Cash</option>
                            </select>
                          </div>
                        </div>
                        <button type="submit" disabled={isSubmitting} className="w-full mt-2 bg-indigo-600 text-white font-medium py-2.5 rounded-xl hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"><ArrowDownCircle size={18} /> Record Collection</button>
                      </form>
                    )}
                  </div>
                </div>

                <div className="lg:col-span-2 bg-white dark:bg-slate-950 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden h-fit flex flex-col">
                  <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                      {popupTab === 'expense' ? <Receipt size={18} className="text-red-500"/> : <Landmark size={18} className="text-indigo-500"/>}
                      {popupTab === 'expense' ? 'Daily Expenses Ledger' : 'Daily Online Collections'}
                    </h3>
                  </div>
                  
                  <div className="overflow-x-auto max-h-96 custom-scrollbar">
                    <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                      <thead className="bg-white dark:bg-slate-950 text-slate-400 font-semibold uppercase text-xs tracking-wider sticky top-0 border-b border-slate-100 dark:border-slate-800 z-10">
                        <tr>
                          <th className="px-6 py-4">Description</th>
                          {popupTab === 'collection' && <th className="px-6 py-4 text-center">Mode</th>}
                          <th className="px-6 py-4 text-right">Amount (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {(popupTab === 'expense' ? expenses : collections).length === 0 ? (
                          <tr><td colSpan={popupTab === 'collection' ? 3 : 2} className="px-6 py-12 text-center text-slate-400">No records found for selected date.</td></tr>
                        ) : (
                          (popupTab === 'expense' ? expenses : collections).map((row) => (
                            <tr key={row.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                              <td className="px-6 py-4 font-medium text-slate-800 dark:text-slate-100">{row.description}</td>
                              {popupTab === 'collection' && (
                                <td className="px-6 py-4 text-center">
                                  <span className={`px-2 py-1 text-[10px] font-bold uppercase rounded-md ${row.withdrawal_mode === 'Cash' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-500' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                                    {row.withdrawal_mode}
                                  </span>
                                </td>
                              )}
                              <td className={`px-6 py-4 text-right font-bold ${popupTab === 'expense' ? 'text-red-600 dark:text-red-400' : 'text-indigo-600 dark:text-indigo-400'}`}>
                                ₹{parseFloat(row.amount).toLocaleString()}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}