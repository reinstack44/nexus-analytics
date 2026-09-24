import { useState, useEffect, forwardRef } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';
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

export default function ProfitLoss() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [refreshTrigger, setRefreshTrigger] = useState(0);

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
    return dStr.includes('T') ? dStr.split('T')[0] : dStr;
  };

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
        const [
          expData,
          withData,
          traderTxData,
          { data: brandsData },
          stockData
        ] = await Promise.all([
          fetchAllRows(supabase.from('expenses').select('amount, date').eq('user_id', user.id).gte('date', startStr).lte('date', endStr)),
          fetchAllRows(supabase.from('owner_withdrawals').select('amount, date').eq('user_id', user.id).gte('date', startStr).lte('date', endStr)),
          fetchAllRows(supabase.from('trader_transactions').select('purchase_amount, date').eq('user_id', user.id).gte('date', startStr).lte('date', endStr)),
          supabase.from('brands').select('id, brand_name, selling_price, mrp_price'),
          fetchAllRows(supabase.from('daily_stock').select('date, brand_id, opening_balance, closing_balance, unit_price, unit_mrp').eq('user_id', user.id).lte('date', endStr).order('date', { ascending: true }))
        ]);

        let tExpenses = 0;
        expData?.forEach(e => tExpenses = safeRound(tExpenses + (parseFloat(e.amount) || 0)));

        let tWithdrawals = 0;
        withData?.forEach(w => tWithdrawals = safeRound(tWithdrawals + (parseFloat(w.amount) || 0)));

        let tPurchases = 0;
        traderTxData?.forEach(t => tPurchases = safeRound(tPurchases + (parseFloat(t.purchase_amount) || 0)));

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

            const opBal = parseInt(s.opening_balance, 10) || 0;
            const pQty = Math.max(0, opBal - (prevClosing[s.brand_id] || 0));
            
            const pPrice = parseFloat(s.unit_price) || lastActivePrice[s.brand_id] || parseFloat(brand.selling_price) || 0;
            const pMrp = parseFloat(s.unit_mrp) || lastActiveMrp[s.brand_id] || parseFloat(brand.mrp_price) || 0;

            if (pQty > 0) {
              queue.push({ qty: pQty, price: pPrice, mrp: pMrp });
            }

            const clBal = s.closing_balance !== null ? parseInt(s.closing_balance, 10) : null;
            
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
            const opBal = parseInt(exactRecord.opening_balance, 10) || 0;
            const clBal = exactRecord.closing_balance !== null ? parseInt(exactRecord.closing_balance, 10) : '';
            
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

            rowData = { 
              purchase_price: latestUnitPrice, 
              purchase_mrp: latestUnitMrp,
              purchase_qty: totalPurchasesQty, 
              opening_balance: baseOpening + totalPurchasesQty, 
              closing_balance: finalClosing,
              starting_batches: starting_batches
            };
          }

          let sAmt = 0;
          let queue = Array.isArray(rowData.starting_batches) ? rowData.starting_batches.map(b => ({ ...b })) : [];
          
          if (parseInt(rowData.purchase_qty, 10) > 0) {
            queue.push({
              qty: parseInt(rowData.purchase_qty, 10),
              price: parseFloat(rowData.purchase_price) || 0,
              mrp: parseFloat(rowData.purchase_mrp) || 0
            });
          }

          if (rowData.closing_balance !== '') {
            let salesRemaining = Math.max(0, parseInt(rowData.opening_balance, 10) - parseInt(rowData.closing_balance, 10));

            while (salesRemaining > 0 && queue.length > 0) {
              if (queue[0].qty <= salesRemaining) {
                sAmt = safeRound(sAmt + (queue[0].qty * queue[0].price));
                salesRemaining -= queue[0].qty;
                queue.shift();
              } else {
                sAmt = safeRound(sAmt + (salesRemaining * queue[0].price));
                queue[0].qty -= salesRemaining; 
                salesRemaining = 0;
              }
            }
            tSales = safeRound(tSales + sAmt);
          }
        });

        if (!isMounted) return;

        const netProfit = safeRound(tSales - tPurchases - tExpenses);
        const retainedCash = safeRound(tSales - tExpenses - tWithdrawals);

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
      
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 relative z-50 transition-colors duration-300">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
            <Wallet className="text-blue-500" /> {t('profitloss.title', 'Financial Analytics')}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{t('profitloss.description', 'Track P&L (Tax Safe) and Cash in Hand.')}</p>
        </div>
        
        <div className="header-date-picker flex flex-row items-center gap-2 bg-slate-100/50 dark:bg-slate-900/50 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-inner">
          <DatePicker selected={startDate} onChange={(date) => setStartDate(date)} maxDate={new Date()} dateFormat="dd/MM/yy" customInput={<CustomDateInput />} showMonthDropdown showYearDropdown dropdownMode="select"/>
          <span className="text-slate-400 dark:text-slate-500 font-medium px-1">{t('common.to', 'to')}</span>
          <DatePicker selected={endDate} onChange={(date) => setEndDate(date)} minDate={startDate} maxDate={new Date()} dateFormat="dd/MM/yy" customInput={<CustomDateInput />} showMonthDropdown showYearDropdown dropdownMode="select"/>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
          <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wider">{t('profitloss.grossRevenue', 'Gross Revenue')}</p>
          <h3 className="text-3xl font-black text-slate-800 dark:text-slate-100">₹{summary.totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
          <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wider">{t('profitloss.purchaseCost', 'Purchase Cost')}</p>
          <h3 className="text-3xl font-black text-slate-800 dark:text-slate-100">₹{summary.totalPurchases.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
          <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wider">{t('profitloss.businessExpenses', 'Business Expenses')}</p>
          <h3 className="text-3xl font-black text-slate-800 dark:text-slate-100">₹{summary.totalExpenses.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
        </div>

        <div className={`p-6 rounded-2xl shadow-sm relative overflow-hidden group border ${summary.netProfit >= 0 ? 'bg-linear-to-br from-emerald-500 to-emerald-700 border-emerald-600' : 'bg-linear-to-br from-red-500 to-red-700 border-red-600'}`}>
           <div className="absolute right-0 top-0 opacity-20 transform translate-x-1/4 -translate-y-1/4">
            {summary.netProfit >= 0 ? <TrendingUp size={120} className="text-white"/> : <TrendingDown size={120} className="text-white"/>}
          </div>
          <p className="text-white/80 font-bold text-sm tracking-wider uppercase mb-2 relative z-10">{t('profitloss.netProfitLoss', 'Net Profit / Loss')}</p>
          <h3 className="text-4xl font-black text-white relative z-10">₹{summary.netProfit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
        </div>
      </div>

      <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-6 relative z-10">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-100 dark:bg-blue-900/50 rounded-full text-blue-600 dark:text-blue-400">
            <Landmark size={24} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('profitloss.onlineCollections', 'Online Collections')}</h3>
            <p className="text-2xl font-black text-slate-800 dark:text-slate-100">₹{summary.totalWithdrawn.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
        </div>
        <div className="h-10 w-px bg-blue-200 dark:bg-blue-800 hidden sm:block"></div>
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emerald-100 dark:bg-emerald-900/50 rounded-full text-emerald-600 dark:text-emerald-400">
            <IndianRupee size={24} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('profitloss.cashLeftInHand', 'Cash Left In Hand')}</h3>
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">₹{summary.retainedCash.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
        </div>
      </div>
    </div>
  );
}