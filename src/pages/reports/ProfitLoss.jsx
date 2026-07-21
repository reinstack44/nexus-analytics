import { useState, useEffect, forwardRef } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { Calendar, Wallet, Landmark, IndianRupee, TrendingUp, TrendingDown, ChevronDown } from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

const CustomDateInput = forwardRef(({ value, onClick, placeholder }, ref) => (
  <button
    type="button"
    onClick={onClick}
    ref={ref}
    className="flex items-center px-4 py-2 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-all duration-200 text-sm font-bold text-slate-700 dark:text-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
  >
    <Calendar size={16} className="text-blue-500 mr-2 shrink-0" />
    {value || placeholder}
    <ChevronDown size={14} className="text-slate-400 dark:text-slate-500 ml-3 shrink-0" />
  </button>
));
CustomDateInput.displayName = "CustomDateInput";

export default function ProfitLoss() {
  const { user } = useAuth();
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Isolated local memory keys for Profit & Loss page
  const [startDate, setStartDate] = useState(() => {
    const saved = sessionStorage.getItem('profitLoss_startDate');
    return saved ? new Date(saved) : new Date();
  });
  
  const [endDate, setEndDate] = useState(() => {
    const saved = sessionStorage.getItem('profitLoss_endDate');
    return saved ? new Date(saved) : new Date();
  });

  useEffect(() => {
    if (startDate) sessionStorage.setItem('profitLoss_startDate', startDate.toISOString());
    if (endDate) sessionStorage.setItem('profitLoss_endDate', endDate.toISOString());
  }, [startDate, endDate]);

  const [summary, setSummary] = useState({
    totalSales: 0,
    totalPurchases: 0,
    totalExpenses: 0,
    netProfit: 0,
    totalWithdrawn: 0,
    retainedCash: 0
  });

  const formatDateForDB = (date) => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const normalizeDateStr = (dStr) => {
    if (!dStr) return '';
    if (typeof dStr !== 'string') return '';
    if (dStr.includes('T')) {
      return dStr.split('T')[0];
    }
    return dStr;
  };

  // Realtime Database Sync
  useEffect(() => {
    const channel = supabase
      .channel('pl-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_stock' }, () => setRefreshTrigger(prev => prev + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => setRefreshTrigger(prev => prev + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trader_transactions' }, () => setRefreshTrigger(prev => prev + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'owner_withdrawals' }, () => setRefreshTrigger(prev => prev + 1))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    
    const fetchReportData = async () => {
      if (!user) return;
      
      const startStr = formatDateForDB(startDate);
      const endStr = formatDateForDB(endDate);
      const isMultiDayRange = startStr !== endStr;

      try {
        let expQuery = supabase.from('expenses').select('amount').gte('date', startStr).lte('date', endStr);
        let withQuery = supabase.from('owner_withdrawals').select('amount').gte('date', startStr).lte('date', endStr);
        let traderTxQuery = supabase.from('trader_transactions').select('purchase_amount').gte('date', startStr).lte('date', endStr);
        let brandsQuery = supabase.from('brands').select('id, brand_name, selling_price, mrp_price');
        
        // Fetch all historical stock to rebuild exactly identical FIFO chains as DailyStock
        let stockQuery = supabase.from('daily_stock').select('date, brand_id, opening_balance, closing_balance, unit_price, unit_mrp').lte('date', endStr).order('date', { ascending: true });

        if (user?.id) {
          expQuery = expQuery.eq('user_id', user.id);
          withQuery = withQuery.eq('user_id', user.id);
          stockQuery = stockQuery.eq('user_id', user.id);
        }

        const [
          { data: expData },
          { data: withData },
          { data: traderTxData },
          { data: brandsData },
          { data: stockData }
        ] = await Promise.all([
          expQuery,
          withQuery,
          traderTxQuery,
          brandsQuery,
          stockQuery
        ]);

        let tExpenses = 0;
        expData?.forEach(e => tExpenses += parseFloat(e.amount) || 0);

        let tWithdrawals = 0;
        withData?.forEach(w => tWithdrawals += parseFloat(w.amount) || 0);

        let tPurchases = 0;
        traderTxData?.forEach(t => tPurchases += parseFloat(t.purchase_amount) || 0);

        // --- UNIFIED CHRONOLOGICAL FIFO RECONSTRUCTION (Exact DailyStock Match) ---
        const brandBatches = {};
        const prevClosing = {};
        const lastActivePrice = {};
        const lastActiveMrp = {};
        const targetStart = normalizeDateStr(startStr);

        stockData?.forEach(s => {
          const logDate = normalizeDateStr(s.date);
          if (logDate < targetStart) {
            let queue = brandBatches[s.brand_id] || [];
            const brand = brandsData?.find(b => b.id === s.brand_id);
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

        let tSales = 0;

        brandsData?.forEach(brand => {
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

          const brandRangeLogs = stockData?.filter(s => s.brand_id === brand.id && normalizeDateStr(s.date) >= targetStart && normalizeDateStr(s.date) <= normalizeDateStr(endStr)) || [];
          const exactRecord = !isMultiDayRange ? brandRangeLogs.find(log => normalizeDateStr(log.date) === targetStart) : null;
          
          let rowData;

          if (exactRecord) {
            const opBal = parseInt(exactRecord.opening_balance) || 0;
            const clBal = exactRecord.closing_balance !== null ? parseInt(exactRecord.closing_balance) : '';
            
            const pQty = Math.max(0, opBal - baseOpening);
            const pPrice = pQty > 0 ? (parseFloat(exactRecord.unit_price) || carriedPrice) : carriedPrice;
            const pMrp = pQty > 0 ? (parseFloat(exactRecord.unit_mrp) || carriedMrp) : carriedMrp;

            rowData = { 
              purchase_price: pPrice, 
              purchase_mrp: pMrp,
              purchase_qty: pQty, 
              opening_balance: opBal, 
              closing_balance: clBal === '' ? '' : String(clBal),
              starting_batches: starting_batches
            };
          } else {
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

            rowData = { 
              purchase_price: latestUnitPrice, 
              purchase_mrp: latestUnitMrp,
              purchase_qty: totalPurchasesQty, 
              opening_balance: baseOpening + totalPurchasesQty, 
              closing_balance: finalClosing,
              starting_batches: starting_batches
            };
          }

          // Exact same calculation execution
          let sAmt = 0;
          let queue = Array.isArray(rowData.starting_batches) ? rowData.starting_batches.map(b => ({...b})) : [];
          
          if (parseInt(rowData.purchase_qty) > 0) {
            queue.push({
              qty: parseInt(rowData.purchase_qty),
              price: parseFloat(rowData.purchase_price) || 0,
              mrp: parseFloat(rowData.purchase_mrp) || 0
            });
          }

          if (rowData.closing_balance !== '') {
            let salesRemaining = Math.max(0, parseInt(rowData.opening_balance) - parseInt(rowData.closing_balance));

            while (salesRemaining > 0 && queue.length > 0) {
              if (queue[0].qty <= salesRemaining) {
                sAmt += queue[0].qty * queue[0].price;
                salesRemaining -= queue[0].qty;
                queue.shift(); 
              } else {
                sAmt += salesRemaining * queue[0].price;
                queue[0].qty -= salesRemaining; 
                salesRemaining = 0;
              }
            }
            tSales += sAmt;
          }
        });

        if (!isMounted) return;

        const netProfit = tSales - tPurchases - tExpenses;
        const retainedCash = tSales - tExpenses - tWithdrawals;

        setSummary({
          totalSales: tSales,
          totalPurchases: tPurchases,
          totalExpenses: tExpenses,
          netProfit: netProfit,
          totalWithdrawn: tWithdrawals,
          retainedCash: retainedCash
        });
      } catch (err) {
        console.error("P&L Compile Error:", err);
      }
    };

    fetchReportData();
    
    return () => {
      isMounted = false;
    };
  }, [startDate, endDate, refreshTrigger, user]);

  return (
    <div className="space-y-6 transition-colors duration-300">
      
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

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 relative z-50 transition-colors duration-300">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
            <Wallet className="text-blue-500" /> Financial Analytics
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Track P&L (Tax Safe) and Cash in Hand.</p>
        </div>
        
        <div className="header-date-picker flex flex-row items-center gap-2 bg-slate-100/50 dark:bg-slate-900/50 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-inner">
          <DatePicker selected={startDate} onChange={(date) => setStartDate(date)} maxDate={new Date()} dateFormat="dd/MM/yy" customInput={<CustomDateInput />} showMonthDropdown showYearDropdown dropdownMode="select"/>
          <span className="text-slate-400 dark:text-slate-500 font-medium px-1">to</span>
          <DatePicker selected={endDate} onChange={(date) => setEndDate(date)} minDate={startDate} maxDate={new Date()} dateFormat="dd/MM/yy" customInput={<CustomDateInput />} showMonthDropdown showYearDropdown dropdownMode="select"/>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
          <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wider">Gross Revenue</p>
          <h3 className="text-3xl font-black text-slate-800 dark:text-slate-100">₹{summary.totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
          <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wider">Purchase Cost</p>
          <h3 className="text-3xl font-black text-slate-800 dark:text-slate-100">₹{summary.totalPurchases.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
          <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wider">Business Expenses</p>
          <h3 className="text-3xl font-black text-slate-800 dark:text-slate-100">₹{summary.totalExpenses.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
        </div>

        <div className={`p-6 rounded-2xl shadow-sm relative overflow-hidden group border ${summary.netProfit >= 0 ? 'bg-linear-to-br from-emerald-500 to-emerald-700 border-emerald-600' : 'bg-linear-to-br from-red-500 to-red-700 border-red-600'}`}>
           <div className="absolute right-0 top-0 opacity-20 transform translate-x-1/4 -translate-y-1/4">
            {summary.netProfit >= 0 ? <TrendingUp size={120} className="text-white"/> : <TrendingDown size={120} className="text-white"/>}
          </div>
          <p className="text-white/80 font-bold text-sm tracking-wider uppercase mb-2 relative z-10">Net Profit / Loss</p>
          <h3 className="text-4xl font-black text-white relative z-10">₹{summary.netProfit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
        </div>
      </div>

      <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-6 relative z-10">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-100 dark:bg-blue-900/50 rounded-full text-blue-600 dark:text-blue-400">
            <Landmark size={24} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Online Collections</h3>
            <p className="text-2xl font-black text-slate-800 dark:text-slate-100">₹{summary.totalWithdrawn.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
        </div>
        <div className="h-10 w-px bg-blue-200 dark:bg-blue-800 hidden sm:block"></div>
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emerald-100 dark:bg-emerald-900/50 rounded-full text-emerald-600 dark:text-emerald-400">
            <IndianRupee size={24} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Cash Left In Hand</h3>
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">₹{summary.retainedCash.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
        </div>
      </div>
    </div>
  );
}