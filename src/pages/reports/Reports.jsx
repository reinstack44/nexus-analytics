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

// विभिन्न डेट फॉर्मेट्स को बिना टाइमज़ोन शिफ्ट के सटीक रूप से पार्स करने के लिए हेल्पर
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

// यह सुनिश्चित करने के लिए हेल्पर कि चुनी हुई अवधि एक पूर्ण कैलेंडर महीना है
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

// भारतीय रुपया फॉर्मेट करने के लिए ग्लोबल हेल्पर फंक्शन
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

  // मैजिक चार्ट स्टेट्स
  const [magicChartData, setMagicChartData] = useState({
    box1: 0, box2: 0, box3: 0, box4: 0, box5: 0, box6: 0, box7: 0, currExp: 0, currNetProfit: 0, prevNetProfit: 0, cumulativeProfit: 0
  });
  const [manualClosing, setManualClosing] = useState('');
  const [manualOpening, setManualOpening] = useState('');
  const [manualPurchases, setManualPurchases] = useState('');

  // पिछले महीने का स्टेट्स (कैलकुलेशन के लिए)
  const [prevSavedData, setPrevSavedData] = useState(null);
  const [prevMonthSales, setPrevMonthSales] = useState(0);
  const [prevMonthExpenses, setPrevMonthExpenses] = useState(0);

  const selectedMonth = startDate; // Reports.jsx में महीने के सिंक के लिए डिक्लेरेशन हुक के ऊपर रखा गया है

  // Selected Month को sessionStorage में सिंक करने के लिए हुक
  useEffect(() => {
    if (selectedMonth) {
      sessionStorage.setItem('mc_selectedMonth', selectedMonth.toISOString());
    }
  }, [selectedMonth]);

  const handleStartDateChange = (date) => { setStartDate(date); sessionStorage.setItem('report_start_date', date.toISOString()); setLoading(true); };
  const handleEndDateChange = (date) => { setEndDate(date); sessionStorage.setItem('report_end_date', date.toISOString()); setLoading(true); };

  // यह जाँचेगा कि चुनी गई अवधि पूर्ण कैलेंडर महीना है या नहीं
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

        // Fetch Expenses
        const expQueryStart = showMagicChart ? prevStartStr : startStr;
        const { data: expData } = await supabase.from('expenses').select('*').gte('date', expQueryStart).lte('date', endStr + 'T23:59:59').order('date');
        
        let tExpenses = 0;
        expData?.forEach(e => {
          if (e.date >= startStr && e.date <= endStr + 'T23:59:59') {
            tExpenses += parseFloat(e.amount);
          }
        });
        
        // Fetch Withdrawals (Collections)
        const { data: withData } = await supabase.from('owner_withdrawals').select('*').gte('date', startStr).lte('date', endStr + 'T23:59:59').order('date');
        const tWithdrawals = withData?.reduce((sum, w) => sum + parseFloat(w.amount), 0) || 0;

        // Fetch Purchases (from standard purchases table)
        const { data: purchData } = await supabase.from('purchases').select('*').gte('date', startStr).lte('date', endStr + 'T23:59:59');
        let tPurchases = 0; const purchaseQtyMap = {}; 
        purchData?.forEach(p => {
          tPurchases += parseFloat(p.total_amount) || 0;
          const key = `${p.date}_${p.brand_id}`; purchaseQtyMap[key] = (purchaseQtyMap[key] || 0) + (p.quantity || 0);
        });

        // Trader Transactions
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

        // Stock Data
        const stockQueryStart = showMagicChart ? prevStartStr : startStr;
        const { data: stockData } = await supabase.from('daily_stock').select('*').gte('date', stockQueryStart).lte('date', endStr + 'T23:59:59').order('date', { ascending: true });
        
        if (!isMounted) return; 

        setExpenseList(expData?.filter(e => e.date >= startStr) || []);
        setCollectionList(withData || []);
        setTraderTransactions(txList);

        // Sales aggregation
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

        // ================= केवल पूर्ण कैलेंडर महीना होने पर मैजिक चार्ट की गणना करना =================
        if (showMagicChart && user) {
          // सहेजे गए मैजिक चार्ट रिकॉर्ड का मिलान
          const [ { data: savedRecord }, { data: prevRecord } ] = await Promise.all([
            supabase.from('magic_chart_saves').select('closing_stock, opening_stock, total_purchases').eq('user_id', user.id).eq('month_year', monthYearStr).maybeSingle(),
            supabase.from('magic_chart_saves').select('closing_stock, opening_stock, total_purchases').eq('user_id', user.id).eq('month_year', prevMonthYearStr).maybeSingle()
          ]);

          // Expenses कैलकुलेशन (चालू और पिछला महीना)
          let currExpVal = 0;
          let prevExpVal = 0;
          expData?.forEach(e => {
            const eDate = getLocalDateObj(e.date);
            if (eDate) {
              if (eDate >= startObj && eDate <= endObj) currExpVal += parseFloat(e.amount || 0);
              if (eDate >= prevStartObj && eDate <= prevEndObj) prevExpVal += parseFloat(e.amount || 0);
            }
          });

          // Stock Valuations
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

          // Simulate FIFO Sales (Box 1)
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

          // डेटा लोड प्रबंधन और एडिट/रीड-ओनली मोड सेट करना
          if (savedRecord) {
            setManualClosing(savedRecord.closing_stock !== null ? String(savedRecord.closing_stock) : '');
            setManualOpening(savedRecord.opening_stock !== null ? String(savedRecord.opening_stock) : '');
            setManualPurchases(savedRecord.total_purchases !== null ? String(savedRecord.total_purchases) : '');
            setIsEditing(false); // डेटा मौजूद होने पर रीड-ओनली व्यू
          } else {
            setManualClosing('');
            setManualPurchases(String(Math.round(currPurchasesVal)));
            setIsEditing(true); // डेटा न होने पर सीधे संपादन मोड
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

  // Calculate Totals for render
  const salesTotalQty = salesList.reduce((acc, s) => acc + s.total_qty, 0);
  const salesTotalRev = salesList.reduce((acc, s) => acc + s.total_revenue, 0);
  const traderTotalPurchases = traderTransactions.reduce((acc, tx) => acc + tx.purchase_amount, 0);
  const traderTotalPaid = traderTransactions.reduce((acc, tx) => acc + tx.paid_amount, 0);
  const traderTotalRemaining = traderTransactions.length > 0 ? traderTransactions[traderTransactions.length - 1].remaining_amount : 0;

  // --- CURRENT MONTH REALTIME CALCULATIONS FOR LEDGER ---
  const ledgerBox1 = magicChartData.box1; // Auto-fetched
  const ledgerBox2 = parseFloat(manualClosing) || 0; // Manual
  const ledgerBox3 = ledgerBox1 + ledgerBox2;

  const ledgerBox4 = parseFloat(manualOpening) || 0; // Manual
  const ledgerBox5 = parseFloat(manualPurchases) || 0; // Manual
  const ledgerBox6 = ledgerBox4 + ledgerBox5;

  const ledgerBox7 = ledgerBox3 - ledgerBox6; // Gross Profit
  const ledgerNetProfit = ledgerBox7 - magicChartData.currExp; // Net Profit

  // --- PREVIOUS MONTH REALTIME CALCULATIONS FOR LEDGER ---
  const prevBox2Val = prevSavedData ? parseFloat(prevSavedData.closing_stock) || 0 : 0;
  const prevBox3Val = prevMonthSales + prevBox2Val;

  const prevBox4Val = prevSavedData ? parseFloat(prevSavedData.opening_stock) || 0 : 0;
  const prevBox5Val = prevSavedData ? parseFloat(prevSavedData.total_purchases) || 0 : 0;
  const prevBox6Val = prevBox4Val + prevBox5Val;

  const prevBox7Val = prevBox3Val - prevBox6Val;
  const prevNetProfitVal = prevBox7Val - prevMonthExpenses; // मागील महिन्याचा नफा

  const cumulativeProfitVal = prevNetProfitVal + ledgerNetProfit; // एकूण नफा

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
        
        @media print {
          @page { size: A4 portrait; margin: 15mm; }
          html, body { background-color: white !important; color: black !important; margin: 0; padding: 0; font-family: Arial, sans-serif !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body * { visibility: hidden; } .no-print { display: none !important; }
          #printable-report, #printable-report * { visibility: visible; } 
          #printable-report { position: absolute; left: 0; top: 0; width: 100%; background-color: white !important; }
          #printable-report h1, #printable-report h2, #printable-report h3, #printable-report p, #printable-report span, #printable-report td, #printable-report th { color: black !important; }
          #printable-report .dark\\:bg-slate-900, #printable-report .dark\\:bg-slate-800, #printable-report .bg-slate-900 { background-color: white !important; }
          .print-card-grid { display: grid !important; grid-template-columns: repeat(3, 1fr) !important; gap: 15px !important; margin-bottom: 25px !important; }
          .print-magic-grid { display: grid !important; grid-template-columns: repeat(2, 1fr) !important; gap: 20px !important; }
          .print-metric { border: 2px solid #e5e7eb !important; border-radius: 8px !important; padding: 15px !important; text-align: center !important; background-color: white !important; box-shadow: none !important; }
          .print-metric p { font-size: 10pt !important; font-weight: bold !important; margin-bottom: 8px !important; text-transform: uppercase; color: #4b5563 !important;}
          .print-metric h3 { font-size: 16pt !important; font-weight: 900 !important; color: #000 !important; margin: 0 !important;}
          table { width: 100% !important; border-collapse: collapse !important; margin-bottom: 20px !important; background-color: white !important; }
          th { background-color: #f3f4f6 !important; color: #000 !important; font-weight: bold !important; text-transform: uppercase; font-size: 9pt !important; padding: 10px !important; border: 1px solid #d1d5db !important; }
          td { padding: 10px !important; border: 1px solid #d1d5db !important; font-size: 10pt !important; color: #000 !important; background-color: white !important; }
          tr { page-break-inside: avoid; }
          thead { display: table-header-group; }
          .page-break-before { page-break-before: always; padding-top: 10mm; }
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
          <div className="text-center mb-8 border-b-2 border-slate-200 dark:border-slate-800 print:border-gray-300 pb-4">
            <h1 className="text-3xl font-black text-slate-900 dark:text-white print:text-black uppercase tracking-widest">Nexus Diary</h1>
            <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-300 print:text-black mt-1">Consolidated Financial & Sales Report</h2>
            <p className="text-slate-500 font-medium mt-2 uppercase text-sm tracking-wider">Reporting Period: {startDate.toLocaleDateString('en-IN')} TO {endDate.toLocaleDateString('en-IN')}</p>
          </div>

          <div className="mb-8">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 print:text-black uppercase border-b border-slate-200 dark:border-slate-800 print:border-gray-300 pb-2 mb-4">1. Financial Summary Overview</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 print-card-grid">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 print-metric">
                <p className="text-xs font-bold text-slate-500 mb-1 uppercase">Gross Profit (Sales)</p><h3 className="text-2xl font-black text-emerald-600 dark:text-emerald-400">₹{summary.grossProfit.toLocaleString()}</h3>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 print-metric">
                <p className="text-xs font-bold text-slate-500 mb-1 uppercase">Total Purchases</p><h3 className="text-2xl font-black text-amber-600 dark:text-amber-400">₹{summary.totalPurchases.toLocaleString()}</h3>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 print-metric">
                <p className="text-xs font-bold text-slate-500 mb-1 uppercase">Business Expenses</p><h3 className="text-2xl font-black text-red-500">₹{summary.totalExpenses.toLocaleString()}</h3>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 print-metric">
                <p className="text-xs font-bold text-slate-500 mb-1 uppercase">Net Profit / Loss</p><h3 className="text-2xl font-black text-blue-600 dark:text-blue-400">₹{summary.netProfit.toLocaleString()}</h3>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 print-metric">
                <p className="text-xs font-bold text-slate-500 mb-1 uppercase">Online Collections</p><h3 className="text-2xl font-black text-indigo-500">₹{summary.totalWithdrawn.toLocaleString()}</h3>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-slate-200 dark:border-slate-800 rounded-xl p-5 print-metric">
                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-500 mb-1 uppercase">Cash Left in Hand</p><h3 className="text-2xl font-black text-emerald-700 dark:text-emerald-400">₹{summary.retainedCash.toLocaleString()}</h3>
              </div>
            </div>
          </div>

          <div className="mb-8">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 print:text-black uppercase border-b border-slate-200 dark:border-slate-800 print:border-gray-300 pb-2 mb-4 flex items-center gap-2"><TrendingUp size={18} className="no-print" /> 2. Itemized Bottles Sold Breakdown</h3>
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
                  {loading ? <tr><td colSpan="5" className="px-4 py-8 text-center">Compiling sales data...</td></tr> : salesList.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 print:hover:bg-transparent">
                      <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100 print:text-black">{item.brand_name}</td>
                      <td className="px-4 py-3 text-center">{item.bottle_size}</td>
                      <td className="px-4 py-3 text-right">₹{item.selling_price}</td>
                      <td className="px-4 py-3 text-center font-bold">{item.total_qty}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400 print:text-black">₹{item.total_revenue.toLocaleString()}</td>
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
                      <td className="px-4 py-4 text-right font-black text-emerald-600 dark:text-emerald-400">₹{salesTotalRev.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>

        {/* PAGE 2 */}
        <div className="page-break-before pt-6 sm:pt-0">
          <div className="hidden print:block text-center mb-8 border-b-2 border-slate-200 print:border-gray-300 pb-4">
             <h1 className="text-2xl font-black text-black uppercase tracking-widest">Nexus Diary - Page 2</h1>
             <p className="text-gray-600 font-medium mt-1 uppercase text-xs tracking-wider">Reporting Period: {startDate.toLocaleDateString('en-IN')} TO {endDate.toLocaleDateString('en-IN')}</p>
          </div>
          <div className="mb-8">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 print:text-black uppercase border-b border-slate-200 dark:border-slate-800 print:border-gray-300 pb-2 mb-4 flex items-center gap-2"><Receipt size={18} className="no-print" /> 3. Business Expenses Ledger</h3>
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden print:border-none print:shadow-none">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-bold uppercase text-[11px] tracking-wider border-b border-slate-200 dark:border-slate-700">
                  <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Description</th><th className="px-4 py-3 text-right text-red-600 print:text-black">Amount (₹)</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? <tr><td colSpan="3" className="px-4 py-8 text-center">Compiling...</td></tr> : expenseList.map((e, idx) => (
                    <tr key={idx}><td className="px-4 py-3 font-medium">{new Date(e.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td><td className="px-4 py-3">{e.description}</td><td className="px-4 py-3 text-right font-bold text-red-600 dark:text-red-400 print:text-black">₹{e.amount}</td></tr>
                  ))}
                </tbody>
                {expenseList.length > 0 && !loading && (
                  <tfoot className="bg-slate-100/80 dark:bg-slate-800/80 border-t-2 border-slate-200 dark:border-slate-700">
                    <tr>
                      <td colSpan="2" className="px-4 py-4 text-right">
                         <div className="font-black text-slate-800 dark:text-slate-100 flex justify-end items-center gap-2"><Sigma size={16} className="text-blue-600"/> TOTAL EXPENSES</div>
                      </td>
                      <td className="px-4 py-4 text-right font-black text-red-600 dark:text-red-400">₹{summary.totalExpenses.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>

        {/* PAGE 3 */}
        <div className="page-break-before pt-6 sm:pt-0">
          <div className="hidden print:block text-center mb-8 border-b-2 border-slate-200 print:border-gray-300 pb-4">
             <h1 className="text-2xl font-black text-black uppercase tracking-widest">Nexus Diary - Page 3</h1>
             <p className="text-gray-600 font-medium mt-1 uppercase text-xs tracking-wider">Reporting Period: {startDate.toLocaleDateString('en-IN')} TO {endDate.toLocaleDateString('en-IN')}</p>
          </div>
          <div className="mb-8">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 print:text-black uppercase border-b border-slate-200 dark:border-slate-800 print:border-gray-300 pb-2 mb-4 flex items-center gap-2"><Landmark size={18} className="no-print" /> 4. Online Collections Ledger</h3>
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden print:border-none print:shadow-none">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-bold uppercase text-[11px] tracking-wider border-b border-slate-200 dark:border-slate-700">
                  <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Description</th><th className="px-4 py-3 text-center">Mode</th><th className="px-4 py-3 text-right text-indigo-600 print:text-black">Amount (₹)</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? <tr><td colSpan="4" className="px-4 py-8 text-center">Compiling...</td></tr> : collectionList.map((c, idx) => (
                    <tr key={idx}><td className="px-4 py-3 font-medium">{new Date(c.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td><td className="px-4 py-3">{c.description}</td><td className="px-4 py-3 text-center"><span className="px-2 py-1 text-[10px] font-bold uppercase rounded-md bg-blue-100 text-blue-700 print:bg-transparent print:border">{c.withdrawal_mode}</span></td><td className="px-4 py-3 text-right font-bold text-indigo-600 dark:text-indigo-400 print:text-black">₹{c.amount}</td></tr>
                  ))}
                </tbody>
                {collectionList.length > 0 && !loading && (
                  <tfoot className="bg-slate-100/80 dark:bg-slate-800/80 border-t-2 border-slate-200 dark:border-slate-700">
                    <tr>
                      <td colSpan="3" className="px-4 py-4 text-right">
                         <div className="font-black text-slate-800 dark:text-slate-100 flex justify-end items-center gap-2"><Sigma size={16} className="text-blue-600"/> TOTAL COLLECTIONS</div>
                      </td>
                      <td className="px-4 py-4 text-right font-black text-indigo-600 dark:text-indigo-400">₹{summary.totalWithdrawn.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>

        {/* PAGE 4 */}
        <div className="page-break-before pt-6 sm:pt-0">
          <div className="hidden print:block text-center mb-8 border-b-2 border-slate-200 print:border-gray-300 pb-4">
             <h1 className="text-2xl font-black text-black uppercase tracking-widest">Nexus Diary - Page 4</h1>
             <p className="text-gray-600 font-medium mt-1 uppercase text-xs tracking-wider">Reporting Period: {startDate.toLocaleDateString('en-IN')} TO {endDate.toLocaleDateString('en-IN')}</p>
          </div>
          <div className="mb-8">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 print:text-black uppercase border-b border-slate-200 dark:border-slate-800 print:border-gray-300 pb-2 mb-4 flex items-center gap-2"><Users size={18} className="no-print" /> 5. Trader Purchases & Payment Ledger</h3>
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden print:border-none print:shadow-none">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-bold uppercase text-[11px] tracking-wider border-b border-slate-200 dark:border-slate-700">
                  <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Trader Name</th><th className="px-4 py-3 text-right text-amber-600 print:text-black">Purchase Amount (₹)</th><th className="px-4 py-3 text-right text-indigo-600 print:text-black">Paid Amount (₹)</th><th className="px-4 py-3 text-right text-slate-900 dark:text-white print:text-black">Remaining Balance (₹)</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? <tr><td colSpan="5" className="px-4 py-8 text-center">Compiling trader data...</td></tr> : traderTransactions.map((tx, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 print:hover:bg-transparent">
                      <td className="px-4 py-3 font-medium">{new Date(tx.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100 print:text-black">{tx.traders?.trader_name || 'N/A'}</td>
                      <td className="px-4 py-3 text-right font-bold text-amber-600 dark:text-amber-500 print:text-black">{tx.purchase_amount > 0 ? `₹${tx.purchase_amount.toLocaleString()}` : '-'}</td>
                      <td className="px-4 py-3 text-right font-bold text-indigo-600 dark:text-indigo-400 print:text-black">{tx.paid_amount > 0 ? `₹${tx.paid_amount.toLocaleString()}` : '-'}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white print:text-black">₹{tx.remaining_amount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                {traderTransactions.length > 0 && !loading && (
                  <tfoot className="bg-slate-100/80 dark:bg-slate-800/80 border-t-2 border-slate-200 dark:border-slate-700">
                    <tr>
                      <td colSpan="2" className="px-4 py-4 text-right">
                         <div className="font-black text-slate-800 dark:text-slate-100 flex justify-end items-center gap-2"><Sigma size={16} className="text-blue-600"/> TRADER TOTALS</div>
                      </td>
                      <td className="px-4 py-4 text-right font-black text-amber-600 dark:text-amber-400">₹{traderTotalPurchases.toLocaleString()}</td>
                      <td className="px-4 py-4 text-right font-black text-indigo-600 dark:text-indigo-400">₹{traderTotalPaid.toLocaleString()}</td>
                      <td className="px-4 py-4 text-right font-black text-slate-900 dark:text-white">₹{traderTotalRemaining.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>

        {/* ================= PAGE 5: DYNAMIC MAGIC CHARTS (कैलेंडर महीना होने पर ही सक्रिय होगा) ================= */}
        {showMagicChart && (
          <div className="page-break-before pt-6 sm:pt-0">
            <div className="hidden print:block text-center mb-8 border-b-2 border-slate-200 print:border-gray-300 pb-4">
               <h1 className="text-2xl font-black text-black uppercase tracking-widest">Nexus Diary - Page 5</h1>
               <p className="text-gray-600 font-medium mt-1 uppercase text-xs tracking-wider">Reporting Period: {startDate.toLocaleDateString('en-IN')} TO {endDate.toLocaleDateString('en-IN')}</p>
            </div>

            <div className="mb-8">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 print:text-black uppercase border-b border-slate-200 dark:border-slate-800 print:border-gray-300 pb-2 mb-6 flex items-center gap-2"><Wand2 size={18} className="no-print" /> 6. Magic Chart Ledger Analytics & Sandbox</h3>
              
              {loading ? (
                <p className="text-center text-slate-400 dark:text-slate-500 py-12">Compiling simulated charts...</p>
              ) : (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl p-6 space-y-8 overflow-hidden print:border-none print:shadow-none">
                  
                  {/* माहे LABEL (LEDGER HEADER) */}
                  <div className="text-center">
                    <h3 className="text-lg font-black text-slate-700 dark:text-slate-300 tracking-widest uppercase">
                      *** माहे {startDate.toLocaleDateString('mr-IN', { month: 'long' })} {startDate.getFullYear()} ***
                    </h3>
                  </div>

                  {/* 1. MAIN 7-COLUMN TABLE */}
                  <div className="overflow-x-auto border border-slate-300 dark:border-slate-700 rounded-xl print:border-collapse">
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
                            {formatRs(ledgerBox1)}
                          </td>
                          
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

                          <td className="border-r border-slate-300 dark:border-slate-700 font-extrabold text-indigo-600 dark:text-indigo-400 text-lg bg-indigo-50/20 dark:bg-indigo-950/5">
                            {formatRs(ledgerBox3)}
                          </td>

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

                          <td className="border-r border-slate-300 dark:border-slate-700 font-extrabold text-indigo-600 dark:text-indigo-400 text-lg bg-indigo-50/20 dark:bg-indigo-950/5">
                            {formatRs(ledgerBox6)}
                          </td>

                          <td className={`font-black text-xl ${ledgerBox7 >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                            {formatRs(ledgerBox7)}
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
                            {formatRs(ledgerBox7)} - {formatRs(magicChartData.currExp)}
                          </td>
                          <td className={`font-black text-2xl ${ledgerNetProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                            {formatRs(ledgerNetProfit)}
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
                            {formatRs(ledgerNetProfit)}
                          </td>
                          <td className="font-black text-2xl text-white bg-indigo-600 dark:bg-indigo-700/80">
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