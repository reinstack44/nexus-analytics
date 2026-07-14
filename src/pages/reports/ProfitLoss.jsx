import { useState, useEffect, forwardRef } from 'react';
import { supabase } from '../../config/supabaseClient';
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
  const [startDate, setStartDate] = useState(() => {
    const saved = sessionStorage.getItem('pl_startDate');
    return saved ? new Date(saved) : new Date();
  });
  
  const [endDate, setEndDate] = useState(() => {
    const saved = sessionStorage.getItem('pl_endDate');
    return saved ? new Date(saved) : new Date();
  });

  useEffect(() => {
    if (startDate) sessionStorage.setItem('pl_startDate', startDate.toISOString());
  }, [startDate]);

  useEffect(() => {
    if (endDate) sessionStorage.setItem('pl_endDate', endDate.toISOString());
  }, [endDate]);

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

  useEffect(() => {
    let isMounted = true;
    
    const fetchReportData = async () => {
      const startStr = formatDateForDB(startDate);
      const endStr = formatDateForDB(endDate);

      const { data: expData } = await supabase.from('expenses').select('amount').gte('date', startStr).lte('date', endStr);
      let tExpenses = 0;
      if (expData) expData.forEach(e => tExpenses += parseFloat(e.amount));

      const { data: withData } = await supabase.from('owner_withdrawals').select('amount').gte('date', startStr).lte('date', endStr);
      let tWithdrawals = 0;
      if (withData) withData.forEach(w => tWithdrawals += parseFloat(w.amount));

      const { data: purchData } = await supabase.from('purchases').select('date, brand_id, quantity, total_amount').gte('date', startStr).lte('date', endStr);
      let tPurchases = 0;
      const purchaseMap = {}; 
      if (purchData) {
        purchData.forEach(p => {
          tPurchases += parseFloat(p.total_amount);
          const key = `${p.date}_${p.brand_id}`;
          purchaseMap[key] = (purchaseMap[key] || 0) + p.quantity;
        });
      }

      const { data: brandsData } = await supabase.from('brands').select('id, selling_price');
      const priceMap = {};
      if (brandsData) brandsData.forEach(b => priceMap[b.id] = parseFloat(b.selling_price) || 0);

      const { data: stockData } = await supabase.from('daily_stock').select('*').gte('date', startStr).lte('date', endStr).not('closing_balance', 'is', null); 
      let tSales = 0;
      if (stockData) {
        stockData.forEach(stock => {
          const key = `${stock.date}_${stock.brand_id}`;
          const purchQty = purchaseMap[key] || 0;
          const openBal = parseInt(stock.opening_balance) || 0;
          const closeBal = parseInt(stock.closing_balance) || 0;
          let saleQty = openBal + purchQty - closeBal;
          saleQty = saleQty < 0 ? 0 : saleQty; 
          const sellingPrice = parseFloat(stock.unit_price) || priceMap[stock.brand_id] || 0;
          tSales += (saleQty * sellingPrice);
        });
      }

      if (!isMounted) return;

      const netProfit = tSales - tPurchases - tExpenses;
      setSummary({
        totalSales: tSales,
        totalPurchases: tPurchases,
        totalExpenses: tExpenses,
        netProfit: netProfit,
        totalWithdrawn: tWithdrawals,
        retainedCash: netProfit - tWithdrawals 
      });
    };

    fetchReportData();
    
    return () => {
      isMounted = false;
    };
  }, [startDate, endDate]);

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
          <h3 className="text-3xl font-black text-slate-800 dark:text-slate-100">₹{summary.totalSales.toLocaleString()}</h3>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
          <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wider">Purchase Cost</p>
          <h3 className="text-3xl font-black text-slate-800 dark:text-slate-100">₹{summary.totalPurchases.toLocaleString()}</h3>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
          <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wider">Business Expenses</p>
          <h3 className="text-3xl font-black text-slate-800 dark:text-slate-100">₹{summary.totalExpenses.toLocaleString()}</h3>
        </div>

        <div className={`p-6 rounded-2xl shadow-sm relative overflow-hidden group border ${summary.netProfit >= 0 ? 'bg-linear-to-br from-emerald-500 to-emerald-700 border-emerald-600' : 'bg-linear-to-br from-red-500 to-red-700 border-red-600'}`}>
           <div className="absolute right-0 top-0 opacity-20 transform translate-x-1/4 -translate-y-1/4">
            {summary.netProfit >= 0 ? <TrendingUp size={120} className="text-white"/> : <TrendingDown size={120} className="text-white"/>}
          </div>
          <p className="text-white/80 font-bold text-sm tracking-wider uppercase mb-2 relative z-10">Net Profit / Loss</p>
          <h3 className="text-4xl font-black text-white relative z-10">₹{summary.netProfit.toLocaleString()}</h3>
        </div>
      </div>

      <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-6 relative z-10">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-100 dark:bg-blue-900/50 rounded-full text-blue-600 dark:text-blue-400">
            <Landmark size={24} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Online Collections</h3>
            <p className="text-2xl font-black text-slate-800 dark:text-slate-100">₹{summary.totalWithdrawn.toLocaleString()}</p>
          </div>
        </div>
        <div className="h-10 w-px bg-blue-200 dark:bg-blue-800 hidden sm:block"></div>
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emerald-100 dark:bg-emerald-900/50 rounded-full text-emerald-600 dark:text-emerald-400">
            <IndianRupee size={24} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Cash Left In Hand</h3>
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">₹{summary.retainedCash.toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}