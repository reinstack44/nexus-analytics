import { useState, useEffect, useRef, forwardRef, useCallback, useMemo } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { Package, Calendar, Save, Calculator, AlertCircle, CheckCircle2, GripVertical, ChevronDown, Landmark, Plus, ArrowDownCircle, Receipt, X, Sigma, IndianRupee, Edit2, Trash2, Coffee, CalendarOff, Info, Lock, ArrowRightLeft } from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

const formatDisplayDate = (dateObj) => {
  if (!dateObj) return '';
  const d = new Date(dateObj);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

const CustomDateInput = forwardRef(({ value, onClick, placeholder }, ref) => (
  <button type="button" onClick={onClick} ref={ref} className="flex items-center justify-between px-3 py-2 h-10.5 w-40 sm:w-44 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-all duration-200 text-sm font-bold text-slate-700 dark:text-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 whitespace-nowrap">
    <div className="flex items-center overflow-hidden">
      <Calendar size={16} className="text-blue-500 mr-2 shrink-0" />
      <span className="truncate">{value || placeholder}</span>
    </div>
    <ChevronDown size={14} className="text-slate-400 dark:text-slate-500 ml-2 shrink-0" />
  </button>
));
CustomDateInput.displayName = "CustomDateInput";

const FormDateInput = forwardRef(({ value, onClick, className }, ref) => (
  <button type="button" onClick={onClick} ref={ref} className={`${className} flex justify-between items-center text-left h-10.5`}>
    <span>{value}</span>
    <Calendar size={16} className="text-slate-400" />
  </button>
));
FormDateInput.displayName = "FormDateInput";

const formatRs = (num) => '₹' + (num || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Scales historical queue batches proportionally when opening stock is manually altered to ensure mathematical FIFO integrity
const scaleStartingBatches = (batches, targetBaseOpening, carriedPrice, carriedMrp) => {
  const currentSum = batches.reduce((acc, b) => acc + b.qty, 0);
  if (currentSum === targetBaseOpening) return batches;
  if (targetBaseOpening <= 0) return [];
  if (currentSum === 0) {
    return [{ qty: targetBaseOpening, price: carriedPrice, mrp: carriedMrp }];
  }
  const result = batches.map(b => ({ ...b }));
  const scale = targetBaseOpening / currentSum;
  let runningSum = 0;
  for (let i = 0; i < result.length; i++) {
    if (i === result.length - 1) {
      result[i].qty = targetBaseOpening - runningSum;
    } else {
      result[i].qty = Math.round(result[i].qty * scale);
      runningSum += result[i].qty;
    }
  }
  return result.filter(b => b.qty > 0);
};

const recalculateRow = (row) => {
  let sQty = 0; let sAmt = 0; let sMrpAmt = 0;
  let cAmt = 0; let cMrpAmt = 0;

  let queue = Array.isArray(row.starting_batches) ? row.starting_batches.map(b => ({...b})) : [];
  
  if (parseInt(row.purchase_qty) > 0) {
    queue.push({
      qty: parseInt(row.purchase_qty),
      price: parseFloat(row.purchase_price) || 0,
      mrp: parseFloat(row.purchase_mrp) || 0
    });
  }

  if (row.closing_balance !== '') {
    sQty = Math.max(0, parseInt(row.opening_balance) - parseInt(row.closing_balance));
    let salesRemaining = sQty;

    while (salesRemaining > 0 && queue.length > 0) {
      if (queue[0].qty <= salesRemaining) {
        sAmt += queue[0].qty * queue[0].price;
        sMrpAmt += queue[0].qty * queue[0].mrp;
        salesRemaining -= queue[0].qty;
        queue.shift(); 
      } else {
        sAmt += salesRemaining * queue[0].price;
        sMrpAmt += salesRemaining * queue[0].mrp;
        queue[0].qty -= salesRemaining; 
        salesRemaining = 0;
      }
    }

    // Safety Fallback: Handle physical discrepancies if logged sales exceed the calculations queue
    if (salesRemaining > 0) {
      sAmt += salesRemaining * (parseFloat(row.carried_price) || parseFloat(row.selling_price) || 0);
      sMrpAmt += salesRemaining * (parseFloat(row.carried_mrp) || parseFloat(row.mrp_price) || 0);
    }
  }

  queue.forEach(b => {
    cAmt += b.qty * b.price;
    cMrpAmt += b.qty * b.mrp;
  });

  return { 
    ...row, 
    sales_qty: sQty, 
    sales_amount: sAmt, 
    sales_mrp_amount: sMrpAmt,
    closing_amount: cAmt,
    closing_mrp_amount: cMrpAmt,
    ending_batches: queue
  };
};

export default function DailyStock() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0); 
  const [isDirty, setIsDirty] = useState(false); 

  // Store isDirty status in a mutable ref to safely handle realtime database checks 
  // without repeatedly mounting and unmounting the subscription channel
  const isDirtyRef = useRef(false);
  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  // Safe Timezone Date Formatter (Prevents DST shifts)
  const formatDateForDB = useCallback((dateObj) => {
    if (!dateObj) return '';
    const d = new Date(dateObj);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  const [startDate, setStartDate] = useState(() => {
    const saved = sessionStorage.getItem('dailyStock_startDate');
    return saved ? new Date(saved) : new Date();
  });
  const [endDate, setEndDate] = useState(() => {
    const saved = sessionStorage.getItem('dailyStock_endDate');
    return saved ? new Date(saved) : new Date();
  });

  useEffect(() => {
    if (startDate) sessionStorage.setItem('dailyStock_startDate', startDate.toISOString());
    if (endDate) sessionStorage.setItem('dailyStock_endDate', endDate.toISOString());
  }, [startDate, endDate]);

  const [stockRows, setStockRows] = useState([]);
  const [dailySummary, setDailySummary] = useState({ totalSalesQty: 0, totalRevenue: 0, totalExpenses: 0, totalCollections: 0, totalMrpRevenue: 0 });

  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', isDanger: false, onConfirm: null });
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '' });
  const [holidayModal, setHolidayModal] = useState({ isOpen: false, date: null, dateStr: '' });
  const closeConfirm = () => setConfirmModal({ ...confirmModal, isOpen: false });
  const closeAlert = () => setAlertModal({ ...alertModal, isOpen: false });

  const handleCancelHolidayFromModal = async (dateStr) => {
    setIsSaving(true);
    await supabase.from('holidays').delete().eq('user_id', user.id).eq('date', dateStr);
    await supabase.from('daily_stock').delete().eq('user_id', user.id).eq('date', dateStr);
    setHolidayModal({ isOpen: false, date: null, dateStr: '' });
    setRefreshTrigger(prev => prev + 1);
    setIsSaving(false);
  };

  const [pipelineWarning, setPipelineWarning] = useState(null);
  const [customRangeMode, setCustomRangeMode] = useState(false);

  const [markedHolidays, setMarkedHolidays] = useState([]);
  const [filledDates, setFilledDates] = useState([]);
  const [lockedRanges, setLockedRanges] = useState([]); 

  const normalizeDateStr = useCallback((dStr) => {
    if (!dStr) return '';
    if (typeof dStr !== 'string') return '';
    if (dStr.includes('T')) {
      return dStr.split('T')[0];
    }
    return dStr;
  }, []);

  const getDatesInRange = useCallback((start, end) => {
    const dates = [];
    let current = new Date(start);
    const last = new Date(end || start);
    current.setHours(0,0,0,0); last.setHours(0,0,0,0);
    while (current <= last) { dates.push(formatDateForDB(current)); current.setDate(current.getDate() + 1); }
    return dates;
  }, [formatDateForDB]);

  const selectedDates = useMemo(() => getDatesInRange(startDate, endDate), [startDate, endDate, getDatesInRange]);
  const isMultiDayRange = startDate && endDate && formatDateForDB(startDate) !== formatDateForDB(endDate);
  
  const isHolidaySelected = isMultiDayRange 
    ? selectedDates.every(d => markedHolidays.includes(d)) 
    : selectedDates.some(d => markedHolidays.includes(d));
  
  const isAnyDateFilled = stockRows.some(row => row.closing_balance !== '' && row.closing_balance !== null);

  const getRedirectedDate = useCallback((date) => {
    if (!date) return null;
    const dateStr = formatDateForDB(date);
    const matchedRange = lockedRanges.find(r => dateStr >= r.start_date && dateStr <= r.end_date);
    if (matchedRange) {
      const parts = matchedRange.end_date.split('-');
      return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    }
    return date;
  }, [lockedRanges, formatDateForDB]);

  const isCurrentSelectionARangeEnd = useMemo(() => {
    const endStr = formatDateForDB(endDate || startDate);
    return lockedRanges.some(r => r.end_date === endStr);
  }, [lockedRanges, startDate, endDate, formatDateForDB]);

  const handleResetRangeData = async () => {
    const activeEndStr = formatDateForDB(endDate || startDate);
    const matchedRange = lockedRanges.find(r => r.end_date === activeEndStr);
    const rangeStartStr = matchedRange ? matchedRange.start_date : activeEndStr;
    const rangeEndStr = matchedRange ? matchedRange.end_date : activeEndStr;
    const [startYear, startMonth, startDay] = rangeStartStr.split('-').map(Number);
    const trueStartObj = new Date(startYear, startMonth - 1, startDay);

    setConfirmModal({
      isOpen: true,
      title: 'Unlock & Split Combined Range?',
      message: `Are you sure you want to split this combined block? This will permanently DELETE all recorded ledger values from ${formatDisplayDate(trueStartObj)} to ${formatDisplayDate(endDate || startDate)} (including closing balances) from the database, unlocking these dates so you can fill them individually day-by-day.`,
      isDanger: true,
      onConfirm: async () => {
        setIsSaving(true);
        closeConfirm();
        try {
          await supabase.from('locked_ranges').delete().eq('user_id', user.id).eq('start_date', rangeStartStr).eq('end_date', rangeEndStr);
          await supabase.from('daily_stock').delete().eq('user_id', user.id).gte('date', rangeStartStr).lte('date', rangeEndStr);
          setLockedRanges(prev => prev.filter(r => !(r.start_date === rangeStartStr && r.end_date === rangeEndStr)));
          setFilledDates(prev => prev.filter(d => !(d >= rangeStartStr && d <= rangeEndStr)));
          setStartDate(trueStartObj);
          setEndDate(trueStartObj);
          setSaveMessage({ type: 'success', text: 'Combined range successfully split. All intermediate days unlocked.' });
          setRefreshTrigger(prev => prev + 1);
          setIsDirty(false);
        } catch (err) {
          setAlertModal({ isOpen: true, title: "Split Range Failed", message: err.message });
        } finally {
          setIsSaving(false);
        }
      }
    });
  };

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isDirtyRef.current && !isSaving && !isSubmitting) {
        setRefreshTrigger(prev => prev + 1);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [isSaving, isSubmitting]);

  // Realtime Database Sync Configuration
  useEffect(() => {
    const channel = supabase
      .channel('dailystock-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_stock' }, () => { if(!isDirtyRef.current) setRefreshTrigger(prev => prev + 1); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => { if(!isDirtyRef.current) setRefreshTrigger(prev => prev + 1); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'owner_withdrawals' }, () => { if(!isDirtyRef.current) setRefreshTrigger(prev => prev + 1); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'brands' }, () => { if(!isDirtyRef.current) setRefreshTrigger(prev => prev + 1); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'locked_ranges' }, () => { if(!isDirtyRef.current) setRefreshTrigger(prev => prev + 1); })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchCloudPreferences = async () => {
      if (!user) return;
      const [
        { data: holidayData },
        { data: filledData },
        { data: rangeData }
      ] = await Promise.all([
        supabase.from('holidays').select('date').eq('user_id', user.id),
        supabase.from('daily_stock').select('date').eq('user_id', user.id).not('closing_balance', 'is', null),
        supabase.from('locked_ranges').select('start_date, end_date').eq('user_id', user.id)
      ]);
      
      if (isMounted) {
        if (holidayData) setMarkedHolidays(holidayData.map(h => h.date));
        if (filledData) setFilledDates([...new Set(filledData.map(d => d.date))].sort());
        if (rangeData) setLockedRanges(rangeData);
      }
    };
    fetchCloudPreferences();
    return () => { isMounted = false; };
  }, [user, refreshTrigger]);

  const handleStartDateChange = (date) => {
    const redirected = getRedirectedDate(date);
    const dateStr = formatDateForDB(redirected || date);
    if (!customRangeMode) {
      if (markedHolidays.includes(dateStr)) {
        setHolidayModal({ isOpen: true, date: redirected || date, dateStr });
        return;
      }
    }
    setStartDate(redirected || date);
    setEndDate(redirected || date); 
    setIsDirty(false);
  };

  const handleEndDateChange = (date) => {
    const redirected = getRedirectedDate(date);
    const dateStr = formatDateForDB(redirected || date);
    if (!customRangeMode) {
      if (markedHolidays.includes(dateStr)) {
        setHolidayModal({ isOpen: true, date: redirected || date, dateStr });
        return;
      }
      if ((redirected || date) < startDate) {
        setAlertModal({ isOpen: true, title: "Invalid Selection", message: "End date must fall on or after the start date." });
        return;
      }
      if (formatDateForDB(redirected || date) !== formatDateForDB(startDate)) {
        const range = getDatesInRange(startDate, redirected || date);
        if (range.some(d => markedHolidays.includes(d))) {
          setAlertModal({ isOpen: true, title: "Overlaps Holiday", message: "Selected block contains declared holidays. Range selection blocked." });
          return;
        }
        const rangeToCheck = range.slice(0, -1);
        if (rangeToCheck.some(d => filledDates.includes(d))) {
          setAlertModal({ isOpen: true, title: "Overlaps Existing Entries", message: "Selected range overlaps with previously saved daily stock records. Range selection blocked." });
          return;
        }
      }
    }
    setEndDate(redirected || date);
    setIsDirty(false);
  };

  const [purchaseModal, setPurchaseModal] = useState({ isOpen: false, brand: null, qty: '', price: '', mrp: '', isPriceChanged: false, isMrpChanged: false });
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
  const prevDatesRef = useRef({ start: null, end: null });
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    let isMounted = true;
    const fetchDailyData = async () => {
      await Promise.resolve(); 
      if (!isMounted) return;

      const startStr = formatDateForDB(startDate);
      const endStr = endDate ? formatDateForDB(endDate) : startStr;
      const datesChanged = prevDatesRef.current.start !== startStr || prevDatesRef.current.end !== endStr;
      if (datesChanged || !hasLoadedRef.current) {
        setLoading(true);
      }
      prevDatesRef.current = { start: startStr, end: endStr };
      setSaveMessage(null);
      setPipelineWarning(null);

      let targetPrevDate = new Date(startDate);
      targetPrevDate.setDate(targetPrevDate.getDate() - 1);
      while (markedHolidays.includes(formatDateForDB(targetPrevDate))) {
          targetPrevDate.setDate(targetPrevDate.getDate() - 1);
      }
      const prevDateStr = formatDateForDB(targetPrevDate);

      if (!customRangeMode) {
        const { data: pData } = await supabase.from('daily_stock').select('closing_balance').eq('date', prevDateStr);
        if (pData && pData.length > 0 && pData.some(r => r.closing_balance === null)) {
            setPipelineWarning(prevDateStr);
        }
      }

      const [
        { data: brandsData },
        { data: allHistoricalStock },
        { data: expData },
        { data: collData }
      ] = await Promise.all([
        supabase.from('brands').select('id, brand_name, bottle_size, selling_price, mrp_price').order('display_order', { ascending: true }).order('brand_name', { ascending: true }),
        supabase.from('daily_stock').select('date, brand_id, opening_balance, closing_balance, unit_price, unit_mrp').eq('user_id', user.id).lte('date', endStr).order('date', { ascending: true }).limit(50000),
        supabase.from('expenses').select('amount').eq('user_id', user.id).gte('date', startStr).lte('date', endStr),
        supabase.from('owner_withdrawals').select('amount').eq('user_id', user.id).gte('date', startStr).lte('date', endStr)
      ]);

      if (!isMounted) return;

      let tExp = 0; if (expData) expData.forEach(e => tExp += parseFloat(e.amount));
      let tColl = 0; if (collData) collData.forEach(c => tColl += parseFloat(c.amount));

      if (brandsData) {
        const brandBatches = {};
        const prevClosing = {};
        const lastActivePrice = {}; 
        const lastActiveMrp = {};   
        const targetStart = normalizeDateStr(startStr);

        allHistoricalStock?.forEach(s => {
            const logDate = normalizeDateStr(s.date);
            if (logDate < targetStart) {
                let queue = brandBatches[s.brand_id] || [];
                const brand = brandsData.find(b => b.id === s.brand_id);
                if (!brand) return;

                if (s.unit_price !== undefined && s.unit_price !== null && parseFloat(s.unit_price) > 0) {
                    if (parseFloat(s.unit_price) !== parseFloat(brand.selling_price)) {
                        lastActivePrice[s.brand_id] = parseFloat(s.unit_price);
                    } else if (lastActivePrice[s.brand_id] === undefined) {
                        lastActivePrice[s.brand_id] = parseFloat(s.unit_price);
                    }
                }
                if (s.unit_mrp !== undefined && s.unit_mrp !== null && parseFloat(s.unit_mrp) > 0) {
                    if (parseFloat(s.unit_mrp) !== parseFloat(brand.mrp_price)) {
                        lastActiveMrp[s.brand_id] = parseFloat(s.unit_mrp);
                    } else if (lastActiveMrp[s.brand_id] === undefined) {
                        lastActiveMrp[s.brand_id] = parseFloat(s.unit_mrp);
                    }
                }

                const opBal = parseInt(s.opening_balance) || 0;
                const pQty = Math.max(0, opBal - (prevClosing[s.brand_id] || 0));
                
                const pPrice = parseFloat(s.unit_price) || lastActivePrice[s.brand_id] || parseFloat(brand.selling_price) || 0;
                const pMrp = parseFloat(s.unit_mrp) || lastActiveMrp[s.brand_id] || parseFloat(brand.mrp_price) || 0;

                if (pQty > 0) {
                    queue.push({ qty: pQty, price: pPrice, mrp: pMrp });
                }

                const clBal = s.closing_balance !== null ? parseInt(s.closing_balance) : null;
                if (clBal !== null) {
                    let sales = Math.max(0, opBal - clBal);
                    while (sales > 0 && queue.length > 0) {
                        if (queue[0].qty <= sales) {
                            sales -= queue[0].qty;
                            queue.shift();
                        } else {
                            queue[0].qty -= sales;
                            sales = 0;
                        }
                    }
                    prevClosing[s.brand_id] = clBal;
                } else {
                    prevClosing[s.brand_id] = opBal;
                }
                brandBatches[s.brand_id] = queue;
            }
        });

        const rows = brandsData.map(brand => {
          const starting_batches = brandBatches[brand.id] || [];
          const baseOpening = starting_batches.reduce((acc, b) => acc + b.qty, 0);
          
          let carriedPrice = parseFloat(brand.selling_price) || 0;
          if (lastActivePrice[brand.id] !== undefined && lastActivePrice[brand.id] > 0) {
            carriedPrice = lastActivePrice[brand.id];
          } else if (starting_batches.length > 0) {
            carriedPrice = starting_batches[0].price;
          }
            
          let carriedMrp = parseFloat(brand.mrp_price) || 0;
          if (lastActiveMrp[brand.id] !== undefined && lastActiveMrp[brand.id] > 0) {
            carriedMrp = lastActiveMrp[brand.id];
          } else if (starting_batches.length > 0) {
            carriedMrp = starting_batches[0].mrp;
          }

          const brandRangeLogs = allHistoricalStock?.filter(s => s.brand_id === brand.id && normalizeDateStr(s.date) >= targetStart && normalizeDateStr(s.date) <= normalizeDateStr(endStr)) || [];
          const exactRecord = !isMultiDayRange ? brandRangeLogs.find(log => normalizeDateStr(log.date) === targetStart) : null;
          
          if (exactRecord) {
            const opBal = parseInt(exactRecord.opening_balance) || 0;
          const clBal = exactRecord.closing_balance !== null ? parseInt(exactRecord.closing_balance) : '';
          const pQty = Math.max(0, opBal - baseOpening);
          
          // Air-tight historical isolation: If a record already exists, use its stored values directly 
          // to prevent future BrandMaster edits or subsequent updates from cascading backwards.
          const pPrice = (exactRecord.unit_price !== null && parseFloat(exactRecord.unit_price) > 0)
            ? parseFloat(exactRecord.unit_price)
            : carriedPrice;
          const pMrp = (exactRecord.unit_mrp !== null && parseFloat(exactRecord.unit_mrp) > 0)
            ? parseFloat(exactRecord.unit_mrp)
            : carriedMrp;

            let initialRow = { 
              brand_id: brand.id, 
              brand_name: brand.brand_name, 
              bottle_size: brand.bottle_size, 
              selling_price: brand.selling_price, 
              mrp_price: brand.mrp_price,
              carried_price: carriedPrice, 
              carried_mrp: carriedMrp,
              purchase_price: pPrice, 
              purchase_mrp: pMrp,
              base_opening: baseOpening, 
              purchase_qty: pQty, 
              opening_balance: opBal, 
              closing_balance: clBal === '' ? '' : String(clBal),
              starting_batches: starting_batches
            };

            return recalculateRow(initialRow);
          }

          let totalPurchasesQty = 0;
          let latestUnitPrice = carriedPrice;
          let latestUnitMrp = carriedMrp;
          let currentPrevClosing = baseOpening;
          
          brandRangeLogs.forEach(log => {
             const opBal = parseInt(log.opening_balance) || 0;
             const pQty = Math.max(0, opBal - currentPrevClosing);
             totalPurchasesQty += pQty;
             
             if (pQty > 0) {
                if (log.unit_price) latestUnitPrice = parseFloat(log.unit_price);
                if (log.unit_mrp) latestUnitMrp = parseFloat(log.unit_mrp);
             }
             if (log.closing_balance !== null) {
                 currentPrevClosing = parseInt(log.closing_balance);
             } else {
                 currentPrevClosing = opBal;
             }
          });

          const finalClosing = brandRangeLogs.length > 0 && brandRangeLogs[brandRangeLogs.length - 1].closing_balance !== null 
            ? String(brandRangeLogs[brandRangeLogs.length - 1].closing_balance) 
            : '';

          let initialRow = { 
            brand_id: brand.id, 
            brand_name: brand.brand_name, 
            bottle_size: brand.bottle_size, 
            selling_price: brand.selling_price, 
            mrp_price: brand.mrp_price,
            carried_price: carriedPrice, 
            carried_mrp: carriedMrp,
            purchase_price: latestUnitPrice, 
            purchase_mrp: latestUnitMrp,
            base_opening: baseOpening, 
            purchase_qty: totalPurchasesQty, 
            opening_balance: baseOpening + totalPurchasesQty, 
            closing_balance: finalClosing,
            starting_batches: starting_batches
          };

          return recalculateRow(initialRow);
        });

        let tQty = 0; let tRev = 0; let tMrpRev = 0;
        rows.forEach(r => { 
          if (r.closing_balance !== '') {
            tQty += r.sales_qty; 
            tRev += r.sales_amount; 
            tMrpRev += r.sales_mrp_amount;
          }
        });

        setStockRows(rows);
        hasLoadedRef.current = true;
        setDailySummary({ totalSalesQty: tQty, totalRevenue: tRev, totalExpenses: tExp, totalCollections: tColl, totalMrpRevenue: tMrpRev });
      }
      setLoading(false);
    };
    
    if (!isHolidaySelected) {
      fetchDailyData();
    } else {
      setTimeout(() => { if (isMounted) setLoading(false); }, 0);
    }
    return () => { isMounted = false; };
  }, [startDate, endDate, isHolidaySelected, refreshTrigger, markedHolidays, user, customRangeMode, formatDateForDB, normalizeDateStr, isMultiDayRange]);

  const fetchPopupData = async (dateToFetch) => {
    const dateStr = formatDateForDB(dateToFetch);
    const { data: expData } = await supabase.from('expenses').select('*').eq('user_id', user.id).eq('date', dateStr).order('created_at', { ascending: false });
    const { data: collData } = await supabase.from('owner_withdrawals').select('*').eq('user_id', user.id).eq('date', dateStr).order('created_at', { ascending: false });
    if (expData) setExpenses(expData);
    if (collData) setCollections(collData);
  };

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      if (!isBankDepositOpen) return;
      const dateToFetch = popupTab === 'expense' ? expenseForm.date : collectionForm.date;
      const dateStr = formatDateForDB(dateToFetch);
      const { data: expData } = await supabase.from('expenses').select('*').eq('user_id', user.id).eq('date', dateStr).order('created_at', { ascending: false });
      const { data: collData } = await supabase.from('owner_withdrawals').select('*').eq('user_id', user.id).eq('date', dateStr).order('created_at', { ascending: false });
      if (isMounted) {
        if (expData) setExpenses(expData);
        if (collData) setCollections(collData);
      }
    };
    loadData();
    return () => { isMounted = false; };
  }, [isBankDepositOpen, popupTab, expenseForm.date, collectionForm.date, user.id, formatDateForDB]);

  const handleOpenBankDeposit = () => {
    setIsBankDepositOpen(true);
    setPopupDate(endDate || startDate);
    setExpenseForm(prev => ({ ...prev, date: endDate || startDate }));
    setCollectionForm(prev => ({ ...prev, date: endDate || startDate }));
    setEditingExpenseId(null);
    setEditingCollectionId(null);
  };

  const openHolidayConfirm = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Declare as Holiday?',
      message: 'Marking this period as a holiday will automatically carry forward opening stock and lock transactions.',
      isDanger: false,
      onConfirm: async () => {
        setIsSaving(true);
        const holidayUpserts = selectedDates.map(dateStr => ({ user_id: user.id, date: dateStr }));
        await supabase.from('holidays').upsert(holidayUpserts, { onConflict: 'user_id, date' });

        const holidayRows = stockRows.map(row => {
          let updatedRow = { ...row, purchase_qty: 0, closing_balance: row.opening_balance };
          updatedRow = recalculateRow(updatedRow);
          return updatedRow;
        });
        
        setStockRows(holidayRows);
        setDailySummary(prev => ({ ...prev, totalSalesQty: 0, totalRevenue: 0, totalMrpRevenue: 0 }));

        try {
          const upsertPromises = selectedDates.map(dateStr => {
             const upsertData = holidayRows.map(row => ({
                user_id: user.id, date: dateStr, brand_id: row.brand_id,
                opening_balance: parseInt(row.opening_balance) || 0,
                closing_balance: parseInt(row.closing_balance) || 0,
                unit_price: parseFloat(row.purchase_price) || 0,
                unit_mrp: parseFloat(row.purchase_mrp) || 0
             }));
             return supabase.from('daily_stock').upsert(upsertData, { onConflict: 'date, brand_id, user_id' });
          });
          await Promise.all(upsertPromises);
        } catch (error) { console.error("Holiday Save Error:", error); }

        setRefreshTrigger(prev => prev + 1);
        setIsSaving(false);
        setIsDirty(false);
        closeConfirm();
      }
    });
  };

  const handleRemoveHoliday = async () => {
    setIsSaving(true);
    await supabase.from('holidays').delete().eq('user_id', user.id).in('date', selectedDates);
    await supabase.from('daily_stock').delete().eq('user_id', user.id).in('date', selectedDates);
    setRefreshTrigger(prev => prev + 1); 
    setIsSaving(false);
    setIsDirty(false);
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
    } catch (error) { console.error("Error saving layout hierarchy:", error); }
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const handleInputChange = (brandId, field, value) => {
    setIsDirty(true);
    const numericValue = value === '' ? '' : parseInt(value) || 0;

    setStockRows(prevRows => {
      const updatedRows = prevRows.map(row => {
        if (row.brand_id === brandId) {
          let updatedRow = { ...row, [field]: numericValue };
          if (field === 'purchase_qty') {
            const currentPurchase = value === '' ? 0 : parseInt(value) || 0;
            updatedRow.opening_balance = updatedRow.base_opening + currentPurchase;
          } else if (field === 'opening_balance') {
            const targetBaseOpening = Math.max(0, numericValue - (parseInt(row.purchase_qty) || 0));
            updatedRow.base_opening = targetBaseOpening;
            updatedRow.starting_batches = scaleStartingBatches(row.starting_batches, targetBaseOpening, row.carried_price, row.carried_mrp);
          }
          updatedRow = recalculateRow(updatedRow);
          return updatedRow;
        }
        return row;
      });

      let tQty = 0; let tRev = 0; let tMrpRev = 0;
      updatedRows.forEach(r => { 
        if (r.closing_balance !== '') {
          tQty += r.sales_qty; 
          tRev += r.sales_amount; 
          tMrpRev += r.sales_mrp_amount;
        }
      });
      setDailySummary(prev => ({ ...prev, totalSalesQty: tQty, totalRevenue: tRev, totalMrpRevenue: tMrpRev }));
      return updatedRows;
    });
  };

  const openPurchaseModal = (row) => {
    const isPriceChanged = row.purchase_qty > 0 && row.purchase_price !== row.carried_price;
    const isMrpChanged = row.purchase_qty > 0 && row.purchase_mrp !== row.carried_mrp;
    setPurchaseModal({ 
      isOpen: true, 
      brand: row, 
      qty: row.purchase_qty || '', 
      price: row.purchase_price || row.carried_price, 
      mrp: row.purchase_mrp || row.carried_mrp || row.mrp_price || 0,
      isPriceChanged,
      isMrpChanged
    });
  };

  const handlePurchaseSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    
    const newQty = parseInt(purchaseModal.qty) || 0;
    const newPrice = parseFloat(purchaseModal.price) || purchaseModal.brand.carried_price;
    const newMrp = parseFloat(purchaseModal.mrp) || purchaseModal.brand.carried_mrp;
    const targetDateStr = formatDateForDB(endDate || startDate);

    try {
      const targetRow = stockRows.find(row => row.brand_id === purchaseModal.brand.brand_id);
      if (!targetRow) return;

      const newOpeningBalance = targetRow.base_opening + newQty;
      const currentClosing = targetRow.closing_balance === '' ? null : parseInt(targetRow.closing_balance);

      const upsertData = {
        user_id: user.id,
        date: targetDateStr,
        brand_id: purchaseModal.brand.brand_id,
        opening_balance: newOpeningBalance,
        closing_balance: currentClosing,
        unit_price: newPrice,
        unit_mrp: newMrp
      };

      const { error: upsertError } = await supabase
        .from('daily_stock')
        .upsert([upsertData], { onConflict: 'date, brand_id, user_id' });

      if (upsertError) throw upsertError;

      // Log to price history only if the new purchase price actually differs from the prior carried operational price
      if (newQty > 0 && newPrice > 0 && newPrice !== parseFloat(targetRow.carried_price)) {
        await supabase.from('brand_price_history').insert([{
          brand_id: targetRow.brand_id,
          user_id: user.id,
          old_price: parseFloat(targetRow.carried_price),
          new_price: newPrice,
          effective_date: targetDateStr
        }]);
      }

      setStockRows(prevRows => {
        const updatedRows = prevRows.map(row => {
          if (row.brand_id === purchaseModal.brand.brand_id) {
            let updatedRow = { 
              ...row, 
              purchase_qty: newQty, 
              purchase_price: newPrice, 
              purchase_mrp: newMrp,
              opening_balance: newOpeningBalance 
            };
            updatedRow = recalculateRow(updatedRow);
            return updatedRow;
          }
          return row;
        });

        let tQty = 0; let tRev = 0; let tMrpRev = 0;
        updatedRows.forEach(r => { 
          if (r.closing_balance !== '') {
            tQty += r.sales_qty; 
            tRev += r.sales_amount; 
            tMrpRev += r.sales_mrp_amount;
          }
        });
        setDailySummary(prev => ({ ...prev, totalSalesQty: tQty, totalRevenue: tRev, totalMrpRevenue: tMrpRev }));
        return updatedRows;
      });

      setRefreshTrigger(prev => prev + 1);
      setIsDirty(false);
    } catch (err) {
      setAlertModal({ isOpen: true, title: "Reconciliation Failed", message: err.message });
    } finally {
      setIsSaving(false);
      setPurchaseModal({ isOpen: false, brand: null, qty: '', price: '', mrp: '', isPriceChanged: false, isMrpChanged: false });
    }
  };

  const handleSaveStock = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    const startStr = formatDateForDB(startDate);
    const endStr = formatDateForDB(endDate || startDate);

    try {
      if (isMultiDayRange) {
        await supabase
          .from('locked_ranges')
          .upsert([{ user_id: user.id, start_date: startStr, end_date: endStr }], { onConflict: 'user_id, start_date, end_date' });

        for (let i = 0; i < selectedDates.length; i++) {
          const dateStr = selectedDates[i];
          const isLastDay = i === selectedDates.length - 1;

          const upsertBatch = stockRows.map(row => {
            const op = parseInt(row.opening_balance) || 0;
            const pQty = parseInt(row.purchase_qty) || 0;
            const cl = isLastDay 
              ? (row.closing_balance === '' ? null : parseInt(row.closing_balance)) 
              : (op + pQty);

            return {
              user_id: user.id,
              date: dateStr,
              brand_id: row.brand_id,
              opening_balance: op,
              closing_balance: cl,
              unit_price: parseFloat(row.purchase_price) || parseFloat(row.carried_price) || parseFloat(row.selling_price) || 0,
              unit_mrp: parseFloat(row.purchase_mrp) || parseFloat(row.carried_mrp) || parseFloat(row.mrp_price) || 0
            };
          });

          await supabase.from('daily_stock').upsert(upsertBatch, { onConflict: 'date, brand_id, user_id' });
        }
      } else {
        const upsertData = stockRows.map(row => ({
          user_id: user.id, 
          date: endStr, 
          brand_id: row.brand_id,
          opening_balance: parseInt(row.opening_balance) || 0,
          closing_balance: row.closing_balance === '' ? null : parseInt(row.closing_balance),
          unit_price: parseFloat(row.purchase_price) || parseFloat(row.carried_price) || parseFloat(row.selling_price) || 0,
          unit_mrp: parseFloat(row.purchase_mrp) || parseFloat(row.carried_mrp) || parseFloat(row.mrp_price) || 0
        }));

        const { error } = await supabase.from('daily_stock').upsert(upsertData, { onConflict: 'date, brand_id, user_id' });
        if (error) throw error;
      }

      const brandUpdates = stockRows.map(async (row) => {
        if (parseInt(row.purchase_qty) > 0) {
          const activePrice = parseFloat(row.purchase_price);
          // Compare against the dynamic carried prior operational price instead of static baseline
          if (activePrice > 0 && activePrice !== parseFloat(row.carried_price)) {
            await supabase.from('brand_price_history').insert([{
              brand_id: row.brand_id,
              user_id: user.id,
              old_price: parseFloat(row.carried_price),
              new_price: activePrice,
              effective_date: endStr
            }]);
          }
        }
      });
      await Promise.all(brandUpdates);

      setSaveMessage({ type: 'success', text: `Inventory metrics saved successfully!` });
      setTimeout(() => setSaveMessage(null), 3000);
      setRefreshTrigger(prev => prev + 1);
      setIsDirty(false);
    } catch (err) {
      setAlertModal({ isOpen: true, title: "Database Error", message: err.message });
    } finally {
      setIsSaving(false);
    }
  };

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
      isOpen: true, title: 'Delete Expense?', message: 'This transaction record will be permanently deleted.', isDanger: true,
      onConfirm: async () => {
        setIsSubmitting(true); 
        const { error } = await supabase.from('expenses').delete().eq('id', id); 
        if (!error) { fetchPopupData(expenseForm.date); setRefreshTrigger(prev => prev + 1); } 
        setIsSubmitting(false); closeConfirm();
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
      isOpen: true, title: 'Delete Entry?', message: 'This collection entry will be permanently removed.', isDanger: true,
      onConfirm: async () => {
        setIsSubmitting(true); 
        const { error } = await supabase.from('owner_withdrawals').delete().eq('id', id); 
        if (!error) { fetchPopupData(collectionForm.date); setRefreshTrigger(prev => prev + 1); } 
        setIsSubmitting(false); closeConfirm();
      }
    });
  };

  const tableTotalOpeningQty = stockRows.reduce((acc, row) => acc + (parseInt(row.opening_balance) || 0), 0);
  const tableTotalClosingQty = stockRows.reduce((acc, row) => acc + (parseInt(row.closing_balance) || 0), 0);

  const tableTotalOpeningAmount = stockRows.reduce((acc, row) => {
    const baseVal = row.starting_batches ? row.starting_batches.reduce((sum, b) => sum + (b.qty * b.price), 0) : 0;
    const purchaseVal = (parseInt(row.purchase_qty) || 0) * parseFloat(row.purchase_price || 0);
    return acc + baseVal + purchaseVal;
  }, 0);

  const tableTotalClosingAmount = stockRows.reduce((acc, row) => {
    if (row.closing_balance === '' || row.closing_balance === null) return acc;
    return acc + (row.closing_amount || 0);
  }, 0);

  const tableTotalOpeningMrpAmount = stockRows.reduce((acc, row) => {
    const baseVal = row.starting_batches ? row.starting_batches.reduce((sum, b) => sum + (b.qty * b.mrp), 0) : 0;
    const purchaseVal = (parseInt(row.purchase_qty) || 0) * parseFloat(row.purchase_mrp || 0);
    return acc + baseVal + purchaseVal;
  }, 0);

  const tableTotalClosingMrpAmount = stockRows.reduce((acc, row) => {
    if (row.closing_balance === '' || row.closing_balance === null) return acc;
    return acc + (row.closing_mrp_amount || 0);
  }, 0);

  const tableTotalMrpRevenue = stockRows.reduce((acc, row) => {
    if (row.closing_balance === '' || row.closing_balance === null) return acc;
    return acc + (row.sales_mrp_amount || 0);
  }, 0);

  const inputClass = "w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all duration-300 text-sm font-semibold";
  const numInputClass = "w-20 px-2 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all duration-300 text-sm text-center font-bold";

  const getDayClassName = (date) => {
    const dateStr = formatDateForDB(date);
    if (markedHolidays.includes(dateStr)) {
      return "react-datepicker__day--highlighted-holiday";
    }
    const isLockedRange = lockedRanges.some(r => dateStr >= r.start_date && dateStr <= r.end_date);
    if (isLockedRange) {
      return "react-datepicker__day--highlighted-combined";
    }
    if (filledDates.includes(dateStr)) {
      return "react-datepicker__day--highlighted-filled";
    }
    return "";
  };

  return (
    <div className="space-y-6 transition-colors duration-300 relative">
      
      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none !important; }
        .hide-scrollbar { -ms-overflow-style: none !important; scrollbar-width: none !important; }
        .form-date-picker .react-datepicker-wrapper { display: block; width: 100%; }
        .react-datepicker-popper { z-index: 99999 !important; }
        .react-datepicker { background-color: #ffffff !important; border: 1px solid #e2e8f0 !important; border-radius: 1rem !important; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1) !important; padding: 0.5rem !important; }
        .react-datepicker__month-select, .react-datepicker__year-select { background-color: #f8fafc !important; border: 1px solid #cbd5e1 !important; border-radius: 0.5rem !important; padding: 0.2rem 0.5rem !important; color: #1e293b !important; font-weight: 600 !important; cursor: pointer !important; outline: none !important; }
        .react-datepicker__month-container { background-color: #ffffff !important; }
        .react-datepicker__current-month { display: none !important; } 
        .react-datepicker__header__dropdown { margin-top: 5px; margin-bottom: 10px; display: flex; justify-content: center; gap: 8px; font-size: 0.95rem; }
        .react-datepicker__day-name { color: #64748b !important; font-weight: 600 !important; width: 2.25rem !important; margin: 0.1rem !important; }
        .react-datepicker__day { color: #334155 !important; border-radius: 0.5rem !important; width: 2.25rem !important; line-height: 2.25rem !important; transition: all 0.2s ease !important; margin: 0.1rem !important; }
        .react-datepicker__day:hover { background-color: #f1f5f9 !important; color: #0f172a !important; }
        .react-datepicker__day--selected, .react-datepicker__day--keyboard-selected { background-color: #3b82f6 !important; color: #ffffff !important; font-weight: bold !important; }
        .react-datepicker__triangle { display: none !important; }
        
        /* State Indicators */
        .react-datepicker__day--highlighted-holiday { background-color: #f97316 !important; color: #ffffff !important; font-weight: bold !important; border-radius: 0.5rem !important; }
        .react-datepicker__day--highlighted-filled { background-color: #10b981 !important; color: #ffffff !important; font-weight: bold !important; border-radius: 0.5rem !important; }
        .react-datepicker__day--highlighted-combined { background-color: #6366f1 !important; color: #ffffff !important; font-weight: bold !important; border-radius: 0.5rem !important; }
        
        .react-datepicker__day--in-range {
          background-color: #dbeafe !important;
          color: #1e40af !important;
          border-radius: 0px !important;
        }
        .react-datepicker__day--range-start {
          background-color: #3b82f6 !important;
          color: #ffffff !important;
          border-top-left-radius: 0.5rem !important;
          border-bottom-left-radius: 0.5rem !important;
        }
        .react-datepicker__day--range-end {
          background-color: #3b82f6 !important;
          color: #ffffff !important;
          border-top-right-radius: 0.5rem !important;
          border-bottom-right-radius: 0.5rem !important;
        }
        
        .dark .react-datepicker { background-color: #1e293b !important; border-color: #334155 !important; }
        .dark .react-datepicker__month-container { background-color: #1e293b !important; }
        .dark .react-datepicker__header { background-color: #1e293b !important; border-bottom-color: #334155 !important; }
        .dark .react-datepicker__day-name { color: #94a3b8 !important; }
        .dark .react-datepicker__day { color: #cbd5e1 !important; }
        .dark .react-datepicker__day:hover { background-color: #334155 !important; color: #ffffff !important; }
        .dark .react-datepicker__day--selected { background-color: #3b82f6 !important; color: #ffffff !important; }
        .dark .react-datepicker__day--highlighted-holiday { background-color: #ea580c !important; color: #ffffff !important; }
        .dark .react-datepicker__day--highlighted-filled { background-color: #059669 !important; color: #ffffff !important; }
        .dark .react-datepicker__day--highlighted-combined { background-color: #4f46e5 !important; color: #ffffff !important; }
        .dark .react-datepicker__month-select, .dark .react-datepicker__year-select { background-color: #0f172a !important; border-color: #334155 !important; color: #f8fafc !important; }
        .dark .react-datepicker__month-select option, .dark .react-datepicker__year-select option { background-color: #0f172a !important; color: #f8fafc !important; }
        
        .dark .react-datepicker__day--in-range {
          background-color: #1e3a8a !important;
          color: #eff6ff !important;
          border-radius: 0px !important;
        }
      `}</style>

      {/* GLOBAL CONFIRM MODAL */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" style={{ zIndex: 100000 }}>
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 max-w-sm w-full transform scale-100 transition-transform">
            <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">{confirmModal.title}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">{confirmModal.message}</p>
            <div className="flex gap-3">
              <button onClick={closeConfirm} className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-colors">Cancel</button>
              <button onClick={confirmModal.onConfirm} className={`flex-1 px-4 py-2.5 text-white rounded-xl font-bold transition-colors shadow-sm ${confirmModal.isDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GLOBAL ALERT MODAL */}
      {alertModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" style={{ zIndex: 100000 }}>
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-orange-100 dark:bg-orange-900/30 text-orange-500 rounded-full"><AlertCircle size={24} /></div>
              <h3 className="text-xl font-bold text-slate-800 dark:text-white">{alertModal.title}</h3>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">{alertModal.message}</p>
            <button onClick={closeAlert} className="w-full px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white rounded-xl font-bold transition-colors">
              Understood
            </button>
          </div>
        </div>
      )}

      {/* HOLIDAY DECLARED INFO MODAL */}
      {holidayModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" style={{ zIndex: 100000 }}>
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-800 text-center">
            <div className="w-20 h-20 bg-orange-100 dark:bg-orange-900/30 text-orange-500 rounded-full flex items-center justify-center mb-5 shadow-inner border border-orange-200 dark:border-orange-800 mx-auto">
              <CalendarOff size={40} />
            </div>
            <h3 className="text-2xl font-black text-slate-800 dark:text-white mb-2">Holiday Declared!</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
              The selected date <strong className="text-slate-800 dark:text-white">{formatDisplayDate(holidayModal.date)}</strong> is marked as a holiday.
            </p>
            <div className="flex flex-col gap-2 p-4">
              <button 
                onClick={() => handleCancelHolidayFromModal(holidayModal.dateStr)} 
                disabled={isSaving}
                className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2"
              >
                <Trash2 size={18} /> {isSaving ? 'Unlocking...' : 'Cancel Holiday & Unlock'}
              </button>
              <button 
                onClick={() => setHolidayModal({ isOpen: false, date: null, dateStr: '' })} 
                className="w-full px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PIPELINE LOCK WARNING */}
      {pipelineWarning && !isHolidaySelected && !customRangeMode && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 flex items-start sm:items-center gap-3 animate-in fade-in">
          <Lock className="text-red-500 shrink-0 mt-0.5 sm:mt-0" size={20} />
          <p className="text-sm text-red-800 dark:text-red-300 leading-relaxed font-medium">
            <strong>Reconciliation Locked:</strong> The closing stock for <span className="font-bold border-b border-red-300">{formatDisplayDate(pipelineWarning)}</span> is incomplete. You must save its closing balance or declare it as a holiday before managing subsequent dates.
          </p>
        </div>
      )}

      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 z-50 relative">
        <div className="shrink-0">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
            <Package className="text-blue-500" /> Daily Stock Ledger
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Reconcile opening stock, purchases, and closing balances.</p>
        </div>
        
        <div className="flex-1 min-w-0 flex xl:justify-end mt-2 xl:mt-0">
          <div className="flex flex-wrap items-center justify-start xl:justify-end gap-2 max-w-full">
            
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/50 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-inner">
              <DatePicker 
                selected={startDate} onChange={handleStartDateChange} maxDate={new Date()} dateFormat="dd MMM yyyy" 
                customInput={<CustomDateInput placeholder="Start Date" />} 
                showMonthDropdown showYearDropdown dropdownMode="select"
                dayClassName={getDayClassName}
                selectsStart
                startDate={startDate}
                endDate={endDate}
              />
              <span className="text-slate-400 font-bold px-1 hidden sm:block">to</span>
              <DatePicker 
                selected={endDate} onChange={handleEndDateChange} minDate={startDate} maxDate={new Date()} dateFormat="dd MMM yyyy" 
                customInput={<CustomDateInput placeholder="End Date" />} 
                showMonthDropdown showYearDropdown dropdownMode="select"
                dayClassName={getDayClassName}
                selectsEnd
                startDate={startDate}
                endDate={endDate}
              />
            </div>
            
            {!customRangeMode && (
              <button onClick={openHolidayConfirm} disabled={isHolidaySelected || isAnyDateFilled || !!pipelineWarning} className="shrink-0 flex items-center gap-1.5 h-10.5 bg-orange-500 text-white px-3 rounded-xl text-sm font-bold hover:bg-orange-600 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                <Coffee size={18} /> Mark Holiday
              </button>
            )}
            
            <button 
              onClick={() => {
                setCustomRangeMode(!customRangeMode);
                setStartDate(new Date());
                setEndDate(new Date());
              }} 
              className={`shrink-0 flex items-center gap-1.5 h-10.5 px-3 rounded-xl text-sm font-bold border transition-all shadow-sm ${customRangeMode ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700' : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            >
              <ArrowRightLeft size={16} /> {customRangeMode ? 'Reconcile Mode' : 'Custom View'}
            </button>

            {!customRangeMode && (
              <button onClick={handleOpenBankDeposit} className="shrink-0 flex items-center gap-1.5 h-10.5 bg-emerald-600 text-white px-3 rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all shadow-sm">
                <Landmark size={18} /> Expenses & Cash
              </button>
            )}

            {!customRangeMode && isCurrentSelectionARangeEnd && (
              <button 
                onClick={handleResetRangeData} 
                disabled={isSaving}
                className="shrink-0 flex items-center gap-1.5 h-10.5 bg-red-600 hover:bg-red-700 text-white px-4 rounded-xl text-sm font-bold transition-all shadow-sm disabled:opacity-50"
              >
                <Trash2 size={18} /> Split Range
              </button>
            )}

            {!customRangeMode && (
              <button onClick={handleSaveStock} disabled={isSaving || isHolidaySelected || !!pipelineWarning} className="shrink-0 flex items-center gap-1.5 h-10.5 bg-blue-600 text-white px-4 rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                <Save size={18} /> {isSaving ? 'Saving...' : 'Save'}
              </button>
            )}
            
          </div>
        </div>
      </div>

      {saveMessage && (
        <div className={`flex items-center gap-2 p-4 rounded-xl border ${saveMessage.type === 'success' ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'} animate-in fade-in slide-in-from-top-2`}>
          {saveMessage.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <span className="font-semibold">{saveMessage.text}</span>
        </div>
      )}

      {customRangeMode ? (
        <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-4 flex items-start sm:items-center gap-3 animate-in fade-in">
          <Info className="text-indigo-500 shrink-0 mt-0.5 sm:mt-0" size={20} />
          <p className="text-sm text-indigo-800 dark:text-indigo-300 leading-relaxed font-semibold">
            Custom View Mode Active (Read-Only): Showing operational statistics from {formatDisplayDate(startDate)} to {formatDisplayDate(endDate)}. Edits are locked.
          </p>
        </div>
      ) : isMultiDayRange && !isHolidaySelected && !pipelineWarning && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 flex items-start sm:items-center gap-3 animate-in fade-in">
          <Info className="text-blue-500 shrink-0 mt-0.5 sm:mt-0" size={20} />
          <p className="text-sm text-blue-800 dark:text-blue-300 leading-relaxed font-semibold">
            Reconcile Range Selected: Visualizing chain from <strong>{formatDisplayDate(startDate)}</strong> to <strong>{formatDisplayDate(endDate)}</strong>. Use Save to commit closing stock.
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
            Sales records are locked for this period. Your stock metrics have been carried forward.
          </p>
          {!customRangeMode && (
            <button onClick={handleRemoveHoliday} disabled={isSaving} className="px-6 py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl flex items-center gap-2 transition-all shadow-md hover:shadow-lg disabled:opacity-50 mx-auto">
              <Trash2 size={20} /> {isSaving ? 'Unlocking...' : 'Cancel Holiday & Unlock'}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className={`grid grid-cols-1 sm:grid-cols-3 gap-6 relative z-10 animate-in fade-in transition-opacity ${pipelineWarning && !customRangeMode ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="bg-linear-to-br from-indigo-500 to-indigo-700 p-6 rounded-2xl shadow-sm text-white relative overflow-hidden group">
              <div className="absolute right-0 top-0 opacity-10 transform translate-x-1/4 -translate-y-1/4"><Calculator size={120} /></div>
              <p className="text-indigo-100 font-medium text-sm tracking-wider uppercase mb-2 relative z-10">Total Sales Qty</p>
              <h3 className="text-4xl font-black relative z-10">{dailySummary.totalSalesQty} <span className="text-lg font-medium opacity-80">Units</span></h3>
            </div>

            <div className="bg-linear-to-br from-emerald-500 to-emerald-700 p-6 rounded-2xl shadow-sm text-white relative overflow-hidden group">
              <div className="absolute right-0 top-0 opacity-10 transform translate-x-1/4 -translate-y-1/4"><Calculator size={120} /></div>
              <p className="text-emerald-100 font-medium text-sm tracking-wider uppercase mb-2 relative z-10">Generated Revenue</p>
              <h3 className="text-4xl font-black relative z-10">{formatRs(dailySummary.totalRevenue)}</h3>
            </div>

            <div className="bg-linear-to-br from-red-500 to-red-700 p-6 rounded-2xl shadow-sm text-white relative overflow-hidden group">
              <div className="absolute right-0 top-0 opacity-10 transform translate-x-1/4 -translate-y-1/4"><Receipt size={120} /></div>
              <p className="text-red-100 font-medium text-sm tracking-wider uppercase mb-2 relative z-10">Expenses</p>
              <h3 className="text-4xl font-black relative z-10">{formatRs(dailySummary.totalExpenses)}</h3>
            </div>
          </div>

          <div className={`bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden relative z-10 animate-in fade-in slide-in-from-bottom-4 transition-opacity ${pipelineWarning && !customRangeMode ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300 min-w-220">
                <thead className="bg-slate-50/80 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-semibold uppercase text-[11px] tracking-wider border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-3 py-4 w-10"></th> 
                    <th className="px-3 py-4">Brand Details</th>
                    <th className="px-4 py-4 text-center">Opening Bal.<br/><span className="text-slate-400 dark:text-slate-500 text-[10px] font-normal">(Editable)</span></th>
                    <th className="px-4 py-4 text-center">Purchases Qty<br/><span className="text-slate-400 dark:text-slate-500 text-[10px] font-normal">(Click to Add)</span></th>
                    <th className="px-4 py-4 text-center">Closing Bal.<br/><span className="text-slate-400 dark:text-slate-500 text-[10px] font-normal">(Input)</span></th>
                    <th className="px-4 py-4 text-center text-indigo-600 dark:text-indigo-400">Sale Qty<br/><span className="text-slate-400 dark:text-slate-500 text-[10px] font-normal">(Auto)</span></th>
                    <th className="px-6 py-4 text-right text-purple-600 dark:text-purple-400 font-semibold">MRP Amount<br/><span className="text-slate-400 dark:text-slate-500 text-[10px] font-normal">(Auto FIFO)</span></th>
                    <th className="px-6 py-4 text-right text-emerald-600 dark:text-emerald-400">Sale Amount<br/><span className="text-slate-400 dark:text-slate-500 text-[10px] font-normal">(Auto FIFO)</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <tr><td colSpan="8" className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">Syncing stock data...</td></tr>
                  ) : stockRows.length === 0 ? (
                    <tr><td colSpan="8" className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">No brands found. Go to Brand Master to register items.</td></tr>
                  ) : (
                    stockRows.map((row, index) => (
                      <tr key={row.brand_id} draggable={!customRangeMode} onDragStart={() => (dragItem.current = index)} onDragEnter={() => (dragOverItem.current = index)} onDragEnd={handleSort} onDragOver={(e) => e.preventDefault()} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/80 transition-colors group bg-white dark:bg-slate-900">
                        <td className="px-3 py-4 text-center cursor-move">
                          {!customRangeMode && <GripVertical size={16} className="text-slate-300 dark:text-slate-600 group-hover:text-blue-500 transition-colors" />}
                        </td>
                        
                        <td className="px-3 py-4">
                          <div className="font-bold text-slate-800 dark:text-slate-100">{row.brand_name}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-col gap-1">
                            <span className="font-semibold uppercase tracking-wider text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded w-fit">{row.bottle_size}</span>
                            <div className="flex flex-col gap-1 bg-slate-50/50 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-100 dark:border-slate-800/80 mt-1">
                              {(() => {
                                // Assemble temporary batch queue for dynamic left-qty calculation
                                const activeBatches = [];
                                
                                if (row.starting_batches && row.starting_batches.length > 0) {
                                  row.starting_batches.forEach((b, idx) => {
                                    activeBatches.push({ 
                                      label: `Old Batch ${row.starting_batches.length > 1 ? idx + 1 : ''}`, 
                                      qty: b.qty, 
                                      mrp: b.mrp, 
                                      price: b.price, 
                                      isNew: false 
                                    });
                                  });
                                } else if (row.base_opening > 0) {
                                  activeBatches.push({ 
                                    label: 'Old Stock', 
                                    qty: row.base_opening, 
                                    mrp: row.carried_mrp, 
                                    price: row.carried_price, 
                                    isNew: false 
                                  });
                                }

                                if (row.purchase_qty > 0) {
                                  activeBatches.push({ 
                                    label: 'New Batch', 
                                    qty: row.purchase_qty, 
                                    mrp: row.purchase_mrp, 
                                    price: row.purchase_price, 
                                    isNew: true 
                                  });
                                }

                                // Distribute Closing Balance from newest to oldest batch
                                if (row.closing_balance !== '' && row.closing_balance !== null) {
                                  let remainingStock = parseInt(row.closing_balance) || 0;
                                  for (let i = activeBatches.length - 1; i >= 0; i--) {
                                    const allocated = Math.min(activeBatches[i].qty, remainingStock);
                                    activeBatches[i].left = allocated;
                                    remainingStock -= allocated;
                                  }
                                } else {
                                  // If closing balance isn't inputted yet, default 'left' to the starting quantity
                                  activeBatches.forEach(b => { b.left = b.qty; });
                                }

                                if (activeBatches.length === 0) {
                                  return (
                                    <div className="text-[11px] text-slate-400">
                                      Baseline (MRP: {formatRs(row.purchase_mrp || row.carried_mrp || row.mrp_price)} | Sale: {formatRs(row.purchase_price || row.carried_price || row.selling_price)})
                                    </div>
                                  );
                                }

                                return activeBatches.map((batch, idx) => {
                                  const isStockZero = batch.left === 0;
                                  
                                  // Theme-fluid responsive status capsules
                                  const statusBadgeClass = isStockZero
                                    ? "bg-rose-50/80 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 border-rose-200/40 dark:border-rose-900/20"
                                    : "bg-amber-50/80 dark:bg-amber-950/10 text-amber-600 dark:text-amber-400 border-amber-200/40 dark:border-amber-900/20";

                                  return (
                                    <div 
                                      key={`batch-row-${idx}`} 
                                      className={`flex flex-wrap sm:flex-nowrap items-center justify-between gap-x-4 gap-y-1.5 py-1.5 ${idx > 0 ? 'border-t border-slate-100 dark:border-slate-800/40' : ''} ${batch.isNew ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}`}
                                    >
                                      {/* Left side: Fully detailed responsive layout (Ellipsis removed) */}
                                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                                        <span className="font-extrabold text-slate-800 dark:text-slate-100 shrink-0">{batch.label}:</span>
                                        <span className="font-bold text-slate-700 dark:text-slate-300 shrink-0">{batch.qty} Qty</span>
                                        <span className="text-slate-300 dark:text-slate-700 text-[9px] select-none shrink-0">•</span>
                                        <span className="font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                          MRP: {formatRs(batch.mrp)}
                                        </span>
                                        <span className="text-slate-300 dark:text-slate-700 text-[9px] select-none shrink-0">•</span>
                                        <span className="font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                          Sale: {formatRs(batch.price)}
                                        </span>
                                      </div>
                                      
                                      {/* Right side: Sleek compact status badge with no-wrap constraint */}
                                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase border shrink-0 whitespace-nowrap transition-all ${statusBadgeClass}`}>
                                        {batch.left} left
                                      </span>
                                    </div>
                                  );
                                });
                              })()}
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-4 text-center">
                          <input 
                            type="number" 
                            disabled={isHolidaySelected}
                            value={row.opening_balance ?? ''} 
                            onChange={(e) => handleInputChange(row.brand_id, 'opening_balance', e.target.value)} 
                            className={`${numInputClass} border-amber-300 dark:border-amber-800 focus:ring-amber-500 disabled:opacity-75 disabled:cursor-not-allowed`} 
                          />
                        </td>
                        
                        <td className="px-4 py-4 text-center">
                          <button 
                            disabled={isHolidaySelected}
                            onClick={() => openPurchaseModal(row)}
                            className={`w-20 px-2 py-2 rounded-lg text-sm text-center font-bold transition-all border outline-none mx-auto block ${isHolidaySelected ? 'opacity-75 cursor-not-allowed' : ''} ${row.purchase_qty > 0 ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-600 hover:text-blue-600 dark:hover:text-blue-400'}`}
                          >
                            {row.purchase_qty === 0 ? '+ Add' : row.purchase_qty}
                          </button>
                        </td>

                        <td className="px-4 py-4 text-center">
                          <input 
                            type="number" 
                            min="0" 
                            placeholder="Qty" 
                            disabled={isHolidaySelected}
                            value={row.closing_balance ?? ''} 
                            onChange={(e) => handleInputChange(row.brand_id, 'closing_balance', e.target.value)} 
                            className={`${numInputClass} border-blue-300 dark:border-blue-700 bg-blue-50/30 dark:bg-blue-900/10 focus:ring-blue-500 disabled:opacity-75 disabled:cursor-not-allowed`} 
                          />
                        </td>
                        <td className="px-4 py-4 text-center font-black text-indigo-600 dark:text-indigo-400 text-lg">
                          {row.closing_balance === '' ? '-' : row.sales_qty}
                        </td>
                        <td className="px-6 py-4 text-right font-black text-purple-600 dark:text-purple-400 text-lg">
                          {row.closing_balance === '' ? '-' : formatRs(row.sales_mrp_amount)}
                        </td>
                        <td className="px-6 py-4 text-right font-black text-emerald-600 dark:text-emerald-400 text-lg">
                          {row.closing_balance === '' ? '-' : formatRs(row.sales_amount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {stockRows.length > 0 && !loading && (
                  <tfoot className="bg-slate-100/80 dark:bg-slate-800/80 border-t-2 border-slate-200 dark:border-slate-700">
                    <tr>
                      <td colSpan="2" className="px-3 py-4 text-right align-top pt-6">
                        <div className="font-black text-slate-800 dark:text-slate-100 flex justify-end items-center gap-2"><Sigma size={16} className="text-blue-600" /> TOTALS</div>
                      </td>
                      
                      <td className="px-4 py-4 text-center">
                        <div className="font-black text-lg text-slate-800 dark:text-slate-200">{tableTotalOpeningQty}</div>
                        <div className="text-[11px] font-bold text-slate-500 dark:text-slate-500 mt-1">MRP: {formatRs(tableTotalOpeningMrpAmount)}</div>
                        <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Sale: {formatRs(tableTotalOpeningAmount)}</div>
                      </td>
                      
                      <td className="px-4 py-4 text-center">
                      </td>
                      
                      <td className="px-4 py-4 text-center">
                        <div className="font-black text-lg text-slate-800 dark:text-slate-200">{tableTotalClosingQty}</div>
                        <div className="text-[11px] font-bold text-slate-500 dark:text-slate-500 mt-1">MRP: {formatRs(tableTotalClosingMrpAmount)}</div>
                        <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Sale: {formatRs(tableTotalClosingAmount)}</div>
                      </td>
                      
                      <td className="px-4 py-4 text-center">
                        <div className="font-black text-lg text-indigo-600 dark:text-indigo-400">{dailySummary.totalSalesQty}</div>
                        <div className="text-[11px] font-bold text-indigo-400 dark:text-indigo-500 mt-1">MRP: {formatRs(dailySummary.totalMrpRevenue)}</div>
                        <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Sale: {formatRs(dailySummary.totalRevenue)}</div>
                      </td>
                      <td className="px-6 py-4 text-right align-top pt-6 font-black text-purple-600 dark:text-purple-400 text-xl">{formatRs(tableTotalMrpRevenue)}</td>
                      <td className="px-6 py-4 text-right align-top pt-6 font-black text-emerald-600 dark:text-emerald-400 text-xl">{formatRs(dailySummary.totalRevenue)}</td>
                    </tr>
                    <tr>
                      <td colSpan="7" className="px-4 py-2 text-right font-bold text-red-500 dark:text-red-400">Business Expenses :</td>
                      <td className="px-6 py-2 text-right font-bold text-red-500 dark:text-red-400">- {formatRs(dailySummary.totalExpenses)}</td>
                    </tr>
                    <tr>
                      <td colSpan="7" className="px-4 py-2 text-right font-bold text-red-500 dark:text-red-400">Online Collected :</td>
                      <td className="px-6 py-2 text-right font-bold text-red-500 dark:text-red-400">- {formatRs(dailySummary.totalCollections)}</td>
                    </tr>
                    <tr className="bg-emerald-50/50 dark:bg-emerald-900/10 border-t border-slate-200 dark:border-slate-700">
                      <td colSpan="7" className="px-4 py-4 text-right font-black text-emerald-700 dark:text-emerald-400 text-sm uppercase tracking-wider">Net In-Hand Cash :</td>
                      <td className="px-6 py-4 text-right font-black text-emerald-700 dark:text-emerald-400 text-xl">
                        {formatRs((parseFloat(dailySummary.totalRevenue) || 0) - (parseFloat(dailySummary.totalExpenses) || 0) - (parseFloat(dailySummary.totalCollections) || 0))}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}

      {/* PURCHASE BATCH RECONCILIATION MODAL */}
      {purchaseModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4" style={{ zIndex: 90000 }}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[95vh] sm:max-h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-200">
            
            <div className="flex justify-between items-center px-5 py-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 shrink-0">
              <h3 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Package size={20} className="text-blue-500" /> Record Batch Purchase
              </h3>
              <button 
                type="button"
                onClick={() => setPurchaseModal({ isOpen: false, brand: null, qty: '', price: '', mrp: '', isPriceChanged: false, isMrpChanged: false })} 
                className="p-1.5 sm:p-2 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-red-500 hover:text-white rounded-full transition-colors outline-none"
              >
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handlePurchaseSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 sm:space-y-5 custom-scrollbar">
              
              <div className="bg-blue-50 dark:bg-blue-900/20 p-3.5 sm:p-4 rounded-xl border border-blue-100 dark:border-blue-900/30">
                <h4 className="font-bold text-slate-800 dark:text-slate-100 text-base sm:text-lg">{purchaseModal.brand?.brand_name}</h4>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">{purchaseModal.brand?.bottle_size} • Baseline MRP: ₹{purchaseModal.brand?.carried_mrp} • Baseline Sale Price: ₹{purchaseModal.brand?.carried_price}</p>
              </div>

              <div>
                <label className="block text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Quantity Added</label>
                <input 
                  type="number" 
                  required min="0" 
                  value={purchaseModal.qty ?? ''} 
                  onChange={(e) => setPurchaseModal({...purchaseModal, qty: e.target.value})} 
                  className={inputClass} 
                  placeholder="e.g., 240" 
                  autoFocus
                />
              </div>

              {/* MRP OVERRIDE OPTION */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                <label className="block text-[11px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5">Is there an MRP change for this batch?</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label className="flex items-center gap-2.5 cursor-pointer group bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-300 transition-colors">
                    <input 
                      type="radio" 
                      name="mrpChange" 
                      checked={!purchaseModal.isMrpChanged} 
                      onChange={() => setPurchaseModal({...purchaseModal, isMrpChanged: false, mrp: purchaseModal.brand.carried_mrp || purchaseModal.brand.mrp_price})} 
                      className="w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 focus:ring-blue-500 dark:bg-slate-700 dark:border-slate-600 shrink-0" 
                    />
                    <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 group-hover:text-blue-600 transition-colors truncate">No (₹{purchaseModal.brand?.carried_mrp || purchaseModal.brand?.mrp_price})</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer group bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-300 transition-colors">
                    <input 
                      type="radio" 
                      name="mrpChange" 
                      checked={purchaseModal.isMrpChanged} 
                      onChange={() => setPurchaseModal({...purchaseModal, isMrpChanged: true})} 
                      className="w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 focus:ring-blue-500 dark:bg-slate-700 dark:border-slate-600 shrink-0" 
                    />
                    <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 group-hover:text-blue-600 transition-colors">Yes, custom batch MRP</span>
                  </label>
                </div>
              </div>

              {purchaseModal.isMrpChanged && (
                <div className="animate-in fade-in slide-in-from-top-2 pt-1">
                  <label className="flex justify-between text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    <span>Batch MRP Price (₹)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><IndianRupee size={14}/></span>
                    <input 
                      type="number" 
                      required min="0" step="any" 
                      value={purchaseModal.mrp ?? ''} 
                      onChange={(e) => setPurchaseModal({...purchaseModal, mrp: e.target.value})} 
                      className={`${inputClass} pl-8.5 font-bold border-purple-300 dark:border-purple-800 focus:ring-purple-500`} 
                    />
                  </div>
                </div>
              )}

              {/* SELLING PRICE OVERRIDE OPTION */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                <label className="block text-[11px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5">Is there a selling price change for this batch?</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label className="flex items-center gap-2.5 cursor-pointer group bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-300 transition-colors">
                    <input 
                      type="radio" 
                      name="priceChange" 
                      checked={!purchaseModal.isPriceChanged} 
                      onChange={() => setPurchaseModal({...purchaseModal, isPriceChanged: false, price: purchaseModal.brand.carried_price})} 
                      className="w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 focus:ring-blue-500 dark:bg-slate-700 dark:border-slate-600 shrink-0" 
                    />
                    <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 group-hover:text-blue-600 transition-colors truncate">No (₹{purchaseModal.brand?.carried_price})</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer group bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-300 transition-colors">
                    <input 
                      type="radio" 
                      name="priceChange" 
                      checked={purchaseModal.isPriceChanged} 
                      onChange={() => setPurchaseModal({...purchaseModal, isPriceChanged: true})} 
                      className="w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 focus:ring-blue-500 dark:bg-slate-700 dark:border-slate-600 shrink-0" 
                    />
                    <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 group-hover:text-blue-600 transition-colors">Yes, custom batch price</span>
                  </label>
                </div>
              </div>

              {purchaseModal.isPriceChanged && (
                <div className="animate-in fade-in slide-in-from-top-2 pt-1">
                  <label className="flex justify-between text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    <span>Batch Selling Price (₹)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><IndianRupee size={14}/></span>
                    <input 
                      type="number" 
                      required min="0" step="any" 
                      value={purchaseModal.price ?? ''} 
                      onChange={(e) => setPurchaseModal({...purchaseModal, price: e.target.value})} 
                      className={`${inputClass} pl-8.5 font-bold border-blue-300 dark:border-blue-800 focus:ring-blue-500`} 
                    />
                  </div>
                </div>
              )}

              <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed font-semibold">
                * Note: Older stock continues to sell at previous operational rates. New rates apply only to these new {purchaseModal.qty || '0'} batch bottles.
              </p>

              <button 
                type="submit" 
                className="w-full mt-2 sm:mt-4 bg-blue-600 text-white font-bold py-2.5 sm:py-3 px-4 rounded-xl hover:bg-blue-700 transition-all duration-300 shadow-md hover:shadow-lg flex justify-center items-center gap-2 shrink-0 text-sm"
              >
                <CheckCircle2 size={18} /> Reconcile Batch
              </button>
            </form>
          </div>
        </div>
      )}

      {/* FINANCIAL OPERATIONS MODAL */}
      {isBankDepositOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 90000 }}>
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-6xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
            
            <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-4">
                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Landmark size={24} className="text-blue-500" /> Operational Cash Ledger
                </h3>
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
                        setCollectionForm({ date: popupDate, description: 'Transferred to Bank', amount: '', mode: 'UPI/Bank' });
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
                          <input type="text" required value={expenseForm.description ?? ''} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} className={inputClass} placeholder="e.g., Electricity Bill" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Amount (₹)</label>
                          <input type="number" required min="1" step="any" value={expenseForm.amount ?? ''} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} className={inputClass} placeholder="0.00" />
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
                          <input type="text" required value={collectionForm.description ?? ''} onChange={(e) => setCollectionForm({ ...collectionForm, description: e.target.value })} className={inputClass} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Amount (₹)</label>
                            <input type="number" required min="1" value={collectionForm.amount ?? ''} onChange={(e) => setCollectionForm({ ...collectionForm, amount: e.target.value })} className={inputClass} placeholder="0.00" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Mode</label>
                            <select value={collectionForm.mode ?? 'UPI/Bank'} onChange={(e) => setCollectionForm({ ...collectionForm, mode: e.target.value })} className={inputClass}>
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
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                      {popupTab === 'expense' ? <Receipt size={18} className="text-red-500"/> : <Landmark size={18} className="text-indigo-500"/>}
                      {popupTab === 'expense' ? 'Daily Expenses Log' : 'Daily Online Collections'}
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
                          <tr><td colSpan={popupTab === 'collection' ? 4 : 3} className="px-6 py-12 text-center text-slate-400">No records found for the selected date.</td></tr>
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
                                  ₹{parseFloat(row.amount || 0).toLocaleString()}
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
