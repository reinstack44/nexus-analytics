import { useState, useEffect, useRef, forwardRef } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { Package, Calendar, Save, Calculator, AlertCircle, CheckCircle2, GripVertical, ChevronDown, Landmark, Plus, ArrowDownCircle, Receipt, X, Sigma, IndianRupee, Edit2, Trash2, RotateCcw, Coffee, CalendarOff, Info } from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

const formatDisplayDate = (dateObj) => {
  if (!dateObj) return '';
  const d = new Date(dateObj);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

const CustomDateInput = forwardRef(({ value, onClick, placeholder }, ref) => {
  let displayValue = value || placeholder;
  
  if (value && value.includes(' - ')) {
    const dates = value.split(' - ');
    if (dates.length === 2) {
      if (dates[0] === dates[1]) {
        displayValue = dates[0];
      } else {
        const startParts = dates[0].split(' ');
        const endParts = dates[1].split(' ');
        if (startParts[1] === endParts[1] && startParts[2] === endParts[2]) {
          displayValue = `${startParts[0]} - ${dates[1]}`;
        }
      }
    }
  }

  return (
    <button type="button" onClick={onClick} ref={ref} className="flex items-center justify-between px-3 py-2 h-10.5 w-52.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-all duration-200 text-sm font-bold text-slate-700 dark:text-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 whitespace-nowrap">
      <div className="flex items-center overflow-hidden">
        <Calendar size={16} className="text-blue-500 mr-2 shrink-0" />
        <span className="truncate">{displayValue}</span>
      </div>
      <ChevronDown size={14} className="text-slate-400 dark:text-slate-500 ml-2 shrink-0" />
    </button>
  );
});
CustomDateInput.displayName = "CustomDateInput";

const FormDateInput = forwardRef(({ value, onClick, className }, ref) => (
  <button type="button" onClick={onClick} ref={ref} className={`${className} flex justify-between items-center text-left h-10.5`}>
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
  const [refreshTrigger, setRefreshTrigger] = useState(0); 

  // --- SMART DATE RANGE STATE ---
  const [dateRange, setDateRange] = useState(() => {
    const savedStart = sessionStorage.getItem('ds_startDate');
    const savedEnd = sessionStorage.getItem('ds_endDate');
    return [
      savedStart ? new Date(savedStart) : new Date(),
      savedEnd ? new Date(savedEnd) : new Date()
    ];
  });
  const [startDate, endDate] = dateRange;

  useEffect(() => {
    if (startDate) sessionStorage.setItem('ds_startDate', startDate.toISOString());
    if (endDate) sessionStorage.setItem('ds_endDate', endDate.toISOString());
  }, [startDate, endDate]);

  const [stockRows, setStockRows] = useState([]);
  const [dailySummary, setDailySummary] = useState({ totalSalesQty: 0, totalRevenue: 0, totalExpenses: 0, totalCollections: 0 });

  // --- CUSTOM CONFIRM MODAL STATE ---
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', isDanger: false, onConfirm: null });
  const closeConfirm = () => setConfirmModal({ ...confirmModal, isOpen: false });

  // --- HOLIDAY & RANGE LOCKING STATES ---
  const [markedHolidays, setMarkedHolidays] = useState(() => {
    const saved = localStorage.getItem('ds_markedHolidays');
    return saved ? JSON.parse(saved) : [];
  });
  const [lockedRanges, setLockedRanges] = useState(() => {
    const saved = localStorage.getItem('ds_lockedRanges');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('ds_markedHolidays', JSON.stringify(markedHolidays));
  }, [markedHolidays]);

  useEffect(() => {
    localStorage.setItem('ds_lockedRanges', JSON.stringify(lockedRanges));
  }, [lockedRanges]);

  const formatDateForDB = (dateObj) => {
    if (!dateObj) return '';
    const d = new Date(dateObj);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getDatesInRange = (start, end) => {
    const dates = [];
    let current = new Date(start);
    const last = new Date(end || start);
    current.setHours(0,0,0,0);
    last.setHours(0,0,0,0);
    
    while (current <= last) {
      dates.push(formatDateForDB(current));
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };

  const selectedDates = getDatesInRange(startDate, endDate);
  const isHolidaySelected = selectedDates.some(d => markedHolidays.includes(d));
  const isMultiDayRange = startDate && endDate && formatDateForDB(startDate) !== formatDateForDB(endDate);

  // --- AUTO-FORWARD RANGE LOCKING & SNAPPING LOGIC ---
  const handleDateSelection = (update) => {
    const [newStart, newEnd] = update;
    
    if (newStart && newEnd) {
       const datesToSelect = getDatesInRange(newStart, newEnd);

       // 1. Prevent Overlapping locked ranges completely
       const overlappingRange = lockedRanges.find(r => 
          datesToSelect.some(d => d >= r.start && d <= r.end)
       );
       if (overlappingRange) {
          setDateRange([new Date(overlappingRange.start), new Date(overlappingRange.end)]);
          return;
       }

       // 2. Prevent mixing Holidays and Non-Holidays
       const hasHolidays = datesToSelect.some(d => markedHolidays.includes(d));
       const hasNonHolidays = datesToSelect.some(d => !markedHolidays.includes(d));

       if (hasHolidays && hasNonHolidays) {
          // SNAP EXACTLY TO THE NEW CLICKED DATE (Reject the range formulation)
          setDateRange([newEnd, newEnd]);
          return;
       }

    } else if (newStart) {
       // Single click behavior check
       const dateStr = formatDateForDB(newStart);
       const overlappingRange = lockedRanges.find(r => dateStr >= r.start && dateStr <= r.end);
       if (overlappingRange) {
          setDateRange([new Date(overlappingRange.start), new Date(overlappingRange.end)]);
          return;
       }
    }
    setDateRange(update);
  };

  // --- POPUP STATES & FORMS ---
  const [purchaseModal, setPurchaseModal] = useState({ isOpen: false, brand: null, qty: '', price: '', isPriceChanged: false });
  const [isBankDepositOpen, setIsBankDepositOpen] = useState(false);
  const [popupTab, setPopupTab] = useState('expense');
  const [expenses, setExpenses] = useState([]);
  const [collections, setCollections] = useState([]);
  const [expenseForm, setExpenseForm] = useState({ date: new Date(), description: '', amount: '' });
  const [collectionForm, setCollectionForm] = useState({ date: new Date(), description: 'Transferred to Bank', amount: '', mode: 'UPI/Bank' });
  const [popupDate, setPopupDate] = useState(new Date());
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [editingCollectionId, setEditingCollectionId] = useState(null);

  const dragItem = useRef(null);
  const dragOverItem = useRef(null);

  // --- FETCH MAIN DAILY STOCK ---
  useEffect(() => {
    let isMounted = true;

    const fetchDailyData = async () => {
      await Promise.resolve(); // Clears sync effect warning
      if (!isMounted) return;
      
      setLoading(true);
      setSaveMessage(null);

      const startStr = formatDateForDB(startDate);
      const endStr = endDate ? formatDateForDB(endDate) : startStr;

      // GET THE DIRECT PREVIOUS DAY'S ENTRY (Holiday or Working)
      const { data: latestDateData } = await supabase
        .from('daily_stock')
        .select('date')
        .lt('date', startStr)
        .order('date', { ascending: false })
        .limit(1);

      let prevDateStr = latestDateData?.[0]?.date || null;

      const { data: brandsData } = await supabase.from('brands').select('*').order('display_order', { ascending: true }).order('brand_name', { ascending: true });
      const { data: stockData } = await supabase.from('daily_stock').select('*').eq('date', endStr);
      
      let prevStockData = [];
      if (prevDateStr) {
        const { data: pData } = await supabase.from('daily_stock').select('*').eq('date', prevDateStr);
        if (pData) prevStockData = pData;
      }
      
      const { data: expData } = await supabase.from('expenses').select('amount').gte('date', startStr).lte('date', endStr);
      const { data: collData } = await supabase.from('owner_withdrawals').select('amount').gte('date', startStr).lte('date', endStr);

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
          let closing = '';
          let pPrice = brand.selling_price; 

          if (existingStock) {
            let recordedPurchase = 0;
            if (existingStock.opening_balance !== null && existingStock.opening_balance !== undefined) {
              recordedPurchase = existingStock.opening_balance - baseOpening;
            }
            
            if (recordedPurchase > 0) {
              purchaseQty = recordedPurchase;
            }

            opening = baseOpening + purchaseQty;

            // Strict check: Only show closing if explicitly entered (not a fresh day)
            if (existingStock.closing_balance !== null && existingStock.closing_balance !== undefined) {
              closing = existingStock.closing_balance;
              if (closing > opening) closing = opening;
            }
            
            if (existingStock.unit_price) {
              pPrice = parseFloat(existingStock.unit_price);
            }
          }

          let sQty = 0;
          let sAmt = 0;
          if (closing !== '') {
            sQty = opening - parseInt(closing);
            sQty = sQty < 0 ? 0 : sQty; 
            
            let remainingSales = sQty;
            const qtyFromOld = Math.min(remainingSales, baseOpening);
            sAmt += qtyFromOld * parseFloat(brand.selling_price);
            remainingSales -= qtyFromOld;

            if (remainingSales > 0 && purchaseQty > 0) {
              const qtyFromNew = Math.min(remainingSales, purchaseQty);
              sAmt += qtyFromNew * parseFloat(pPrice);
            }

            totalQty += sQty;
            totalRev += sAmt;
          }

          return {
            brand_id: brand.id,
            brand_name: brand.brand_name,
            bottle_size: brand.bottle_size,
            selling_price: brand.selling_price,
            purchase_price: pPrice, 
            base_opening: baseOpening,
            purchase_qty: purchaseQty,
            opening_balance: opening,
            closing_balance: closing,
            sales_qty: sQty,
            sales_amount: sAmt,
          };
        });

        setStockRows(rows);
        setDailySummary({ totalSalesQty: totalQty, totalRevenue: totalRev, totalExpenses: tExp, totalCollections: tColl });
      }
      setLoading(false);
    };
    
    if (!isHolidaySelected) {
      fetchDailyData();
    } else {
      // If it's a holiday, skip processing calculations directly for UI (screen is locked)
      setTimeout(() => { if (isMounted) setLoading(false); }, 0);
    }
    
    return () => { isMounted = false; };
  }, [startDate, endDate, isHolidaySelected, refreshTrigger, markedHolidays]);

  // --- FETCH POPUP DATA ---
  const fetchPopupData = async (dateToFetch) => {
    const dateStr = formatDateForDB(dateToFetch);
    const { data: expData } = await supabase.from('expenses').select('*').eq('date', dateStr).order('created_at', { ascending: false });
    const { data: collData } = await supabase.from('owner_withdrawals').select('*').eq('date', dateStr).order('created_at', { ascending: false });
    
    if (expData) setExpenses(expData);
    if (collData) setCollections(collData);
  };

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      if (!isBankDepositOpen) return;
      const dateToFetch = popupTab === 'expense' ? expenseForm.date : collectionForm.date;
      const dateStr = formatDateForDB(dateToFetch);
      
      const { data: expData } = await supabase.from('expenses').select('*').eq('date', dateStr).order('created_at', { ascending: false });
      const { data: collData } = await supabase.from('owner_withdrawals').select('*').eq('date', dateStr).order('created_at', { ascending: false });
      
      if (isMounted) {
        if (expData) setExpenses(expData);
        if (collData) setCollections(collData);
      }
    };
    loadData();
    return () => { isMounted = false; };
  }, [isBankDepositOpen, popupTab, expenseForm.date, collectionForm.date]);

  // --- CALCULATION ENGINE ---
  const recalculateRow = (row) => {
    let sQty = 0;
    let sAmt = 0;
    
    if (row.closing_balance !== '') {
      sQty = parseInt(row.opening_balance) - parseInt(row.closing_balance);
      sQty = sQty < 0 ? 0 : sQty;
      
      let remainingSales = sQty;
      
      const qtyFromOld = Math.min(remainingSales, parseInt(row.base_opening));
      sAmt += qtyFromOld * parseFloat(row.selling_price);
      remainingSales -= qtyFromOld;

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
    setPopupDate(endDate || startDate);
    setExpenseForm(prev => ({ ...prev, date: endDate || startDate }));
    setCollectionForm(prev => ({ ...prev, date: endDate || startDate }));
    setEditingExpenseId(null);
    setEditingCollectionId(null);
  };

  const openResetConfirm = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Reset Daily Entries?',
      message: 'Are you sure you want to reset all manual entries for this period? This will clear all added purchases and closing balances.',
      isDanger: true,
      onConfirm: () => {
        setStockRows(prevRows => {
          const resetRows = prevRows.map(row => {
            let updatedRow = { ...row, purchase_qty: 0, purchase_price: row.selling_price, opening_balance: row.base_opening, closing_balance: '' };
            updatedRow = recalculateRow(updatedRow);
            return updatedRow;
          });
          setDailySummary(prev => ({ ...prev, totalSalesQty: 0, totalRevenue: 0 }));
          return resetRows;
        });
        closeConfirm();
      }
    });
  };

  const openHolidayConfirm = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Declare as Holiday?',
      message: 'Marking this period as a holiday will automatically lock sales generation and carry forward opening balances as closing balances.',
      isDanger: false,
      onConfirm: async () => {
        setIsSaving(true);
        const newHolidays = [...new Set([...markedHolidays, ...selectedDates])];
        setMarkedHolidays(newHolidays);
        
        const holidayRows = stockRows.map(row => {
          let updatedRow = { ...row, purchase_qty: 0, closing_balance: row.opening_balance };
          updatedRow = recalculateRow(updatedRow);
          return updatedRow;
        });
        
        setStockRows(holidayRows);
        setDailySummary(prev => ({ ...prev, totalSalesQty: 0, totalRevenue: 0 }));

        try {
          const upsertPromises = selectedDates.map(dateStr => {
             const upsertData = holidayRows.map(row => ({
                user_id: user.id, 
                date: dateStr, 
                brand_id: row.brand_id,
                opening_balance: parseInt(row.opening_balance) || 0,
                closing_balance: parseInt(row.closing_balance) || 0,
                unit_price: parseFloat(row.purchase_price) || 0 
             }));
             return supabase.from('daily_stock').upsert(upsertData, { onConflict: 'date, brand_id, user_id' });
          });
          await Promise.all(upsertPromises);
        } catch (error) {
          console.error("Holiday DB Save Error:", error);
        }

        setIsSaving(false);
        closeConfirm();
      }
    });
  };

  // 100% Instant DB Nullification upon unmarking holiday
  const handleRemoveHoliday = async () => {
    setIsSaving(true);
    const newHolidays = markedHolidays.filter(date => !selectedDates.includes(date));
    setMarkedHolidays(newHolidays);

    try {
      const resetPromises = selectedDates.map(dateStr => {
         const resetData = stockRows.map(row => ({
            user_id: user.id, 
            date: dateStr, 
            brand_id: row.brand_id,
            opening_balance: parseInt(row.opening_balance) || 0,
            closing_balance: null, // Wipe closing balance to allow fresh entry
            unit_price: parseFloat(row.purchase_price) || 0 
         }));
         return supabase.from('daily_stock').upsert(resetData, { onConflict: 'date, brand_id, user_id' });
      });
      await Promise.all(resetPromises);
      setRefreshTrigger(prev => prev + 1); // Triggers re-fetch for absolute accuracy
    } catch (error) {
      console.error("Error unlocking holiday:", error);
    }
    setIsSaving(false);
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
      console.error("Error saving new sequence:", error);
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

  const openPurchaseModal = (row) => {
    const isChanged = row.purchase_qty > 0 && row.purchase_price !== row.selling_price;
    setPurchaseModal({ isOpen: true, brand: row, qty: row.purchase_qty || '', price: row.purchase_price || row.selling_price, isPriceChanged: isChanged });
  };

  const handlePurchaseSubmit = (e) => {
    e.preventDefault();
    const newQty = parseInt(purchaseModal.qty) || 0;
    const newPrice = parseFloat(purchaseModal.price) || purchaseModal.brand.selling_price;

    setStockRows(prevRows => {
      const updatedRows = prevRows.map(row => {
        if (row.brand_id === purchaseModal.brand.brand_id) {
          let updatedRow = { ...row, purchase_qty: newQty, purchase_price: newPrice, opening_balance: row.base_opening + newQty };
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

    setPurchaseModal({ isOpen: false, brand: null, qty: '', price: '', isPriceChanged: false });
  };

  const handleSaveStock = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    const startStr = formatDateForDB(startDate);
    const endStr = formatDateForDB(endDate || startDate);
    
    if (startStr !== endStr) {
      const newRanges = lockedRanges.filter(r => r.start !== startStr && r.end !== endStr);
      setLockedRanges([...newRanges, { start: startStr, end: endStr }]);
    }

    const upsertData = stockRows.map(row => ({
      user_id: user.id, date: endStr, brand_id: row.brand_id,
      opening_balance: parseInt(row.opening_balance) || 0,
      closing_balance: row.closing_balance === '' ? null : parseInt(row.closing_balance),
      unit_price: parseFloat(row.purchase_price) || 0 
    }));

    const { error } = await supabase.from('daily_stock').upsert(upsertData, { onConflict: 'date, brand_id, user_id' });
    if (error) {
      setSaveMessage({ type: 'error', text: 'Failed to save stock: ' + error.message });
    } else {
      setSaveMessage({ type: 'success', text: `Stock ledger saved successfully for the period!` });
      setTimeout(() => setSaveMessage(null), 3000);
    }
    setIsSaving(false);
  };

  // --- EXPENSE/COLLECTION LOGIC ---
  const handleAddExpense = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    if (editingExpenseId) {
      const { error } = await supabase.from('expenses').update({
        date: formatDateForDB(expenseForm.date), description: expenseForm.description, amount: parseFloat(expenseForm.amount)
      }).eq('id', editingExpenseId);
      if (!error) { setEditingExpenseId(null); setExpenseForm({ date: popupDate, description: '', amount: '' }); fetchPopupData(expenseForm.date); setRefreshTrigger(prev => prev + 1); }
    } else {
      const { error } = await supabase.from('expenses').insert([{
        user_id: user.id, date: formatDateForDB(expenseForm.date), description: expenseForm.description, amount: parseFloat(expenseForm.amount)
      }]);
      if (!error) { setExpenseForm({ ...expenseForm, description: '', amount: '' }); fetchPopupData(expenseForm.date); setRefreshTrigger(prev => prev + 1); }
    }
    setIsSubmitting(false);
  };

  const editExpense = (exp) => { setEditingExpenseId(exp.id); setExpenseForm({ date: new Date(exp.date), description: exp.description, amount: exp.amount }); };
  
  const openDeleteExpense = (id) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Expense?',
      message: 'This expense record will be permanently deleted.',
      isDanger: true,
      onConfirm: async () => {
        setIsSubmitting(true); 
        const { error } = await supabase.from('expenses').delete().eq('id', id); 
        if (!error) { fetchPopupData(expenseForm.date); setRefreshTrigger(prev => prev + 1); } 
        setIsSubmitting(false);
        closeConfirm();
      }
    });
  };

  const handleAddCollection = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    if (editingCollectionId) {
      const { error } = await supabase.from('owner_withdrawals').update({
        date: formatDateForDB(collectionForm.date), description: collectionForm.description, amount: parseFloat(collectionForm.amount), withdrawal_mode: collectionForm.mode
      }).eq('id', editingCollectionId);
      if (!error) { setEditingCollectionId(null); setCollectionForm({ date: popupDate, description: 'Transferred to Bank', amount: '', mode: 'UPI/Bank' }); fetchPopupData(collectionForm.date); setRefreshTrigger(prev => prev + 1); }
    } else {
      const { error } = await supabase.from('owner_withdrawals').insert([{
        user_id: user.id, date: formatDateForDB(collectionForm.date), description: collectionForm.description, amount: parseFloat(collectionForm.amount), withdrawal_mode: collectionForm.mode
      }]);
      if (!error) { setCollectionForm({ ...collectionForm, description: '', amount: '' }); fetchPopupData(collectionForm.date); setRefreshTrigger(prev => prev + 1); }
    }
    setIsSubmitting(false);
  };

  const editCollection = (coll) => { setEditingCollectionId(coll.id); setCollectionForm({ date: new Date(coll.date), description: coll.description, amount: coll.amount, mode: coll.withdrawal_mode }); };
  
  const openDeleteCollection = (id) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Collection?',
      message: 'This collection entry will be permanently removed.',
      isDanger: true,
      onConfirm: async () => {
        setIsSubmitting(true); 
        const { error } = await supabase.from('owner_withdrawals').delete().eq('id', id); 
        if (!error) { fetchPopupData(collectionForm.date); setRefreshTrigger(prev => prev + 1); } 
        setIsSubmitting(false);
        closeConfirm();
      }
    });
  };

  const tableTotalOpening = stockRows.reduce((acc, row) => acc + (parseInt(row.opening_balance) || 0), 0);
  const tableTotalPurchases = stockRows.reduce((acc, row) => acc + (parseInt(row.purchase_qty) || 0), 0);
  const tableTotalClosing = stockRows.reduce((acc, row) => acc + (parseInt(row.closing_balance) || 0), 0);

  const inputClass = "w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all duration-300 text-sm font-semibold";
  const numInputClass = "w-20 px-2 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all duration-300 text-sm text-center font-bold";

  const highlightedHolidayDates = markedHolidays.map(dateStr => {
    const [year, month, day] = dateStr.split('-');
    return new Date(year, month - 1, day);
  });

  return (
    <div className="space-y-6 transition-colors duration-300 relative">
      
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
        
        /* Dropdown Styling */
        .react-datepicker__month-select, .react-datepicker__year-select {
          background-color: #f8fafc !important;
          border: 1px solid #cbd5e1 !important;
          border-radius: 0.5rem !important;
          padding: 0.2rem 0.5rem !important;
          color: #1e293b !important;
          font-weight: 600 !important;
          cursor: pointer !important;
          outline: none !important;
        }

        .react-datepicker__month-container { background-color: #ffffff !important; }
        .react-datepicker__header { background-color: #ffffff !important; border-bottom: 1px solid #f1f5f9 !important; padding-top: 0.5rem !important; }
        .react-datepicker__current-month { display: none !important; } 
        .react-datepicker__header__dropdown { margin-top: 5px; margin-bottom: 10px; display: flex; justify-content: center; gap: 8px; font-size: 0.95rem; }
        
        .react-datepicker__day-name { color: #64748b !important; font-weight: 600 !important; width: 2.25rem !important; margin: 0.1rem !important; }
        .react-datepicker__day { color: #334155 !important; border-radius: 0.5rem !important; width: 2.25rem !important; line-height: 2.25rem !important; transition: all 0.2s ease !important; margin: 0.1rem !important; }
        .react-datepicker__day:hover { background-color: #f1f5f9 !important; color: #0f172a !important; }
        .react-datepicker__day--selected, .react-datepicker__day--in-range, .react-datepicker__day--keyboard-selected { background-color: #3b82f6 !important; color: #ffffff !important; font-weight: bold !important; }
        .react-datepicker__day--in-selecting-range { background-color: #93c5fd !important; color: #0f172a !important; }
        .react-datepicker__triangle { display: none !important; }
        
        .react-datepicker__day--highlighted-holiday {
          background-color: #f97316 !important; 
          color: #ffffff !important;
          font-weight: bold !important;
        }
        
        /* Dark Mode Theme */
        .dark .react-datepicker { background-color: #1e293b !important; border-color: #334155 !important; }
        .dark .react-datepicker__month-container { background-color: #1e293b !important; }
        .dark .react-datepicker__header { background-color: #1e293b !important; border-bottom-color: #334155 !important; }
        .dark .react-datepicker__day-name { color: #94a3b8 !important; }
        .dark .react-datepicker__day { color: #e2e8f0 !important; }
        .dark .react-datepicker__day:hover { background-color: #334155 !important; color: #ffffff !important; }
        .dark .react-datepicker__day--selected, .dark .react-datepicker__day--in-range { background-color: #3b82f6 !important; color: #ffffff !important; }
        .dark .react-datepicker__day--in-selecting-range { background-color: #1e40af !important; color: #e2e8f0 !important; }
        
        .dark .react-datepicker__day--highlighted-holiday { background-color: #ea580c !important; }

        /* Dark Mode Fixes for Dropdowns */
        .dark .react-datepicker__month-select, .dark .react-datepicker__year-select {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #f8fafc !important;
        }
        .dark .react-datepicker__month-select option, .dark .react-datepicker__year-select option {
          background-color: #0f172a !important;
          color: #f8fafc !important;
        }
      `}</style>

      {/* GLOBAL CONFIRM MODAL */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-99999 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 max-w-sm w-full transform scale-100 transition-transform">
            <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">{confirmModal.title}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">{confirmModal.message}</p>
            <div className="flex gap-3">
              <button onClick={closeConfirm} className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-colors">
                Cancel
              </button>
              <button onClick={confirmModal.onConfirm} className={`flex-1 px-4 py-2.5 text-white rounded-xl font-bold transition-colors shadow-sm ${confirmModal.isDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header Container */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 z-50 relative">
        <div className="shrink-0">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
            <Package className="text-blue-500" /> Daily Stock Ledger
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Reconcile opening stock, purchases, and closing stock.</p>
        </div>
        
        <div className="flex-1 min-w-0 flex xl:justify-end mt-2 xl:mt-0">
          <div className="flex flex-wrap items-center justify-start xl:justify-end gap-2 max-w-full">
            
            <div className="header-date-picker shrink-0 flex items-center bg-slate-50 dark:bg-slate-800/50 p-1 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-inner">
              <DatePicker 
                selectsRange={true}
                startDate={startDate}
                endDate={endDate}
                onChange={handleDateSelection}
                maxDate={new Date()} 
                dateFormat="dd MMM yyyy" 
                customInput={<CustomDateInput placeholder="Select Period" />} 
                isClearable={false}
                showMonthDropdown
                showYearDropdown
                dropdownMode="select"
                highlightDates={[ { "highlighted-holiday": highlightedHolidayDates } ]}
              />
            </div>
            
            <button onClick={openHolidayConfirm} disabled={isHolidaySelected} className="shrink-0 flex items-center gap-1.5 h-10.5 bg-orange-500 text-white px-3 rounded-xl text-sm font-bold hover:bg-orange-600 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
              <Coffee size={18} /> Mark Holiday
            </button>
            
            <button onClick={handleOpenBankDeposit} className="shrink-0 flex items-center gap-1.5 h-10.5 bg-emerald-600 text-white px-3 rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all shadow-sm">
              <Landmark size={18} /> Expenses & Cash
            </button>
            
            <button onClick={openResetConfirm} disabled={isHolidaySelected} className="shrink-0 flex items-center gap-1.5 h-10.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 rounded-xl text-sm font-bold hover:bg-amber-100 hover:text-amber-700 transition-all shadow-sm disabled:opacity-50">
              <RotateCcw size={18} /> Reset
            </button>

            <button onClick={handleSaveStock} disabled={isSaving || isHolidaySelected} className="shrink-0 flex items-center gap-1.5 h-10.5 bg-blue-600 text-white px-4 rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-sm disabled:opacity-50">
              <Save size={18} /> {isSaving ? 'Saving...' : 'Save'}
            </button>
            
          </div>
        </div>
      </div>

      {saveMessage && (
        <div className={`flex items-center gap-2 p-4 rounded-xl border ${saveMessage.type === 'success' ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'} animate-in fade-in slide-in-from-top-2`}>
          {saveMessage.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <span className="font-semibold">{saveMessage.text}</span>
        </div>
      )}

      {isMultiDayRange && !isHolidaySelected && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 flex items-start sm:items-center gap-3 animate-in fade-in">
          <Info className="text-blue-500 shrink-0 mt-0.5 sm:mt-0" size={20} />
          <p className="text-sm text-blue-800 dark:text-blue-300 leading-relaxed">
            <strong>Combined View:</strong> You are entering data for the period <strong>{formatDisplayDate(startDate)}</strong> to <strong>{formatDisplayDate(endDate)}</strong>. The opening balance is from the start date, and the closing balance applies to the end date.
          </p>
        </div>
      )}

      {isHolidaySelected ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 text-center shadow-sm border border-orange-200 dark:border-orange-900/50 flex flex-col items-center justify-center min-h-[50vh] animate-in zoom-in duration-300">
          <div className="w-24 h-24 bg-orange-100 dark:bg-orange-900/30 text-orange-500 rounded-full flex items-center justify-center mb-6 shadow-inner border border-orange-200 dark:border-orange-800">
            <CalendarOff size={48} />
          </div>
          <h3 className="text-3xl font-black text-slate-800 dark:text-white mb-3">Holiday Declared!</h3>
          <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-lg text-lg">
            Sales generation is locked for the selected period. Your stock balances have been safely carried forward. 
          </p>
          <button onClick={handleRemoveHoliday} disabled={isSaving} className="px-6 py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl flex items-center gap-2 transition-all shadow-md hover:shadow-lg disabled:opacity-50">
            <Trash2 size={20} /> {isSaving ? 'Unlocking Entry...' : 'Cancel Holiday & Unlock Entry'}
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 relative z-10 animate-in fade-in">
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

          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden relative z-10 animate-in fade-in slide-in-from-bottom-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50/80 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-semibold uppercase text-[11px] tracking-wider border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-3 py-4 w-10"></th> 
                    <th className="px-3 py-4">Brand Details</th>
                    <th className="px-4 py-4 text-center">Opening Bal.<br/><span className="text-slate-400 dark:text-slate-500 text-[10px] font-normal">(Auto)</span></th>
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
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center flex-wrap gap-1">
                            <span>{row.bottle_size} |</span>
                            {row.purchase_qty > 0 && row.purchase_price !== row.selling_price ? (
                              <span className="inline-flex items-center gap-1.5 ml-1">
                                <span>Old: {row.base_opening} @ ₹{row.selling_price}</span>
                                <span className="text-slate-300 dark:text-slate-600">•</span>
                                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">New: {row.purchase_qty} @ ₹{row.purchase_price}</span>
                              </span>
                            ) : (
                              <span className="ml-1">₹{row.selling_price} base rate</span>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-4 text-center">
                          <input type="number" readOnly value={row.opening_balance} className={`${numInputClass} border-slate-200 dark:border-slate-700 opacity-80 cursor-not-allowed`} />
                        </td>
                        
                        <td className="px-4 py-4 text-center">
                          <button 
                            onClick={() => openPurchaseModal(row)}
                            className={`w-20 px-2 py-2 rounded-lg text-sm text-center font-bold transition-all border outline-none mx-auto block ${row.purchase_qty > 0 ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-600 hover:text-blue-600 dark:hover:text-blue-400'}`}
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
                      <td colSpan="6" className="px-4 py-2 text-right font-bold text-red-500 dark:text-red-400">(-) Business Expenses :</td>
                      <td className="px-6 py-2 text-right font-bold text-red-500 dark:text-red-400">- ₹{dailySummary.totalExpenses.toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td colSpan="6" className="px-4 py-2 text-right font-bold text-red-500 dark:text-red-400">(-) Online Collected :</td>
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
        </>
      )}

      {/* --- ADD PURCHASE MODAL (FIFO ENGINE) --- */}
      {purchaseModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-99999">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Package size={20} className="text-blue-500" /> Record New Purchase
              </h3>
              <button onClick={() => setPurchaseModal({ isOpen: false, brand: null, qty: '', price: '', isPriceChanged: false })} className="p-2 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-red-500 hover:text-white rounded-full transition-colors outline-none"><X size={20} /></button>
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

              <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-4">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Is there a price change for this new stock?</label>
                <div className="flex flex-col gap-3 mb-2">
                  <label className="flex items-center gap-3 cursor-pointer group bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-300 transition-colors">
                    <input 
                      type="radio" 
                      name="priceChange" 
                      checked={!purchaseModal.isPriceChanged} 
                      onChange={() => setPurchaseModal({...purchaseModal, isPriceChanged: false, price: purchaseModal.brand.selling_price})} 
                      className="w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 focus:ring-blue-500 dark:bg-slate-700 dark:border-slate-600" 
                    />
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 group-hover:text-blue-600 transition-colors">No, keep base rate (₹{purchaseModal.brand?.selling_price})</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer group bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-300 transition-colors">
                    <input 
                      type="radio" 
                      name="priceChange" 
                      checked={purchaseModal.isPriceChanged} 
                      onChange={() => setPurchaseModal({...purchaseModal, isPriceChanged: true})} 
                      className="w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 focus:ring-blue-500 dark:bg-slate-700 dark:border-slate-600" 
                    />
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 group-hover:text-blue-600 transition-colors">Yes, different price</span>
                  </label>
                </div>
              </div>

              {purchaseModal.isPriceChanged && (
                <div className="animate-in fade-in slide-in-from-top-2 pt-2">
                  <label className="flex justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    <span>New Selling Price (₹)</span>
                    <span className="text-[10px] text-blue-500 bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 rounded-md">FIFO Applied</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><IndianRupee size={16}/></span>
                    <input 
                      type="number" 
                      required min="0" step="any" 
                      value={purchaseModal.price} 
                      onChange={(e) => setPurchaseModal({...purchaseModal, price: e.target.value})} 
                      className={`${inputClass} pl-10 font-bold border-blue-300 dark:border-blue-800 focus:ring-blue-500`} 
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                    * Note: Previous stock will continue to sell at the old rate. This new rate will only apply to these {purchaseModal.qty || '0'} newly added bottles.
                  </p>
                </div>
              )}

              <button type="submit" className="w-full mt-4 bg-blue-600 text-white font-bold py-3 px-4 rounded-xl hover:bg-blue-700 transition-all duration-300 shadow-md hover:shadow-lg flex justify-center items-center gap-2">
                <CheckCircle2 size={18} /> Confirm Addition
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- BANK DEPOSIT & EXPENSES POPUP (MODAL) --- */}
      {isBankDepositOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-99999">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-6xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
            
            <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-4">
                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Landmark size={24} className="text-blue-500" /> Bank & Ledger Operations
                </h3>
                <div className="header-date-picker flex items-center gap-2 bg-white dark:bg-slate-900 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-inner">
                  <DatePicker 
                    selected={popupDate} 
                    onChange={(date) => {
                      setPopupDate(date);
                      setExpenseForm(prev => ({ ...prev, date }));
                      setCollectionForm(prev => ({ ...prev, date }));
                      setEditingExpenseId(null);
                      setEditingCollectionId(null);
                    }} 
                    maxDate={new Date()} 
                    dateFormat="dd/MM/yy" 
                    customInput={<CustomDateInput />} 
                    showMonthDropdown
                    showYearDropdown
                    dropdownMode="select"
                  />
                </div>
              </div>
              <button onClick={() => setIsBankDepositOpen(false)} className="p-2 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-red-500 hover:text-white rounded-full transition-colors outline-none"><X size={20} /></button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                <div className="bg-white dark:bg-slate-950 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 h-fit overflow-hidden">
                  <div className="flex border-b border-slate-100 dark:border-slate-800">
                    <button 
                      onClick={() => {
                        setPopupTab('expense');
                        setEditingCollectionId(null);
                        setCollectionForm({ date: popupDate, description: 'Transferred to Bank', amount: '', mode: 'UPI/Bank' });
                      }} 
                      className={`flex-1 py-4 text-sm font-bold text-center transition-colors ${popupTab === 'expense' ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-b-2 border-red-600' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                      Business Expense
                    </button>
                    <button 
                      onClick={() => {
                        setPopupTab('collection');
                        setEditingExpenseId(null);
                        setExpenseForm({ date: popupDate, description: '', amount: '' });
                      }} 
                      className={`flex-1 py-4 text-sm font-bold text-center transition-colors ${popupTab === 'collection' ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                      Online Collection
                    </button>
                  </div>

                  <div className="p-6">
                    {popupTab === 'expense' ? (
                      <form onSubmit={handleAddExpense} className="space-y-4 animate-in fade-in zoom-in duration-200">
                        <div className="form-date-picker">
                          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Date</label>
                          <DatePicker 
                            selected={expenseForm.date} 
                            onChange={(date) => { setExpenseForm({ ...expenseForm, date }); }} 
                            dateFormat="dd MMM yyyy" 
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
                        
                        {editingExpenseId ? (
                          <div className="flex gap-3 mt-2">
                            <button type="button" onClick={() => { setEditingExpenseId(null); setExpenseForm({ date: popupDate, description: '', amount: '' }); }} className="flex-1 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium py-2.5 rounded-xl hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors">Cancel</button>
                            <button type="submit" disabled={isSubmitting} className="flex-1 bg-blue-600 text-white font-medium py-2.5 rounded-xl hover:bg-blue-700 transition-colors">Update Expense</button>
                          </div>
                        ) : (
                          <button type="submit" disabled={isSubmitting} className="w-full mt-2 bg-red-600 text-white font-medium py-2.5 rounded-xl hover:bg-red-700 transition-colors flex items-center justify-center gap-2"><Plus size={18}/> Add Expense</button>
                        )}
                      </form>
                    ) : (
                      <form onSubmit={handleAddCollection} className="space-y-4 animate-in fade-in zoom-in duration-200">
                        <div className="form-date-picker">
                          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Date</label>
                          <DatePicker 
                            selected={collectionForm.date} 
                            onChange={(date) => { setCollectionForm({ ...collectionForm, date }); }} 
                            dateFormat="dd MMM yyyy" 
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

                        {editingCollectionId ? (
                          <div className="flex gap-3 mt-2">
                            <button type="button" onClick={() => { setEditingCollectionId(null); setCollectionForm({ date: popupDate, description: 'Transferred to Bank', amount: '', mode: 'UPI/Bank' }); }} className="flex-1 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium py-2.5 rounded-xl hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors">Cancel</button>
                            <button type="submit" disabled={isSubmitting} className="flex-1 bg-blue-600 text-white font-medium py-2.5 rounded-xl hover:bg-blue-700 transition-colors">Update Collection</button>
                          </div>
                        ) : (
                          <button type="submit" disabled={isSubmitting} className="w-full mt-2 bg-indigo-600 text-white font-medium py-2.5 rounded-xl hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"><ArrowDownCircle size={18} /> Record Collection</button>
                        )}
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
                          <th className="px-4 py-4 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {(popupTab === 'expense' ? expenses : collections).length === 0 ? (
                          <tr><td colSpan={popupTab === 'collection' ? 4 : 3} className="px-6 py-12 text-center text-slate-400">No records found for selected date.</td></tr>
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
                              <td className="px-4 py-4 text-center">
                                <div className="flex justify-center gap-2">
                                  <button onClick={() => popupTab === 'expense' ? editExpense(row) : editCollection(row)} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"><Edit2 size={16} /></button>
                                  <button onClick={() => popupTab === 'expense' ? openDeleteExpense(row.id) : openDeleteCollection(row.id)} className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"><Trash2 size={16} /></button>
                                </div>
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