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

  const formatDateForDB = (date) => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleStartDateChange = (date) => { setStartDate(date); sessionStorage.setItem('report_start_date', date.toISOString()); setLoading(true); };
  const handleEndDateChange = (date) => { setEndDate(date); sessionStorage.setItem('report_end_date', date.toISOString()); setLoading(true); };

  useEffect(() => {
    let isMounted = true;
    const fetchReportData = async () => {
      if (!startDate || !endDate) return;
      const startStr = formatDateForDB(startDate); const endStr = formatDateForDB(endDate);

      try {
        const { data: brandsData } = await supabase.from('brands').select('*');
        const brandMap = {}; brandsData?.forEach(b => brandMap[b.id] = b);

        // Fetch Expenses
        const { data: expData } = await supabase.from('expenses').select('*').gte('date', startStr).lte('date', endStr).order('date');
        const tExpenses = expData?.reduce((sum, e) => sum + parseFloat(e.amount), 0) || 0;
        
        // Fetch Withdrawals (Collections)
        const { data: withData } = await supabase.from('owner_withdrawals').select('*').gte('date', startStr).lte('date', endStr).order('date');
        const tWithdrawals = withData?.reduce((sum, w) => sum + parseFloat(w.amount), 0) || 0;

        // Fetch Purchases
        const { data: purchData } = await supabase.from('purchases').select('*').gte('date', startStr).lte('date', endStr);
        let tPurchases = 0; const purchaseQtyMap = {}; 
        purchData?.forEach(p => {
          tPurchases += parseFloat(p.total_amount) || 0;
          const key = `${p.date}_${p.brand_id}`; purchaseQtyMap[key] = (purchaseQtyMap[key] || 0) + (p.quantity || 0);
        });

        // Trader Transactions
        const { data: allTraderTxData } = await supabase.from('trader_transactions').select('*, traders(trader_name)').lte('date', endStr).order('date').order('created_at');
        const txList = []; const balances = {};
        allTraderTxData?.forEach(tx => {
          const traderId = tx.trader_id; const pAmt = parseFloat(tx.purchase_amount) || 0; const paidAmt = parseFloat(tx.paid_amount) || 0;
          if (!balances[traderId]) balances[traderId] = 0;
          if (tx.manual_remaining !== null && tx.manual_remaining !== undefined) balances[traderId] = parseFloat(tx.manual_remaining);
          else balances[traderId] = balances[traderId] + pAmt - paidAmt;
          if (tx.date >= startStr) txList.push({ ...tx, remaining_amount: balances[traderId] });
        });

        // Stock & Sales
        const { data: stockData } = await supabase.from('daily_stock').select('*').gte('date', startStr).lte('date', endStr).not('closing_balance', 'is', null);
        
        if (!isMounted) return; 

        setExpenseList(expData || []);
        setCollectionList(withData || []);
        setTraderTransactions(txList);

        let tSales = 0; const salesAggregation = {};
        stockData?.forEach(stock => {
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
      } catch (error) { console.error("Error generating report:", error); }
      if (isMounted) setLoading(false);
    };

    fetchReportData();
    return () => { isMounted = false; };
  }, [startDate, endDate]);

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
          <p className="text-slate-500 text-sm mt-1">Multi-page print layout for records extraction.</p>
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
            <h1 className="text-3xl font-black text-slate-900 dark:text-white print:text-black uppercase tracking-widest">Elixir Store</h1>
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
             <h1 className="text-2xl font-black text-black uppercase tracking-widest">Elixir Store - Page 2</h1>
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
             <h1 className="text-2xl font-black text-black uppercase tracking-widest">Elixir Store - Page 3</h1>
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
             <h1 className="text-2xl font-black text-black uppercase tracking-widest">Elixir Store - Page 4</h1>
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

      </div>
    </div>
  );
}