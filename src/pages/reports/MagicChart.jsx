import { useState, useEffect, forwardRef } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { Wand2, Calendar, Sigma, MinusCircle, Wallet, ChevronDown, ArrowRight } from 'lucide-react';
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

// विभिन्न डेट फॉर्मेट्स और टाइमस्टैम्प्स को बिना टाइमज़ोन शिफ्ट के सटीक रूप से पार्स करने के लिए हेल्पर
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

export default function MagicChart() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const saved = sessionStorage.getItem('mc_selectedMonth');
    return saved ? new Date(saved) : new Date();
  });

  const [chartData, setChartData] = useState({
    box1: 0,
    box2: 0,
    box3: 0,
    box4: 0,
    box5: 0,
    box6: 0,
    box7: 0,
    currExp: 0,
    currNetProfit: 0,
    prevNetProfit: 0,
    totalProfit: 0
  });

  // मैनुअल सिमुलेशन के लिए स्टेट्स
  const [manualSales, setManualSales] = useState('0');
  const [manualPurchases, setManualPurchases] = useState('0');

  // Selected Month को sessionStorage में सिंक करने के लिए हुक
  useEffect(() => {
    if (selectedMonth) {
      sessionStorage.setItem('mc_selectedMonth', selectedMonth.toISOString());
    }
  }, [selectedMonth]);

  useEffect(() => {
    let isMounted = true;

    const fetchAndCalculateMagicData = async () => {
      if (!user) return;
      setLoading(true);

      const currYear = selectedMonth.getFullYear();
      const currMonth = selectedMonth.getMonth();
      
      const currStartObj = new Date(currYear, currMonth, 1);
      const currEndObj = new Date(currYear, currMonth + 1, 0);
      const prevStartObj = new Date(currYear, currMonth - 1, 1);
      const prevEndObj = new Date(currYear, currMonth, 0);

      const currEndStr = formatDateForDB(currEndObj);
      const prevStartStr = formatDateForDB(prevStartObj);

      // 'T23:59:59' जोड़कर आखिरी दिन की प्रविष्टियों को टाइमस्टैम्प होने पर भी शामिल किया गया है
      const [ { data: brands }, { data: allStock }, { data: allExpenses }, { data: traderTx } ] = await Promise.all([
        supabase.from('brands').select('*'),
        supabase.from('daily_stock').select('*').gte('date', prevStartStr).lte('date', currEndStr + 'T23:59:59').order('date', { ascending: true }),
        supabase.from('expenses').select('amount, date').gte('date', prevStartStr).lte('date', currEndStr + 'T23:59:59'),
        supabase.from('trader_transactions').select('purchase_amount, date').gte('date', prevStartStr).lte('date', currEndStr + 'T23:59:59')
      ]);

      if (!isMounted) return;

      // 1. Calculate Expenses
      let prevExp = 0, currExp = 0;
      allExpenses?.forEach(e => {
        const eDate = getLocalDateObj(e.date);
        if (eDate) {
          if (eDate >= prevStartObj && eDate <= prevEndObj) prevExp += parseFloat(e.amount || 0);
          if (eDate >= currStartObj && eDate <= currEndObj) currExp += parseFloat(e.amount || 0);
        }
      });

      // 2. Calculate Purchases (trader_transactions से)
      let prevPurchases = 0, currPurchases = 0;
      traderTx?.forEach(tx => {
        const txDate = getLocalDateObj(tx.date);
        if (txDate) {
          if (txDate >= prevStartObj && txDate <= prevEndObj) prevPurchases += parseFloat(tx.purchase_amount || 0);
          if (txDate >= currStartObj && txDate <= currEndObj) currPurchases += parseFloat(tx.purchase_amount || 0);
        }
      });

      // Extract exact Opening & Closing Stocks
      const extractStockValuations = (startObj, endObj) => {
        let openingVal = 0;
        let closingVal = 0;
        const stockByBrand = {};
        
        allStock?.forEach(s => {
            const sDate = getLocalDateObj(s.date);
            if (sDate && sDate >= startObj && sDate <= endObj) {
                if (!stockByBrand[s.brand_id]) stockByBrand[s.brand_id] = [];
                stockByBrand[s.brand_id].push(s);
            }
        });

        brands?.forEach(b => {
            const bStock = stockByBrand[b.id];
            if (bStock && bStock.length > 0) {
                const firstEntry = bStock[0];
                const openPrice = firstEntry.unit_price ? parseFloat(firstEntry.unit_price) : parseFloat(b.selling_price);
                openingVal += (parseInt(firstEntry.opening_balance || 0) * openPrice);

                const lastEntry = bStock[bStock.length - 1];
                const closeQty = lastEntry.closing_balance !== null ? parseInt(lastEntry.closing_balance) : 0;
                const closePrice = lastEntry.unit_price ? parseFloat(lastEntry.unit_price) : parseFloat(b.selling_price);
                closingVal += (closeQty * closePrice);
            }
        });
        return { openingVal, closingVal };
      };

      const currStockVals = extractStockValuations(currStartObj, currEndObj);
      const prevStockVals = extractStockValuations(prevStartObj, prevEndObj);

      // Simulate DailyStock FIFO Sales
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

      if (!isMounted) return;

      const currBox3 = currSales + currStockVals.closingVal;
      const currBox6 = currStockVals.openingVal + currPurchases;
      const currBox7 = currBox3 - currBox6;
      const currentNetProfit = currBox7 - currExp;

      const prevBox3 = prevSales + prevStockVals.closingVal;
      const prevBox6 = prevStockVals.openingVal + prevPurchases;
      const prevBox7 = prevBox3 - prevBox6;
      const previousNetProfit = prevBox7 - prevExp;

      setChartData({ 
        box1: currSales, 
        box2: currStockVals.closingVal, 
        box3: currBox3, 
        box4: currStockVals.openingVal, 
        box5: currPurchases, 
        box6: currBox6, 
        box7: currBox7, 
        currExp, 
        currNetProfit: currentNetProfit, 
        prevNetProfit: previousNetProfit, 
        totalProfit: previousNetProfit + currentNetProfit 
      });

      // लोड होने पर मैनुअल इनपुट फ़ील्ड्स को ऑटोमेटेड वैल्यूज़ से प्री-फिल करना
      setManualSales(String(Math.round(currSales)));
      setManualPurchases(String(Math.round(currPurchases)));
      
      setLoading(false);
    };

    fetchAndCalculateMagicData();
    return () => { isMounted = false; };
  }, [selectedMonth, user]);

  const formatRs = (num) => '₹' + Math.round(num).toLocaleString('en-IN');

  // --- MANUAL CHART REALTIME CALCULATIONS ---
  const mSalesVal = parseFloat(manualSales) || 0;
  const mPurchasesVal = parseFloat(manualPurchases) || 0;
  const mBox2Val = chartData.box2; // Closing Stock
  const mBox3Val = mSalesVal + mBox2Val; // (Box 1 + Box 2)
  const mBox4Val = chartData.box4; // Opening Stock
  const mBox6Val = mBox4Val + mPurchasesVal; // (Box 4 + Box 5)
  const mBox7Val = mBox3Val - mBox6Val; // मैनुअल ग्रॉस प्रॉफिट/लॉस
  const mNetProfitVal = mBox7Val - chartData.currExp; // मैनुअल नेट प्रॉफिट
  const mTotalProfit = chartData.prevNetProfit + mNetProfitVal; // कुल मैनुअल संचयी लाभ

  return (
    <div className="space-y-6 transition-colors duration-300">
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
        
        .dark .react-datepicker__year-select {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #f8fafc !important;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23cbd5e1'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E") !important;
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
            <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Magic Chart Sandbox</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">Automated accounting & manual simulation mapping side-by-side.</p>
          </div>
        </div>
        
        <div className="shrink-0 relative">
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
          <p className="text-slate-500 font-medium">Reconciling thousands of entries dynamically...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 animate-in fade-in zoom-in-95 duration-500">
          
          {/* ================= 1. AUTOMATED MAGIC CHART ================= */}
          <div className="space-y-6 border-r border-slate-100 dark:border-slate-800/60 xl:pr-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30 text-xs font-black text-blue-600 dark:text-blue-400">1</span>
                Automated Magic Chart
              </h3>
              <span className="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-xs font-bold px-2.5 py-1 rounded-full">System Calculated</span>
            </div>

            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex justify-between items-center group hover:border-blue-400 transition-colors">
                <div>
                  <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Box 1</p>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Total Sales Amount</h3>
                  <p className="text-xs text-slate-400 mt-1">चालू महिन्याची अखेर विक्री</p>
                </div>
                <div className="text-2xl font-black text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-4 py-2 rounded-xl">
                  {formatRs(chartData.box1)}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex justify-between items-center group hover:border-cyan-400 transition-colors">
                <div>
                  <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Box 2</p>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Closing Stock Value</h3>
                  <p className="text-xs text-slate-400 mt-1">शिल्लक माल</p>
                </div>
                <div className="text-2xl font-black text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/20 px-4 py-2 rounded-xl">
                  {formatRs(chartData.box2)}
                </div>
              </div>

              <div className="bg-slate-800 dark:bg-slate-950 rounded-2xl p-5 border border-slate-700/50 shadow-md flex justify-between items-center relative overflow-hidden">
                <div className="absolute right-0 top-0 opacity-5 transform translate-x-1/4 -translate-y-1/4"><Sigma size={100} /></div>
                <div className="relative z-10">
                  <p className="text-xs font-bold text-indigo-300 uppercase tracking-wider mb-1">Box 3</p>
                  <h3 className="text-lg font-bold text-white">Sum (Box 1 + 2)</h3>
                  <p className="text-xs text-indigo-200 mt-1">रकाना 1+2 ची बेरीज</p>
                </div>
                <div className="text-2xl font-black text-indigo-400 relative z-10">
                  {formatRs(chartData.box3)}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex justify-between items-center group hover:border-fuchsia-400 transition-colors">
                <div>
                  <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Box 4</p>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Opening Stock Value</h3>
                  <p className="text-xs text-slate-400 mt-1">चालू महिन्याची सुरुवातीची शिल्लक</p>
                </div>
                <div className="text-2xl font-black text-fuchsia-600 dark:text-fuchsia-400 bg-fuchsia-50 dark:bg-fuchsia-900/20 px-4 py-2 rounded-xl">
                  {formatRs(chartData.box4)}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex justify-between items-center group hover:border-purple-400 transition-colors">
                <div>
                  <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Box 5</p>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Total Purchases</h3>
                  <p className="text-xs text-slate-400 mt-1">चालू महिन्याची खरेदी</p>
                </div>
                <div className="text-2xl font-black text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-4 py-2 rounded-xl">
                  {formatRs(chartData.box5)}
                </div>
              </div>

              <div className="bg-slate-800 dark:bg-slate-950 rounded-2xl p-5 border border-slate-700/50 shadow-md flex justify-between items-center relative overflow-hidden">
                <div className="absolute right-0 top-0 opacity-5 transform translate-x-1/4 -translate-y-1/4"><Sigma size={100} /></div>
                <div className="relative z-10">
                  <p className="text-xs font-bold text-violet-300 uppercase tracking-wider mb-1">Box 6</p>
                  <h3 className="text-lg font-bold text-white">Sum (Box 4 + 5)</h3>
                  <p className="text-xs text-violet-200 mt-1">रकाना 4+5 ची बेरीज</p>
                </div>
                <div className="text-2xl font-black text-violet-400 relative z-10">
                  {formatRs(chartData.box6)}
                </div>
              </div>
            </div>

            {/* GROSS PROFIT HIGHLIGHT (BOX 7) */}
            <div className={`rounded-2xl p-6 border-2 shadow-md flex justify-between items-center relative overflow-hidden transition-colors ${chartData.box7 >= 0 ? 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800' : 'bg-red-50/70 dark:bg-red-950/20 border-red-300 dark:border-red-800'}`}>
              <div className="relative z-10">
                <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${chartData.box7 >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  Box 7
                </p>
                <h3 className={`text-lg font-bold ${chartData.box7 >= 0 ? 'text-emerald-800 dark:text-emerald-200' : 'text-red-800 dark:text-red-200'}`}>
                  Gross {chartData.box7 >= 0 ? 'Profit' : 'Loss'} (Box 3 - 6)
                </h3>
              </div>
              <div className={`text-3xl font-black relative z-10 ${chartData.box7 >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatRs(chartData.box7)}
              </div>
            </div>

            {/* AUTOMATED SETTLEMENT */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 border-b border-slate-200 dark:border-slate-800">
                <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2"><Wallet size={16} className="text-blue-500" /> Settlement & Profit History</h4>
              </div>
              <div className="p-5 space-y-3.5 text-sm">
                <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                  <span>Gross Profit</span>
                  <span className="font-bold">{formatRs(chartData.box7)}</span>
                </div>
                <div className="flex justify-between items-center text-red-500 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <span className="flex items-center gap-1.5"><MinusCircle size={15}/> Business Expenses</span>
                  <span className="font-bold">- {formatRs(chartData.currExp)}</span>
                </div>
                <div className="flex justify-between items-center pt-1.5">
                  <span className="font-bold text-slate-800 dark:text-white">Current Month Net Profit</span>
                  <span className={`font-black text-xl ${chartData.currNetProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {formatRs(chartData.currNetProfit)}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-slate-100 dark:border-slate-800/80">
                  <span className="font-bold text-slate-800 dark:text-white">Total Cumulative Profit</span>
                  <div className="flex items-center gap-2">
                    <ArrowRight size={18} className="text-slate-300 dark:text-slate-600" />
                    <span className="bg-indigo-600 text-white font-black px-4 py-1.5 rounded-lg text-lg">
                      {formatRs(chartData.totalProfit)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ================= 2. MANUAL MAGIC CHART (EDITABLE) ================= */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-xs font-black text-indigo-600 dark:text-indigo-400">2</span>
                Manual Magic Chart
              </h3>
              <span className="bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 text-xs font-bold px-2.5 py-1 rounded-full">Custom Sandbox</span>
            </div>

            <div className="space-y-4">
              {/* EDITABLE BOX 1 (Total Sales) */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex justify-between items-center group hover:border-indigo-400 transition-colors">
                <div>
                  <p className="text-xs font-bold text-indigo-500 uppercase tracking-wider mb-1">Box 1 (Manual)</p>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Total Sales Amount</h3>
                  <p className="text-xs text-slate-400 mt-1">मैनुअल विक्री रक्कम बदला</p>
                </div>
                <div className="flex items-center bg-indigo-50 dark:bg-indigo-900/20 rounded-xl px-4 py-2 border border-transparent focus-within:border-indigo-500/30 focus-within:ring-2 focus-within:ring-indigo-500/15 transition-all">
                  <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400 select-none mr-0.5">₹</span>
                  <input 
                    type="number"
                    value={manualSales}
                    onChange={(e) => setManualSales(e.target.value)}
                    className="w-36 sm:w-44 bg-transparent border-none outline-none text-right font-black text-indigo-600 dark:text-indigo-400 text-2xl p-0 focus:ring-0"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* AUTOMATED BOX 2 */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex justify-between items-center group transition-colors">
                <div>
                  <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Box 2 (Auto)</p>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Closing Stock Value</h3>
                  <p className="text-xs text-slate-400 mt-1">शिल्लक माल</p>
                </div>
                <div className="text-2xl font-black text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/20 px-4 py-2 rounded-xl">
                  {formatRs(mBox2Val)}
                </div>
              </div>

              {/* MANUAL SUM BOX 3 */}
              <div className="bg-slate-800 dark:bg-slate-950 rounded-2xl p-5 border border-slate-700/50 shadow-md flex justify-between items-center relative overflow-hidden">
                <div className="absolute right-0 top-0 opacity-5 transform translate-x-1/4 -translate-y-1/4"><Sigma size={100} /></div>
                <div className="relative z-10">
                  <p className="text-xs font-bold text-indigo-300 uppercase tracking-wider mb-1">Box 3 (Manual)</p>
                  <h3 className="text-lg font-bold text-white">Sum (Box 1 + 2)</h3>
                  <p className="text-xs text-indigo-200 mt-1">रकाना 1+2 ची बेरीज</p>
                </div>
                <div className="text-2xl font-black text-indigo-400 relative z-10">
                  {formatRs(mBox3Val)}
                </div>
              </div>

              {/* AUTOMATED BOX 4 */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex justify-between items-center group transition-colors">
                <div>
                  <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Box 4 (Auto)</p>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Opening Stock Value</h3>
                  <p className="text-xs text-slate-400 mt-1">चालू महिन्याची सुरुवातीची शिल्लक</p>
                </div>
                <div className="text-2xl font-black text-fuchsia-600 dark:text-fuchsia-400 bg-fuchsia-50 dark:bg-fuchsia-900/20 px-4 py-2 rounded-xl">
                  {formatRs(mBox4Val)}
                </div>
              </div>

              {/* EDITABLE BOX 5 (Total Purchases) */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex justify-between items-center group hover:border-indigo-400 transition-colors">
                <div>
                  <p className="text-xs font-bold text-indigo-500 uppercase tracking-wider mb-1">Box 5 (Manual)</p>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Total Purchases</h3>
                  <p className="text-xs text-slate-400 mt-1">मैनुअल खरेदी रक्कम बदला</p>
                </div>
                <div className="flex items-center bg-indigo-50 dark:bg-indigo-900/20 rounded-xl px-4 py-2 border border-transparent focus-within:border-indigo-500/30 focus-within:ring-2 focus-within:ring-indigo-500/15 transition-all">
                  <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400 select-none mr-0.5">₹</span>
                  <input 
                    type="number"
                    value={manualPurchases}
                    onChange={(e) => setManualPurchases(e.target.value)}
                    className="w-36 sm:w-44 bg-transparent border-none outline-none text-right font-black text-indigo-600 dark:text-indigo-400 text-2xl p-0 focus:ring-0"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* MANUAL SUM BOX 6 */}
              <div className="bg-slate-800 dark:bg-slate-950 rounded-2xl p-5 border border-slate-700/50 shadow-md flex justify-between items-center relative overflow-hidden">
                <div className="absolute right-0 top-0 opacity-5 transform translate-x-1/4 -translate-y-1/4"><Sigma size={100} /></div>
                <div className="relative z-10">
                  <p className="text-xs font-bold text-violet-300 uppercase tracking-wider mb-1">Box 6 (Manual)</p>
                  <h3 className="text-lg font-bold text-white">Sum (Box 4 + 5)</h3>
                  <p className="text-xs text-violet-200 mt-1">रकाना 4+5 ची बेरीज</p>
                </div>
                <div className="text-2xl font-black text-violet-400 relative z-10">
                  {formatRs(mBox6Val)}
                </div>
              </div>
            </div>

            {/* MANUAL GROSS PROFIT HIGHLIGHT (BOX 7) */}
            <div className={`rounded-2xl p-6 border-2 shadow-md flex justify-between items-center relative overflow-hidden transition-colors ${mBox7Val >= 0 ? 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800' : 'bg-red-50/70 dark:bg-red-950/20 border-red-300 dark:border-red-800'}`}>
              <div className="relative z-10">
                <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${mBox7Val >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  Box 7 (Manual)
                </p>
                <h3 className={`text-lg font-bold ${mBox7Val >= 0 ? 'text-emerald-800 dark:text-emerald-200' : 'text-red-800 dark:text-red-200'}`}>
                  Gross {mBox7Val >= 0 ? 'Profit' : 'Loss'} (Box 3 - 6)
                </h3>
              </div>
              <div className={`text-3xl font-black relative z-10 ${mBox7Val >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatRs(mBox7Val)}
              </div>
            </div>

            {/* MANUAL SETTLEMENT */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 border-b border-slate-200 dark:border-slate-800">
                <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2"><Wallet size={16} className="text-indigo-500" /> Manual Sandbox Settlement</h4>
              </div>
              <div className="p-5 space-y-3.5 text-sm">
                <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                  <span>Gross Profit</span>
                  <span className="font-bold">{formatRs(mBox7Val)}</span>
                </div>
                <div className="flex justify-between items-center text-red-500 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <span className="flex items-center gap-1.5"><MinusCircle size={15}/> Business Expenses</span>
                  <span className="font-bold">- {formatRs(chartData.currExp)}</span>
                </div>
                <div className="flex justify-between items-center pt-1.5">
                  <span className="font-bold text-slate-800 dark:text-white">Current Month Net Profit</span>
                  <span className={`font-black text-xl ${mNetProfitVal >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {formatRs(mNetProfitVal)}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-slate-100 dark:border-slate-800/80">
                  <span className="font-bold text-slate-800 dark:text-white">Total Cumulative Profit</span>
                  <div className="flex items-center gap-2">
                    <ArrowRight size={18} className="text-slate-300 dark:text-slate-600" />
                    <span className="bg-indigo-600 text-white font-black px-4 py-1.5 rounded-lg text-lg">
                      {formatRs(mTotalProfit)}
                    </span>
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