import { useState, useEffect, forwardRef, useRef } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { Wand2, Calendar, ChevronDown, RefreshCw } from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

// Custom Month Picker Input
const CustomMonthInput = forwardRef(({ value, onClick }, ref) => (
  <button type="button" onClick={onClick} ref={ref} className="flex items-center justify-between px-4 py-2.5 h-12 w-56 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl transition-all duration-200 text-sm font-bold text-slate-700 dark:text-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
    <div className="flex items-center">
      <Calendar size={18} className="text-indigo-500 mr-2 shrink-0" />
      <span>{value || "Select Month"}</span>
    </div>
    <ChevronDown size={16} className="text-slate-400 dark:text-slate-500 ml-2 shrink-0" />
  </button>
));
CustomMonthInput.displayName = "CustomMonthInput";

const formatDateForDB = (dateObj) => {
  if (!dateObj) return '';
  const d = new Date(dateObj);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getLocalDateObj = (dateInput) => {
  if (!dateInput) return null;
  const str = typeof dateInput === 'string' ? dateInput.split('T')[0] : '';
  if (str) {
    const parts = str.split('-');
    if (parts.length === 3) {
      return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }
  }
  const d = new Date(dateInput);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

// दशमलव सटीकता के साथ मुद्रा प्रदर्शन
const formatRs = (num) => '₹' + (num || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Literal Opening Stock MRP Total Calculation
const getOpeningStockMrp = (brands, allStock, currentMonthStartStr) => {
  const firstDayRecords = allStock?.filter(s => {
    const cleanDate = s.date ? s.date.split('T')[0].split(' ')[0] : '';
    return cleanDate === currentMonthStartStr;
  }) || [];
  
  if (firstDayRecords.length > 0) {
    let totalMrp = 0;
    firstDayRecords.forEach(s => {
      const brand = brands?.find(b => b.id === s.brand_id);
      const opQty = parseInt(s.opening_balance) || 0;
      const mrp = parseFloat(s.unit_mrp || (brand ? brand.mrp_price : 0) || 0);
      totalMrp += opQty * mrp;
    });
    return totalMrp;
  }

  const currentMonthYearPrefix = currentMonthStartStr.substring(0, 7);
  const currentMonthRecords = allStock?.filter(s => {
    const cleanDate = s.date ? s.date.split('T')[0].split(' ')[0] : '';
    return cleanDate.startsWith(currentMonthYearPrefix);
  }) || [];

  if (currentMonthRecords.length > 0) {
    const uniqueDates = [...new Set(currentMonthRecords.map(r => {
      return r.date ? r.date.split('T')[0].split(' ')[0] : '';
    }))].sort();
    const earliestDateStr = uniqueDates[0];
    const earliestRecords = currentMonthRecords.filter(r => {
      const cleanDate = r.date ? r.date.split('T')[0].split(' ')[0] : '';
      return cleanDate === earliestDateStr;
    });
    let totalMrp = 0;
    earliestRecords.forEach(s => {
      const brand = brands?.find(b => b.id === s.brand_id);
      const opQty = parseInt(s.opening_balance) || 0;
      const mrp = parseFloat(s.unit_mrp || (brand ? brand.mrp_price : 0) || 0);
      totalMrp += opQty * mrp;
    });
    return totalMrp;
  }
  return 0;
};

// FIFO Stock Valuation Helper to calculate exact true batch stock MRP totals
const getFifoStockValuationMrp = (brands, allStock, targetDateStr) => {
  const brandBatches = {};
  const prevClosing = {};

  const sortedStock = [...(allStock || [])]
    .filter(s => {
      const cleanDate = s.date ? s.date.split('T')[0].split(' ')[0] : '';
      return cleanDate <= targetDateStr;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  sortedStock.forEach(s => {
    if (!brandBatches[s.brand_id]) {
      brandBatches[s.brand_id] = [];
    }
    let queue = brandBatches[s.brand_id];
    const brand = brands?.find(b => b.id === s.brand_id);
    if (!brand) return;

    const opBal = parseInt(s.opening_balance) || 0;
    const pQty = Math.max(0, opBal - (prevClosing[s.brand_id] || 0));
    const pPrice = parseFloat(s.unit_price) || parseFloat(brand.selling_price) || 0;
    const pMrp = parseFloat(s.unit_mrp) || parseFloat(brand.mrp_price) || 0;

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
  });

  let totalMrpValuation = 0;
  brands?.forEach(b => {
    const queue = brandBatches[b.id] || [];
    queue.forEach(batch => {
      totalMrpValuation += batch.qty * batch.mrp;
    });
  });

  return totalMrpValuation;
};

const getTrueOpeningStockMrp = (brands, allStock, currentMonthStartStr, prevMonthEndStr) => {
  const prevMonthEndValuation = getFifoStockValuationMrp(brands, allStock, prevMonthEndStr);
  if (prevMonthEndValuation > 0) {
    return prevMonthEndValuation;
  }
  return getOpeningStockMrp(brands, allStock, currentMonthStartStr);
};

export default function MagicChart() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const prevMonthRef = useRef(null);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const saved = sessionStorage.getItem('mc_selectedMonth');
    return saved ? new Date(saved) : new Date();
  });

  const [syncTrigger, setSyncTrigger] = useState(0);

  // 1-सेकंड पोलिंग इंटरवल (Instantaneous Refresh Check)
  useEffect(() => {
    const interval = setInterval(() => {
      setSyncTrigger(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // REAL-TIME SYNC LISTENER
  useEffect(() => {
    const channel = supabase
      .channel('magicchart-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_stock' }, () => setSyncTrigger(prev => prev + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => setSyncTrigger(prev => prev + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trader_transactions' }, () => setSyncTrigger(prev => prev + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'brands' }, () => setSyncTrigger(prev => prev + 1))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const [salesAmount, setSalesAmount] = useState(0);
  const [expensesAmount, setExpensesAmount] = useState(0);
  const [prevMonthSales, setPrevMonthSales] = useState(0);
  const [prevMonthExpenses, setPrevMonthExpenses] = useState(0);

  const [ledgerOpening, setLedgerOpening] = useState(0);
  const [ledgerClosing, setLedgerClosing] = useState(0);
  const [ledgerPurchases, setLedgerPurchases] = useState(0);

  const [prevMonthOpening, setPrevMonthOpening] = useState(0);
  const [prevMonthClosing, setPrevMonthClosing] = useState(0);
  const [prevMonthPurchases, setPrevMonthPurchases] = useState(0);

  useEffect(() => {
    if (selectedMonth) {
      sessionStorage.setItem('mc_selectedMonth', selectedMonth.toISOString());
    }
  }, [selectedMonth]);

  useEffect(() => {
    let isMounted = true;

    const fetchAndCalculateMagicData = async () => {
      if (!user) return;
      
      const monthKey = selectedMonth ? selectedMonth.toISOString() : '';
      if (prevMonthRef.current !== monthKey) {
        setLoading(true);
      }
      prevMonthRef.current = monthKey;

      const currYear = selectedMonth.getFullYear();
      const currMonth = selectedMonth.getMonth();
      
      const currStartObj = new Date(currYear, currMonth, 1);
      const currEndObj = new Date(currYear, currMonth + 1, 0);
      const prevStartObj = new Date(currYear, currMonth - 1, 1);
      const prevEndObj = new Date(currYear, currMonth, 0);

      const currEndStr = formatDateForDB(currEndObj);
      const prevStartStr = formatDateForDB(prevStartObj);
      const prevEndStr = formatDateForDB(prevEndObj);

      const firstDayStr = `${currYear}-${String(currMonth + 1).padStart(2, '0')}-01`;

      try {
        const [ { data: brands }, { data: allStock }, { data: allExpenses }, { data: traderTxData } ] = await Promise.all([
          supabase.from('brands').select('*'),
          supabase.from('daily_stock').select('*').eq('user_id', user.id).gte('date', prevStartStr).lte('date', currEndStr + 'T23:59:59').order('date', { ascending: true }),
          supabase.from('expenses').select('amount, date').eq('user_id', user.id).gte('date', prevStartStr).lte('date', currEndStr + 'T23:59:59'),
          supabase.from('trader_transactions').select('purchase_amount').eq('user_id', user.id).gte('date', firstDayStr).lte('date', currEndStr)
        ]);

        if (!isMounted) return;

        // EXPENSES CALCULATION
        let currExpVal = 0;
        let prevExpVal = 0;
        allExpenses?.forEach(e => {
          const eDate = getLocalDateObj(e.date);
          if (eDate) {
            if (eDate >= currStartObj && eDate <= currEndObj) currExpVal += parseFloat(e.amount || 0);
            if (eDate >= prevStartObj && eDate <= prevEndObj) prevExpVal += parseFloat(e.amount || 0);
          }
        });

        // FIFO SALES SIMULATION
        const calculateFifoSales = async (startObj, endObj) => {
          let totalSales = 0;
          const prevClosings = {};
          
          const startStr = formatDateForDB(startObj);
          const { data: beforeStock } = await supabase.from('daily_stock').select('*').lt('date', startStr).order('date', { ascending: false });
          beforeStock?.forEach(s => {
              if (prevClosings[s.brand_id] === undefined && s.closing_balance !== null) {
                  prevClosings[s.brand_id] = { closing_balance: parseInt(s.closing_balance), price: s.unit_price ? parseFloat(s.unit_price) : null };
              }
          });

          const stockByDate = {};
          allStock?.forEach(s => {
              const sDate = getLocalDateObj(s.date);
              if (sDate && sDate >= startObj && sDate <= endObj) {
                  const dateKey = formatDateForDB(sDate);
                  if (!stockByDate[dateKey]) stockByDate[dateKey] = [];
                  stockByDate[dateKey].push(s);
              }
          });

          const sortedDates = Object.keys(stockByDate).sort();
          let runningStates = {};
          brands?.forEach(b => {
              const pc = prevClosings[b.id];
              runningStates[b.id] = { closing: pc ? pc.closing_balance : 0, price: pc?.price || parseFloat(b.selling_price) };
          });

          sortedDates.forEach(date => {
              stockByDate[date].forEach(row => {
                  const brand = brands?.find(b => b.id === row.brand_id);
                  if (!brand) return;

                  const state = runningStates[brand.id];
                  const baseOpening = state.closing;
                  const carriedPrice = state.price;

                  const opening = parseInt(row.opening_balance || 0);
                  const purchaseQty = Math.max(0, opening - baseOpening);
                  const pPrice = row.unit_price ? parseFloat(row.unit_price) : carriedPrice;
                  const closing = row.closing_balance !== null ? parseInt(row.closing_balance) : '';

                  if (closing !== '') {
                      const sQty = Math.max(0, opening - closing);
                      let rem = sQty;
                      let sAmt = 0;

                      const qtyOld = Math.min(rem, baseOpening);
                      sAmt += qtyOld * carriedPrice;
                      rem -= qtyOld;

                      if (rem > 0 && purchaseQty > 0) {
                          sAmt += Math.min(rem, purchaseQty) * pPrice;
                      }
                      totalSales += sAmt;
                      runningStates[brand.id] = { closing: closing, price: pPrice };
                  }
              });
          });
          return totalSales;
        };

        const currSales = await calculateFifoSales(currStartObj, currEndObj);
        const prevSales = await calculateFifoSales(prevStartObj, prevEndObj);

        // TRUE LITERAL MRP STOCK VALUATIONS (DIRECT FETCH & ACCURATE FIFO INTEGRATION)
        const computedOpeningStockMrp = getTrueOpeningStockMrp(brands, allStock, firstDayStr, prevEndStr);
        const computedClosingStockMrp = getFifoStockValuationMrp(brands, allStock, currEndStr);

        // Monthly Total Purchases
        let computedTotalPurchasesTraders = 0;
        traderTxData?.forEach(tx => {
          computedTotalPurchasesTraders += parseFloat(tx.purchase_amount || 0);
        });

        // PREVIOUS MONTH VALUATIONS (DIRECT FETCH & ACCURATE FIFO INTEGRATION)
        const prevFirstDayStr = `${prevStartObj.getFullYear()}-${String(prevStartObj.getMonth() + 1).padStart(2, '0')}-01`;
        const prevPrevMonthLastDayObj = new Date(currYear, currMonth - 2, 0);
        const prevPrevMonthLastDayStr = formatDateForDB(prevPrevMonthLastDayObj);
        
        const computedPrevOpeningMrp = getTrueOpeningStockMrp(brands, allStock, prevFirstDayStr, prevPrevMonthLastDayStr);
        const computedPrevClosingMrp = computedOpeningStockMrp; // प्रिफिक्स सिंक

        const { data: prevTraderTxData } = await supabase
          .from('trader_transactions')
          .select('purchase_amount')
          .eq('user_id', user.id)
          .gte('date', formatDateForDB(prevStartObj))
          .lte('date', formatDateForDB(prevEndObj));

        let computedPrevTotalPurchasesTraders = 0;
        prevTraderTxData?.forEach(tx => {
          computedPrevTotalPurchasesTraders += parseFloat(tx.purchase_amount || 0);
        });

        if (!isMounted) return;

        setSalesAmount(currSales);
        setExpensesAmount(currExpVal);
        setPrevMonthSales(prevSales);
        setPrevMonthExpenses(prevExpVal);

        setLedgerOpening(computedOpeningStockMrp);
        setLedgerClosing(computedClosingStockMrp);
        setLedgerPurchases(computedTotalPurchasesTraders);

        setPrevMonthOpening(computedPrevOpeningMrp);
        setPrevMonthClosing(computedPrevClosingMrp);
        setPrevMonthPurchases(computedPrevTotalPurchasesTraders);

      } catch (error) {
        console.error("Error loading magic data:", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchAndCalculateMagicData();
    return () => { isMounted = false; };
  }, [selectedMonth, user, syncTrigger]);

  // Calculations
  const box1Val = salesAmount;
  const box2Val = ledgerClosing;
  const box3Val = box1Val + box2Val;

  const box4Val = ledgerOpening;
  const box5Val = ledgerPurchases;
  const box6Val = box4Val + box5Val;

  const box7Val = box3Val - box6Val; 
  const netProfitVal = box7Val - expensesAmount; 

  const prevBox1Val = prevMonthSales;
  const prevBox2Val = prevMonthClosing;
  const prevBox3Val = prevBox1Val + prevBox2Val;

  const prevBox4Val = prevMonthOpening;
  const prevBox5Val = prevMonthPurchases;
  const prevBox6Val = prevBox4Val + prevBox5Val;

  const prevBox7Val = prevBox3Val - prevBox6Val;
  const prevNetProfitVal = prevBox7Val - prevMonthExpenses; 

  const cumulativeProfitVal = prevNetProfitVal + netProfitVal; 

  return (
    <div className="max-w-5xl mx-auto space-y-6 transition-colors duration-300">
      <style dangerouslySetInnerHTML={{ __html: `
        .react-datepicker-popper { z-index: 99999 !important; }
        .react-datepicker { background-color: #ffffff !important; border-radius: 1.2rem !important; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1) !important; font-family: inherit !important; padding: 0.8rem !important; border: none !important; }
        .dark .react-datepicker { background-color: #1e293b !important; border: 1px solid #334155 !important; }
        .react-datepicker__triangle { display: none !important; }
        .react-datepicker__header { background-color: transparent !important; border-bottom: 1px solid #f1f5f9 !important; border-radius: 1rem 1rem 0 0 !important; padding-bottom: 0.8rem !important; }
        .dark .react-datepicker__header { border-bottom: 1px solid #334155 !important; }
        .react-datepicker__month-text--keyboard-selected, .react-datepicker__month-text--selected { background-color: #4f46e5 !important; color: white !important; font-weight: bold; border-radius: 0.5rem !important; }
        .react-datepicker__month-text:hover { background-color: #e0e7ff !important; border-radius: 0.5rem !important; color: #4f46e5 !important; font-weight: bold; }
        .dark .react-datepicker__month-text:hover { background-color: #334155 !important; color: white !important; }
        .react-datepicker__month-text { padding: 0.5rem !important; margin: 0.2rem !important; color: #475569 !important; font-weight: 600 !important; transition: all 0.2s; }
        .dark .react-datepicker__month-text { color: #cbd5e1 !important; }
        .react-datepicker__year-dropdown-container--select { margin: 0 !important; display: flex; justify-content: center; }
        .react-datepicker__year-select {
          background-color: #f8fafc !important;
          border: 1px solid #e2e8f0 !important;
          border-radius: 0.8rem !important;
          padding: 0.4rem 2rem 0.4rem 1rem !important;
          color: #1e293b !important;
          font-weight: 800 !important;
          font-size: 1rem !important;
          cursor: pointer !important;
          outline: none !important;
          appearance: none !important;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E") !important;
          background-repeat: no-repeat !important;
          background-position: right 0.5rem center !important;
          background-size: 1.2em !important;
          text-align: center !important;
        }
        .dark .react-datepicker__year-select option {
          background-color: #0f172a !important;
          color: #f8fafc !important;
        }
      `}} />

      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 relative z-50">
        <div className="shrink-0 flex items-center gap-3">
          <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400">
            <Wand2 size={28} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Magic Chart Ledger</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">Physical ledger layout redesigned for structured accounting.</p>
          </div>
        </div>
        
        <div className="shrink-0 relative flex items-center gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={() => setSyncTrigger(prev => prev + 1)}
            className="flex items-center justify-center p-2.5 h-12 w-12 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl transition-all duration-200 text-slate-700 dark:text-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
            title="Sync Data"
          >
            <RefreshCw size={18} className={`text-indigo-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        
          <DatePicker 
            selected={selectedMonth} 
            onChange={date => setSelectedMonth(date)} 
            dateFormat="MMMM yyyy"
            showMonthYearPicker
            customInput={<CustomMonthInput />}
            maxDate={new Date()}
            renderCustomHeader={({ date, changeYear }) => {
              const currentYear = new Date().getFullYear();
              const years = Array.from({ length: currentYear - 2019 + 1 }, (_, i) => 2020 + i);
              return (
                <div className="flex justify-center pb-2 pt-1 border-b border-slate-100 dark:border-slate-800 mb-2">
                  <div className="relative">
                    <select
                      value={date.getFullYear()}
                      onChange={({ target: { value } }) => changeYear(parseInt(value, 10))}
                      className="appearance-none bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-1.5 pr-8 font-black outline-none cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors shadow-sm text-center"
                    >
                      {years.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 pointer-events-none" />
                  </div>
                </div>
              );
            }}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[50vh] bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800">
          <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
          <p className="text-slate-500 font-medium">Reconciling ledger entries...</p>
        </div>
      ) : (
        <div className="space-y-8 animate-in fade-in duration-300">
          
          {/* LEDGER SHEETS CONTAINER */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg rounded-2xl p-6 space-y-8 overflow-hidden">
            
            <div className="text-center">
              <h3 className="text-xl font-black text-slate-700 dark:text-slate-300 tracking-widest uppercase">
                *** माहे {selectedMonth.toLocaleDateString('mr-IN', { month: 'long' })} {selectedMonth.getFullYear()} ***
              </h3>
            </div>

            {/* 1. MAIN 7-COLUMN TABLE */}
            <div className="overflow-x-auto border border-slate-300 dark:border-slate-700 rounded-xl">
              <table className="w-full text-center border-collapse" style={{ minWidth: '900px' }}>
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-300 dark:border-slate-700">
                    <th className="py-4 px-2 border-r border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 w-[14%]">
                      चालू महिन्याची विक्री <br /> (Total Sales)
                    </th>
                    <th className="py-4 px-2 border-r border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 w-[14%]">
                      आखेर शिल्लक माल <br /> (Closing Stock)
                    </th>
                    <th className="py-4 px-2 border-r border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 w-[14%] bg-indigo-50/40 dark:bg-indigo-950/10">
                      रकाना 1 + 2 ची बेरीज <br /> (Sum 1 + 2)
                    </th>
                    <th className="py-4 px-2 border-r border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 w-[14%]">
                      सुरुवातीची शिल्लक <br /> (Opening Stock)
                    </th>
                    <th className="py-4 px-2 border-r border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 w-[14%]">
                      चालू महिन्याची खरेदी <br /> (Total Purchases)
                    </th>
                    <th className="py-4 px-2 border-r border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 w-[14%] bg-indigo-50/40 dark:bg-indigo-950/10">
                      रकाना 4 + 5 ची बेरीज <br /> (Sum 4 + 5)
                    </th>
                    <th className="py-4 px-2 text-sm font-bold text-slate-700 dark:text-slate-200 w-[16%]">
                      रकाना 3 - 6 <br /> ढोबळ नफा - तोटा
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-300 dark:border-slate-700 h-16">
                    <td className="border-r border-slate-300 dark:border-slate-700 font-extrabold text-slate-800 dark:text-slate-100 text-lg">
                      {formatRs(box1Val)}
                    </td>
                    
                    <td className="border-r border-slate-300 dark:border-slate-700 font-extrabold text-slate-800 dark:text-slate-100 text-lg">
                      {formatRs(box2Val)}
                    </td>

                    <td className="border-r border-slate-300 dark:border-slate-700 font-extrabold text-indigo-600 dark:text-indigo-400 text-lg bg-indigo-50/20 dark:bg-indigo-950/5">
                      {formatRs(box3Val)}
                    </td>

                    <td className="border-r border-slate-300 dark:border-slate-700 font-extrabold text-slate-800 dark:text-slate-100 text-lg">
                      {formatRs(box4Val)}
                    </td>

                    <td className="border-r border-slate-300 dark:border-slate-700 font-extrabold text-slate-800 dark:text-slate-100 text-lg">
                      {formatRs(box5Val)}
                    </td>

                    <td className="border-r border-slate-300 dark:border-slate-700 font-extrabold text-indigo-600 dark:text-indigo-400 text-lg bg-indigo-50/20 dark:bg-indigo-950/5">
                      {formatRs(box6Val)}
                    </td>

                    <td className={`font-black text-xl ${box7Val >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                      {formatRs(box7Val)}
                    </td>
                  </tr>
                  
                  <tr className="bg-slate-50/60 dark:bg-slate-800/40 text-xs text-slate-400 font-bold">
                    <td className="py-1 border-r border-slate-300 dark:border-slate-700">1</td>
                    <td className="py-1 border-r border-slate-300 dark:border-slate-700">2</td>
                    <td className="py-1 border-r border-slate-300 dark:border-slate-700 bg-indigo-50/10 dark:bg-indigo-950/5">3</td>
                    <td className="py-1 border-r border-slate-300 dark:border-slate-700">4</td>
                    <td className="py-1 border-r border-slate-300 dark:border-slate-700">5</td>
                    <td className="py-1 border-r border-slate-300 dark:border-slate-700 bg-indigo-50/10 dark:bg-indigo-950/5">6</td>
                    <td className="py-1">7</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 2. SETTLEMENT TABLE */}
            <div className="overflow-x-auto border border-slate-300 dark:border-slate-700 rounded-xl">
              <table className="w-full text-center border-collapse" style={{ minWidth: '600px' }}>
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-300 dark:border-slate-700">
                    <th className="py-4 px-2 border-r border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 w-[50%]">
                      एकूण ढोबळ नफा - चालू महिन्याचा खर्च <br /> (Gross Profit - Expenses)
                    </th>
                    <th className="py-4 px-2 text-sm font-bold text-slate-700 dark:text-slate-200 w-[50%]">
                      एकूण चालू महिन्याचा नफा <br /> (Current Month Net Profit)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="h-16">
                    <td className="border-r border-slate-300 dark:border-slate-700 font-extrabold text-slate-700 dark:text-slate-300 text-lg">
                      {formatRs(box7Val)} - {formatRs(expensesAmount)}
                    </td>
                    <td className={`font-black text-2xl ${netProfitVal >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                      {formatRs(netProfitVal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 3. CUMULATIVE TABLE */}
            <div className="overflow-x-auto border border-slate-300 dark:border-slate-700 rounded-xl">
              <table className="w-full text-center border-collapse" style={{ minWidth: '600px' }}>
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-300 dark:border-slate-700">
                    <th className="py-4 px-2 border-r border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 w-[33%]">
                      मागील महिन्याचा नफा (+) <br /> (Previous Month Net Profit)
                    </th>
                    <th className="py-4 px-2 border-r border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 w-[33%]">
                      चालू महिन्याचा नफा <span className="text-slate-400 dark:text-slate-500 text-[10px] font-normal">(Auto)</span>
                    </th>
                    <th className="py-4 px-2 text-sm font-bold text-slate-700 dark:text-slate-200 w-[34%] bg-indigo-500/10 dark:bg-indigo-500/5">
                      एकूण नफा <br /> (Total Net Profit)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="h-16">
                    <td className="border-r border-slate-300 dark:border-slate-700 font-extrabold text-slate-600 dark:text-slate-400 text-lg">
                      {formatRs(prevNetProfitVal)}
                    </td>
                    <td className="border-r border-slate-300 dark:border-slate-700 font-extrabold text-slate-600 dark:text-slate-400 text-lg">
                      {formatRs(netProfitVal)}
                    </td>
                    <td className="font-black text-2xl text-white bg-indigo-600 dark:bg-indigo-700/80">
                      {formatRs(cumulativeProfitVal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

          </div>

        </div>
      )}
    </div>
  );
}