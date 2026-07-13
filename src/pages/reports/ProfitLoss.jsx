import { useState, useEffect, useCallback, forwardRef } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { Calendar, Wallet, Landmark, IndianRupee, TrendingUp, TrendingDown, Receipt, Plus, ArrowDownCircle, ChevronDown } from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

// Premium Custom Dropdown Button for Top Date Slicer
const CustomDateInput = forwardRef(({ value, onClick, placeholder }, ref) => (
  <button
    type="button"
    onClick={onClick}
    ref={ref}
    className="flex items-center px-4 py-2 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-all duration-200 text-sm font-bold text-slate-700 dark:text-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-500/50 whitespace-nowrap w-full sm:w-auto"
  >
    <Calendar size={16} className="text-blue-500 mr-2 shrink-0" />
    {value || placeholder}
    <ChevronDown size={14} className="text-slate-400 dark:text-slate-500 ml-3 shrink-0" />
  </button>
));
CustomDateInput.displayName = "CustomDateInput";

export default function ProfitLoss() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Date Range State (Using Session Storage for persistence across page navigation)
  const [startDate, setStartDate] = useState(() => {
    const saved = sessionStorage.getItem('pl_startDate');
    return saved ? new Date(saved) : new Date(); // Default is Today
  });
  
  const [endDate, setEndDate] = useState(() => {
    const saved = sessionStorage.getItem('pl_endDate');
    return saved ? new Date(saved) : new Date(); // Default is Today
  });

  // Save selected dates to session storage whenever they change
  useEffect(() => {
    if (startDate) sessionStorage.setItem('pl_startDate', startDate.toISOString());
  }, [startDate]);

  useEffect(() => {
    if (endDate) sessionStorage.setItem('pl_endDate', endDate.toISOString());
  }, [endDate]);

  // UI States
  const [activeTab, setActiveTab] = useState('expense'); 

  // Data States
  const [expenses, setExpenses] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [summary, setSummary] = useState({
    totalSales: 0,
    totalPurchases: 0,
    totalExpenses: 0,
    netProfit: 0,
    totalWithdrawn: 0,
    retainedCash: 0
  });

  // Forms State (Using JS Date Objects)
  const [expenseForm, setExpenseForm] = useState({
    date: new Date(),
    description: '',
    amount: ''
  });

  const [withdrawalForm, setWithdrawalForm] = useState({
    date: new Date(),
    description: 'Transferred to PhonePe',
    amount: '',
    mode: 'UPI/Bank'
  });

  // Helpers for Dates
  const formatDateForDB = (date) => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatAsDDMMYY = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
  };

  // Main Calculation Function
  const fetchReportData = useCallback(async () => {
    setLoading(true);

    const startStr = formatDateForDB(startDate);
    const endStr = formatDateForDB(endDate);

    // 1. Fetch Expenses
    const { data: expData } = await supabase
      .from('expenses')
      .select('*')
      .gte('date', startStr)
      .lte('date', endStr)
      .order('date', { ascending: false });

    let tExpenses = 0;
    if (expData) {
      setExpenses(expData);
      expData.forEach(e => tExpenses += parseFloat(e.amount));
    }

    // 2. Fetch Withdrawals
    const { data: withData } = await supabase
      .from('owner_withdrawals')
      .select('*')
      .gte('date', startStr)
      .lte('date', endStr)
      .order('date', { ascending: false });

    let tWithdrawals = 0;
    if (withData) {
      setWithdrawals(withData);
      withData.forEach(w => tWithdrawals += parseFloat(w.amount));
    }

    // 3. Fetch Purchases
    const { data: purchData } = await supabase
      .from('purchases')
      .select('date, brand_id, quantity, total_amount')
      .gte('date', startStr)
      .lte('date', endStr);

    let tPurchases = 0;
    const purchaseMap = {}; 
    
    if (purchData) {
      purchData.forEach(p => {
        tPurchases += parseFloat(p.total_amount);
        const key = `${p.date}_${p.brand_id}`;
        purchaseMap[key] = (purchaseMap[key] || 0) + p.quantity;
      });
    }

    // 4. Fetch Brands (for fallback selling price)
    const { data: brandsData } = await supabase.from('brands').select('id, selling_price');
    const priceMap = {};
    if (brandsData) {
      brandsData.forEach(b => priceMap[b.id] = parseFloat(b.selling_price) || 0);
    }

    // 5. Fetch Daily Stock
    const { data: stockData } = await supabase
      .from('daily_stock')
      .select('*')
      .gte('date', startStr)
      .lte('date', endStr)
      .not('closing_balance', 'is', null); 

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

    // Set Final Summary
    const netProfit = tSales - tPurchases - tExpenses;
    setSummary({
      totalSales: tSales,
      totalPurchases: tPurchases,
      totalExpenses: tExpenses,
      netProfit: netProfit,
      totalWithdrawn: tWithdrawals,
      retainedCash: netProfit - tWithdrawals 
    });

    setLoading(false);
  }, [startDate, endDate]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchReportData();
  }, [fetchReportData]);

  // Handle Add Expense
  const handleAddExpense = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    const { error } = await supabase
      .from('expenses')
      .insert([{
        user_id: user.id,
        date: formatDateForDB(expenseForm.date),
        description: expenseForm.description,
        amount: parseFloat(expenseForm.amount)
      }]);

    if (error) {
      alert("Error adding expense: " + error.message);
    } else {
      setExpenseForm({ ...expenseForm, description: '', amount: '' });
      fetchReportData(); 
    }
    setIsSubmitting(false);
  };

  // Handle Add Withdrawal
  const handleAddWithdrawal = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    const { error } = await supabase
      .from('owner_withdrawals')
      .insert([{
        user_id: user.id,
        date: formatDateForDB(withdrawalForm.date),
        description: withdrawalForm.description,
        amount: parseFloat(withdrawalForm.amount),
        withdrawal_mode: withdrawalForm.mode
      }]);

    if (error) {
      alert("Error adding withdrawal: " + error.message);
    } else {
      setWithdrawalForm({ ...withdrawalForm, description: '', amount: '' });
      fetchReportData(); 
    }
    setIsSubmitting(false);
  };

  const inputClass = "w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all duration-300 text-sm";

  return (
    <div className="space-y-6 transition-colors duration-300">
      
      {/* DatePicker Global Styles */}
      <style>{`
        /* SEPARATE WRAPPER LOGIC FOR HEADER vs FORMS */
        .header-date-picker .react-datepicker-wrapper { display: inline-block; width: auto; }
        .form-date-picker .react-datepicker-wrapper { display: block; width: 100%; }

        .react-datepicker-popper { z-index: 99999 !important; }
        .react-datepicker { 
          background-color: #ffffff !important; 
          border: 1px solid #e2e8f0 !important; 
          border-radius: 1.25rem !important; 
          box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1) !important; 
          font-family: inherit !important; 
          padding: 0.75rem !important;
        }
        .react-datepicker__month-container { background-color: #ffffff !important; }
        .react-datepicker__header { 
          background-color: #ffffff !important; 
          border-bottom: 1px solid #f8fafc !important; 
        }
        .react-datepicker__current-month { 
          color: #1e293b; font-weight: 700; font-size: 1rem; margin-bottom: 1rem !important; 
        }
        .react-datepicker__header select {
          background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 0.5rem;
          padding: 0.25rem 0.5rem; font-weight: 600; color: #1e293b; cursor: pointer;
          margin: 0 0.25rem 0.75rem 0.25rem; outline: none;
        }
        .react-datepicker__day-name { color: #94a3b8 !important; font-weight: 600 !important; width: 2.25rem !important; margin: 0.1rem !important; }
        .react-datepicker__day { 
          color: #334155 !important; border-radius: 50% !important; width: 2.25rem !important;
          line-height: 2.25rem !important; transition: all 0.2s ease !important; margin: 0.1rem !important; background-color: transparent !important;
        }
        .react-datepicker__day:hover { background-color: #f1f5f9 !important; color: #0f172a !important; }
        .react-datepicker__day--selected { background-color: #2563eb !important; color: #ffffff !important; font-weight: 600 !important; }
        .react-datepicker__triangle { display: none !important; }

        /* Dark Mode Overrides */
        .dark .react-datepicker { background-color: #0f172a !important; border-color: #1e293b !important; }
        .dark .react-datepicker__month-container { background-color: #0f172a !important; }
        .dark .react-datepicker__header { background-color: #0f172a !important; border-color: #1e293b !important; }
        .dark .react-datepicker__current-month { color: #f8fafc !important; }
        .dark .react-datepicker__header select { background-color: #1e293b !important; color: #f8fafc !important; border-color: #334155 !important; }
        .dark .react-datepicker__day-name { color: #64748b !important; }
        .dark .react-datepicker__day { color: #cbd5e1 !important; }
        .dark .react-datepicker__day:hover { background-color: #1e293b !important; color: #f8fafc !important; }
        .dark .react-datepicker__day--selected { background-color: #3b82f6 !important; color: #ffffff !important; }
      `}</style>

      {/* Header & Date Range Slicer */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 relative z-60 transition-colors duration-300">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight flex items-center gap-2 transition-colors duration-300">
            <Wallet className="text-blue-500" /> Financial Analytics
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 transition-colors duration-300">Track P&L (Tax Safe) and Owner Cash Withdrawals.</p>
        </div>
        
        {/* Added .header-date-picker wrapper class here */}
        <div className="header-date-picker flex flex-row items-center gap-2 bg-slate-100/50 dark:bg-slate-900/50 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-inner transition-colors duration-300 w-fit">
          <DatePicker
            selected={startDate}
            onChange={(date) => setStartDate(date)}
            maxDate={new Date()}
            dateFormat="dd/MM/yy"
            customInput={<CustomDateInput />}
            showMonthDropdown
            showYearDropdown
            dropdownMode="select"
          />
          <span className="text-slate-400 dark:text-slate-500 font-medium px-1">to</span>
          <DatePicker
            selected={endDate}
            onChange={(date) => setEndDate(date)}
            minDate={startDate}
            maxDate={new Date()}
            dateFormat="dd/MM/yy"
            customInput={<CustomDateInput />}
            showMonthDropdown
            showYearDropdown
            dropdownMode="select"
          />
        </div>
      </div>

      {/* --- BUSINESS P&L CARDS --- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 transition-colors duration-300">
          <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wider">Gross Revenue</p>
          <h3 className="text-3xl font-black text-slate-800 dark:text-slate-100 transition-colors">₹{summary.totalSales.toLocaleString()}</h3>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 transition-colors duration-300">
          <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wider">Purchase Cost</p>
          <h3 className="text-3xl font-black text-slate-800 dark:text-slate-100 transition-colors">₹{summary.totalPurchases.toLocaleString()}</h3>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 transition-colors duration-300">
          <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wider">Business Expenses</p>
          <h3 className="text-3xl font-black text-slate-800 dark:text-slate-100 transition-colors">₹{summary.totalExpenses.toLocaleString()}</h3>
        </div>

        <div className={`p-6 rounded-2xl shadow-sm relative overflow-hidden group border transition-colors duration-300 ${summary.netProfit >= 0 ? 'bg-linear-to-br from-emerald-500 to-emerald-700 border-emerald-600' : 'bg-linear-to-br from-red-500 to-red-700 border-red-600'}`}>
           <div className="absolute right-0 top-0 opacity-20 transform translate-x-1/4 -translate-y-1/4">
            {summary.netProfit >= 0 ? <TrendingUp size={120} className="text-white"/> : <TrendingDown size={120} className="text-white"/>}
          </div>
          <p className="text-white/80 font-bold text-sm tracking-wider uppercase mb-2 relative z-10">Net Profit / Loss</p>
          <h3 className="text-4xl font-black text-white relative z-10">₹{summary.netProfit.toLocaleString()}</h3>
        </div>
      </div>

      {/* --- INTERNAL CASH FLOW TRACKER --- */}
      <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-6 transition-colors duration-300 relative z-10">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-100 dark:bg-blue-900/50 rounded-full text-blue-600 dark:text-blue-400">
            <Landmark size={24} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Owner Withdrawals</h3>
            <p className="text-2xl font-black text-slate-800 dark:text-slate-100">₹{summary.totalWithdrawn.toLocaleString()}</p>
          </div>
        </div>
        <div className="h-10 w-px bg-blue-200 dark:bg-blue-800 hidden sm:block"></div>
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emerald-100 dark:bg-emerald-900/50 rounded-full text-emerald-600 dark:text-emerald-400">
            <IndianRupee size={24} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Cash Left In Drawer</h3>
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">₹{summary.retainedCash.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* --- TOGGLE FORMS & LEDGERS --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10">
        
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 h-fit overflow-hidden transition-colors duration-300">
          <div className="flex border-b border-slate-100 dark:border-slate-800">
            <button onClick={() => setActiveTab('expense')} className={`flex-1 py-4 text-sm font-bold text-center transition-colors ${activeTab === 'expense' ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-b-2 border-red-600' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>Business Expense</button>
            <button onClick={() => setActiveTab('withdrawal')} className={`flex-1 py-4 text-sm font-bold text-center transition-colors ${activeTab === 'withdrawal' ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>Owner Withdrawal</button>
          </div>

          <div className="p-6">
            {activeTab === 'expense' ? (
              <form onSubmit={handleAddExpense} className="space-y-4 animate-in fade-in zoom-in duration-200">
                <div className="form-date-picker">
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Date</label>
                  <DatePicker
                    selected={expenseForm.date}
                    onChange={(date) => setExpenseForm({ ...expenseForm, date })}
                    dateFormat="dd/MM/yy"
                    className={inputClass}
                    showMonthDropdown
                    showYearDropdown
                    dropdownMode="select"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Description</label>
                  <input type="text" required value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} className={inputClass} placeholder="e.g., Light Bill" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Amount (₹)</label>
                  <input type="number" required min="1" step="any" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} className={inputClass} placeholder="0.00" />
                </div>
                <button type="submit" disabled={isSubmitting} className="w-full mt-2 bg-red-600 text-white font-medium py-2.5 rounded-xl hover:bg-red-700 transition-colors flex items-center justify-center gap-2">
                  <Plus size={18}/> Add Expense
                </button>
              </form>
            ) : (
              <form onSubmit={handleAddWithdrawal} className="space-y-4 animate-in fade-in zoom-in duration-200">
                <div className="form-date-picker">
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Date</label>
                  <DatePicker
                    selected={withdrawalForm.date}
                    onChange={(date) => setWithdrawalForm({ ...withdrawalForm, date })}
                    dateFormat="dd/MM/yy"
                    className={inputClass}
                    showMonthDropdown
                    showYearDropdown
                    dropdownMode="select"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Description</label>
                  <input type="text" required value={withdrawalForm.description} onChange={(e) => setWithdrawalForm({ ...withdrawalForm, description: e.target.value })} className={inputClass} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Amount (₹)</label>
                    <input type="number" required min="1" value={withdrawalForm.amount} onChange={(e) => setWithdrawalForm({ ...withdrawalForm, amount: e.target.value })} className={inputClass} placeholder="0.00" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Mode</label>
                    <select value={withdrawalForm.mode} onChange={(e) => setWithdrawalForm({ ...withdrawalForm, mode: e.target.value })} className={inputClass}>
                      <option value="UPI/Bank">UPI/Bank</option>
                      <option value="Cash">Cash</option>
                    </select>
                  </div>
                </div>
                <button type="submit" disabled={isSubmitting} className="w-full mt-2 bg-indigo-600 text-white font-medium py-2.5 rounded-xl hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2">
                  <ArrowDownCircle size={18} /> Record Withdrawal
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden h-fit flex flex-col transition-colors duration-300">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
               {activeTab === 'expense' ? <Receipt size={18} className="text-red-500"/> : <Landmark size={18} className="text-indigo-500"/>}
               {activeTab === 'expense' ? 'Expenses Ledger' : 'Withdrawals Ledger'}
            </h3>
          </div>
          
          <div className="overflow-x-auto flex-1 max-h-125 custom-scrollbar">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead className="bg-white dark:bg-slate-900 text-slate-400 font-semibold uppercase text-xs tracking-wider sticky top-0 border-b border-slate-100 dark:border-slate-800 z-10">
                <tr>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Description</th>
                  {activeTab === 'withdrawal' && <th className="px-6 py-4 text-center">Mode</th>}
                  <th className="px-6 py-4 text-right">Amount (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr><td colSpan={activeTab === 'withdrawal' ? 4 : 3} className="px-6 py-12 text-center text-slate-400">Calculating...</td></tr>
                ) : (activeTab === 'expense' ? expenses : withdrawals).length === 0 ? (
                  <tr><td colSpan={activeTab === 'withdrawal' ? 4 : 3} className="px-6 py-12 text-center text-slate-400">No records found for this period.</td></tr>
                ) : (
                  (activeTab === 'expense' ? expenses : withdrawals).map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">{formatAsDDMMYY(row.date)}</td>
                      <td className="px-6 py-4 font-medium text-slate-800 dark:text-slate-100">{row.description}</td>
                      {activeTab === 'withdrawal' && (
                        <td className="px-6 py-4 text-center">
                          <span className={`px-2 py-1 text-[10px] font-bold uppercase rounded-md ${row.withdrawal_mode === 'Cash' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-500' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                            {row.withdrawal_mode}
                          </span>
                        </td>
                      )}
                      <td className={`px-6 py-4 text-right font-bold ${activeTab === 'expense' ? 'text-red-600 dark:text-red-400' : 'text-indigo-600 dark:text-indigo-400'}`}>
                        ₹{parseFloat(row.amount).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}