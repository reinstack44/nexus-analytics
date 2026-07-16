import { useState, useEffect, forwardRef } from 'react';
import { supabase } from '../../config/supabaseClient';
import { FileText, Download, FileSpreadsheet, Printer, Calendar, ChevronDown, TrendingUp, Users, Receipt, Landmark, Sigma } from 'lucide-react';
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

  // उसी महीने के अंतिम दिन की संख्या निकालना (उदा. 28, 29, 30, या 31)
  const lastDayOfSameMonth = new Date(s.getFullYear(), s.getMonth() + 1, 0).getDate();
  const isLastDay = e.getDate() === lastDayOfSameMonth;

  return sameYear && sameMonth && isFirstDay && isLastDay;
};

// फ़ॉर्मेटिंग हेल्पर
const formatRs = (num) => '₹' + Math.round(num).toLocaleString('en-IN');

export default function Reports() {
  const [loading, setLoading] = useState(true);
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
    box1: 0, box2: 0, box3: 0, box4: 0, box5: 0, box6: 0, box7: 0, currExp: 0, currNetProfit: 0
  });
  const [manualSales, setManualSales] = useState('0');
  const [manualPurchases, setManualPurchases] = useState('0');

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

      try {
        const { data: brandsData } = await supabase.from('brands').select('*');
        const brandMap = {}; brandsData?.forEach(b => brandMap[b.id] = b);

        // Fetch Expenses
        const { data: expData } = await supabase.from('expenses').select('*').gte('date', startStr).lte('date', endStr + 'T23:59:59').order('date');
        const tExpenses = expData?.reduce((sum, e) => sum + parseFloat(e.amount), 0) || 0;
        
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
        const { data: stockData } = await supabase.from('daily_stock').select('*').gte('date', startStr).lte('date', endStr + 'T23:59:59').order('date', { ascending: true });
        
        if (!isMounted) return; 

        setExpenseList(expData || []);
        setCollectionList(withData || []);
        setTraderTransactions(txList);

        // Sales aggregation
        let tSales = 0; const salesAggregation = {};
        const validStockData = stockData?.filter(stock => stock.closing_balance !== null) || [];
        
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
        if (showMagicChart) {
          let currExpVal = 0;
          expData?.forEach(e => {
            const eDate = getLocalDateObj(e.date);
            if (eDate && eDate >= startObj && eDate <= endObj) {
              currExpVal += parseFloat(e.amount || 0);
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
          let totalSalesVal = 0;
          const prevClosings = {};
          const { data: beforeStock } = await supabase.from('daily_stock').select('*').lt('date', startStr).order('date', { ascending: false });
          beforeStock?.forEach(s => {
            if (prevClosings[s.brand_id] === undefined && s.closing_balance !== null) {
              prevClosings[s.brand_id] = { closing_balance: parseInt(s.closing_balance), price: s.unit_price ? parseFloat(s.unit_price) : null };
            }
          });

          const stockByDate = {};
          stockData?.forEach(s => {
            const sDate = getLocalDateObj(s.date);
            if (sDate && sDate >= startObj && sDate <= endObj) {
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
                totalSalesVal += sAmt;
                runningStates[brand.id] = { closing: closing, price: pPrice };
              }
            });
          });

          const box3 = totalSalesVal + closingVal;
          const box6 = openingVal + currPurchasesVal;
          const box7 = box3 - box6;
          const currNetProfit = box7 - currExpVal;

          setMagicChartData({
            box1: totalSalesVal,
            box2: closingVal,
            box3,
            box4: openingVal,
            box5: currPurchasesVal,
            box6,
            box7,
            currExp: currExpVal,
            currNetProfit
          });

          setManualSales(String(Math.round(totalSalesVal)));
          setManualPurchases(String(Math.round(currPurchasesVal)));
        }

      } catch (error) { console.error("Error generating report:", error); }
      if (isMounted) setLoading(false);
    };

    fetchReportData();
    return () => { isMounted = false; };
  }, [startDate, endDate, showMagicChart]); // showMagicChart भी डिपेंडेंसी में जोड़ा गया है

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

  // --- MANUAL CHART REALTIME CALCULATIONS ---
  const mSalesVal = parseFloat(manualSales) || 0;
  const mPurchasesVal = parseFloat(manualPurchases) || 0;
  const mBox2Val = magicChartData.box2; 
  const mBox3Val = mSalesVal + mBox2Val; 
  const mBox4Val = magicChartData.box4; 
  const mBox6Val = mBox4Val + mPurchasesVal; 
  const mBox7Val = mBox3Val - mBox6Val; 
  const mNetProfitVal = mBox7Val - magicChartData.currExp; 

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
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 print:text-black uppercase border-b border-slate-200 dark:border-slate-800 print:border-gray-300 pb-2 mb-6">6. Magic Chart Analytics & Sandbox Simulation</h3>
              
              {loading ? (
                <p className="text-center text-slate-400 dark:text-slate-500 py-12">Compiling simulated charts...</p>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 print-magic-grid">
                  
                  {/* 1. Automated Magic Chart */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-2">
                      <h4 className="font-black text-slate-800 dark:text-white text-sm uppercase">1. Automated Magic Chart</h4>
                      <span className="text-[10px] font-bold uppercase text-blue-600 dark:text-blue-400 bg-blue-100/50 dark:bg-blue-900/30 px-2 py-0.5 rounded-md print:border">System Cal</span>
                    </div>

                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex justify-between items-center">
                      <div><span className="text-[10px] font-bold text-slate-400 block uppercase">Box 1</span><span className="font-semibold text-slate-800 dark:text-slate-200">Total Sales Amount</span></div>
                      <span className="text-lg font-black text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/10 px-3 py-1.5 rounded-lg">{formatRs(magicChartData.box1)}</span>
                    </div>

                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex justify-between items-center">
                      <div><span className="text-[10px] font-bold text-slate-400 block uppercase">Box 2</span><span className="font-semibold text-slate-800 dark:text-slate-200">Closing Stock Value</span></div>
                      <span className="text-lg font-black text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/10 px-3 py-1.5 rounded-lg">{formatRs(magicChartData.box2)}</span>
                    </div>

                    <div className="bg-slate-800 dark:bg-slate-900 rounded-xl p-4 flex justify-between items-center text-white">
                      <div><span className="text-[10px] font-bold text-indigo-300 block uppercase">Box 3</span><span className="font-semibold">Sum (Box 1 + 2)</span></div>
                      <span className="text-lg font-black text-indigo-400">{formatRs(magicChartData.box3)}</span>
                    </div>

                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex justify-between items-center">
                      <div><span className="text-[10px] font-bold text-slate-400 block uppercase">Box 4</span><span className="font-semibold text-slate-800 dark:text-slate-200">Opening Stock Value</span></div>
                      <span className="text-lg font-black text-fuchsia-600 dark:text-fuchsia-400 bg-fuchsia-50 dark:bg-fuchsia-900/10 px-3 py-1.5 rounded-lg">{formatRs(magicChartData.box4)}</span>
                    </div>

                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex justify-between items-center">
                      <div><span className="text-[10px] font-bold text-slate-400 block uppercase">Box 5</span><span className="font-semibold text-slate-800 dark:text-slate-200">Total Purchases</span></div>
                      <span className="text-lg font-black text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/10 px-3 py-1.5 rounded-lg">{formatRs(magicChartData.box5)}</span>
                    </div>

                    <div className="bg-slate-800 dark:bg-slate-900 rounded-xl p-4 flex justify-between items-center text-white">
                      <div><span className="text-[10px] font-bold text-violet-300 block uppercase">Box 6</span><span className="font-semibold">Sum (Box 4 + 5)</span></div>
                      <span className="text-lg font-black text-violet-400">{formatRs(magicChartData.box6)}</span>
                    </div>

                    <div className={`rounded-xl p-4 border-2 flex justify-between items-center ${magicChartData.box7 >= 0 ? 'bg-emerald-50/70 border-emerald-300 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-200' : 'bg-red-50/70 border-red-300 text-red-800 dark:bg-red-950/20 dark:border-red-800 dark:text-red-200'}`}>
                      <div><span className="text-[10px] font-bold block uppercase">Box 7</span><span className="font-bold">Gross Profit (Box 3 - 6)</span></div>
                      <span className="text-xl font-black">{formatRs(magicChartData.box7)}</span>
                    </div>

                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-sm space-y-2 text-slate-700 dark:text-slate-300">
                      <div className="flex justify-between"><span>Gross Profit:</span><span className="font-bold">{formatRs(magicChartData.box7)}</span></div>
                      <div className="flex justify-between text-red-500"><span>Expenses:</span><span className="font-bold">- {formatRs(magicChartData.currExp)}</span></div>
                      <div className="flex justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-base font-black">
                        <span>Net Profit:</span><span className={magicChartData.currNetProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}>{formatRs(magicChartData.currNetProfit)}</span>
                      </div>
                    </div>
                  </div>

                  {/* 2. Manual Sandbox Chart */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-2">
                      <h4 className="font-black text-slate-800 dark:text-white text-sm uppercase">2. Manual Magic Chart</h4>
                      <span className="text-[10px] font-bold uppercase text-indigo-600 dark:text-indigo-400 bg-indigo-100/50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-md print:border">Sandbox</span>
                    </div>

                    {/* EDITABLE BOX 1 */}
                    <div className="bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/40 rounded-xl p-4 flex justify-between items-center">
                      <div><span className="text-[10px] font-bold text-indigo-500 block uppercase">Box 1 (Manual)</span><span className="font-semibold text-slate-800 dark:text-slate-200">Total Sales Amount</span></div>
                      <div className="flex items-center bg-indigo-50 dark:bg-indigo-900/10 rounded-lg px-3 py-1.5 focus-within:ring-2 focus-within:ring-indigo-500/15 border border-transparent">
                        <span className="text-lg font-black text-indigo-600 dark:text-indigo-400 mr-0.5">₹</span>
                        <input 
                          type="number" 
                          value={manualSales} 
                          onChange={(e) => setManualSales(e.target.value)} 
                          className="w-24 bg-transparent border-none outline-none text-right font-black text-indigo-600 dark:text-indigo-400 text-lg p-0 focus:ring-0 no-print"
                        />
                        <span className="hidden print:inline text-lg font-black text-indigo-600 dark:text-indigo-400">{mSalesVal.toLocaleString('en-IN')}</span>
                      </div>
                    </div>

                    {/* BOX 2 */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex justify-between items-center opacity-75">
                      <div><span className="text-[10px] font-bold text-slate-400 block uppercase">Box 2 (Auto)</span><span className="font-semibold text-slate-800 dark:text-slate-200">Closing Stock Value</span></div>
                      <span className="text-lg font-black text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/10 px-3 py-1.5 rounded-lg">{formatRs(mBox2Val)}</span>
                    </div>

                    {/* BOX 3 */}
                    <div className="bg-slate-800 dark:bg-slate-900 rounded-xl p-4 flex justify-between items-center text-white">
                      <div><span className="text-[10px] font-bold text-indigo-300 block uppercase">Box 3 (Manual)</span><span className="font-semibold">Sum (Box 1 + 2)</span></div>
                      <span className="text-lg font-black text-indigo-400">{formatRs(mBox3Val)}</span>
                    </div>

                    {/* BOX 4 */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex justify-between items-center opacity-75">
                      <div><span className="text-[10px] font-bold text-slate-400 block uppercase">Box 4 (Auto)</span><span className="font-semibold text-slate-800 dark:text-slate-200">Opening Stock Value</span></div>
                      <span className="text-lg font-black text-fuchsia-600 dark:text-fuchsia-400 bg-fuchsia-50 dark:bg-fuchsia-900/10 px-3 py-1.5 rounded-lg">{formatRs(mBox4Val)}</span>
                    </div>

                    {/* EDITABLE BOX 5 */}
                    <div className="bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/40 rounded-xl p-4 flex justify-between items-center">
                      <div><span className="text-[10px] font-bold text-indigo-500 block uppercase">Box 5 (Manual)</span><span className="font-semibold text-slate-800 dark:text-slate-200">Total Purchases</span></div>
                      <div className="flex items-center bg-indigo-50 dark:bg-indigo-900/10 rounded-lg px-3 py-1.5 focus-within:ring-2 focus-within:ring-indigo-500/15 border border-transparent">
                        <span className="text-lg font-black text-indigo-600 dark:text-indigo-400 mr-0.5">₹</span>
                        <input 
                          type="number" 
                          value={manualPurchases} 
                          onChange={(e) => setManualPurchases(e.target.value)} 
                          className="w-24 bg-transparent border-none outline-none text-right font-black text-indigo-600 dark:text-indigo-400 text-lg p-0 focus:ring-0 no-print"
                        />
                        <span className="hidden print:inline text-lg font-black text-indigo-600 dark:text-indigo-400">{mPurchasesVal.toLocaleString('en-IN')}</span>
                      </div>
                    </div>

                    {/* BOX 6 */}
                    <div className="bg-slate-800 dark:bg-slate-900 rounded-xl p-4 flex justify-between items-center text-white">
                      <div><span className="text-[10px] font-bold text-violet-300 block uppercase">Box 6 (Manual)</span><span className="font-semibold">Sum (Box 4 + 5)</span></div>
                      <span className="text-lg font-black text-violet-400">{formatRs(mBox6Val)}</span>
                    </div>

                    {/* BOX 7 */}
                    <div className={`rounded-xl p-4 border-2 flex justify-between items-center ${mBox7Val >= 0 ? 'bg-emerald-50/70 border-emerald-300 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-200' : 'bg-red-50/70 border-red-300 text-red-800 dark:bg-red-950/20 dark:border-red-800 dark:text-red-200'}`}>
                      <div><span className="text-[10px] font-bold block uppercase">Box 7 (Manual)</span><span className="font-bold">Gross Profit (Box 3 - 6)</span></div>
                      <span className="text-xl font-black">{formatRs(mBox7Val)}</span>
                    </div>

                    {/* MANUAL SETTLEMENT SUMMARY */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-sm space-y-2 text-slate-700 dark:text-slate-300">
                      <div className="flex justify-between"><span>Gross Profit:</span><span className="font-bold">{formatRs(mBox7Val)}</span></div>
                      <div className="flex justify-between text-red-500"><span>Expenses:</span><span className="font-bold">- {formatRs(magicChartData.currExp)}</span></div>
                      <div className="flex justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-base font-black">
                        <span>Net Profit:</span><span className={mNetProfitVal >= 0 ? 'text-emerald-600' : 'text-red-600'}>{formatRs(mNetProfitVal)}</span>
                      </div>
                    </div>
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