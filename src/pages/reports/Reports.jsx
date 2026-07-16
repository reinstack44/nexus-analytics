import { useState, useEffect, forwardRef } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { 
  FileText, Download, FileSpreadsheet, Printer, Calendar, ChevronDown, 
  TrendingUp, Users, Receipt, Landmark, Sigma, Wand2, Save, Edit2 
} from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

const CustomDateInput = forwardRef(({ value, onClick, placeholder }, ref) => (
  <button onClick={onClick} ref={ref} className="flex items-center px-4 py-2.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-all text-sm font-semibold text-slate-700 dark:text-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 whitespace-nowrap">
    <Calendar size={16} className="text-blue-500 mr-2" /> {value || placeholder}
    <ChevronDown size={14} className="text-slate-400 dark:text-slate-500 ml-3" />
  </button>
));
CustomDateInput.displayName = "CustomDateInput";

const getInitialDate = (storageKey) => {
  const savedDate = sessionStorage.getItem(storageKey);
  if (savedDate) return new Date(savedDate);
  return new Date(); 
};

const formatDateForDB = (date) => {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

const isFullCalendarMonth = (start, end) => {
  if (!start || !end) return false;
  const s = getLocalDateObj(start);
  const e = getLocalDateObj(end);
  if (!s || !e) return false;

  const sameYear = s.getFullYear() === e.getFullYear();
  const sameMonth = s.getMonth() === e.getMonth();
  const isFirstDay = s.getDate() === 1;

  const lastDayOfSameMonth = new Date(s.getFullYear(), s.getMonth() + 1, 0).getDate();
  const isLastDay = e.getDate() === lastDayOfSameMonth;

  return sameYear && sameMonth && isFirstDay && isLastDay;
};

const formatRs = (num) => '₹' + Math.round(num || 0).toLocaleString('en-IN');

export default function Reports() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [startDate, setStartDate] = useState(() => getInitialDate('report_start_date'));
  const [endDate, setEndDate] = useState(() => getInitialDate('report_end_date'));
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  const [salesList, setSalesList] = useState([]);
  const [traderTransactions, setTraderTransactions] = useState([]);
  const [expenseList, setExpenseList] = useState([]);
  const [collectionList, setCollectionList] = useState([]);
  const [summary, setSummary] = useState({ grossProfit: 0, totalPurchases: 0, totalExpenses: 0, netProfit: 0, totalWithdrawn: 0, retainedCash: 0 });

  const [magicChartData, setMagicChartData] = useState({
    box1: 0, box2: 0, box3: 0, box4: 0, box5: 0, box6: 0, box7: 0, currExp: 0, currNetProfit: 0, prevNetProfit: 0, cumulativeProfit: 0
  });
  const [manualClosing, setManualClosing] = useState('');
  const [manualOpening, setManualOpening] = useState('');
  const [manualPurchases, setManualPurchases] = useState('');

  const [prevSavedData, setPrevSavedData] = useState(null);
  const [prevMonthSales, setPrevMonthSales] = useState(0);
  const [prevMonthExpenses, setPrevMonthExpenses] = useState(0);

  const selectedMonth = startDate;

  useEffect(() => {
    if (selectedMonth) {
      sessionStorage.setItem('mc_selectedMonth', selectedMonth.toISOString());
    }
  }, [selectedMonth]);

  const handleStartDateChange = (date) => { setStartDate(date); sessionStorage.setItem('report_start_date', date.toISOString()); setLoading(true); };
  const handleEndDateChange = (date) => { setEndDate(date); sessionStorage.setItem('report_end_date', date.toISOString()); setLoading(true); };

  const showMagicChart = isFullCalendarMonth(startDate, endDate);

  useEffect(() => {
    let isMounted = true;
    const fetchReportData = async () => {
      if (!startDate || !endDate) return;
      
      const startObj = getLocalDateObj(startDate);
      const endObj = getLocalDateObj(endDate);
      const startStr = formatDateForDB(startObj); 
      const endStr = formatDateForDB(endObj);

      const prevStartObj = new Date(startObj.getFullYear(), startObj.getMonth() - 1, 1);
      const prevEndObj = new Date(startObj.getFullYear(), startObj.getMonth(), 0);
      const prevStartStr = formatDateForDB(prevStartObj);

      const monthYearStr = `${startObj.getFullYear()}-${String(startObj.getMonth() + 1).padStart(2, '0')}-01`;
      const prevMonthYearStr = `${prevStartObj.getFullYear()}-${String(prevStartObj.getMonth() + 1).padStart(2, '0')}-01`;

      try {
        const { data: brandsData } = await supabase.from('brands').select('*');
        const brandMap = {}; brandsData?.forEach(b => brandMap[b.id] = b);

        const expQueryStart = showMagicChart ? prevStartStr : startStr;
        const { data: expData } = await supabase.from('expenses').select('*').gte('date', expQueryStart).lte('date', endStr + 'T23:59:59').order('date');
        
        let tExpenses = 0;
        expData?.forEach(e => {
          if (e.date >= startStr && e.date <= endStr + 'T23:59:59') {
            tExpenses += parseFloat(e.amount);
          }
        });
        
        const { data: withData } = await supabase.from('owner_withdrawals').select('*').gte('date', startStr).lte('date', endStr + 'T23:59:59').order('date');
        const tWithdrawals = withData?.reduce((sum, w) => sum + parseFloat(w.amount), 0) || 0;

        const { data: purchData } = await supabase.from('purchases').select('*').gte('date', startStr).lte('date', endStr + 'T23:59:59');
        let tPurchases = 0; const purchaseQtyMap = {}; 
        purchData?.forEach(p => {
          tPurchases += parseFloat(p.total_amount) || 0;
          const key = `${p.date}_${p.brand_id}`; purchaseQtyMap[key] = (purchaseQtyMap[key] || 0) + (p.quantity || 0);
        });

        const { data: allTraderTxData } = await supabase.from('trader_transactions').select('*, traders(trader_name)').lte('date', endStr + 'T23:59:59').order('date').order('created_at');
        const txList = []; const balances = {};
        let currPurchasesVal = 0;

        allTraderTxData?.forEach(tx => {
          const traderId = tx.trader_id; const pAmt = parseFloat(tx.purchase_amount) || 0; const paidAmt = parseFloat(tx.paid_amount) || 0;
          if (!balances[traderId]) balances[traderId] = 0;
          if (tx.manual_remaining !== null && tx.manual_remaining !== undefined) balances[traderId] = parseFloat(tx.manual_remaining);
          else balances[traderId] = balances[traderId] + pAmt - paidAmt;
          
          if (tx.date >= startStr) {
            txList.push({ ...tx, remaining_amount: balances[traderId] });
            const txDate = getLocalDateObj(tx.date);
            if (txDate && txDate <= endObj) {
              currPurchasesVal += pAmt;
            }
          }
        });

        const stockQueryStart = showMagicChart ? prevStartStr : startStr;
        const { data: stockData } = await supabase.from('daily_stock').select('*').gte('date', stockQueryStart).lte('date', endStr + 'T23:59:59').order('date', { ascending: true });
        
        if (!isMounted) return; 

        setExpenseList(expData?.filter(e => e.date >= startStr) || []);
        setCollectionList(withData || []);
        setTraderTransactions(txList);

        let tSales = 0; const salesAggregation = {};
        const validStockData = stockData?.filter(stock => stock.date >= startStr && stock.closing_balance !== null) || [];
        
        validStockData.forEach(stock => {
          const key = `${stock.date}_${stock.brand_id}`; const purchQty = purchaseQtyMap[key] || 0;
          const openBal = parseInt(stock.opening_balance) || 0; const closeBal = parseInt(stock.closing_balance) || 0;
          let saleQty = openBal + purchQty - closeBal; saleQty = saleQty < 0 ? 0 : saleQty;
          const brand = brandMap[stock.brand_id]; const sellingPrice = parseFloat(stock.unit_price) || (brand ? parseFloat(brand.selling_price) : 0);
          const saleRev = saleQty * sellingPrice; tSales += saleRev;

          if (saleQty > 0 && brand) {
            if (!salesAggregation[brand.id]) {
              salesAggregation[brand.id] = { brand_name: brand.brand_name, bottle_size: brand.bottle_size, selling_price: sellingPrice, display_order: brand.display_order, total_qty: 0, total_revenue: 0 };
            }
            salesAggregation[brand.id].total_qty += saleQty; salesAggregation[brand.id].total_revenue += saleRev;
          }
        });

        const sortedSalesList = Object.values(salesAggregation).sort((a, b) => {
          const orderA = a.display_order ?? Number.MAX_SAFE_INTEGER; const orderB = b.display_order ?? Number.MAX_SAFE_INTEGER;
          if (orderA !== orderB) return orderA - orderB; return a.brand_name.localeCompare(b.brand_name);
        });
        setSalesList(sortedSalesList);

        const netProfit = tSales - tPurchases - tExpenses;
        setSummary({ grossProfit: tSales, totalPurchases: tPurchases, totalExpenses: tExpenses, netProfit: netProfit, totalWithdrawn: tWithdrawals, retainedCash: netProfit - tWithdrawals });

        if (showMagicChart && user) {
          const [ { data: savedRecord }, { data: prevRecord } ] = await Promise.all([
            supabase.from('magic_chart_saves').select('closing_stock, opening_stock, total_purchases').eq('user_id', user.id).eq('month_year', monthYearStr).maybeSingle(),
            supabase.from('magic_chart_saves').select('closing_stock, opening_stock, total_purchases').eq('user_id', user.id).eq('month_year', prevMonthYearStr).maybeSingle()
          ]);

          let currExpVal = 0;
          let prevExpVal = 0;
          expData?.forEach(e => {
            const eDate = getLocalDateObj(e.date);
            if (eDate) {
              if (eDate >= startObj && eDate <= endObj) currExpVal += parseFloat(e.amount || 0);
              if (eDate >= prevStartObj && eDate <= prevEndObj) prevExpVal += parseFloat(e.amount || 0);
            }
          });

          let openingVal = 0;
          let closingVal = 0;
          const stockByBrand = {};
          
          stockData?.forEach(s => {
            const sDate = getLocalDateObj(s.date);
            if (sDate && sDate >= startObj && sDate <= endObj) {
              if (!stockByBrand[s.brand_id]) stockByBrand[s.brand_id] = [];
              stockByBrand[s.brand_id].push(s);
            }
          });

          brandsData?.forEach(b => {
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

          const calculateFifoSales = async (startObjRange, endObjRange) => {
            let totalSales = 0;
            const prevClosings = {};
            const startRangeStr = formatDateForDB(startObjRange);
            const { data: beforeStock } = await supabase.from('daily_stock').select('*').lt('date', startRangeStr).order('date', { ascending: false });
            beforeStock?.forEach(s => {
              if (prevClosings[s.brand_id] === undefined && s.closing_balance !== null) {
                prevClosings[s.brand_id] = { closing_balance: parseInt(s.closing_balance), price: s.unit_price ? parseFloat(s.unit_price) : null };
              }
            });

            const stockByDate = {};
            stockData?.forEach(s => {
              const sDate = getLocalDateObj(s.date);
              if (sDate && sDate >= startObjRange && sDate <= endObjRange) {
                const dateKey = formatDateForDB(sDate);
                if (!stockByDate[dateKey]) stockByDate[dateKey] = [];
                stockByDate[dateKey].push(s);
              }
            });

            const sortedDates = Object.keys(stockByDate).sort();
            let runningStates = {};
            brandsData?.forEach(b => {
              const pc = prevClosings[b.id];
              runningStates[b.id] = { closing: pc ? pc.closing_balance : 0, price: pc?.price || parseFloat(b.selling_price) };
            });

            sortedDates.forEach(date => {
              stockByDate[date].forEach(row => {
                const brand = brandMap[row.brand_id];
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

          const currSales = await calculateFifoSales(startObj, endObj);
          const prevSales = await calculateFifoSales(prevStartObj, prevEndObj);

          setPrevSavedData(prevRecord);
          setPrevMonthSales(prevSales);
          setPrevMonthExpenses(prevExpVal);

          if (!isMounted) return;

          setMagicChartData(prev => ({
            ...prev,
            box1: currSales,
            box2: closingVal,
            box4: openingVal,
            box5: currPurchasesVal,
            currExp: currExpVal
          }));

          if (savedRecord) {
            setManualClosing(savedRecord.closing_stock !== null ? String(savedRecord.closing_stock) : '');
            setManualOpening(savedRecord.opening_stock !== null ? String(savedRecord.opening_stock) : '');
            setManualPurchases(savedRecord.total_purchases !== null ? String(savedRecord.total_purchases) : '');
            setIsEditing(false); 
          } else {
            setManualClosing('');
            setManualPurchases(String(Math.round(currPurchasesVal)));
            setIsEditing(true); 
            if (prevRecord && prevRecord.closing_stock !== null) {
              setManualOpening(String(prevRecord.closing_stock));
            } else {
              setManualOpening(String(Math.round(openingVal)));
            }
          }
        }

      } catch (error) { console.error("Error generating report:", error); }
      if (isMounted) setLoading(false);
    };

    fetchReportData();
    return () => { isMounted = false; };
  }, [startDate, endDate, showMagicChart, user]);

  const handleSaveMagicChart = async () => {
    if (!user) return;
    setSaving(true);

    const startObj = getLocalDateObj(startDate);
    const monthYearStr = `${startObj.getFullYear()}-${String(startObj.getMonth() + 1).padStart(2, '0')}-01`;

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

  const exportToCSV = () => {
    window.alert("Exporting CSV is optimized for specific fields. PDF is recommended for full multi-page reporting.");
  };

  const printReport = () => { window.print(); setIsExportMenuOpen(false); };

  const salesTotalQty = salesList.reduce((acc, s) => acc + s.total_qty, 0);
  const salesTotalRev = salesList.reduce((acc, s) => acc + s.total_revenue, 0);
  const traderTotalPurchases = traderTransactions.reduce((acc, tx) => acc + tx.purchase_amount, 0);
  const traderTotalPaid = traderTransactions.reduce((acc, tx) => acc + tx.paid_amount, 0);
  const traderTotalRemaining = traderTransactions.length > 0 ? traderTransactions[traderTransactions.length - 1].remaining_amount : 0;

  // Grouping trader transactions by trader ID for individual ledgers
  const groupedTraderData = traderTransactions.reduce((acc, tx) => {
    const traderId = tx.trader_id;
    const name = tx.traders?.trader_name || 'N/A';
    if (!acc[traderId]) {
      acc[traderId] = {
        name,
        transactions: [],
        totalPurchases: 0,
        totalPaid: 0,
        remainingBalance: 0
      };
    }
    acc[traderId].transactions.push(tx);
    acc[traderId].totalPurchases += parseFloat(tx.purchase_amount || 0);
    acc[traderId].totalPaid += parseFloat(tx.paid_amount || 0);
    acc[traderId].remainingBalance = tx.remaining_amount; // Sets the final remaining balance after last transaction
    return acc;
  }, {});

  const ledgerBox1 = magicChartData.box1; 
  const ledgerBox2 = parseFloat(manualClosing) || 0; 
  const ledgerBox3 = ledgerBox1 + ledgerBox2;

  const ledgerBox4 = parseFloat(manualOpening) || 0; 
  const ledgerBox5 = parseFloat(manualPurchases) || 0; 
  const ledgerBox6 = ledgerBox4 + ledgerBox5;

  const ledgerBox7 = ledgerBox3 - ledgerBox6; 
  const ledgerNetProfit = ledgerBox7 - magicChartData.currExp; 

  const prevBox2Val = prevSavedData ? parseFloat(prevSavedData.closing_stock) || 0 : 0;
  const prevBox3Val = prevMonthSales + prevBox2Val;

  const prevBox4Val = prevSavedData ? parseFloat(prevSavedData.opening_stock) || 0 : 0;
  const prevBox5Val = prevSavedData ? parseFloat(prevSavedData.total_purchases) || 0 : 0;
  const prevBox6Val = prevBox4Val + prevBox5Val;

  const prevBox7Val = prevBox3Val - prevBox6Val;
  const prevNetProfitVal = prevBox7Val - prevMonthExpenses; 

  const cumulativeProfitVal = prevNetProfitVal + ledgerNetProfit; 

  return (
    <div className="space-y-6 transition-colors duration-300">
      <style>{`
        .header-date-picker .react-datepicker-wrapper { display: inline-block; width: auto; }
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
        
        /* UNIFIED HIGH-FIDELITY PRINT SYSTEM */
        @media print {
          @page { 
            size: A4 portrait; 
            margin: 12mm 12mm 12mm 12mm; 
          }
          
          /* Enforce exact colors and graphics rendering regardless of active theme */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            box-shadow: none !important;
            text-shadow: none !important;
          }

          html, body { 
            background-color: #ffffff !important; 
            color: #0f172a !important; 
            margin: 0 !important; 
            padding: 0 !important; 
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important; 
          }

          /* Forcefully strip out dark-mode styling overrides on print pages */
          .dark, .dark * {
            background-color: #ffffff !important;
            color: #0f172a !important;
            border-color: #cbd5e1 !important;
          }
          
          body * { visibility: hidden; } 
          .no-print { display: none !important; }
          
          #printable-report, #printable-report * { visibility: visible; } 
          #printable-report { 
            position: absolute !important; 
            left: 0 !important; 
            top: 0 !important; 
            width: 100% !important; 
            background-color: #ffffff !important; 
            padding: 0 !important;
            margin: 0 !important;
          }

          /* Elegant Colored Section Headings */
          .print-section-header {
            border-left: 5px solid #4f46e5 !important;
            padding-left: 10px !important;
            color: #1e1b4b !important;
            font-size: 13pt !important;
            font-weight: 800 !important;
            text-transform: uppercase;
            margin-top: 25px !important;
            margin-bottom: 15px !important;
          }

          /* Clean Metric Grid styling */
          .print-card-grid { 
            display: grid !important; 
            grid-template-columns: repeat(3, 1fr) !important; 
            gap: 12px !important; 
            margin-bottom: 25px !important; 
          }
          .print-metric { 
            border: 1px solid #e2e8f0 !important; 
            border-radius: 12px !important; 
            padding: 12px !important; 
            text-align: left !important; 
            background-color: #f8fafc !important; 
          }
          .print-metric p { 
            font-size: 8pt !important; 
            font-weight: 700 !important; 
            margin-bottom: 6px !important; 
            text-transform: uppercase; 
            color: #64748b !important;
          }
          .print-metric h3 { 
            font-size: 15pt !important; 
            font-weight: 900 !important; 
            margin: 0 !important;
          }

          /* Auto-Scaling Magic Chart Tables */
          .print-magic-table {
            min-width: 0 !important;
            width: 100% !important;
            table-layout: fixed !important;
            border-collapse: collapse !important;
            border: 1px solid #cbd5e1 !important;
          }

          .print-magic-table th {
            background-color: #f8fafc !important;
            color: #1e293b !important;
            font-size: 7pt !important;
            font-weight: bold !important;
            padding: 8px 3px !important;
            border: 1px solid #cbd5e1 !important;
            line-height: 1.25 !important;
          }

          .print-magic-table td {
            font-size: 8pt !important;
            padding: 8px 3px !important;
            border: 1px solid #cbd5e1 !important;
            font-weight: 800 !important;
            background-color: #ffffff !important;
          }

          /* Print Highlights Preservation */
          .print-text-emerald { color: #059669 !important; }
          .print-text-rose { color: #e11d48 !important; }
          .print-text-indigo { color: #4f46e5 !important; }
          .print-bg-indigo-light { background-color: #e0e7ff !important; color: #4f46e5 !important; }
          .print-bg-indigo-deep { background-color: #4f46e5 !important; color: #ffffff !important; }

          /* Flatten inputs to raw text in print */
          .print-magic-table input {
            font-size: 8pt !important;
            font-weight: 900 !important;
            background-color: transparent !important;
            border: none !important;
            height: auto !important;
            min-height: 0 !important;
            padding: 0 !important;
            text-align: center !important;
            color: #0f172a !important;
            -moz-appearance: textfield;
            appearance: textfield;
          }
          .print-magic-table input::-webkit-outer-spin-button,
          .print-magic-table input::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
          }

          /* General lists */
          table { width: 100% !important; border-collapse: collapse !important; margin-bottom: 20px !important; }
          th { background-color: #f1f5f9 !important; color: #1e293b !important; font-weight: bold !important; text-transform: uppercase; font-size: 8pt !important; padding: 8px !important; border: 1px solid #e2e8f0 !important; }
          td { padding: 8px !important; border: 1px solid #e2e8f0 !important; font-size: 9pt !important; color: #334155 !important; }
          tr { page-break-inside: avoid !important; }
          thead { display: table-header-group !important; }
          
          .page-break-before { 
            page-break-before: always !important; 
            padding-top: 8mm !important; 
          }
        }
      `}</style>

      {/* HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 no-print relative z-50">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight flex items-center gap-2"><FileText className="text-blue-600" /> Official Reports</h2>
          <p className="text-slate-500 text-sm mt-1">Multi-page print layout with live sandbox comparisons.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="header-date-picker flex items-center gap-2 bg-slate-100/50 dark:bg-slate-900/50 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-inner">
            <DatePicker selected={startDate} onChange={handleStartDateChange} maxDate={new Date()} dateFormat="dd/MM/yy" customInput={<CustomDateInput />} showMonthDropdown showYearDropdown dropdownMode="select"/>
            <span className="text-slate-400 font-medium px-1">to</span>
            <DatePicker selected={endDate} onChange={handleEndDateChange} minDate={startDate} maxDate={new Date()} dateFormat="dd/MM/yy" customInput={<CustomDateInput />} showMonthDropdown showYearDropdown dropdownMode="select"/>
          </div>

          <div className="relative">
            <button onClick={() => setIsExportMenuOpen(!isExportMenuOpen)} className="flex items-center gap-2 bg-slate-800 dark:bg-slate-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium shadow-sm outline-none">
              <Download size={16} /> Document Export
            </button>
            {isExportMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl shadow-lg py-2 z-50">
                <button onClick={printReport} className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2"><Printer size={16} className="text-blue-600 dark:text-blue-400" /> Print PDF Report</button>
                <button onClick={exportToCSV} className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2"><FileSpreadsheet size={16} className="text-green-600 dark:text-green-400" /> Export Excel CSV</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PRINTABLE AREA */}
      <div id="printable-report" className="relative z-10 bg-[#F8FAFC] dark:bg-slate-950 print:bg-white print:p-0">
        
        {/* PAGE 1 */}
        <div>
          <div className="text-center mb-8 border-b-2 border-slate-200 dark:border-slate-800 print:border-indigo-500 pb-4">
            <h1 className="text-3xl font-black text-slate-900 dark:text-white print:text-indigo-950 uppercase tracking-widest">Nexus Diary</h1>
            <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-300 print:text-slate-700 mt-1">Consolidated Financial & Sales Report</h2>
            <p className="text-slate-500 font-semibold mt-2 uppercase text-xs tracking-wider">Reporting Period: {startDate.toLocaleDateString('en-IN')} TO {endDate.toLocaleDateString('en-IN')}</p>
          </div>

          <div className="mb-8">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 print-section-header uppercase border-b border-slate-200 dark:border-slate-800 pb-2 mb-4">1. Financial Summary Overview</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 print-card-grid">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 print-metric shadow-sm">
                <p className="text-xs font-bold text-slate-500 mb-1 uppercase">Gross Profit (Sales)</p><h3 className="text-2xl font-black text-emerald-600 dark:text-emerald-400 print-text-emerald">₹{summary.grossProfit.toLocaleString()}</h3>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 print-metric shadow-sm">
                <p className="text-xs font-bold text-slate-500 mb-1 uppercase">Total Purchases</p><h3 className="text-2xl font-black text-amber-600 dark:text-amber-400">₹{summary.totalPurchases.toLocaleString()}</h3>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 print-metric shadow-sm">
                <p className="text-xs font-bold text-slate-500 mb-1 uppercase">Business Expenses</p><h3 className="text-2xl font-black text-red-500 print-text-rose">₹{summary.totalExpenses.toLocaleString()}</h3>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 print-metric shadow-sm">
                <p className="text-xs font-bold text-slate-500 mb-1 uppercase">Net Profit / Loss</p><h3 className="text-2xl font-black text-blue-600 dark:text-blue-400 print-text-indigo">₹{summary.netProfit.toLocaleString()}</h3>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 print-metric shadow-sm">
                <p className="text-xs font-bold text-slate-500 mb-1 uppercase">Online Collections</p><h3 className="text-2xl font-black text-indigo-500">₹{summary.totalWithdrawn.toLocaleString()}</h3>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/20 rounded-xl p-5 print-metric shadow-sm">
                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-500 mb-1 uppercase">Cash Left in Hand</p><h3 className="text-2xl font-black text-emerald-700 dark:text-emerald-400 print-text-emerald">₹{summary.retainedCash.toLocaleString()}</h3>
              </div>
            </div>
          </div>

          <div className="mb-8">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 print-section-header uppercase border-b border-slate-200 dark:border-slate-800 pb-2 mb-4 flex items-center gap-2"><TrendingUp size={18} className="no-print" /> 2. Itemized Bottles Sold Breakdown</h3>
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden print:border-none print:shadow-none">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-bold uppercase text-[11px] tracking-wider border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-4 py-3">Brand Name</th>
                    <th className="px-4 py-3 text-center">Bottle Size</th>
                    <th className="px-4 py-3 text-right">Unit Price (₹)</th>
                    <th className="px-4 py-3 text-center">Qty Sold</th>
                    <th className="px-4 py-3 text-right text-emerald-600 print:text-black">Total Revenue (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <tr><td colSpan="5" className="px-4 py-8 text-center">Compiling sales data...</td></tr>
                  ) : salesList.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 print:hover:bg-transparent">
                      <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100">{item.brand_name}</td>
                      <td className="px-4 py-3 text-center">{item.bottle_size}</td>
                      <td className="px-4 py-3 text-right">₹{item.selling_price}</td>
                      <td className="px-4 py-3 text-center font-bold">{item.total_qty}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400 print-text-emerald">₹{item.total_revenue.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                {salesList.length > 0 && !loading && (
                  <tfoot className="bg-slate-100/80 dark:bg-slate-800/80 border-t-2 border-slate-200 dark:border-slate-700">
                    <tr>
                      <td colSpan="3" className="px-4 py-4 text-right">
                         <div className="font-black text-slate-800 dark:text-slate-100 flex justify-end items-center gap-2"><Sigma size={16} className="text-blue-600"/> TOTALS</div>
                      </td>
                      <td className="px-4 py-4 text-center font-black text-indigo-600 dark:text-indigo-400">{salesTotalQty}</td>
                      <td className="px-4 py-4 text-right font-black text-emerald-600 dark:text-emerald-400 print-text-emerald">₹{salesTotalRev.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>

        {/* PAGE 2 */}
        <div className="page-break-before pt-6 sm:pt-0">
          <div className="hidden print:block text-center mb-8 border-b-2 border-slate-200 print:border-indigo-500 pb-4">
             <h1 className="text-2xl font-black text-indigo-950 uppercase tracking-widest">Nexus Diary</h1>
             <p className="text-slate-600 font-semibold mt-1 uppercase text-xs tracking-wider">Reporting Period: {startDate.toLocaleDateString('en-IN')} TO {endDate.toLocaleDateString('en-IN')}</p>
          </div>
          <div className="mb-8">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 print-section-header uppercase border-b border-slate-200 dark:border-slate-800 pb-2 mb-4 flex items-center gap-2"><Receipt size={18} className="no-print" /> 3. Business Expenses Ledger</h3>
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden print:border-none print:shadow-none">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-bold uppercase text-[11px] tracking-wider border-b border-slate-200 dark:border-slate-700">
                  <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Description</th><th className="px-4 py-3 text-right text-red-600 print:text-black">Amount (₹)</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? <tr><td colSpan="3" className="px-4 py-8 text-center">Compiling...</td></tr> : expenseList.map((e, idx) => (
                    <tr key={idx}><td className="px-4 py-3 font-medium">{new Date(e.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td><td className="px-4 py-3">{e.description}</td><td className="px-4 py-3 text-right font-bold text-red-600 dark:text-red-400 print-text-rose">₹{e.amount}</td></tr>
                  ))}
                </tbody>
                {expenseList.length > 0 && !loading && (
                  <tfoot className="bg-slate-100/80 dark:bg-slate-800/80 border-t-2 border-slate-200 dark:border-slate-700">
                    <tr>
                      <td colSpan="2" className="px-4 py-4 text-right">
                         <div className="font-black text-slate-800 dark:text-slate-100 flex justify-end items-center gap-2"><Sigma size={16} className="text-blue-600"/> TOTAL EXPENSES</div>
                      </td>
                      <td className="px-4 py-4 text-right font-black text-red-600 dark:text-red-400 print-text-rose">₹{summary.totalExpenses.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>

        {/* PAGE 3 */}
        <div className="page-break-before pt-6 sm:pt-0">
          <div className="hidden print:block text-center mb-8 border-b-2 border-slate-200 print:border-indigo-500 pb-4">
             <h1 className="text-2xl font-black text-indigo-950 uppercase tracking-widest">Nexus Diary</h1>
             <p className="text-slate-600 font-semibold mt-1 uppercase text-xs tracking-wider">Reporting Period: {startDate.toLocaleDateString('en-IN')} TO {endDate.toLocaleDateString('en-IN')}</p>
          </div>
          <div className="mb-8">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 print-section-header uppercase border-b border-slate-200 dark:border-slate-800 pb-2 mb-4 flex items-center gap-2"><Landmark size={18} className="no-print" /> 4. Online Collections Ledger</h3>
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden print:border-none print:shadow-none">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-bold uppercase text-[11px] tracking-wider border-b border-slate-200 dark:border-slate-700">
                  <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Description</th><th className="px-4 py-3 text-center">Mode</th><th className="px-4 py-3 text-right text-indigo-600 print:text-black">Amount (₹)</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? <tr><td colSpan="4" className="px-4 py-8 text-center">Compiling...</td></tr> : collectionList.map((c, idx) => (
                    <tr key={idx}><td className="px-4 py-3 font-medium">{new Date(c.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td><td className="px-4 py-3">{c.description}</td><td className="px-4 py-3 text-center"><span className="px-2 py-1 text-[10px] font-bold uppercase rounded-md bg-blue-100 text-blue-700 print:bg-slate-100 print:text-blue-800">{c.withdrawal_mode}</span></td><td className="px-4 py-3 text-right font-bold text-indigo-600 dark:text-indigo-400 print-text-indigo">₹{c.amount}</td></tr>
                  ))}
                </tbody>
                {collectionList.length > 0 && !loading && (
                  <tfoot className="bg-slate-100/80 dark:bg-slate-800/80 border-t-2 border-slate-200 dark:border-slate-700">
                    <tr>
                      <td colSpan="3" className="px-4 py-4 text-right">
                         <div className="font-black text-slate-800 dark:text-slate-100 flex justify-end items-center gap-2"><Sigma size={16} className="text-blue-600"/> TOTAL COLLECTIONS</div>
                      </td>
                      <td className="px-4 py-4 text-right font-black text-indigo-600 dark:text-indigo-400 print-text-indigo">₹{summary.totalWithdrawn.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>

        {/* PAGE 4 */}
        <div className="page-break-before pt-6 sm:pt-0">
          <div className="hidden print:block text-center mb-8 border-b-2 border-slate-200 print:border-indigo-500 pb-4">
             <h1 className="text-2xl font-black text-indigo-950 uppercase tracking-widest">Nexus Diary</h1>
             <p className="text-slate-600 font-semibold mt-1 uppercase text-xs tracking-wider">Reporting Period: {startDate.toLocaleDateString('en-IN')} TO {endDate.toLocaleDateString('en-IN')}</p>
          </div>
          
          <div className="mb-8">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 print-section-header uppercase border-b border-slate-200 dark:border-slate-800 pb-2 mb-6 flex items-center gap-2">
              <Users size={18} className="no-print" /> 5. Trader Purchases & Payment Ledger
            </h3>

            {loading ? (
              <p className="text-center text-slate-400 dark:text-slate-500 py-12">Compiling trader data...</p>
            ) : (
              <div className="space-y-10">
                
                {/* A. SEPARATE INDIVIDUAL TRADER TABLES */}
                <div>
                  <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 border-l-4 border-indigo-400 pl-2">
                    A. Individual Trader Ledgers (व्यक्तिगत व्यापारी खाते)
                  </h4>
                  
                  {Object.keys(groupedTraderData).length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400 pl-2">No transaction recorded for this period.</p>
                  ) : (
                    <div className="space-y-8">
                      {Object.values(groupedTraderData).map((trader, tIdx) => (
                        <div key={tIdx} className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden print:border-none print:shadow-none break-inside-avoid">
                          
                          {/* Trader Header */}
                          <div className="bg-slate-50/50 dark:bg-slate-800/30 px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                            <span className="font-extrabold text-slate-800 dark:text-slate-100 text-base">{trader.name}</span>
                            <span className="text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400 px-2 py-1 rounded-md">Trader Accounts</span>
                          </div>

                          {/* Table */}
                          <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px] tracking-wider border-b border-slate-100 dark:border-slate-700">
                              <tr>
                                <th className="px-4 py-2.5">Date</th>
                                <th className="px-4 py-2.5 text-right text-amber-600 print:text-black">Purchase Amount (₹)</th>
                                <th className="px-4 py-2.5 text-right text-indigo-600 print:text-black">Paid Amount (₹)</th>
                                <th className="px-4 py-2.5 text-right text-slate-900 dark:text-white print:text-black">Remaining Balance (₹)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {trader.transactions.map((tx, idx) => (
                                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                  <td className="px-4 py-2.5 font-medium">{new Date(tx.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                                  <td className="px-4 py-2.5 text-right font-bold text-amber-600 dark:text-amber-500">{tx.purchase_amount > 0 ? `₹${tx.purchase_amount.toLocaleString()}` : '-'}</td>
                                  <td className="px-4 py-2.5 text-right font-bold text-indigo-600 dark:text-indigo-400 print-text-indigo">{tx.paid_amount > 0 ? `₹${tx.paid_amount.toLocaleString()}` : '-'}</td>
                                  <td className="px-4 py-2.5 text-right font-bold text-slate-900 dark:text-white">₹{tx.remaining_amount.toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-slate-100/50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700">
                              <tr className="font-black">
                                <td className="px-4 py-3 text-right text-xs uppercase text-slate-500 dark:text-slate-400">Total ({trader.name})</td>
                                <td className="px-4 py-3 text-right text-amber-600 dark:text-amber-400">₹{trader.totalPurchases.toLocaleString()}</td>
                                <td className="px-4 py-3 text-right text-indigo-600 dark:text-indigo-400 print-text-indigo">₹{trader.totalPaid.toLocaleString()}</td>
                                <td className="px-4 py-3 text-right text-slate-900 dark:text-white">₹{trader.remainingBalance.toLocaleString()}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* B. CONSOLIDATED LEDGER (MIXED) */}
                <div className="pt-4 break-inside-avoid">
                  <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 border-l-4 border-slate-400 pl-2">
                    B. Consolidated Ledger (एकत्रित सर्व व्यापारी खाते)
                  </h4>
                  <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden print:border-none print:shadow-none">
                    <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                      <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-bold uppercase text-[11px] tracking-wider border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Trader Name</th>
                          <th className="px-4 py-3 text-right text-amber-600 print:text-black">Purchase Amount (₹)</th>
                          <th className="px-4 py-3 text-right text-indigo-600 print:text-black">Paid Amount (₹)</th>
                          <th className="px-4 py-3 text-right text-slate-900 dark:text-white print:text-black">Remaining Balance (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {traderTransactions.map((tx, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 print:hover:bg-transparent">
                            <td className="px-4 py-3 font-medium">{new Date(tx.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                            <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100">{tx.traders?.trader_name || 'N/A'}</td>
                            <td className="px-4 py-3 text-right font-bold text-amber-600 dark:text-amber-500">{tx.purchase_amount > 0 ? `₹${tx.purchase_amount.toLocaleString()}` : '-'}</td>
                            <td className="px-4 py-3 text-right font-bold text-indigo-600 dark:text-indigo-400 print-text-indigo">{tx.paid_amount > 0 ? `₹${tx.paid_amount.toLocaleString()}` : '-'}</td>
                            <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white">₹{tx.remaining_amount.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                      {traderTransactions.length > 0 && (
                        <tfoot className="bg-slate-100/80 dark:bg-slate-800/80 border-t-2 border-slate-200 dark:border-slate-700">
                          <tr>
                            <td colSpan="2" className="px-4 py-4 text-right">
                               <div className="font-black text-slate-800 dark:text-slate-100 flex justify-end items-center gap-2"><Sigma size={16} className="text-blue-600"/> TRADER TOTALS</div>
                            </td>
                            <td className="px-4 py-4 text-right font-black text-amber-600 dark:text-amber-400">₹{traderTotalPurchases.toLocaleString()}</td>
                            <td className="px-4 py-4 text-right font-black text-indigo-600 dark:text-indigo-400 print-text-indigo">₹{traderTotalPaid.toLocaleString()}</td>
                            <td className="px-4 py-4 text-right font-black text-slate-900 dark:text-white">₹{traderTotalRemaining.toLocaleString()}</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>

        {/* PAGE 5: DYNAMIC MAGIC CHARTS */}
        {showMagicChart && (
          <div className="page-break-before pt-6 sm:pt-0">
            <div className="hidden print:block text-center mb-8 border-b-2 border-slate-200 print:border-indigo-500 pb-4">
               <h1 className="text-2xl font-black text-indigo-950 uppercase tracking-widest">Nexus Diary</h1>
               <p className="text-slate-600 font-semibold mt-1 uppercase text-xs tracking-wider">Reporting Period: {startDate.toLocaleDateString('en-IN')} TO {endDate.toLocaleDateString('en-IN')}</p>
            </div>

            <div className="mb-8">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 print-section-header uppercase border-b border-slate-200 dark:border-slate-800 pb-2 mb-6 flex items-center gap-2"><Wand2 size={18} className="no-print" /> 6. Magic Chart Ledger Analytics & Sandbox</h3>
              
              {loading ? (
                <p className="text-center text-slate-400 dark:text-slate-500 py-12">Compiling simulated charts...</p>
              ) : (
                <div className="space-y-8 no-print:bg-[#0c111d] dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl p-6 overflow-hidden print:border-none print:shadow-none print:p-0">
                  
                  {/* Ledger Header */}
                  <div className="text-center">
                    <h3 className="text-lg font-black text-slate-700 dark:text-slate-300 print:text-indigo-950 tracking-widest uppercase">
                      *** माहे {startDate.toLocaleDateString('mr-IN', { month: 'long' })} {startDate.getFullYear()} ***
                    </h3>
                  </div>

                  {/* 1. MAIN 7-COLUMN TABLE ENCLOSED IN A BEAUTIFUL CARD */}
                  <div className="overflow-x-auto border border-slate-300 dark:border-slate-700 rounded-2xl print:border-slate-300 overflow-hidden">
                    <table className="w-full text-center border-collapse min-w-225 print:min-w-0 print:w-full print:table-fixed print-magic-table">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-300 dark:border-slate-700">
                          <th className="py-4 px-2 border-r border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 w-[14%]">
                            चालू महिन्याची विक्री <span className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 print:text-slate-500 mt-0.5">(Total Sales)</span>
                          </th>
                          <th className="py-4 px-2 border-r border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 w-[14%]">
                            आखेर शिल्लक माल <span className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 print:text-slate-500 mt-0.5">(Closing Stock)</span>
                          </th>
                          <th className="py-4 px-2 border-r border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 w-[14%] bg-indigo-50/40 dark:bg-indigo-950/10 print:bg-slate-50">
                            रकाना 1 + 2 ची बेरीज <span className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 print:text-slate-500 mt-0.5">(Sum 1 + 2)</span>
                          </th>
                          <th className="py-4 px-2 border-r border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 w-[14%]">
                            सुरुवातीची शिल्लक <span className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 print:text-slate-500 mt-0.5">(Opening Stock)</span>
                          </th>
                          <th className="py-4 px-2 border-r border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 w-[14%]">
                            चालू महिन्याची खरेदी <span className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 print:text-slate-500 mt-0.5">(Total Purchases)</span>
                          </th>
                          <th className="py-4 px-2 border-r border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 w-[14%] bg-indigo-50/40 dark:bg-indigo-950/10 print:bg-slate-50">
                            रकाना 4 + 5 ची बेरीज <span className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 print:text-slate-500 mt-0.5">(Sum 4 + 5)</span>
                          </th>
                          <th className="py-4 px-2 text-sm font-bold text-slate-700 dark:text-slate-200 w-[16%]">
                            रकाना 3 - 6 <span className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 print:text-slate-500 mt-0.5">ढोबळ नफा - तोटा</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-slate-300 dark:border-slate-700 h-16 print:h-auto">
                          <td className="border-r border-slate-300 dark:border-slate-700 font-extrabold text-slate-800 dark:text-slate-100 text-lg print:text-xs">
                            {formatRs(ledgerBox1)}
                          </td>
                          
                          <td className="border-r border-slate-300 dark:border-slate-700 p-0">
                            <input 
                              type="number"
                              disabled={!isEditing}
                              value={manualClosing}
                              onChange={(e) => setManualClosing(e.target.value)}
                              className="w-full h-full text-center bg-transparent focus:bg-indigo-50 dark:focus:bg-indigo-950/30 text-lg font-black text-slate-800 dark:text-slate-100 border-none outline-none focus:ring-0 disabled:opacity-90 min-h-16 print:min-h-0 print:py-1"
                              placeholder="0"
                            />
                          </td>

                          <td className="border-r border-slate-300 dark:border-slate-700 font-extrabold text-indigo-600 dark:text-indigo-400 text-lg bg-indigo-50/20 dark:bg-indigo-950/5 print:text-xs print:bg-indigo-50 print-text-indigo">
                            {formatRs(ledgerBox3)}
                          </td>

                          <td className="border-r border-slate-300 dark:border-slate-700 p-0">
                            <input 
                              type="number"
                              disabled={!isEditing}
                              value={manualOpening}
                              onChange={(e) => setManualOpening(e.target.value)}
                              className="w-full h-full text-center bg-transparent focus:bg-indigo-50 dark:focus:bg-indigo-950/30 text-lg font-black text-slate-800 dark:text-slate-100 border-none outline-none focus:ring-0 disabled:opacity-90 min-h-16 print:min-h-0 print:py-1"
                              placeholder="0"
                            />
                          </td>

                          <td className="border-r border-slate-300 dark:border-slate-700 p-0">
                            <input 
                              type="number"
                              disabled={!isEditing}
                              value={manualPurchases}
                              onChange={(e) => setManualPurchases(e.target.value)}
                              className="w-full h-full text-center bg-transparent focus:bg-indigo-50 dark:focus:bg-indigo-950/30 text-lg font-black text-slate-800 dark:text-slate-100 border-none outline-none focus:ring-0 disabled:opacity-90 min-h-16 print:min-h-0 print:py-1"
                              placeholder="0"
                            />
                          </td>

                          <td className="border-r border-slate-300 dark:border-slate-700 font-extrabold text-indigo-600 dark:text-indigo-400 text-lg bg-indigo-50/20 dark:bg-indigo-950/5 print:text-xs print:bg-indigo-50 print-text-indigo">
                            {formatRs(ledgerBox6)}
                          </td>

                          <td className={`font-black text-xl print:text-xs ${ledgerBox7 >= 0 ? 'text-emerald-600 dark:text-emerald-400 print-text-emerald' : 'text-red-500 print-text-rose'}`}>
                            {formatRs(ledgerBox7)}
                          </td>
                        </tr>
                        
                        {/* BOX NUMBERS ROW (1, 2, 3, 4, 5, 6, 7) */}
                        <tr className="bg-slate-50/60 dark:bg-slate-800/40 text-xs text-slate-400 dark:text-slate-500 font-bold">
                          <td className="py-2 border-r border-slate-300 dark:border-slate-700 print:border-slate-300">1</td>
                          <td className="py-2 border-r border-slate-300 dark:border-slate-700 print:border-slate-300">2</td>
                          <td className="py-2 border-r border-slate-300 dark:border-slate-700 print:border-slate-300 bg-indigo-50/10 dark:bg-indigo-950/5 print:bg-slate-50">3</td>
                          <td className="py-2 border-r border-slate-300 dark:border-slate-700 print:border-slate-300">4</td>
                          <td className="py-2 border-r border-slate-300 dark:border-slate-700 print:border-slate-300">5</td>
                          <td className="py-2 border-r border-slate-300 dark:border-slate-700 print:border-slate-300 bg-indigo-50/10 dark:bg-indigo-950/5 print:bg-slate-50">6</td>
                          <td className="py-2">7</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* 2. SETTLEMENT TABLE ENCLOSED IN A BEAUTIFUL CARD (ढोबळ नफा - खर्च) */}
                  <div className="overflow-hidden border border-slate-300 dark:border-slate-700 rounded-2xl print:border-slate-300">
                    <table className="w-full text-center border-collapse min-w-150 print:min-w-0 print:w-full print:table-fixed print-magic-table">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-300 dark:border-slate-700">
                          <th className="py-4 px-2 border-r border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 w-[50%]">
                            एकूण ढोबळ नफा - चालू महिन्याचा खर्च <span className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 print:text-slate-500 mt-0.5">(Gross Profit - Expenses)</span>
                          </th>
                          <th className="py-4 px-2 text-sm font-bold text-slate-700 dark:text-slate-200 w-[50%]">
                            एकूण चालू महिन्याचा नफा <span className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 print:text-slate-500 mt-0.5">(Current Month Net Profit)</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="h-16 print:h-auto">
                          <td className="border-r border-slate-300 dark:border-slate-700 font-extrabold text-slate-700 dark:text-slate-300 text-lg print:text-xs">
                            {formatRs(ledgerBox7)} - {formatRs(magicChartData.currExp)}
                          </td>
                          <td className={`font-black text-2xl print:text-sm ${ledgerNetProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400 print-text-emerald' : 'text-red-500 print-text-rose'}`}>
                            {formatRs(ledgerNetProfit)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* 3. CUMULATIVE TABLE ENCLOSED IN A BEAUTIFUL CARD (एकूण नफा / संचयी) */}
                  <div className="overflow-hidden border border-slate-300 dark:border-slate-700 rounded-2xl print:border-slate-300">
                    <table className="w-full text-center border-collapse min-w-150 print:min-w-0 print:w-full print:table-fixed print-magic-table">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-300 dark:border-slate-700">
                          <th className="py-4 px-2 border-r border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 w-[33%]">
                            मागील महिन्याचा नफा (+) <span className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 print:text-slate-500 mt-0.5">(Previous Month Net Profit)</span>
                          </th>
                          <th className="py-4 px-2 border-r border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 w-[33%]">
                            चालू महिन्याचा नफा <span className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 print:text-slate-500 mt-0.5">(Current Month Net Profit)</span>
                          </th>
                          <th className="py-4 px-2 text-sm font-bold text-slate-700 dark:text-slate-200 w-[34%] bg-indigo-500/10 dark:bg-indigo-500/5 print:bg-indigo-50">
                            एकूण नफा <span className="block text-[10px] font-medium text-slate-400 dark:text-slate-300 print:text-slate-500 mt-0.5">(Total Net Profit)</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="h-16 print:h-auto">
                          <td className="border-r border-slate-300 dark:border-slate-700 font-extrabold text-slate-600 dark:text-slate-400 text-lg print:text-xs">
                            {formatRs(prevNetProfitVal)}
                          </td>
                          <td className="border-r border-slate-300 dark:border-slate-700 font-extrabold text-slate-600 dark:text-slate-400 text-lg print:text-xs">
                            {formatRs(ledgerNetProfit)}
                          </td>
                          <td className="font-black text-2xl text-white bg-indigo-600 dark:bg-indigo-700/80 print:bg-indigo-600 print:text-white print:text-sm">
                            {formatRs(cumulativeProfitVal)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* ACTIONS FOOTER */}
                  <div className="flex justify-end items-center gap-3 pt-2 no-print">
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
                      onClick={handleSaveMagicChart}
                      disabled={saving || !isEditing}
                      className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-black text-sm rounded-xl shadow-md transition-colors cursor-pointer"
                    >
                      <Save size={16} />
                      {saving ? 'Saving...' : 'Save Configuration'}
                    </button>
                  </div>

                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}