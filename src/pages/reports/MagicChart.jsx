import { useState, useEffect, forwardRef } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { Wand2, Calendar, ChevronDown, Save, Edit2 } from 'lucide-react';
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

const formatRs = (num) => '₹' + Math.round(num || 0).toLocaleString('en-IN');

export default function MagicChart() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const saved = sessionStorage.getItem('mc_selectedMonth');
    return saved ? new Date(saved) : new Date();
  });

  // ऑटोमेटेड स्टेट्स (चालू और पिछले महीने के लिए)
  const [salesAmount, setSalesAmount] = useState(0);
  const [expensesAmount, setExpensesAmount] = useState(0);
  const [prevMonthSales, setPrevMonthSales] = useState(0);
  const [prevMonthExpenses, setPrevMonthExpenses] = useState(0);

  // पिछले महीने का सहेजा हुआ डेटा
  const [prevSavedData, setPrevSavedData] = useState(null);

  // मैनुअल / ऑटो-फ़ेच इनपुट स्टेट्स
  const [manualClosing, setManualClosing] = useState('');
  const [manualOpening, setManualOpening] = useState('');
  const [manualPurchases, setManualPurchases] = useState('');

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

      const firstDayStr = `${currYear}-${String(currMonth + 1).padStart(2, '0')}-01`;
      const monthYearStr = `${currYear}-${String(currMonth + 1).padStart(2, '0')}-01`;
      const prevMonthYearStr = `${prevStartObj.getFullYear()}-${String(prevStartObj.getMonth() + 1).padStart(2, '0')}-01`;

      try {
        const [ { data: brands }, { data: allStock }, { data: allExpenses }, { data: savedRecord }, { data: prevRecord }, { data: traderTxData } ] = await Promise.all([
          supabase.from('brands').select('*'),
          supabase.from('daily_stock').select('*').gte('date', prevStartStr).lte('date', currEndStr + 'T23:59:59').order('date', { ascending: true }),
          supabase.from('expenses').select('amount, date').gte('date', prevStartStr).lte('date', currEndStr + 'T23:59:59'),
          supabase.from('magic_chart_saves').select('closing_stock, opening_stock, total_purchases').eq('user_id', user.id).eq('month_year', monthYearStr).maybeSingle(),
          supabase.from('magic_chart_saves').select('closing_stock, opening_stock, total_purchases').eq('user_id', user.id).eq('month_year', prevMonthYearStr).maybeSingle(),
          supabase.from('trader_transactions').select('purchase_amount').eq('user_id', user.id).gte('date', firstDayStr).lte('date', currEndStr)
        ]);

        if (!isMounted) return;

        // ----------------------------------------------------
        // 1. EXPENSES CALCULATION
        // ----------------------------------------------------
        let currExp = 0;
        let prevExp = 0;
        allExpenses?.forEach(e => {
          const eDate = getLocalDateObj(e.date);
          if (eDate) {
            if (eDate >= currStartObj && eDate <= currEndObj) currExp += parseFloat(e.amount || 0);
            if (eDate >= prevStartObj && eDate <= prevEndObj) prevExp += parseFloat(e.amount || 0);
          }
        });

        // ----------------------------------------------------
        // 2. FIFO SALES SIMULATION
        // ----------------------------------------------------
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

        // ----------------------------------------------------
        // 3. AUTO-FETCH OPENING/CLOSING & TOTAL PURCHASES
        // ----------------------------------------------------
        const stockByDateStr = {};
        allStock?.forEach(s => {
          if (!stockByDateStr[s.date]) stockByDateStr[s.date] = {};
          stockByDateStr[s.date][s.brand_id] = s;
        });

        // A. Opening Stock MRP Total (First Day of the Month)
        let computedOpeningStockMrp = 0;
        const firstDayRecords = stockByDateStr[firstDayStr] || {};
        brands?.forEach(b => {
          const rec = firstDayRecords[b.id];
          if (rec) {
            const opQty = parseInt(rec.opening_balance) || 0;
            const mrp = parseFloat(rec.unit_mrp || b.mrp_price || 0);
            computedOpeningStockMrp += opQty * mrp;
          }
        });

        // B. Closing Stock MRP Total (Last Day of the Month)
        let computedClosingStockMrp = 0;
        const lastDayRecords = stockByDateStr[currEndStr] || {};
        brands?.forEach(b => {
          const rec = lastDayRecords[b.id];
          if (rec) {
            const clQty = rec.closing_balance !== null ? parseInt(rec.closing_balance) : 0;
            const mrp = parseFloat(rec.unit_mrp || b.mrp_price || 0);
            computedClosingStockMrp += clQty * mrp;
          }
        });

        // C. Monthly Total Purchases (Fetched directly from Purchase Manager Ledger)
        let computedTotalPurchasesTraders = 0;
        traderTxData?.forEach(tx => {
          computedTotalPurchasesTraders += parseFloat(tx.purchase_amount || 0);
        });

        if (!isMounted) return;

        setSalesAmount(currSales);
        setExpensesAmount(currExp);
        setPrevMonthSales(prevSales);
        setPrevMonthExpenses(prevExp);
        setPrevSavedData(prevRecord);

        // डेटा लोड प्रबंधन (अवेलेबल हो तो सुरक्षित डेटा लें अन्यथा सीधे कम्प्यूटेड वैल्यू लें)
        if (savedRecord) {
          setManualClosing(savedRecord.closing_stock !== null ? String(savedRecord.closing_stock) : String(Math.round(computedClosingStockMrp)));
          setManualOpening(savedRecord.opening_stock !== null ? String(savedRecord.opening_stock) : String(Math.round(computedOpeningStockMrp)));
          setManualPurchases(savedRecord.total_purchases !== null ? String(savedRecord.total_purchases) : String(Math.round(computedTotalPurchasesTraders)));
          setIsEditing(false);
        } else {
          setManualClosing(String(Math.round(computedClosingStockMrp)));
          setManualOpening(String(Math.round(computedOpeningStockMrp)));
          setManualPurchases(String(Math.round(computedTotalPurchasesTraders)));
          setIsEditing(true);
        }

      } catch (error) {
        console.error("Error loading magic data:", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchAndCalculateMagicData();
    return () => { isMounted = false; };
  }, [selectedMonth, user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const currYear = selectedMonth.getFullYear();
    const currMonth = selectedMonth.getMonth();
    const monthYearStr = `${currYear}-${String(currMonth + 1).padStart(2, '0')}-01`;

    const payload = {
      user_id: user.id,
      month_year: monthYearStr,
      closing_stock: manualClosing === '' ? null : parseFloat(manualClosing),
      opening_stock: manualOpening === '' ? null : parseFloat(manualOpening),
      total_purchases: manualPurchases === '' ? null : parseFloat(manualPurchases),
      updated_at: new Date().toISOString()
    };

    try {
      const { error } = await supabase
        .from('magic_chart_saves')
        .upsert(payload, { onConflict: 'user_id, month_year' });

      if (error) throw error;
      setIsEditing(false);
      alert('Magic Chart saved successfully.');
    } catch (err) {
      console.error('Error saving magic chart:', err);
      alert('Error saving: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // --- CALCULATIONS FOR CURRENT MONTH ---
  const box1Val = salesAmount;
  const box2Val = parseFloat(manualClosing) || 0;
  const box3Val = box1Val + box2Val;

  const box4Val = parseFloat(manualOpening) || 0;
  const box5Val = parseFloat(manualPurchases) || 0;
  const box6Val = box4Val + box5Val;

  const box7Val = box3Val - box6Val; // चालू ग्रॉस प्रॉफिट
  const netProfitVal = box7Val - expensesAmount; // चालू नेट प्रॉफिट

  // --- CALCULATIONS FOR PREVIOUS MONTH ---
  const prevBox1Val = prevMonthSales;
  const prevBox2Val = prevSavedData ? parseFloat(prevSavedData.closing_stock) || 0 : 0;
  const prevBox3Val = prevBox1Val + prevBox2Val;

  const prevBox4Val = prevSavedData ? parseFloat(prevSavedData.opening_stock) || 0 : 0;
  const prevBox5Val = prevSavedData ? parseFloat(prevSavedData.total_purchases) || 0 : 0;
  const prevBox6Val = prevBox4Val + prevBox5Val;

  const prevBox7Val = prevBox3Val - prevBox6Val;
  const prevNetProfitVal = prevBox7Val - prevMonthExpenses; // मागील महिन्याचा नफा

  const cumulativeProfitVal = prevNetProfitVal + netProfitVal; // एकूण नफा

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
            
            {/* माहे LABEL (LEDGER HEADER) */}
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
                    {/* रकाना 1 */}
                    <td className="border-r border-slate-300 dark:border-slate-700 font-extrabold text-slate-800 dark:text-slate-100 text-lg">
                      {formatRs(box1Val)}
                    </td>
                    
                    {/* रकाना 2 */}
                    <td className="border-r border-slate-300 dark:border-slate-700 p-0">
                      <input 
                        type="number"
                        disabled={!isEditing}
                        value={manualClosing}
                        onChange={(e) => setManualClosing(e.target.value)}
                        className="w-full h-full text-center bg-transparent focus:bg-indigo-50 dark:focus:bg-indigo-950/30 text-lg font-black text-slate-800 dark:text-slate-100 border-none outline-none focus:ring-0 disabled:opacity-90"
                        style={{ minHeight: '64px' }}
                        placeholder="0"
                      />
                    </td>

                    {/* रकाना 3 */}
                    <td className="border-r border-slate-300 dark:border-slate-700 font-extrabold text-indigo-600 dark:text-indigo-400 text-lg bg-indigo-50/20 dark:bg-indigo-950/5">
                      {formatRs(box3Val)}
                    </td>

                    {/* रकाना 4 */}
                    <td className="border-r border-slate-300 dark:border-slate-700 p-0">
                      <input 
                        type="number"
                        disabled={!isEditing}
                        value={manualOpening}
                        onChange={(e) => setManualOpening(e.target.value)}
                        className="w-full h-full text-center bg-transparent focus:bg-indigo-50 dark:focus:bg-indigo-950/30 text-lg font-black text-slate-800 dark:text-slate-100 border-none outline-none focus:ring-0 disabled:opacity-90"
                        style={{ minHeight: '64px' }}
                        placeholder="0"
                      />
                    </td>

                    {/* रकाना 5 */}
                    <td className="border-r border-slate-300 dark:border-slate-700 p-0">
                      <input 
                        type="number"
                        disabled={!isEditing}
                        value={manualPurchases}
                        onChange={(e) => setManualPurchases(e.target.value)}
                        className="w-full h-full text-center bg-transparent focus:bg-indigo-50 dark:focus:bg-indigo-950/30 text-lg font-black text-slate-800 dark:text-slate-100 border-none outline-none focus:ring-0 disabled:opacity-90"
                        style={{ minHeight: '64px' }}
                        placeholder="0"
                      />
                    </td>

                    {/* रकाना 6 */}
                    <td className="border-r border-slate-300 dark:border-slate-700 font-extrabold text-indigo-600 dark:text-indigo-400 text-lg bg-indigo-50/20 dark:bg-indigo-950/5">
                      {formatRs(box6Val)}
                    </td>

                    {/* रकाना 7 */}
                    <td className={`font-black text-xl ${box7Val >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                      {formatRs(box7Val)}
                    </td>
                  </tr>
                  
                  {/* Row Indices */}
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

            {/* 2. SETTLEMENT TABLE (ढोबळ नफा - खर्च) */}
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

            {/* 3. CUMULATIVE TABLE (एकूण नफा / संचयी) */}
            <div className="overflow-x-auto border border-slate-300 dark:border-slate-700 rounded-xl">
              <table className="w-full text-center border-collapse" style={{ minWidth: '600px' }}>
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-300 dark:border-slate-700">
                    <th className="py-4 px-2 border-r border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 w-[33%]">
                      मागील महिन्याचा नफा (+) <br /> (Previous Month Net Profit)
                    </th>
                    <th className="py-4 px-2 border-r border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 w-[33%]">
                      चालू महिन्याचा नफा <br /> (Current Month Net Profit)
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

            {/* ACTIONS FOOTER */}
            <div className="flex justify-end items-center gap-3 pt-2">
              {!isEditing && (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-sm rounded-xl border border-slate-200 dark:border-slate-700 transition-colors shadow-sm cursor-pointer"
                >
                  <Edit2 size={16} />
                  <span>Edit Ledger</span>
                </button>
              )}
              <button 
                onClick={handleSave}
                disabled={saving || !isEditing}
                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-black text-sm rounded-xl shadow-md transition-colors cursor-pointer"
              >
                <Save size={16} />
                {saving ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>

          </div>

        </div>
      )}
    </div>
  );
}