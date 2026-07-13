import { useState, useEffect, forwardRef } from 'react';
import { supabase } from '../../config/supabaseClient';
import { FileText, Download, FileSpreadsheet, Printer, Calendar, ChevronDown, TrendingUp, Users } from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

// Premium Custom Dropdown Button Date Picker
const CustomDateInput = forwardRef(({ value, onClick, placeholder }, ref) => (
  <button
    onClick={onClick}
    ref={ref}
    className="flex items-center px-4 py-2.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-all duration-200 text-sm font-semibold text-slate-700 dark:text-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-500/50"
  >
    <Calendar size={16} className="text-blue-500 mr-2" />
    {value || placeholder}
    <ChevronDown size={14} className="text-slate-400 dark:text-slate-500 ml-3" />
  </button>
));
CustomDateInput.displayName = "CustomDateInput";

// Helper function to safely get dates from SessionStorage or fallback to Current Date
const getInitialDate = (storageKey) => {
  const savedDate = sessionStorage.getItem(storageKey);
  if (savedDate) {
    return new Date(savedDate);
  }
  return new Date(); // Current date by default
};

export default function Reports() {
  const [loading, setLoading] = useState(true);
  
  // Date Management with SessionStorage Persistence
  const [startDate, setStartDate] = useState(() => getInitialDate('report_start_date'));
  const [endDate, setEndDate] = useState(() => getInitialDate('report_end_date'));
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  // Consolidated Data States
  const [salesList, setSalesList] = useState([]);
  const [traderTransactions, setTraderTransactions] = useState([]);
  const [summary, setSummary] = useState({
    grossProfit: 0,
    totalPurchases: 0,
    totalExpenses: 0,
    netProfit: 0,
    totalWithdrawn: 0,
    retainedCash: 0
  });

  // Date Formatter for DB query
  const formatDateForDB = (date) => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleStartDateChange = (date) => {
    setStartDate(date);
    sessionStorage.setItem('report_start_date', date.toISOString());
    setLoading(true); 
  };

  const handleEndDateChange = (date) => {
    setEndDate(date);
    sessionStorage.setItem('report_end_date', date.toISOString());
    setLoading(true); 
  };

  // Fetch logic directly inside useEffect
  useEffect(() => {
    let isMounted = true;

    const fetchReportData = async () => {
      if (!startDate || !endDate) return;

      const startStr = formatDateForDB(startDate);
      const endStr = formatDateForDB(endDate);

      try {
        // 1. Fetch Brands for Pricing mapping
        const { data: brandsData } = await supabase.from('brands').select('*');
        const brandMap = {};
        brandsData?.forEach(b => brandMap[b.id] = b);

        // 2. Fetch Expenses
        const { data: expData } = await supabase.from('expenses').select('amount').gte('date', startStr).lte('date', endStr);
        const tExpenses = expData?.reduce((sum, e) => sum + parseFloat(e.amount), 0) || 0;

        // 3. Fetch Withdrawals
        const { data: withData } = await supabase.from('owner_withdrawals').select('amount').gte('date', startStr).lte('date', endStr);
        const tWithdrawals = withData?.reduce((sum, w) => sum + parseFloat(w.amount), 0) || 0;

        // 4. Fetch Purchases (for Item logic)
        const { data: purchData } = await supabase.from('purchases').select('*').gte('date', startStr).lte('date', endStr);
        let tPurchases = 0;
        const purchaseQtyMap = {}; 
        purchData?.forEach(p => {
          tPurchases += parseFloat(p.total_amount) || 0;
          const key = `${p.date}_${p.brand_id}`;
          purchaseQtyMap[key] = (purchaseQtyMap[key] || 0) + (p.quantity || 0);
        });

        // 5. Fetch ALL Trader Transactions up to End Date to calculate accurate Running Balances
        const { data: allTraderTxData } = await supabase.from('trader_transactions')
          .select('*, traders(trader_name)')
          .lte('date', endStr)
          .order('date', { ascending: true })
          .order('created_at', { ascending: true });
        
        const txList = [];
        const balances = {}; // Track running balance per trader

        allTraderTxData?.forEach(tx => {
          const traderId = tx.trader_id;
          const pAmt = parseFloat(tx.purchase_amount) || 0;
          const paidAmt = parseFloat(tx.paid_amount) || 0;

          if (!balances[traderId]) balances[traderId] = 0;

          // Compute running balance exactly like PurchaseManager.jsx
          if (tx.manual_remaining !== null && tx.manual_remaining !== undefined) {
            balances[traderId] = parseFloat(tx.manual_remaining);
          } else {
            balances[traderId] = balances[traderId] + pAmt - paidAmt;
          }

          // Only push to the display list if it's within the selected date range
          if (tx.date >= startStr) {
            txList.push({
              ...tx,
              remaining_amount: balances[traderId]
            });
          }
        });

        // 6. Fetch Daily Stock & Calculate Accurate Sales Breakdown
        const { data: stockData } = await supabase.from('daily_stock')
          .select('*')
          .gte('date', startStr).lte('date', endStr)
          .not('closing_balance', 'is', null);

        if (!isMounted) return; 

        setTraderTransactions(txList);

        let tSales = 0;
        const salesAggregation = {}; // Group by brand ID

        stockData?.forEach(stock => {
          const key = `${stock.date}_${stock.brand_id}`;
          const purchQty = purchaseQtyMap[key] || 0;
          const openBal = parseInt(stock.opening_balance) || 0;
          const closeBal = parseInt(stock.closing_balance) || 0;

          let saleQty = openBal + purchQty - closeBal;
          saleQty = saleQty < 0 ? 0 : saleQty;

          const brand = brandMap[stock.brand_id];
          const sellingPrice = parseFloat(stock.unit_price) || (brand ? parseFloat(brand.selling_price) : 0);
          const saleRev = saleQty * sellingPrice;

          tSales += saleRev;

          if (saleQty > 0 && brand) {
            if (!salesAggregation[brand.id]) {
              salesAggregation[brand.id] = {
                brand_name: brand.brand_name,
                bottle_size: brand.bottle_size,
                selling_price: sellingPrice,
                total_qty: 0,
                total_revenue: 0
              };
            }
            salesAggregation[brand.id].total_qty += saleQty;
            salesAggregation[brand.id].total_revenue += saleRev;
          }
        });

        // Sort sales by highest revenue
        setSalesList(Object.values(salesAggregation).sort((a,b) => b.total_revenue - a.total_revenue));

        // Calculate Final Summary
        const netProfit = tSales - tPurchases - tExpenses;
        setSummary({
          grossProfit: tSales,
          totalPurchases: tPurchases,
          totalExpenses: tExpenses,
          netProfit: netProfit,
          totalWithdrawn: tWithdrawals,
          retainedCash: netProfit - tWithdrawals
        });

      } catch (error) {
        console.error("Error generating report:", error);
      }

      if (isMounted) setLoading(false);
    };

    fetchReportData();

    return () => {
      isMounted = false;
    };
  }, [startDate, endDate]);

  // --- EXCEL (CSV) EXPORT LOGIC ---
  const exportToCSV = () => {
    const startStr = formatDateForDB(startDate);
    const endStr = formatDateForDB(endDate);
    
    // Part 1: Financial Summary
    let csvContent = `ELIXIR STORE - OFFICIAL FINANCIAL REPORT\nPeriod: ${startStr} to ${endStr}\n\n`;
    csvContent += `FINANCIAL SUMMARY\n`;
    csvContent += `Gross Profit (Sales),Total Purchases,Total Expenses,Net Profit/Loss,Owner Withdrawals,Cash Left In Drawer\n`;
    csvContent += `Rs. ${summary.grossProfit},Rs. ${summary.totalPurchases},Rs. ${summary.totalExpenses},Rs. ${summary.netProfit},Rs. ${summary.totalWithdrawn},Rs. ${summary.retainedCash}\n\n`;

    // Part 2: Sales Breakdown
    csvContent += `BOTTLES SOLD BREAKDOWN\n`;
    csvContent += `Brand Name,Size,Selling Price,Qty Sold,Total Revenue (Rs)\n`;
    salesList.forEach(s => {
      csvContent += `"${s.brand_name}","${s.bottle_size}",${s.selling_price},${s.total_qty},${s.total_revenue}\n`;
    });
    csvContent += `\n`;

    // Part 3: Trader Transactions
    csvContent += `PURCHASES & TRADER LEDGER\n`;
    csvContent += `Date,Trader Name,Purchase Billed Amount,Amount Paid to Trader,Remaining Balance\n`;
    traderTransactions.forEach(t => {
      const tName = t.traders?.trader_name || 'Unknown';
      csvContent += `"${t.date}","${tName}",${t.purchase_amount},${t.paid_amount},${t.remaining_amount}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Elixir_Comprehensive_Report_${startStr}_to_${endStr}.csv`;
    link.click();
    setIsExportMenuOpen(false);
  };

  const printReport = () => {
    window.print();
    setIsExportMenuOpen(false);
  };

  return (
    <div className="space-y-6 transition-colors duration-300">
      
      {/* GLOBAL & A4 PRINT CSS */}
      <style>{`
        .react-datepicker-popper { z-index: 99999 !important; }
        .react-datepicker-wrapper { display: inline-block; }
        .react-datepicker { background-color: #ffffff !important; border: 1px solid #e2e8f0 !important; border-radius: 1.25rem !important; box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1) !important; font-family: inherit !important; padding: 0.75rem !important; }
        .dark .react-datepicker { background-color: #0f172a !important; border-color: #1e293b !important; }
        
        /* A4 SIZE PDF PRINT SPECIFIC CSS */
        @media print {
          @page { size: A4 portrait; margin: 15mm; }
          body { background-color: white !important; color: black !important; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; font-family: Arial, sans-serif !important; }
          body * { visibility: hidden; } 
          .no-print { display: none !important; }
          #printable-report, #printable-report * { visibility: visible; } 
          #printable-report { position: absolute; left: 0; top: 0; width: 100%; }
          
          /* Forced Page Break for Print */
          .page-break-after { page-break-after: always; margin-bottom: 20mm; border:none !important; }
          .page-break-before { page-break-before: always; padding-top: 10mm; }
          
          /* Print Typography & Table Specs */
          table { width: 100% !important; border-collapse: collapse !important; margin-bottom: 15px; }
          th, td { padding: 8px !important; border: 1px solid #ccc !important; font-size: 10pt !important; color: #000 !important; }
          th { background-color: #f1f5f9 !important; color: #000 !important; font-weight: bold !important; text-transform: uppercase; font-size: 9pt !important; }
          tr { page-break-inside: avoid; }
          thead { display: table-header-group; }
          
          /* Clean borders for official look */
          .official-border { border: 2px solid #000 !important; border-radius: 0 !important; padding: 15px !important; box-shadow: none !important; }
          .print-card-grid { display: grid !important; grid-template-columns: repeat(3, 1fr) !important; gap: 10px !important; margin-bottom: 20px !important; }
          .print-metric { border: 1px solid #000 !important; padding: 10px !important; text-align: center !important; background: transparent !important; }
          .print-metric p { font-size: 9pt !important; font-weight: bold !important; margin-bottom: 5px !important; text-transform: uppercase; color: #333 !important;}
          .print-metric h3 { font-size: 14pt !important; font-weight: bold !important; color: #000 !important; margin: 0 !important;}
          
          /* Hide Dark Mode specific items */
          .dark-only-print { display: none !important; }
        }
      `}</style>

      {/* HEADER SECTION */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 no-print relative z-50">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
            <FileText className="text-blue-600" /> Comprehensive Official Report
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Full P&L, Sales Breakdown, and Ledger for extraction.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-100/50 dark:bg-slate-900/50 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-inner">
            <DatePicker
              selected={startDate}
              onChange={handleStartDateChange}
              maxDate={new Date()}
              dateFormat="dd/MM/yy"
              customInput={<CustomDateInput />}
              showMonthDropdown
              showYearDropdown
              dropdownMode="select"
            />
            <span className="text-slate-400 font-medium px-1">to</span>
            <DatePicker
              selected={endDate}
              onChange={handleEndDateChange}
              minDate={startDate}
              maxDate={new Date()}
              dateFormat="dd/MM/yy"
              customInput={<CustomDateInput />}
              showMonthDropdown
              showYearDropdown
              dropdownMode="select"
            />
          </div>

          <div className="relative">
            <button 
              onClick={() => setIsExportMenuOpen(!isExportMenuOpen)} 
              className="flex items-center gap-2 bg-slate-800 dark:bg-slate-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-700 dark:hover:bg-slate-600 transition-colors shadow-sm outline-none"
            >
              <Download size={16} /> Document Export
            </button>
            {isExportMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl shadow-lg py-2 z-50">
                <button onClick={exportToCSV} className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2">
                  <FileSpreadsheet size={16} className="text-green-600 dark:text-green-400" /> Export Excel (CSV)
                </button>
                <button onClick={printReport} className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2">
                  <Printer size={16} className="text-blue-600 dark:text-blue-400" /> Export PDF (A4)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PRINTABLE A4 AREA */}
      <div id="printable-report" className="relative z-10 bg-[#F8FAFC] dark:bg-slate-950 print:bg-white print:p-0">
        
        {/* ================= PAGE 1: FINANCIALS & SALES ================= */}
        <div className="page-break-after">
          
          {/* Official Document Header */}
          <div className="text-center mb-8 border-b-2 border-slate-800 pb-4">
            <h1 className="text-3xl font-black text-slate-900 dark:text-white print:text-black uppercase tracking-widest">Elixir Store</h1>
            <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-300 print:text-black mt-1">Consolidated Financial & Sales Report</h2>
            <p className="text-slate-500 dark:text-slate-400 print:text-gray-700 font-medium mt-2 uppercase text-sm tracking-wider">
              Reporting Period: {startDate.toLocaleDateString('en-IN')} TO {endDate.toLocaleDateString('en-IN')}
            </p>
          </div>

          {/* Section 1: Financial Summary */}
          <div className="mb-8">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 print:text-black uppercase border-b border-slate-200 dark:border-slate-800 print:border-black pb-2 mb-4">1. Financial Summary Overview</h3>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 print-card-grid">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 print-metric">
                <p className="text-xs font-bold text-slate-500 mb-1 uppercase">Gross Profit (Sales)</p>
                <h3 className="text-2xl font-black text-emerald-600 dark:text-emerald-400">₹{summary.grossProfit.toLocaleString()}</h3>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 print-metric">
                <p className="text-xs font-bold text-slate-500 mb-1 uppercase">Total Purchases Billed</p>
                <h3 className="text-2xl font-black text-amber-600 dark:text-amber-400">₹{summary.totalPurchases.toLocaleString()}</h3>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 print-metric">
                <p className="text-xs font-bold text-slate-500 mb-1 uppercase">Business Expenses</p>
                <h3 className="text-2xl font-black text-red-500">₹{summary.totalExpenses.toLocaleString()}</h3>
              </div>
              
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 print-metric">
                <p className="text-xs font-bold text-slate-500 mb-1 uppercase">Net Profit / Loss</p>
                <h3 className="text-2xl font-black text-blue-600 dark:text-blue-400">₹{summary.netProfit.toLocaleString()}</h3>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 print-metric">
                <p className="text-xs font-bold text-slate-500 mb-1 uppercase">Owner Withdrawals</p>
                <h3 className="text-2xl font-black text-indigo-500">₹{summary.totalWithdrawn.toLocaleString()}</h3>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-slate-200 dark:border-slate-800 rounded-xl p-5 print-metric">
                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-500 mb-1 uppercase">Cash Left in Drawer</p>
                <h3 className="text-2xl font-black text-emerald-700 dark:text-emerald-400">₹{summary.retainedCash.toLocaleString()}</h3>
              </div>
            </div>
          </div>

          {/* Section 2: Detailed Sales Breakdown */}
          <div className="mb-8">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 print:text-black uppercase border-b border-slate-200 dark:border-slate-800 print:border-black pb-2 mb-4 flex items-center gap-2">
              <TrendingUp size={18} className="no-print" /> 2. Itemized Bottles Sold Breakdown
            </h3>
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden print:border-none print:shadow-none">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-bold uppercase text-[11px] tracking-wider border-b border-slate-200 dark:border-slate-700 print:bg-gray-100 print:text-black">
                  <tr>
                    <th className="px-4 py-3">Brand Name</th>
                    <th className="px-4 py-3 text-center">Bottle Size</th>
                    <th className="px-4 py-3 text-right">Unit Price (₹)</th>
                    <th className="px-4 py-3 text-center">Qty Sold</th>
                    <th className="px-4 py-3 text-right text-emerald-600 print:text-black">Total Revenue (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 print:divide-gray-300">
                  {loading ? (
                    <tr><td colSpan="5" className="px-4 py-8 text-center">Compiling sales data...</td></tr>
                  ) : salesList.length === 0 ? (
                    <tr><td colSpan="5" className="px-4 py-8 text-center">No sales records found for this period.</td></tr>
                  ) : (
                    salesList.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 print:hover:bg-transparent">
                        <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100 print:text-black">{item.brand_name}</td>
                        <td className="px-4 py-3 text-center">{item.bottle_size}</td>
                        <td className="px-4 py-3 text-right">₹{item.selling_price}</td>
                        <td className="px-4 py-3 text-center font-bold">{item.total_qty}</td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400 print:text-black">₹{item.total_revenue.toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ================= PAGE 2: PURCHASES & TRADERS ================= */}
        <div className="page-break-before pt-6 sm:pt-0">
          
          {/* Header Repeated for Print Context */}
          <div className="hidden print:block text-center mb-8 border-b-2 border-slate-800 pb-4">
             <h1 className="text-2xl font-black text-black uppercase tracking-widest">Elixir Store - Page 2</h1>
             <p className="text-gray-700 font-medium mt-1 uppercase text-xs tracking-wider">
               Reporting Period: {startDate.toLocaleDateString('en-IN')} TO {endDate.toLocaleDateString('en-IN')}
             </p>
          </div>

          <div className="mb-8">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 print:text-black uppercase border-b border-slate-200 dark:border-slate-800 print:border-black pb-2 mb-4 flex items-center gap-2">
              <Users size={18} className="no-print" /> 3. Trader Purchases & Payment Ledger
            </h3>
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden print:border-none print:shadow-none">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-bold uppercase text-[11px] tracking-wider border-b border-slate-200 dark:border-slate-700 print:bg-gray-100 print:text-black">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Trader / Agency Name</th>
                    <th className="px-4 py-3 text-right">Billed Amount (₹)</th>
                    <th className="px-4 py-3 text-right text-indigo-600 print:text-black">Amount Paid (₹)</th>
                    <th className="px-4 py-3 text-right text-red-600 print:text-black">Remaining Balance (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 print:divide-gray-300">
                  {loading ? (
                    <tr><td colSpan="5" className="px-4 py-8 text-center">Compiling trader data...</td></tr>
                  ) : traderTransactions.length === 0 ? (
                    <tr><td colSpan="5" className="px-4 py-8 text-center">No trader transactions found for this period.</td></tr>
                  ) : (
                    traderTransactions.map((tx, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 print:hover:bg-transparent">
                        <td className="px-4 py-3 font-medium">{new Date(tx.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                        <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100 print:text-black">{tx.traders?.trader_name || 'N/A'}</td>
                        <td className="px-4 py-3 text-right font-bold text-amber-600 dark:text-amber-500 print:text-black">{tx.purchase_amount > 0 ? `₹${tx.purchase_amount.toLocaleString()}` : '-'}</td>
                        <td className="px-4 py-3 text-right font-bold text-indigo-600 dark:text-indigo-400 print:text-black">{tx.paid_amount > 0 ? `₹${tx.paid_amount.toLocaleString()}` : '-'}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white print:text-black">
                          ₹{tx.remaining_amount.toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-xs text-slate-500 print:text-gray-600 italic">
              * Note: The 'Billed Amount' column maps directly to the Total Purchases value in the Financial Summary.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}