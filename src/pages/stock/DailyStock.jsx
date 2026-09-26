import { useState, useEffect, useRef, forwardRef, useCallback, useMemo } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useModal } from '../../context/ModalContext';
import { useTranslation } from 'react-i18next';
import { 
  Package, Calendar, Save, Calculator, AlertCircle, CheckCircle2, 
  GripVertical, ChevronDown, Landmark, Plus, ArrowDownCircle, 
  Receipt, X, Sigma, IndianRupee, Edit2, Trash2, Coffee, 
  CalendarOff, Info, Lock, ArrowRightLeft 
} from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

// Strict timezone-neutral formatting helper
const formatDisplayDate = (dateObj) => {
  if (!dateObj) return '';
  const d = new Date(dateObj);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

const safeRound = (value) => {
  return Math.round((value + Number.EPSILON) * 100) / 100;
};

async function fetchAllRows(queryBuilder) {
  let allData = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await queryBuilder.range(page * pageSize, (page + 1) * pageSize - 1);
    if (error || !data || data.length === 0) {
      break;
    }
    allData = allData.concat(data);
    if (data.length < pageSize) {
      hasMore = false;
    } else {
      page++;
    }
  }
  return allData;
}

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
      result[i].qty = Math.max(0, targetBaseOpening - runningSum);
    } else {
      result[i].qty = Math.round(result[i].qty * scale);
      runningSum += result[i].qty;
    }
  }
  return result.filter(b => b.qty > 0);
};

const CustomDateInput = forwardRef(({ value, onClick, placeholder }, ref) => (
  <button 
    type="button" 
    onClick={onClick} 
    ref={ref} 
    className="flex items-center justify-between px-3 py-2 h-10.5 w-40 sm:w-44 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-all duration-200 text-sm font-bold text-slate-700 dark:text-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 whitespace-nowrap cursor-pointer"
  >
    <div className="flex items-center overflow-hidden">
      <Calendar size={16} className="text-blue-500 mr-2 shrink-0" />
      <span className="truncate">{value || placeholder}</span>
    </div>
    <ChevronDown size={14} className="text-slate-400 dark:text-slate-500 ml-2 shrink-0" />
  </button>
));
CustomDateInput.displayName = "CustomDateInput";

const FormDateInput = forwardRef(({ value, onClick, className }, ref) => (
  <button type="button" onClick={onClick} ref={ref} className={`${className} flex justify-between items-center text-left h-10.5 cursor-pointer`}>
    <span>{value}</span>
    <Calendar size={16} className="text-slate-400" />
  </button>
));
FormDateInput.displayName = "FormDateInput";

// Custom Autocomplete Component for Descriptions
const AutocompleteInput = ({ value, onChange, options, onDeleteOption, placeholder, className, required }) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = options.filter(o => o.description.toLowerCase().includes(value.toLowerCase()));

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          required={required}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className={`${className} pr-8`}
          placeholder={placeholder}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none transition-colors cursor-pointer"
        >
          <ChevronDown size={16} />
        </button>
      </div>
      {isOpen && filtered.length > 0 && (
        <ul className="absolute z-1000 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-48 overflow-y-auto custom-scrollbar">
          {filtered.map(opt => (
            <li key={opt.id} className="flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors group border-b last:border-b-0 border-slate-100 dark:border-slate-700/50">
              <span className="flex-1 text-sm font-semibold text-slate-700 dark:text-slate-200" onClick={() => { onChange(opt.description); setIsOpen(false); }}>
                {opt.description}
              </span>
              <button 
                type="button" 
                onClick={(e) => { e.stopPropagation(); onDeleteOption(opt.id); }} 
                className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1 cursor-pointer"
                title="Delete saved description"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const formatRs = (num) => '₹' + safeRound(num || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const recalculateRow = (row) => {
  let sQty = 0; 
  let sAmt = 0; 
  let sMrpAmt = 0;
  let cAmt = 0; 
  let cMrpAmt = 0;

  let queue = Array.isArray(row.starting_batches) ? row.starting_batches.map(b => ({ ...b })) : [];
  
  if (parseInt(row.purchase_qty, 10) > 0) {
    queue.push({
      qty: parseInt(row.purchase_qty, 10),
      price: parseFloat(row.purchase_price) || 0,
      mrp: parseFloat(row.purchase_mrp) || 0
    });
  }

  if (row.closing_balance !== '') {
    sQty = Math.max(0, parseInt(row.opening_balance, 10) - parseInt(row.closing_balance, 10));
    let salesRemaining = sQty;

    while (salesRemaining > 0 && queue.some(b => b.qty > 0)) {
      const activeBatch = queue.find(b => b.qty > 0);
      if (!activeBatch) break;

      if (activeBatch.qty <= salesRemaining) {
        sAmt = safeRound(sAmt + (activeBatch.qty * activeBatch.price));
        sMrpAmt = safeRound(sMrpAmt + (activeBatch.qty * activeBatch.mrp));
        salesRemaining -= activeBatch.qty;
        activeBatch.qty = 0;
      } else {
        sAmt = safeRound(sAmt + (salesRemaining * activeBatch.price));
        sMrpAmt = safeRound(sMrpAmt + (salesRemaining * activeBatch.mrp));
        activeBatch.qty -= salesRemaining; 
        salesRemaining = 0;
      }
    }

    if (salesRemaining > 0) {
      const fallbackPrice = parseFloat(row.carried_price) || parseFloat(row.selling_price) || 0;
      const fallbackMrp = parseFloat(row.carried_mrp) || parseFloat(row.mrp_price) || 0;
      sAmt = safeRound(sAmt + (salesRemaining * fallbackPrice));
      sMrpAmt = safeRound(sMrpAmt + (salesRemaining * fallbackMrp));
    }
  }

  queue.forEach(b => {
    cAmt = safeRound(cAmt + (b.qty * b.price));
    cMrpAmt = safeRound(cMrpAmt + (b.qty * b.mrp));
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
  const { showAlert, showConfirm } = useModal();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0); 
  const [isDirty, setIsDirty] = useState(false); 

  const isDirtyRef = useRef(false);
  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

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

  const [holidayModal, setHolidayModal] = useState({ isOpen: false, date: null, dateStr: '' });
  const [pipelineWarning, setPipelineWarning] = useState(null);
  const [customRangeMode, setCustomRangeMode] = useState(false);

  const [markedHolidays, setMarkedHolidays] = useState([]);
  const [filledDates, setFilledDates] = useState([]);
  const [lockedRanges, setLockedRanges] = useState([]); 

  // POPUP EXPENSE & CASH LEDGER STATE
  const [isBankDepositOpen, setIsBankDepositOpen] = useState(false);
  const [popupTab, setPopupTab] = useState('expense');
  const [popupDate, setPopupDate] = useState(new Date());
  const [expenses, setExpenses] = useState([]);
  const [collections, setCollections] = useState([]);
  const [popupLoading, setPopupLoading] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [editingCollectionId, setEditingCollectionId] = useState(null);
  const [expenseForm, setExpenseForm] = useState({ description: '', amount: '' });
  const [collectionForm, setCollectionForm] = useState({ description: 'Transferred to Bank', amount: '', mode: 'UPI/Bank' });

  // Saved Descriptions State
  const [savedDescriptions, setSavedDescriptions] = useState([]);

  // Fetch saved descriptions from DB
  const fetchSavedDescriptions = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.from('user_saved_descriptions').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      if (!error && data) {
        setSavedDescriptions(data);
      }
    } catch (err) {
      console.error('Failed to load saved descriptions', err);
    }
  }, [user]);

  // Handle saving new description seamlessly
  const saveNewDescription = async (type, desc) => {
    if (!desc || desc.trim() === '') return;
    const existing = savedDescriptions.find(d => d.type === type && d.description.toLowerCase() === desc.trim().toLowerCase());
    if (!existing) {
      try {
        const { error } = await supabase.from('user_saved_descriptions').insert([{ user_id: user.id, type, description: desc.trim() }]);
        if (!error) fetchSavedDescriptions();
      } catch (err) {
        console.error('Error saving description', err);
      }
    }
  };

  // Handle deleting a saved description
  const handleDeleteDescription = async (id) => {
    try {
      await supabase.from('user_saved_descriptions').delete().eq('id', id);
      setSavedDescriptions(prev => prev.filter(d => d.id !== id));
    } catch (err) {
      console.error('Error deleting description', err);
    }
  };

  // Realtime database listener
  useEffect(() => {
    const channel = supabase
      .channel('dailystock-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_stock' }, () => {
        if (!isDirtyRef.current) setRefreshTrigger(prev => prev + 1);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'brands' }, () => {
        if (!isDirtyRef.current) setRefreshTrigger(prev => prev + 1);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => {
        if (!isDirtyRef.current) setRefreshTrigger(prev => prev + 1);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'owner_withdrawals' }, () => {
        if (!isDirtyRef.current) setRefreshTrigger(prev => prev + 1);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleCancelHolidayFromModal = async (dateStr) => {
    setIsSaving(true);
    await supabase.from('holidays').delete().eq('user_id', user.id).eq('date', dateStr);
    await supabase.from('daily_stock').delete().eq('user_id', user.id).eq('date', dateStr);
    setHolidayModal({ isOpen: false, date: null, dateStr: '' });
    setRefreshTrigger(prev => prev + 1);
    setIsSaving(false);
  };

  const normalizeDateStr = useCallback((dStr) => {
    if (!dStr) return '';
    if (typeof dStr !== 'string') return '';
    return dStr.includes('T') ? dStr.split('T')[0] : dStr;
  }, []);

  const getDatesInRange = useCallback((start, end) => {
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
      return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }
    return date;
  }, [lockedRanges, formatDateForDB]);

  const isCurrentSelectionARangeEnd = useMemo(() => {
    const endStr = formatDateForDB(endDate || startDate);
    return lockedRanges.some(r => r.end_date === endStr);
  }, [lockedRanges, startDate, endDate, formatDateForDB]);

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
        showAlert({ title: t('common.close', 'Invalid Selection'), message: "End date must fall on or after the start date.", type: 'warning' });
        return;
      }
      if (formatDateForDB(redirected || date) !== formatDateForDB(startDate)) {
        const range = getDatesInRange(startDate, redirected || date);
        if (range.some(d => markedHolidays.includes(d))) {
          showAlert({ title: t('dailyStock.holidayDeclaredTitle', 'Overlaps Holiday'), message: "Selected block contains declared holidays. Range selection blocked.", type: 'warning' });
          return;
        }
        const rangeToCheck = range.slice(0, -1);
        if (rangeToCheck.some(d => filledDates.includes(d))) {
          showAlert({ title: "Overlaps Existing Entries", message: "Selected range overlaps with previously saved daily stock records. Range selection blocked.", type: 'warning' });
          return;
        }
      }
    }
    setEndDate(redirected || date);
    setIsDirty(false);
  };

  const handleResetRangeData = async () => {
    const activeEndStr = formatDateForDB(endDate || startDate);
    const matchedRange = lockedRanges.find(r => r.end_date === activeEndStr);
    const rangeStartStr = matchedRange ? matchedRange.start_date : activeEndStr;
    const rangeEndStr = matchedRange ? matchedRange.end_date : activeEndStr;
    const [startYear, startMonth, startDay] = rangeStartStr.split('-').map(Number);
    const trueStartObj = new Date(startYear, startMonth - 1, startDay);

    showConfirm({
      title: t('dailyStock.splitModalTitle', 'Unlock & Split Combined Range?'),
      message: t('dailyStock.splitModalMsg', `Are you sure you want to split this combined block? This will permanently DELETE all recorded ledger values from ${formatDisplayDate(trueStartObj)} to ${formatDisplayDate(endDate || startDate)} (including closing balances) from the database, unlocking these dates so you can fill them individually day-by-day.`),
      isDanger: true,
      confirmText: "Split Range",
      onConfirm: async () => {
        setIsSaving(true);
        try {
          await supabase.from('locked_ranges').delete().eq('user_id', user.id).eq('start_date', rangeStartStr).eq('end_date', rangeEndStr);
          await supabase.from('daily_stock').delete().eq('user_id', user.id).gte('date', rangeStartStr).lte('date', rangeEndStr);
          setLockedRanges(prev => prev.filter(r => !(r.start_date === rangeStartStr && r.end_date === rangeEndStr)));
          setFilledDates(prev => prev.filter(d => !(d >= rangeStartStr && d <= rangeEndStr)));
          setStartDate(trueStartObj);
          setEndDate(trueStartObj);
          setSaveMessage({ type: 'success', text: t('dailyStock.saveSuccessMessage', 'Combined range successfully split. All intermediate days unlocked.') });
          setRefreshTrigger(prev => prev + 1);
          setIsDirty(false);
        } catch (err) {
          showAlert({ title: "Split Range Failed", message: err.message, type: 'error' });
        } finally {
          setIsSaving(false);
        }
      }
    });
  };

  // SECURED CALENDAR PREFERENCES
  useEffect(() => {
    let isMounted = true;
    const fetchCloudPreferences = async () => {
      if (!user) return;
      
      try {
        const [
          { data: holidayData },
          stockEntries,
          { data: activeBrands },
          { data: rangeData }
        ] = await Promise.all([
          supabase.from('holidays').select('date').eq('user_id', user.id),
          fetchAllRows(supabase.from('daily_stock').select('date, closing_balance').eq('user_id', user.id)),
          supabase.from('brands').select('id'),
          supabase.from('locked_ranges').select('start_date, end_date').eq('user_id', user.id)
        ]);
        
        const activeBrandsCount = activeBrands ? activeBrands.length : 0;

        if (isMounted) {
          if (holidayData) setMarkedHolidays(holidayData.map(h => h.date));
          if (rangeData) setLockedRanges(rangeData);

          const dateCounts = {};
          stockEntries?.forEach(entry => {
            if (entry.closing_balance !== null && entry.closing_balance !== undefined) {
              dateCounts[entry.date] = (dateCounts[entry.date] || 0) + 1;
            }
          });

          const fullyFilledDates = Object.keys(dateCounts).filter(dateStr => dateCounts[dateStr] >= activeBrandsCount);
          setFilledDates(fullyFilledDates);
        }

        if (!customRangeMode) {
          const { data: firstRec } = await supabase
            .from('daily_stock')
            .select('date')
            .eq('user_id', user.id)
            .order('date', { ascending: true })
            .limit(1);

          if (!firstRec || firstRec.length === 0) {
            if (isMounted) setPipelineWarning(null);
            return;
          }

          const firstDateStr = firstRec[0].date.split('T')[0];
          const selectedStartStr = formatDateForDB(startDate);

          if (selectedStartStr <= firstDateStr) {
            if (isMounted) setPipelineWarning(null);
            return;
          }

          const firstDateObj = new Date(firstDateStr);
          const dayBeforeStartObj = new Date(startDate);
          dayBeforeStartObj.setDate(dayBeforeStartObj.getDate() - 1);

          const checkDates = [];
          let cur = new Date(firstDateObj);
          while (cur <= dayBeforeStartObj) {
            checkDates.push(formatDateForDB(cur));
            cur.setDate(cur.getDate() + 1);
          }

          if (checkDates.length === 0) {
            if (isMounted) setPipelineWarning(null);
            return;
          }

          const { data: holidays } = await supabase
            .from('holidays')
            .select('date')
            .eq('user_id', user.id)
            .in('date', checkDates);

          const holidayDates = holidays ? holidays.map(h => h.date) : [];
          const requiredWorkingDates = checkDates.filter(d => !holidayDates.includes(d));

          if (requiredWorkingDates.length === 0) {
            if (isMounted) setPipelineWarning(null);
            return;
          }

          const { data: stockRecords } = await supabase
            .from('daily_stock')
            .select('date, closing_balance')
            .eq('user_id', user.id)
            .in('date', requiredWorkingDates);

          const recordsByDate = {};
          stockRecords?.forEach(r => {
            if (!recordsByDate[r.date]) {
              recordsByDate[r.date] = { count: 0, hasNull: false };
            }
            recordsByDate[r.date].count++;
            if (r.closing_balance === null || r.closing_balance === undefined) {
              recordsByDate[r.date].hasNull = true;
            }
          });

          let earliestIncompleteDate = null;
          for (const dateStr of requiredWorkingDates) {
            const dayInfo = recordsByDate[dateStr];
            if (!dayInfo || dayInfo.count < activeBrandsCount || dayInfo.hasNull) {
              earliestIncompleteDate = dateStr;
              break;
            }
          }

          if (isMounted) {
            if (earliestIncompleteDate) {
              setPipelineWarning(earliestIncompleteDate);
            } else {
              setPipelineWarning(null);
            }
          }
        } else {
          if (isMounted) setPipelineWarning(null);
        }
      } catch (err) {
        console.error("Calendar preferences compilation error:", err);
      }
    };
    
    fetchCloudPreferences();
    return () => { isMounted = false; };
  }, [user, refreshTrigger, startDate, customRangeMode, formatDateForDB]);

  const [purchaseModal, setPurchaseModal] = useState({ isOpen: false, brand: null, qty: '', price: '', mrp: '', isPriceChanged: false, isMrpChanged: false });
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

      const [
        { data: brandsData },
        allHistoricalStock,
        { data: expData },
        { data: collData }
      ] = await Promise.all([
        supabase.from('brands').select('id, brand_name, bottle_size, selling_price, mrp_price').order('display_order', { ascending: true }).order('brand_name', { ascending: true }),
        fetchAllRows(supabase.from('daily_stock').select('date, brand_id, opening_balance, closing_balance, unit_price, unit_mrp').eq('user_id', user.id).lte('date', endStr).order('date', { ascending: true })),
        supabase.from('expenses').select('amount, date').eq('user_id', user.id).gte('date', startStr).lte('date', endStr),
        supabase.from('owner_withdrawals').select('amount, date').eq('user_id', user.id).gte('date', startStr).lte('date', endStr)
      ]);

      if (!isMounted) return;

      let tExp = 0; if (expData) expData.forEach(e => tExp = safeRound(tExp + parseFloat(e.amount)));
      let tColl = 0; if (collData) collData.forEach(c => tColl = safeRound(tColl + parseFloat(c.amount)));

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

                const opBal = parseInt(s.opening_balance, 10) || 0;
                const pQty = Math.max(0, opBal - (prevClosing[s.brand_id] || 0));

                const dbPrice = parseFloat(s.unit_price);
                const dbMrp = parseFloat(s.unit_mrp);

                const isCustomPrice = dbPrice > 0 && dbPrice !== parseFloat(brand.selling_price);
                const isCustomMrp = dbMrp > 0 && dbMrp !== parseFloat(brand.mrp_price);

                if (dbPrice > 0) {
                  if (isCustomPrice || pQty > 0) {
                    lastActivePrice[s.brand_id] = dbPrice;
                  } else if (lastActivePrice[s.brand_id] === undefined) {
                    lastActivePrice[s.brand_id] = dbPrice;
                  }
                }
                if (dbMrp > 0) {
                  if (isCustomMrp || pQty > 0) {
                    lastActiveMrp[s.brand_id] = dbMrp;
                  } else if (lastActiveMrp[s.brand_id] === undefined) {
                    lastActiveMrp[s.brand_id] = dbMrp;
                  }
                }
                
                const pPrice = parseFloat(s.unit_price) || lastActivePrice[s.brand_id] || parseFloat(brand.selling_price) || 0;
                const pMrp = parseFloat(s.unit_mrp) || lastActiveMrp[s.brand_id] || parseFloat(brand.mrp_price) || 0;

                if (pQty > 0) {
                    queue.push({ qty: pQty, price: pPrice, mrp: pMrp });
                }

                const clBal = s.closing_balance !== null ? parseInt(s.closing_balance, 10) : null;
                if (clBal !== null) {
                    let sales = Math.max(0, opBal - clBal);
                    
                    while (sales > 0 && queue.some(b => b.qty > 0)) {
                      const activeBatch = queue.find(b => b.qty > 0);
                      if (!activeBatch) break;

                      if (activeBatch.qty <= sales) {
                        sales -= activeBatch.qty;
                        activeBatch.qty = 0;
                      } else {
                        activeBatch.qty -= sales;
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
            const opBal = parseInt(exactRecord.opening_balance, 10) || 0;
            const clBal = exactRecord.closing_balance !== null ? parseInt(exactRecord.closing_balance, 10) : '';
            const pQty = Math.max(0, opBal - baseOpening);
            const pPrice = (exactRecord.unit_price !== null && parseFloat(exactRecord.unit_price) > 0) ? parseFloat(exactRecord.unit_price) : carriedPrice;
            const pMrp = (exactRecord.unit_mrp !== null && parseFloat(exactRecord.unit_mrp) > 0) ? parseFloat(exactRecord.unit_mrp) : carriedMrp;

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
             const opBal = parseInt(log.opening_balance, 10) || 0;
             const pQty = Math.max(0, opBal - currentPrevClosing);
             totalPurchasesQty += pQty;
             
             if (pQty > 0) {
                if (log.unit_price) latestUnitPrice = parseFloat(log.unit_price);
                if (log.unit_mrp) latestUnitMrp = parseFloat(log.unit_mrp);
             }
             if (log.closing_balance !== null) {
                 currentPrevClosing = parseInt(log.closing_balance, 10);
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

        let tQty = 0; 
        let tRev = 0; 
        let tMrpRev = 0;
        rows.forEach(r => { 
          if (r.closing_balance !== '') {
            tQty += r.sales_qty; 
            tRev = safeRound(tRev + r.sales_amount); 
            tMrpRev = safeRound(tMrpRev + r.sales_mrp_amount);
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

  // FETCH POPUP DATA (SYNCED TO EXACT SELECTED POPUP DATE)
  const fetchPopupData = useCallback(async (dateToFetch) => {
    if (!user) return;
    setPopupLoading(true);
    const dateStr = formatDateForDB(dateToFetch);

    try {
      const [
        { data: expData, error: expErr },
        { data: collData, error: collErr }
      ] = await Promise.all([
        supabase.from('expenses').select('*').eq('user_id', user.id).eq('date', dateStr).order('created_at', { ascending: false }),
        supabase.from('owner_withdrawals').select('*').eq('user_id', user.id).eq('date', dateStr).order('created_at', { ascending: false })
      ]);

      if (!expErr) setExpenses(expData || []);
      if (!collErr) setCollections(collData || []);
    } catch (err) {
      console.error("Error fetching popup log:", err);
    } finally {
      setPopupLoading(false);
    }
  }, [user, formatDateForDB]);

  // Sync popup data safely on mount/date change
  useEffect(() => {
    let isMounted = true;
    if (isBankDepositOpen && popupDate) {
      Promise.resolve().then(() => {
        if (isMounted) {
          fetchPopupData(popupDate);
          fetchSavedDescriptions();
        }
      });
    }
    return () => {
      isMounted = false;
    };
  }, [isBankDepositOpen, popupDate, fetchPopupData, fetchSavedDescriptions]);

  const handleOpenBankDeposit = () => {
    const activeDate = endDate || startDate || new Date();
    setPopupDate(activeDate);
    setEditingExpenseId(null);
    setEditingCollectionId(null);
    setExpenseForm({ description: '', amount: '' });
    setCollectionForm({ description: 'Transferred to Bank', amount: '', mode: 'UPI/Bank' });
    setIsBankDepositOpen(true);
  };

  const openHolidayConfirm = () => {
    showConfirm({
      title: t('dailyStock.holidayDeclaredTitle', 'Declare as Holiday?'),
      message: t('dailyStock.holidayDeclaredMsg', 'Marking this period as a holiday will automatically carry forward opening stock and lock transactions.'),
      isDanger: false,
      confirmText: "Declare Holiday",
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
                opening_balance: parseInt(row.opening_balance, 10) || 0,
                closing_balance: parseInt(row.closing_balance, 10) || 0,
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
        showAlert({ title: "Holiday Declared", message: "Date block safely preserved as holiday.", type: "success" });
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
    showAlert({ title: "Holiday Cancelled", message: "Date block unlocked for daily entry.", type: "success" });
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
    if (customRangeMode) return;
    setIsDirty(true);
    const numericValue = value === '' ? '' : parseInt(value, 10) || 0;

    setStockRows(prevRows => {
      const updatedRows = prevRows.map(row => {
        if (row.brand_id === brandId) {
          let updatedRow = { ...row, [field]: numericValue };
          if (field === 'purchase_qty') {
            const currentPurchase = value === '' ? 0 : parseInt(value, 10) || 0;
            updatedRow.opening_balance = updatedRow.base_opening + currentPurchase;
          } else if (field === 'opening_balance') {
            const targetBaseOpening = Math.max(0, numericValue - (parseInt(row.purchase_qty, 10) || 0));
            updatedRow.base_opening = targetBaseOpening;
            updatedRow.starting_batches = scaleStartingBatches(row.starting_batches, targetBaseOpening, row.carried_price, row.carried_mrp);
          }
          updatedRow = recalculateRow(updatedRow);
          return updatedRow;
        }
        return row;
      });

      let tQty = 0; 
      let tRev = 0; 
      let tMrpRev = 0;
      updatedRows.forEach(r => { 
        if (r.closing_balance !== '') {
          tQty += r.sales_qty; 
          tRev = safeRound(tRev + r.sales_amount); 
          tMrpRev = safeRound(tMrpRev + r.sales_mrp_amount);
        }
      });
      setDailySummary(prev => ({ ...prev, totalSalesQty: tQty, totalRevenue: tRev, totalMrpRevenue: tMrpRev }));
      return updatedRows;
    });
  };

  const openPurchaseModal = (row) => {
    if (customRangeMode) return;
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
    
    const newQty = parseInt(purchaseModal.qty, 10) || 0;
    const newPrice = parseFloat(purchaseModal.price) || purchaseModal.brand.carried_price;
    const newMrp = parseFloat(purchaseModal.mrp) || purchaseModal.brand.carried_mrp;
    const targetDateStr = formatDateForDB(endDate || startDate);

    try {
      const targetRow = stockRows.find(row => row.brand_id === purchaseModal.brand.brand_id);
      if (!targetRow) return;

      const newOpeningBalance = targetRow.base_opening + newQty;
      const currentClosing = targetRow.closing_balance === '' ? null : parseInt(targetRow.closing_balance, 10);

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

        let tQty = 0; 
        let tRev = 0; 
        let tMrpRev = 0;
        updatedRows.forEach(r => { 
          if (r.closing_balance !== '') {
            tQty += r.sales_qty; 
            tRev = safeRound(tRev + r.sales_amount); 
            tMrpRev = safeRound(tMrpRev + r.sales_mrp_amount);
          }
        });
        setDailySummary(prev => ({ ...prev, totalSalesQty: tQty, totalRevenue: tRev, totalMrpRevenue: tMrpRev }));
        return updatedRows;
      });

      setRefreshTrigger(prev => prev + 1);
      setIsDirty(false);
    } catch (err) {
      showAlert({ title: "Reconciliation Failed", message: err.message, type: "error" });
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
            const op = parseInt(row.opening_balance, 10) || 0;
            const pQty = parseInt(row.purchase_qty, 10) || 0;
            const cl = isLastDay 
              ? (row.closing_balance === '' ? null : parseInt(row.closing_balance, 10)) 
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
          opening_balance: parseInt(row.opening_balance, 10) || 0,
          closing_balance: row.closing_balance === '' ? null : parseInt(row.closing_balance, 10),
          unit_price: parseFloat(row.purchase_price) || parseFloat(row.carried_price) || parseFloat(row.selling_price) || 0,
          unit_mrp: parseFloat(row.purchase_mrp) || parseFloat(row.carried_mrp) || parseFloat(row.mrp_price) || 0
        }));

        const { error } = await supabase.from('daily_stock').upsert(upsertData, { onConflict: 'date, brand_id, user_id' });
        if (error) throw error;
      }

      const brandUpdates = stockRows.map(async (row) => {
        if (parseInt(row.purchase_qty, 10) > 0) {
          const activePrice = parseFloat(row.purchase_price);
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

      setSaveMessage({ type: 'success', text: t('dailyStock.saveSuccessMessage', 'Inventory metrics saved successfully!') });
      setTimeout(() => setSaveMessage(null), 3000);
      setRefreshTrigger(prev => prev + 1);
      setIsDirty(false);
    } catch (err) {
      showAlert({ title: "Database Error", message: err.message, type: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  // ADD / UPDATE EXPENSE
  const handleAddExpense = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    const dateStr = formatDateForDB(popupDate);

    try {
      if (editingExpenseId) {
        const { error } = await supabase.from('expenses').update({
          date: dateStr, 
          description: expenseForm.description, 
          amount: parseFloat(expenseForm.amount)
        }).eq('id', editingExpenseId);

        if (error) throw error;
        setEditingExpenseId(null);
      } else {
        const { error } = await supabase.from('expenses').insert([{
          user_id: user.id, 
          date: dateStr, 
          description: expenseForm.description, 
          amount: parseFloat(expenseForm.amount)
        }]);

        if (error) throw error;
      }

      await saveNewDescription('expense', expenseForm.description);
      setExpenseForm({ description: '', amount: '' });
      await fetchPopupData(popupDate);
      setRefreshTrigger(prev => prev + 1);
    } catch (err) {
      showAlert({ title: "Expense Save Failed", message: err.message, type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const editExpense = (exp) => { 
    setEditingExpenseId(exp.id); 
    setExpenseForm({ description: exp.description, amount: exp.amount }); 
  };
  
  const openDeleteExpense = (id) => {
    showConfirm({
      title: t('common.delete', 'Delete Expense?'), 
      message: 'This expense transaction record will be permanently deleted.', 
      isDanger: true,
      confirmText: "Delete",
      onConfirm: async () => {
        setIsSubmitting(true); 
        const { error } = await supabase.from('expenses').delete().eq('id', id); 
        if (!error) { 
          await fetchPopupData(popupDate); 
          setRefreshTrigger(prev => prev + 1); 
        } 
        setIsSubmitting(false);
      }
    });
  };

  // ADD / UPDATE COLLECTION
  const handleAddCollection = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    const dateStr = formatDateForDB(popupDate);

    try {
      if (editingCollectionId) {
        const { error } = await supabase.from('owner_withdrawals').update({
          date: dateStr, 
          description: collectionForm.description, 
          amount: parseFloat(collectionForm.amount), 
          withdrawal_mode: collectionForm.mode
        }).eq('id', editingCollectionId);

        if (error) throw error;
        setEditingCollectionId(null);
      } else {
        const { error } = await supabase.from('owner_withdrawals').insert([{
          user_id: user.id, 
          date: dateStr, 
          description: collectionForm.description, 
          amount: parseFloat(collectionForm.amount), 
          withdrawal_mode: collectionForm.mode
        }]);

        if (error) throw error;
      }

      await saveNewDescription('collection', collectionForm.description);
      setCollectionForm({ description: 'Transferred to Bank', amount: '', mode: 'UPI/Bank' });
      await fetchPopupData(popupDate);
      setRefreshTrigger(prev => prev + 1);
    } catch (err) {
      showAlert({ title: "Collection Save Failed", message: err.message, type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const editCollection = (coll) => { 
    setEditingCollectionId(coll.id); 
    setCollectionForm({ description: coll.description, amount: coll.amount, mode: coll.withdrawal_mode }); 
  };
  
  const openDeleteCollection = (id) => {
    showConfirm({
      title: t('common.delete', 'Delete Entry?'), 
      message: 'This collection entry will be permanently removed.', 
      isDanger: true,
      confirmText: "Delete",
      onConfirm: async () => {
        setIsSubmitting(true); 
        const { error } = await supabase.from('owner_withdrawals').delete().eq('id', id); 
        if (!error) { 
          await fetchPopupData(popupDate); 
          setRefreshTrigger(prev => prev + 1); 
        } 
        setIsSubmitting(false);
      }
    });
  };

  const tableTotalOpeningQty = stockRows.reduce((acc, row) => acc + (parseInt(row.opening_balance, 10) || 0), 0);
  const tableTotalClosingQty = stockRows.reduce((acc, row) => acc + (parseInt(row.closing_balance, 10) || 0), 0);

  const tableTotalOpeningAmount = stockRows.reduce((acc, row) => {
    const baseVal = row.starting_batches ? row.starting_batches.reduce((sum, b) => safeRound(sum + (b.qty * b.price)), 0) : 0;
    const purchaseVal = safeRound((parseInt(row.purchase_qty, 10) || 0) * parseFloat(row.purchase_price || 0));
    return safeRound(acc + baseVal + purchaseVal);
  }, 0);

  const tableTotalClosingAmount = stockRows.reduce((acc, row) => {
    if (row.closing_balance === '' || row.closing_balance === null) return acc;
    return safeRound(acc + (row.closing_amount || 0));
  }, 0);

  const tableTotalOpeningMrpAmount = stockRows.reduce((acc, row) => {
    const baseVal = row.starting_batches ? row.starting_batches.reduce((sum, b) => safeRound(sum + (b.qty * b.mrp)), 0) : 0;
    const purchaseVal = safeRound((parseInt(row.purchase_qty, 10) || 0) * parseFloat(row.purchase_mrp || 0));
    return safeRound(acc + baseVal + purchaseVal);
  }, 0);

  const tableTotalClosingMrpAmount = stockRows.reduce((acc, row) => {
    if (row.closing_balance === '' || row.closing_balance === null) return acc;
    return safeRound(acc + (row.closing_mrp_amount || 0));
  }, 0);

  const tableTotalMrpRevenue = stockRows.reduce((acc, row) => {
    if (row.closing_balance === '' || row.closing_balance === null) return acc;
    return safeRound(acc + (row.sales_mrp_amount || 0));
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

      {/* HOLIDAY DECLARED INFO MODAL */}
      {holidayModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200 z-100000">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-800 text-center p-6">
            <div className="w-20 h-20 bg-orange-100 dark:bg-orange-900/30 text-orange-500 rounded-full flex items-center justify-center mb-5 shadow-inner border border-orange-200 dark:border-orange-800 mx-auto">
              <CalendarOff size={40} />
            </div>
            <h3 className="text-2xl font-black text-slate-800 dark:text-white mb-2">{t('dailyStock.holidayDeclaredTitle', 'Holiday Declared!')}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
              The selected date <strong className="text-slate-800 dark:text-white">{formatDisplayDate(holidayModal.date)}</strong> is marked as a holiday.
            </p>
            <div className="flex flex-col gap-2">
              <button 
                onClick={() => handleCancelHolidayFromModal(holidayModal.dateStr)} 
                disabled={isSaving}
                className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <Trash2 size={18} /> {isSaving ? t('common.saving', 'Unlocking...') : t('dailyStock.cancelHolidayButton', 'Cancel Holiday & Unlock')}
              </button>
              <button 
                onClick={() => setHolidayModal({ isOpen: false, date: null, dateStr: '' })} 
                className="w-full px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-colors cursor-pointer"
              >
                {t('common.close', 'Close')}
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
            {t('dailyStock.pipelineLockedWarning', 'Reconciliation Locked: The closing stock for previous working day is incomplete. You must save its closing balance or declare it as a holiday before managing subsequent dates.')}
          </p>
        </div>
      )}

      {/* Control Bar: z-40 ensures DatePicker floats over table and cards */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 relative z-40">
        <div className="shrink-0">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
            <Package className="text-blue-500" /> {t('dailyStock.title', 'Daily Stock Ledger')}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{t('dailyStock.description', 'Reconcile opening stock, purchases, and closing balances.')}</p>
        </div>
        
        <div className="flex-1 min-w-0 flex xl:justify-end mt-2 xl:mt-0">
          <div className="flex flex-wrap items-center justify-start xl:justify-end gap-2 max-w-full">
            
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/50 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-inner relative z-40">
              <DatePicker 
                selected={startDate} onChange={handleStartDateChange} maxDate={new Date()} dateFormat="dd MMM yyyy" 
                customInput={<CustomDateInput placeholder={t('dailyStock.startDatePlaceholder', 'Start Date')} />} 
                showMonthDropdown showYearDropdown dropdownMode="select"
                dayClassName={getDayClassName}
                selectsStart
                startDate={startDate}
                endDate={endDate}
                popperPlacement="bottom-start"
              />
              <span className="text-slate-400 font-bold px-1 hidden sm:block">{t('common.to', 'to')}</span>
              <DatePicker 
                selected={endDate} onChange={handleEndDateChange} minDate={startDate} maxDate={new Date()} dateFormat="dd MMM yyyy" 
                customInput={<CustomDateInput placeholder={t('dailyStock.endDatePlaceholder', 'End Date')} />} 
                showMonthDropdown showYearDropdown dropdownMode="select"
                dayClassName={getDayClassName}
                selectsEnd
                startDate={startDate}
                endDate={endDate}
                popperPlacement="bottom-end"
              />
            </div>
            
            {!customRangeMode && (
              <button onClick={openHolidayConfirm} disabled={isHolidaySelected || isAnyDateFilled || !!pipelineWarning} className="shrink-0 flex items-center gap-1.5 h-10.5 bg-orange-500 text-white px-3 rounded-xl text-sm font-bold hover:bg-orange-600 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
                <Coffee size={18} /> {t('dailyStock.markHolidayButton', 'Mark Holiday')}
              </button>
            )}
            
            <button 
              type="button"
              onClick={() => {
                setCustomRangeMode(!customRangeMode);
                setStartDate(new Date());
                setEndDate(new Date());
              }} 
              className={`shrink-0 flex items-center gap-1.5 h-10.5 px-3 rounded-xl text-sm font-bold border transition-all shadow-sm cursor-pointer ${customRangeMode ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700' : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            >
              <ArrowRightLeft size={16} /> {customRangeMode ? t('dailyStock.reconcileModeButton', 'Reconcile Mode') : t('dailyStock.customViewButton', 'Custom View')}
            </button>

            {!customRangeMode && (
              <button onClick={handleOpenBankDeposit} className="shrink-0 flex items-center gap-1.5 h-10.5 bg-emerald-600 text-white px-3 rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all shadow-sm cursor-pointer">
                <Landmark size={18} /> {t('dailyStock.expensesCashButton', 'Expenses & Cash')}
              </button>
            )}

            {!customRangeMode && isCurrentSelectionARangeEnd && (
              <button 
                onClick={handleResetRangeData} 
                disabled={isSaving}
                className="shrink-0 flex items-center gap-1.5 h-10.5 bg-red-600 hover:bg-red-700 text-white px-4 rounded-xl text-sm font-bold transition-all shadow-sm disabled:opacity-50 cursor-pointer"
              >
                <Trash2 size={18} /> {t('dailyStock.splitRangeButton', 'Split Range')}
              </button>
            )}

            {!customRangeMode && (
              <button onClick={handleSaveStock} disabled={isSaving || isHolidaySelected || !!pipelineWarning} className="shrink-0 flex items-center gap-1.5 h-10.5 bg-blue-600 text-white px-4 rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
                <Save size={18} /> {isSaving ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
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
            {t('dailyStock.customViewBanner', 'Custom View Mode Active (Read-Only): Showing operational statistics. Edits are locked.')}
          </p>
        </div>
      ) : isMultiDayRange && !isHolidaySelected && !pipelineWarning && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 flex items-start sm:items-center gap-3 animate-in fade-in">
          <Info className="text-blue-500 shrink-0 mt-0.5 sm:mt-0" size={20} />
          <p className="text-sm text-blue-800 dark:text-blue-300 leading-relaxed font-semibold">
            {t('dailyStock.reconcileRangeBanner', 'Reconcile Range Selected: Visualizing chain. Use Save to commit closing stock.')}
          </p>
        </div>
      )}

      {isHolidaySelected ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 text-center shadow-sm border border-orange-200 dark:border-orange-900/50 flex flex-col items-center justify-center min-h-[50vh] animate-in zoom-in duration-300">
          <div className="w-24 h-24 bg-orange-100 dark:bg-orange-900/30 text-orange-500 rounded-full flex items-center justify-center mb-6 shadow-inner border border-orange-200 dark:border-orange-800">
            <CalendarOff size={48} />
          </div>
          <h3 className="text-3xl font-black text-slate-800 dark:text-white mb-3">{t('dailyStock.holidayDeclaredTitle', 'Holiday Declared!')}</h3>
          <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-lg text-lg">
            {t('dailyStock.holidayDeclaredMsg', 'Sales records are locked for this period. Your stock metrics have been carried forward.')}
          </p>
          {!customRangeMode && (
            <button onClick={handleRemoveHoliday} disabled={isSaving} className="px-6 py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl flex items-center gap-2 transition-all shadow-md hover:shadow-lg disabled:opacity-50 mx-auto cursor-pointer">
              <Trash2 size={20} /> {isSaving ? t('common.saving', 'Unlocking...') : t('dailyStock.cancelHolidayButton', 'Cancel Holiday & Unlock')}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className={`grid grid-cols-1 sm:grid-cols-3 gap-6 relative z-10 animate-in fade-in transition-opacity ${pipelineWarning && !customRangeMode ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="bg-linear-to-br from-indigo-500 to-indigo-700 p-6 rounded-2xl shadow-sm text-white relative overflow-hidden group">
              <div className="absolute right-0 top-0 opacity-10 transform translate-x-1/4 -translate-y-1/4"><Calculator size={120} /></div>
              <p className="text-indigo-100 font-medium text-sm tracking-wider uppercase mb-2 relative z-10">{t('dailyStock.totalSalesQtyLabel', 'Total Sales Qty')}</p>
              <h3 className="text-4xl font-black relative z-10">{dailySummary.totalSalesQty} <span className="text-lg font-medium opacity-80">{t('common.units', 'Units')}</span></h3>
            </div>

            <div className="bg-linear-to-br from-emerald-500 to-emerald-700 p-6 rounded-2xl shadow-sm text-white relative overflow-hidden group">
              <div className="absolute right-0 top-0 opacity-10 transform translate-x-1/4 -translate-y-1/4"><Calculator size={120} /></div>
              <p className="text-emerald-100 font-medium text-sm tracking-wider uppercase mb-2 relative z-10">{t('dailyStock.generatedRevenueLabel', 'Generated Revenue')}</p>
              <h3 className="text-4xl font-black relative z-10">{formatRs(dailySummary.totalRevenue)}</h3>
            </div>

            <div className="bg-linear-to-br from-red-500 to-red-700 p-6 rounded-2xl shadow-sm text-white relative overflow-hidden group">
              <div className="absolute right-0 top-0 opacity-10 transform translate-x-1/4 -translate-y-1/4"><Receipt size={120} /></div>
              <p className="text-red-100 font-medium text-sm tracking-wider uppercase mb-2 relative z-10">{t('dailyStock.expensesLabel', 'Expenses')}</p>
              <h3 className="text-4xl font-black relative z-10">{formatRs(dailySummary.totalExpenses)}</h3>
            </div>
          </div>

          <div className={`bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden relative z-10 animate-in fade-in slide-in-from-bottom-4 transition-opacity ${pipelineWarning && !customRangeMode ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300 min-w-220">
                <thead className="bg-slate-50/80 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-semibold uppercase text-[11px] tracking-wider border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-3 py-4 w-10"></th> 
                    <th className="px-3 py-4">{t('dailyStock.detailsHeader', 'Brand Details')}</th>
                    <th className="px-4 py-4 text-center">{t('dailyStock.openingBalHeader', 'Opening Bal.')}<br/><span className="text-slate-400 dark:text-slate-500 text-[10px] font-normal">{t('dailyStock.openingBalSub', '(Editable)')}</span></th>
                    <th className="px-4 py-4 text-center">{t('dailyStock.purchasesQtyHeader', 'Purchases Qty')}<br/><span className="text-slate-400 dark:text-slate-500 text-[10px] font-normal">{t('dailyStock.purchasesQtySub', '(Click to Add)')}</span></th>
                    <th className="px-4 py-4 text-center">{t('dailyStock.closingBalHeader', 'Closing Bal.')}<br/><span className="text-slate-400 dark:text-slate-500 text-[10px] font-normal">{t('dailyStock.closingBalSub', '(Input)')}</span></th>
                    <th className="px-4 py-4 text-center text-indigo-600 dark:text-indigo-400">{t('dailyStock.saleQtyHeader', 'Sale Qty')}<br/><span className="text-slate-400 dark:text-slate-500 text-[10px] font-normal">{t('dailyStock.saleQtySub', '(Auto)')}</span></th>
                    <th className="px-6 py-4 text-right text-purple-600 dark:text-purple-400 font-semibold">{t('dailyStock.mrpAmountHeader', 'MRP Amount')}<br/><span className="text-slate-400 dark:text-slate-500 text-[10px] font-normal">{t('dailyStock.mrpAmountSub', '(Auto FIFO)')}</span></th>
                    <th className="px-6 py-4 text-right text-emerald-600 dark:text-emerald-400">{t('dailyStock.saleAmtHeader', 'Sale Amount')}<br/><span className="text-slate-400 dark:text-slate-500 text-[10px] font-normal">{t('dailyStock.saleAmtSub', '(Auto FIFO)')}</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <tr><td colSpan="8" className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">{t('dailyStock.syncingStock', 'Syncing stock data...')}</td></tr>
                  ) : stockRows.length === 0 ? (
                    <tr><td colSpan="8" className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">{t('dailyStock.noBrands', 'No brands found. Go to Brand Master to register items.')}</td></tr>
                  ) : (
                    stockRows.map((row, index) => (
                      <tr key={row.brand_id} draggable={!customRangeMode} onDragStart={() => (dragItem.current = index)} onDragEnter={() => (dragOverItem.current = index)} onDragEnd={handleSort} onDragOver={(e) => e.preventDefault()} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/80 transition-colors group bg-white dark:bg-slate-900">
                        <td className="px-3 py-4 text-center cursor-move">
                          {!customRangeMode && <GripVertical size={16} className="text-slate-300 dark:text-slate-600 group-hover:text-blue-500 transition-colors" />}
                        </td>
                        
                        <td className="px-3 py-4">
                          <div className="font-bold text-slate-800 dark:text-slate-100">{row.brand_name}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-col gap-1 max-w-sm">
                            <span className="font-semibold uppercase tracking-wider text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded w-fit">{row.bottle_size}</span>
                            
                            {/* SMART 2-BATCH CONTAINER: Automatically hides 0 LEFT depleted batches & scrolls if > 2 */}
                            <div className="flex flex-col gap-1 bg-slate-50/70 dark:bg-slate-900/60 p-2 rounded-xl border border-slate-200/60 dark:border-slate-800 mt-1 max-h-88px] overflow-y-auto custom-scrollbar">
                              {(() => {
                                const activeBatches = [];
                                
                                if (row.starting_batches && row.starting_batches.length > 0) {
                                  row.starting_batches.forEach((b, idx) => {
                                    activeBatches.push({ 
                                      label: `Batch ${row.starting_batches.length > 1 ? idx + 1 : 'Old'}`, 
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
                                  let remainingStock = parseInt(row.closing_balance, 10) || 0;
                                  for (let i = activeBatches.length - 1; i >= 0; i--) {
                                    const allocated = Math.min(activeBatches[i].qty, remainingStock);
                                    activeBatches[i].left = allocated;
                                    remainingStock -= allocated;
                                  }
                                } else {
                                  activeBatches.forEach(b => { b.left = b.qty; });
                                }

                                // FILTER OUT 0 LEFT DEPLETED BATCHES FOR CLEAN USER EXPERIENCE
                                const visibleBatches = activeBatches.filter(b => b.left > 0 || b.isNew);

                                if (visibleBatches.length === 0) {
                                  return (
                                    <div className="text-[11px] text-slate-400 py-0.5">
                                      Baseline Rate (MRP: {formatRs(row.purchase_mrp || row.carried_mrp || row.mrp_price)} | Sale: {formatRs(row.purchase_price || row.carried_price || row.selling_price)})
                                    </div>
                                  );
                                }

                                return visibleBatches.map((batch, idx) => {
                                  return (
                                    <div 
                                      key={`batch-row-${idx}`} 
                                      className={`flex items-center justify-between gap-x-2 py-1 ${idx > 0 ? 'border-t border-slate-100 dark:border-slate-800/50' : ''}`}
                                    >
                                      <div className="flex flex-wrap items-center gap-x-1.5 text-[10.5px]">
                                        <span className="font-black text-slate-800 dark:text-slate-100 shrink-0">{batch.label}:</span>
                                        <span className="font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">Sale: ₹{batch.price}</span>
                                        <span className="text-slate-300 dark:text-slate-700 text-[8px]">•</span>
                                        <span className="text-slate-400 dark:text-slate-500 whitespace-nowrap">MRP: ₹{batch.mrp}</span>
                                      </div>
                                      
                                      <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 shrink-0 whitespace-nowrap">
                                        {batch.left} {t('dailyStock.leftBadge', 'left')}
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
                            disabled={isHolidaySelected || customRangeMode}
                            value={row.opening_balance ?? ''} 
                            onChange={(e) => handleInputChange(row.brand_id, 'opening_balance', e.target.value)} 
                            className={`${numInputClass} border-amber-300 dark:border-amber-800 focus:ring-amber-500 disabled:opacity-75 disabled:cursor-not-allowed`} 
                          />
                        </td>
                        
                        <td className="px-4 py-4 text-center">
                          <button 
                            disabled={isHolidaySelected || customRangeMode}
                            onClick={() => openPurchaseModal(row)}
                            className={`w-20 px-2 py-2 rounded-lg text-sm text-center font-bold transition-all border outline-none mx-auto block ${isHolidaySelected || customRangeMode ? 'opacity-75 cursor-not-allowed' : 'cursor-pointer'} ${row.purchase_qty > 0 ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-600 hover:text-blue-600 dark:hover:text-blue-400'}`}
                          >
                            {row.purchase_qty === 0 ? '+ Add' : row.purchase_qty}
                          </button>
                        </td>

                        <td className="px-4 py-4 text-center">
                          <input 
                            type="number" 
                            min="0" 
                            placeholder="Qty" 
                            disabled={isHolidaySelected || customRangeMode}
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
                        <div className="font-black text-slate-800 dark:text-slate-100 flex justify-end items-center gap-2"><Sigma size={16} className="text-blue-600" /> {t('common.totals', 'TOTALS')}</div>
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
                      <td colSpan="7" className="px-4 py-2 text-right font-bold text-red-500 dark:text-red-400">{t('dailyStock.businessExpensesRow', 'Business Expenses :')}</td>
                      <td className="px-6 py-2 text-right font-bold text-red-500 dark:text-red-400">- {formatRs(dailySummary.totalExpenses)}</td>
                    </tr>
                    <tr>
                      <td colSpan="7" className="px-4 py-2 text-right font-bold text-red-500 dark:text-red-400">{t('dailyStock.onlineCollectedRow', 'Online Collected :')}</td>
                      <td className="px-6 py-2 text-right font-bold text-red-500 dark:text-red-400">- {formatRs(dailySummary.totalCollections)}</td>
                    </tr>
                    <tr className="bg-emerald-50/50 dark:bg-emerald-900/10 border-t border-slate-200 dark:border-slate-700">
                      <td colSpan="7" className="px-4 py-4 text-right font-black text-emerald-700 dark:text-emerald-400 text-sm uppercase tracking-wider">{t('dailyStock.netInHandCashRow', 'Net In-Hand Cash :')}</td>
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
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-100000">
          <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[95vh] sm:max-h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-200">
            
            <div className="flex justify-between items-center px-5 py-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 shrink-0">
              <h3 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Package size={20} className="text-blue-500" /> {t('dailyStock.recordPurchaseTitle', 'Record Batch Purchase')}
              </h3>
              <button 
                type="button"
                onClick={() => setPurchaseModal({ isOpen: false, brand: null, qty: '', price: '', mrp: '', isPriceChanged: false, isMrpChanged: false })} 
                className="p-1.5 sm:p-2 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-red-500 hover:text-white rounded-full transition-colors outline-none cursor-pointer"
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
                <label className="block text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">{t('dailyStock.quantityAddedLabel', 'Quantity Added')}</label>
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
                <label className="block text-[11px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5">{t('dailyStock.mrpChangeQuestion', 'Is there an MRP change for this batch?')}</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label className="flex items-center gap-2.5 cursor-pointer group bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-300 transition-colors">
                    <input 
                      type="radio" 
                      name="mrpChange" 
                      checked={!purchaseModal.isMrpChanged} 
                      onChange={() => setPurchaseModal({...purchaseModal, isMrpChanged: false, mrp: purchaseModal.brand.carried_mrp || purchaseModal.brand.mrp_price})} 
                      className="w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 focus:ring-blue-500 dark:bg-slate-700 dark:border-slate-600 shrink-0" 
                    />
                    <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 group-hover:text-blue-600 transition-colors truncate">{t('dailyStock.mrpNoChange', 'No')} (₹{purchaseModal.brand?.carried_mrp || purchaseModal.brand?.mrp_price})</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer group bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-300 transition-colors">
                    <input 
                      type="radio" 
                      name="mrpChange" 
                      checked={purchaseModal.isMrpChanged} 
                      onChange={() => setPurchaseModal({...purchaseModal, isMrpChanged: true})} 
                      className="w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 focus:ring-blue-500 dark:bg-slate-700 dark:border-slate-600 shrink-0" 
                    />
                    <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 group-hover:text-blue-600 transition-colors">{t('dailyStock.mrpYesChange', 'Yes, custom batch MRP')}</span>
                  </label>
                </div>
              </div>

              {purchaseModal.isMrpChanged && (
                <div className="animate-in fade-in slide-in-from-top-2 pt-1">
                  <label className="flex justify-between text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    <span>{t('dailyStock.batchMrpPriceLabel', 'Batch MRP Price (₹)')}</span>
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
                <label className="block text-[11px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5">{t('dailyStock.priceChangeQuestion', 'Is there a selling price change for this batch?')}</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label className="flex items-center gap-2.5 cursor-pointer group bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-300 transition-colors">
                    <input 
                      type="radio" 
                      name="priceChange" 
                      checked={!purchaseModal.isPriceChanged} 
                      onChange={() => setPurchaseModal({...purchaseModal, isPriceChanged: false, price: purchaseModal.brand.carried_price})} 
                      className="w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 focus:ring-blue-500 dark:bg-slate-700 dark:border-slate-600 shrink-0" 
                    />
                    <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 group-hover:text-blue-600 transition-colors truncate">{t('dailyStock.priceNoChange', 'No')} (₹{purchaseModal.brand?.carried_price})</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer group bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-300 transition-colors">
                    <input 
                      type="radio" 
                      name="priceChange" 
                      checked={purchaseModal.isPriceChanged} 
                      onChange={() => setPurchaseModal({...purchaseModal, isPriceChanged: true})} 
                      className="w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 focus:ring-blue-500 dark:bg-slate-700 dark:border-slate-600 shrink-0" 
                    />
                    <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 group-hover:text-blue-600 transition-colors">{t('dailyStock.priceYesChange', 'Yes, custom batch price')}</span>
                  </label>
                </div>
              </div>

              {purchaseModal.isPriceChanged && (
                <div className="animate-in fade-in slide-in-from-top-2 pt-1">
                  <label className="flex justify-between text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    <span>{t('dailyStock.batchSellingPriceLabel', 'Batch Selling Price (₹)')}</span>
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
                {t('dailyStock.fifoNote', '* Note: Older stock continues to sell at previous operational rates. New rates apply only to these new batch bottles.')}
              </p>

              <button 
                type="submit" 
                className="w-full mt-2 sm:mt-4 bg-blue-600 text-white font-bold py-2.5 sm:py-3 px-4 rounded-xl hover:bg-blue-700 transition-all duration-300 shadow-md hover:shadow-lg flex justify-center items-center gap-2 shrink-0 text-sm cursor-pointer"
              >
                <CheckCircle2 size={18} /> {t('dailyStock.reconcileBatchButton', 'Reconcile Batch')}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* FULLY RESPONSIVE FINANCIAL OPERATIONS MODAL (TOP-LAYER z-[100000]) */}
      {isBankDepositOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 z-100000 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-5xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-xl">
                  <Landmark size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    {t('dailyStock.cashLedgerTitle', 'Operational Cash Ledger')}
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold mt-0.5">
                    Viewing records for: <strong className="text-blue-600 dark:text-blue-400">{formatDisplayDate(popupDate)}</strong>
                  </p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setIsBankDepositOpen(false)} 
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors outline-none cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>
            
            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar flex-1">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Form Column with dedicated high z-index datepicker container */}
                <div className="bg-slate-50/60 dark:bg-slate-950 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 h-fit overflow-visible relative z-30">
                  
                  {/* Tab Switcher */}
                  <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-900/50 rounded-t-2xl overflow-hidden">
                    <button 
                      type="button"
                      onClick={() => {
                        setPopupTab('expense');
                        setEditingCollectionId(null);
                        setCollectionForm({ description: 'Transferred to Bank', amount: '', mode: 'UPI/Bank' });
                      }} 
                      className={`flex-1 py-3.5 text-xs font-extrabold text-center transition-all cursor-pointer ${
                        popupTab === 'expense' 
                          ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-b-2 border-red-500' 
                          : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                    >
                      {t('dailyStock.businessExpenseTab', 'Business Expense')}
                    </button>
                    <button 
                      type="button"
                      onClick={() => {
                        setPopupTab('collection');
                        setEditingExpenseId(null);
                        setExpenseForm({ description: '', amount: '' });
                      }} 
                      className={`flex-1 py-3.5 text-xs font-extrabold text-center transition-all cursor-pointer ${
                        popupTab === 'collection' 
                          ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500' 
                          : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                    >
                      {t('dailyStock.onlineCollectionTab', 'Online Collection')}
                    </button>
                  </div>

                  <div className="p-5">
                    {popupTab === 'expense' ? (
                      <form onSubmit={handleAddExpense} className="space-y-4">
                        <div className="form-date-picker relative z-50">
                          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">{t('common.date', 'Date')}</label>
                          <DatePicker 
                            selected={popupDate} 
                            onChange={(date) => { setPopupDate(date); }} 
                            dateFormat="dd MMM yyyy" 
                            className={inputClass} 
                            customInput={<FormDateInput className={inputClass} />} 
                            showMonthDropdown
                            showYearDropdown
                            dropdownMode="select"
                            popperPlacement="bottom-start"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">{t('common.description', 'Description')}</label>
                          <AutocompleteInput 
                            required 
                            value={expenseForm.description} 
                            onChange={(val) => setExpenseForm({ ...expenseForm, description: val })} 
                            options={savedDescriptions.filter(d => d.type === 'expense')}
                            onDeleteOption={handleDeleteDescription}
                            className={inputClass} 
                            placeholder="e.g., Light Bill, Rent" 
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">{t('common.amount', 'Amount')} (₹)</label>
                          <input type="number" required min="1" step="any" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} className={inputClass} placeholder="0.00" />
                        </div>
                        
                        {editingExpenseId ? (
                          <div className="flex gap-2.5 pt-1">
                            <button type="button" onClick={() => { setEditingExpenseId(null); setExpenseForm({ description: '', amount: '' }); }} className="flex-1 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold py-2.5 rounded-xl hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors text-xs cursor-pointer">{t('common.cancel', 'Cancel')}</button>
                            <button type="submit" disabled={isSubmitting} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl transition-colors text-xs cursor-pointer">{t('dailyStock.updateExpenseButton', 'Update')}</button>
                          </div>
                        ) : (
                          <button type="submit" disabled={isSubmitting} className="w-full mt-2 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 text-xs shadow-md cursor-pointer"><Plus size={16}/> {t('dailyStock.addExpenseButton', 'Add Expense')}</button>
                        )}
                      </form>
                    ) : (
                      <form onSubmit={handleAddCollection} className="space-y-4">
                        <div className="form-date-picker relative z-50">
                          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">{t('common.date', 'Date')}</label>
                          <DatePicker 
                            selected={popupDate} 
                            onChange={(date) => { setPopupDate(date); }} 
                            dateFormat="dd MMM yyyy" 
                            className={inputClass} 
                            customInput={<FormDateInput className={inputClass} />} 
                            showMonthDropdown
                            showYearDropdown
                            dropdownMode="select"
                            popperPlacement="bottom-start"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">{t('common.description', 'Description')}</label>
                          <AutocompleteInput 
                            required 
                            value={collectionForm.description} 
                            onChange={(val) => setCollectionForm({ ...collectionForm, description: val })} 
                            options={savedDescriptions.filter(d => d.type === 'collection')}
                            onDeleteOption={handleDeleteDescription}
                            className={inputClass} 
                            placeholder="e.g., Bank Deposit" 
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">{t('common.amount', 'Amount')} (₹)</label>
                            <input type="number" required min="1" value={collectionForm.amount} onChange={(e) => setCollectionForm({ ...collectionForm, amount: e.target.value })} className={inputClass} placeholder="0.00" />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">{t('common.mode', 'Mode')}</label>
                            <select value={collectionForm.mode} onChange={(e) => setCollectionForm({ ...collectionForm, mode: e.target.value })} className={inputClass}>
                              <option value="UPI/Bank">UPI/Bank</option>
                              <option value="Cash">Cash</option>
                            </select>
                          </div>
                        </div>

                        {editingCollectionId ? (
                          <div className="flex gap-2.5 pt-1">
                            <button type="button" onClick={() => { setEditingCollectionId(null); setCollectionForm({ description: 'Transferred to Bank', amount: '', mode: 'UPI/Bank' }); }} className="flex-1 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold py-2.5 rounded-xl hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors text-xs cursor-pointer">{t('common.cancel', 'Cancel')}</button>
                            <button type="submit" disabled={isSubmitting} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl transition-colors text-xs cursor-pointer">{t('dailyStock.updateCollectionButton', 'Update')}</button>
                          </div>
                        ) : (
                          <button type="submit" disabled={isSubmitting} className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 text-xs shadow-md cursor-pointer"><ArrowDownCircle size={16} /> {t('dailyStock.recordCollectionButton', 'Record Collection')}</button>
                        )}
                      </form>
                    )}
                  </div>
                </div>

                {/* Table Log Column */}
                <div className="lg:col-span-2 bg-white dark:bg-slate-950 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col h-full relative z-10">
                  <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex justify-between items-center">
                    <h4 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                      {popupTab === 'expense' ? <Receipt size={16} className="text-red-500"/> : <Landmark size={16} className="text-indigo-500"/>}
                      {popupTab === 'expense' ? t('dailyStock.dailyExpensesTitle', 'Daily Expenses Log') : t('dailyStock.dailyCollectionsTitle', 'Daily Online Collections')}
                    </h4>
                    <span className="text-[11px] font-mono text-slate-400">
                      Total: ₹{((popupTab === 'expense' ? expenses : collections).reduce((sum, r) => sum + parseFloat(r.amount || 0), 0)).toLocaleString('en-IN')}
                    </span>
                  </div>
                  
                  <div className="overflow-x-auto max-h-80 custom-scrollbar flex-1">
                    <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                      <thead className="bg-slate-50/80 dark:bg-slate-900 text-slate-400 font-semibold uppercase text-[10px] tracking-wider sticky top-0 border-b border-slate-100 dark:border-slate-800 z-10">
                        <tr>
                          <th className="px-5 py-3">{t('common.description', 'Description')}</th>
                          {popupTab === 'collection' && <th className="px-4 py-3 text-center">{t('common.mode', 'Mode')}</th>}
                          <th className="px-5 py-3 text-right">{t('common.amount', 'Amount')} (₹)</th>
                          <th className="px-4 py-3 text-center">{t('common.actions', 'Actions')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                        {popupLoading ? (
                          <tr><td colSpan={popupTab === 'collection' ? 4 : 3} className="px-6 py-12 text-center text-slate-400">{t('common.loading', 'Loading records...')}</td></tr>
                        ) : (popupTab === 'expense' ? expenses : collections).length === 0 ? (
                          <tr><td colSpan={popupTab === 'collection' ? 4 : 3} className="px-6 py-12 text-center text-slate-400">{t('dailyStock.noRecordsFound', 'No records found for the selected date.')}</td></tr>
                        ) : (
                          (popupTab === 'expense' ? expenses : collections).map((row) => (
                            <tr key={row.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                              <td className="px-5 py-3.5 font-bold text-slate-800 dark:text-slate-100">{row.description}</td>
                              {popupTab === 'collection' && (
                                <td className="px-4 py-3.5 text-center">
                                  <span className={`px-2 py-0.5 text-[9px] font-extrabold uppercase rounded-md ${row.withdrawal_mode === 'Cash' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-500' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                                    {row.withdrawal_mode}
                                  </span>
                                </td>
                              )}
                              <td className={`px-5 py-3.5 text-right font-black ${popupTab === 'expense' ? 'text-red-600 dark:text-red-400' : 'text-indigo-600 dark:text-indigo-400'}`}>
                                ₹{parseFloat(row.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-4 py-3.5 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button onClick={() => popupTab === 'expense' ? editExpense(row) : editCollection(row)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"><Edit2 size={14} /></button>
                                  <button onClick={() => popupTab === 'expense' ? openDeleteExpense(row.id) : openDeleteCollection(row.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors cursor-pointer"><Trash2 size={14} /></button>
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