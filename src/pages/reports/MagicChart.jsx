import { useState, useEffect, forwardRef, useRef } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { Wand2, Calendar, ChevronDown, RefreshCw } from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

const CustomMonthInput = forwardRef(({ value, onClick }, ref) => {
  const { t } = useTranslation();
  return (
    <button type="button" onClick={onClick} ref={ref} className="flex items-center justify-between px-4 py-2.5 h-12 w-56 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl transition-all duration-200 text-sm font-bold text-slate-700 dark:text-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer">
      <div className="flex items-center">
        <Calendar size={18} className="text-indigo-500 mr-2 shrink-0" />
        <span>{value || t('magicChart.selectMonth', 'Select Month')}</span>
      </div>
      <ChevronDown size={16} className="text-slate-400 dark:text-slate-500 ml-2 shrink-0" />
    </button>
  );
});
CustomMonthInput.displayName = "CustomMonthInput";

const formatDateForDB = (dateObj) => {
  if (!dateObj) return '';
  const d = new Date(dateObj);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

const formatRs = (num) => '₹' + safeRound(num || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function MagicChart() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(true);
  const prevMonthRef = useRef(null);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const saved = sessionStorage.getItem('mc_selectedMonth');
    return saved ? new Date(saved) : new Date();
  });

  const [syncTrigger, setSyncTrigger] = useState(0);

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
  const [ledgerOpening, setLedgerOpening] = useState(0);
  const [ledgerClosing, setLedgerClosing] = useState(0);
  const [ledgerPurchases, setLedgerPurchases] = useState(0);
  const [prevMonthNetProfit, setPrevMonthNetProfit] = useState(0);

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
      const currEndObj = new Date(currYear, currMonth + 1, 0);
      const currEndStr = formatDateForDB(currEndObj);

      try {
        const [
          { data: brands },
          allStock,
          allExpenses,
          traderTxData
        ] = await Promise.all([
          supabase.from('brands').select('*'),
          fetchAllRows(supabase.from('daily_stock').select('*').eq('user_id', user.id).lte('date', currEndStr).order('date', { ascending: true })),
          fetchAllRows(supabase.from('expenses').select('amount, date').eq('user_id', user.id).lte('date', currEndStr)),
          fetchAllRows(supabase.from('trader_transactions').select('purchase_amount, date').eq('user_id', user.id).lte('date', currEndStr))
        ]);

        if (!isMounted) return;

        const brandMap = {};
        brands?.forEach(b => brandMap[b.id] = b);

        const stockByDateStr = {};
        allStock?.forEach(s => {
          const dStr = s.date ? s.date.split('T')[0] : '';
          if (dStr) {
            if (!stockByDateStr[dStr]) stockByDateStr[dStr] = [];
            stockByDateStr[dStr].push(s);
          }
        });
        const sortedDates = Object.keys(stockByDateStr).sort();

        const monthlyProfits = {};

        const brandStates = {}; 
        const brandBatches = {};
        brands?.forEach(b => {
          brandStates[b.id] = { closing: 0, price: parseFloat(b.selling_price) || 0 };
          brandBatches[b.id] = [];
        });

        sortedDates.forEach((dateStr, dIdx) => {
          const yearMonthKey = dateStr.substring(0, 7); 
          if (!monthlyProfits[yearMonthKey]) {
            monthlyProfits[yearMonthKey] = { sales: 0, purchases: 0, expenses: 0, openingMrp: 0, closingMrp: 0 };
          }

          const dayRecords = stockByDateStr[dateStr];
          dayRecords.forEach(row => {
            const brandId = row.brand_id;
            const brand = brandMap[brandId];
            if (!brand) return;

            const state = brandStates[brandId];
            const baseOpening = state.closing;
            const carriedPrice = state.price;

            const opening = parseInt(row.opening_balance, 10) || 0;
            const purchaseQty = Math.max(0, opening - baseOpening);
            const pPrice = row.unit_price ? parseFloat(row.unit_price) : carriedPrice;
            const pMrp = row.unit_mrp ? parseFloat(row.unit_mrp) : (parseFloat(brand.mrp_price) || 0);

            if (purchaseQty > 0) {
              brandBatches[brandId].push({ qty: purchaseQty, price: pPrice, mrp: pMrp });
            }

            const closing = row.closing_balance !== null ? parseInt(row.closing_balance, 10) : null;
            if (closing !== null) {
              const sQty = Math.max(0, opening - closing);
              let rem = sQty;
              let sAmt = 0;

              const qtyOld = Math.min(rem, baseOpening);
              sAmt = safeRound(sAmt + (qtyOld * carriedPrice));
              rem -= qtyOld;

              if (rem > 0 && purchaseQty > 0) {
                sAmt = safeRound(sAmt + (Math.min(rem, purchaseQty) * pPrice));
              }

              let sellRem = sQty;
              while (sellRem > 0 && brandBatches[brandId].length > 0) {
                if (brandBatches[brandId][0].qty <= sellRem) {
                  sellRem -= brandBatches[brandId][0].qty;
                  brandBatches[brandId].shift();
                } else {
                  brandBatches[brandId][0].qty -= sellRem;
                  sellRem = 0;
                }
              }

              monthlyProfits[yearMonthKey].sales = safeRound(monthlyProfits[yearMonthKey].sales + sAmt);
              brandStates[brandId] = { closing: closing, price: pPrice };
            } else {
              brandStates[brandId] = { closing: opening, price: pPrice };
            }
          });

          const nextDateStr = sortedDates[dIdx + 1];
          const isLastDayOfM = !nextDateStr || nextDateStr.substring(0, 7) !== yearMonthKey;
          if (isLastDayOfM) {
            const dayRecordsForEnd = stockByDateStr[dateStr] || [];
            let totalMrpValuation = 0;
            let anyClosingEntered = false;

            dayRecordsForEnd.forEach(s => {
              if (s.closing_balance !== null && s.closing_balance !== undefined) {
                anyClosingEntered = true;
                const brand = brandMap[s.brand_id];
                const clQty = parseInt(s.closing_balance, 10) || 0;
                const mrp = parseFloat(s.unit_mrp || brand?.mrp_price || 0);
                totalMrpValuation = safeRound(totalMrpValuation + (clQty * mrp));
              }
            });

            monthlyProfits[yearMonthKey].closingMrp = anyClosingEntered ? totalMrpValuation : 0;
          }
        });

        allExpenses?.forEach(e => {
          const eDateStr = e.date ? e.date.split('T')[0] : '';
          const yearMonthKey = eDateStr.substring(0, 7);
          if (monthlyProfits[yearMonthKey]) {
            monthlyProfits[yearMonthKey].expenses = safeRound(monthlyProfits[yearMonthKey].expenses + parseFloat(e.amount || 0));
          }
        });

        traderTxData?.forEach(tx => {
          const txDateStr = tx.date ? tx.date.split('T')[0] : '';
          const yearMonthKey = txDateStr.substring(0, 7);
          if (monthlyProfits[yearMonthKey]) {
            monthlyProfits[yearMonthKey].purchases = safeRound(monthlyProfits[yearMonthKey].purchases + parseFloat(tx.purchase_amount || 0));
          }
        });

        const sortedMonths = Object.keys(monthlyProfits).sort();
        sortedMonths.forEach((mKey, mIdx) => {
          if (mIdx === 0) {
            const firstDateStr = sortedDates.find(d => d.startsWith(mKey));
            const firstDayRecords = stockByDateStr[firstDateStr] || [];
            let totalOpMrp = 0;
            firstDayRecords.forEach(s => {
              const brand = brandMap[s.brand_id];
              const opQty = parseInt(s.opening_balance, 10) || 0;
              const mrp = parseFloat(s.unit_mrp || brand?.mrp_price || 0);
              totalOpMrp = safeRound(totalOpMrp + (opQty * mrp));
            });
            monthlyProfits[mKey].openingMrp = totalOpMrp;
          } else {
            const prevMKey = sortedMonths[mIdx - 1];
            monthlyProfits[mKey].openingMrp = monthlyProfits[prevMKey].closingMrp;
          }
        });

        sortedMonths.forEach(mKey => {
          const mData = monthlyProfits[mKey];
          const box3 = safeRound(mData.sales + mData.closingMrp);
          const box6 = safeRound(mData.openingMrp + mData.purchases);
          const box7 = safeRound(box3 - box6);
          mData.netProfit = safeRound(box7 - mData.expenses);
        });

        const selectedMonthKey = `${currYear}-${String(currMonth + 1).padStart(2, '0')}`;
        const currMonthData = monthlyProfits[selectedMonthKey] || { sales: 0, closingMrp: 0, openingMrp: 0, purchases: 0, expenses: 0 };

        if (!brands || !allStock) return;

        setSalesAmount(currMonthData.sales || 0);
        setLedgerPurchases(currMonthData.purchases || 0);
        setExpensesAmount(currMonthData.expenses || 0);

        const activeMonthDates = sortedDates.filter(d => d.startsWith(selectedMonthKey));
        const firstSavedDate = activeMonthDates[0];
        const startDayRecords = firstSavedDate ? (stockByDateStr[firstSavedDate] || []) : [];
        let computedOpeningMrp = 0;

        if (firstSavedDate) {
          startDayRecords.forEach(s => {
            const brand = brandMap[s.brand_id];
            const opQty = parseInt(s.opening_balance, 10) || 0;
            const mrp = parseFloat(s.unit_mrp || brand?.mrp_price || 0);
            computedOpeningMrp = safeRound(computedOpeningMrp + (opQty * mrp));
          });
        } else {
          const previousMonths = sortedMonths.filter(m => m < selectedMonthKey);
          if (previousMonths.length > 0) {
            const lastActiveMonthKey = previousMonths[previousMonths.length - 1];
            computedOpeningMrp = monthlyProfits[lastActiveMonthKey]?.closingMrp || 0;
          }
        }
        setLedgerOpening(computedOpeningMrp);

        const endDayRecords = stockByDateStr[currEndStr] || [];
        let computedClosingMrp = 0;
        let anyClosingEnteredForEnd = false;
        endDayRecords.forEach(s => {
          if (s.closing_balance !== null && s.closing_balance !== undefined) {
            anyClosingEnteredForEnd = true;
            const brand = brandMap[s.brand_id];
            const clQty = parseInt(s.closing_balance, 10) || 0;
            const mrp = parseFloat(s.unit_mrp || brand?.mrp_price || 0);
            computedClosingMrp = safeRound(computedClosingMrp + (clQty * mrp));
          }
        });
        const finalClosingMrp = anyClosingEnteredForEnd ? computedClosingMrp : 0;
        setLedgerClosing(finalClosingMrp);

        let computedPrevNetProfit = 0;
        sortedMonths.forEach(mKey => {
          if (mKey < selectedMonthKey) {
            computedPrevNetProfit = safeRound(computedPrevNetProfit + (monthlyProfits[mKey]?.netProfit || 0));
          }
        });
        setPrevMonthNetProfit(computedPrevNetProfit);

      } catch (error) {
        console.error("Error loading magic data:", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchAndCalculateMagicData();
    return () => { isMounted = false; };
  }, [selectedMonth, user, syncTrigger]);

  const box1Val = salesAmount || 0;
  const box2Val = ledgerClosing || 0;
  const box3Val = safeRound(box1Val + box2Val);

  const box4Val = ledgerOpening || 0;
  const box5Val = ledgerPurchases || 0;
  const box6Val = safeRound(box4Val + box5Val);

  const box7Val = safeRound(box3Val - box6Val); 
  const netProfitVal = safeRound(box7Val - (expensesAmount || 0)); 

  const cumulativeProfitVal = safeRound((prevMonthNetProfit || 0) + netProfitVal); 

  const locale = i18n.language === 'hi' ? 'hi-IN' : i18n.language === 'mr' ? 'mr-IN' : 'en-IN';

  return (
    <div className="max-w-5xl mx-auto space-y-6 transition-colors duration-300">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 relative z-50">
        <div className="shrink-0 flex items-center gap-3">
          <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400">
            <Wand2 size={28} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">{t('magicChart.title', 'Magic Chart Ledger')}</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">{t('magicChart.description', 'Physical ledger layout redesigned for structured accounting.')}</p>
          </div>
        </div>
        
        <div className="shrink-0 relative flex items-center gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={() => setSyncTrigger(prev => prev + 1)}
            className="flex items-center justify-center p-2.5 h-12 w-12 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl transition-all duration-200 text-slate-700 dark:text-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50 cursor-pointer"
            title={t('magicChart.syncData', 'Sync Data')}
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
          <p className="text-slate-500 font-medium">{t('magicChart.reconcilingLedger', 'Reconciling ledger entries...')}</p>
        </div>
      ) : (
        <div className="space-y-8 animate-in fade-in duration-300">
          
          {/* LEDGER SHEETS CONTAINER */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg rounded-2xl p-6 space-y-8 overflow-hidden">
            
            <div className="text-center">
              <h3 className="text-xl font-black text-slate-700 dark:text-slate-300 tracking-widest uppercase">
                *** {selectedMonth.toLocaleDateString(locale, { month: 'long' })} {selectedMonth.getFullYear()} ***
              </h3>
            </div>

            {/* 1. MAIN 7-COLUMN TABLE */}
            <div className="overflow-x-auto border border-slate-300 dark:border-slate-700 rounded-xl">
              <table className="w-full text-center border-collapse" style={{ minWidth: '900px' }}>
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-300 dark:border-slate-700">
                    <th className="py-4 px-2 border-r border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 w-[14%]">
                      {t('magicChart.col1', 'Total Sales')} <br /> ({t('magicChart.col1Sub', 'चालू महिन्याची विक्री')})
                    </th>
                    <th className="py-4 px-2 border-r border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 w-[14%]">
                      {t('magicChart.col2', 'Closing Stock')} <br /> ({t('magicChart.col2Sub', 'आखेर शिल्लक माल')})
                    </th>
                    <th className="py-4 px-2 border-r border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 w-[14%] bg-indigo-50/40 dark:bg-indigo-950/10">
                      {t('magicChart.col3', 'Sum 1 + 2')} <br /> ({t('magicChart.col3Sub', 'रकाना 1 + 2 ची बेरीज')})
                    </th>
                    <th className="py-4 px-2 border-r border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 w-[14%]">
                      {t('magicChart.col4', 'Opening Stock')} <br /> ({t('magicChart.col4Sub', 'सुरुवातीची शिल्लक')})
                    </th>
                    <th className="py-4 px-2 border-r border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 w-[14%]">
                      {t('magicChart.col5', 'Total Purchases')} <br /> ({t('magicChart.col5Sub', 'चालू महिन्याची खरेदी')})
                    </th>
                    <th className="py-4 px-2 border-r border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 w-[14%] bg-indigo-50/40 dark:bg-indigo-950/10">
                      {t('magicChart.col6', 'Sum 4 + 5')} <br /> ({t('magicChart.col6Sub', 'रकाना 4 + 5 ची बेरीज')})
                    </th>
                    <th className="py-4 px-2 text-sm font-bold text-slate-700 dark:text-slate-200 w-[16%]">
                      {t('magicChart.col7', 'Gross Profit - Loss')} <br /> ({t('magicChart.col7Sub', 'ढोबळ नफा - तोटा')})
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
                      {t('magicChart.settleCol1', 'Gross Profit - Expenses')} <br /> ({t('magicChart.settleCol1Sub', 'एकूण ढोबळ नफा - चालू महिन्याचा खर्च')})
                    </th>
                    <th className="py-4 px-2 text-sm font-bold text-slate-700 dark:text-slate-200 w-[50%]">
                      {t('magicChart.settleCol2', 'Current Month Net Profit')} <br /> ({t('magicChart.settleCol2Sub', 'एकूण चालू महिन्याचा नफा')})
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
                      {t('magicChart.cumCol1', 'Previous Month Net Profit (+)')} <br /> ({t('magicChart.cumCol1Sub', 'मागील महिन्याचा नफा (+)')})
                    </th>
                    <th className="py-4 px-2 border-r border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 w-[33%]">
                      {t('magicChart.cumCol2', 'Current Month Net Profit')} <span className="text-slate-400 dark:text-slate-500 text-[10px] font-normal">({t('dailyStock.saleQtySub', 'Auto')})</span>
                    </th>
                    <th className="py-4 px-2 text-sm font-bold text-slate-700 dark:text-slate-200 w-[34%] bg-indigo-500/10 dark:bg-indigo-500/5">
                      {t('magicChart.cumCol3', 'Total Net Profit')} <br /> ({t('magicChart.cumCol3Sub', 'एकूण नफा')})
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="h-16">
                    <td className="border-r border-slate-300 dark:border-slate-700 font-extrabold text-slate-600 dark:text-slate-400 text-lg">
                      {formatRs(prevMonthNetProfit)}
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
