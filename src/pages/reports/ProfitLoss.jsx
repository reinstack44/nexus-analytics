import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { TrendingUp, TrendingDown, Receipt, Calendar, Plus, Wallet, FileText } from 'lucide-react';

export default function ProfitLoss() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Date Range State (Default: Current Month)
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const lastDay = today.toISOString().split('T')[0];
  
  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(lastDay);

  // Data States
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState({
    totalSales: 0,
    totalPurchases: 0,
    totalExpenses: 0,
    netProfit: 0
  });

  // Expense Form State
  const [expenseForm, setExpenseForm] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    amount: ''
  });

  // Main Calculation Function
  const fetchReportData = useCallback(async () => {
    setLoading(true);

    // 1. Fetch Expenses in Date Range
    const { data: expData } = await supabase
      .from('expenses')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false });

    let tExpenses = 0;
    if (expData) {
      setExpenses(expData);
      expData.forEach(e => tExpenses += parseFloat(e.amount));
    }

    // 2. Fetch Purchases in Date Range
    const { data: purchData } = await supabase
      .from('purchases')
      .select('date, brand_id, quantity, total_amount')
      .gte('date', startDate)
      .lte('date', endDate);

    let tPurchases = 0;
    const purchaseMap = {}; // Format: { "YYYY-MM-DD_brandId": qty }
    
    if (purchData) {
      purchData.forEach(p => {
        tPurchases += parseFloat(p.total_amount);
        const key = `${p.date}_${p.brand_id}`;
        purchaseMap[key] = (purchaseMap[key] || 0) + p.quantity;
      });
    }

    // 3. Fetch Brands (for selling price)
    const { data: brandsData } = await supabase.from('brands').select('id, selling_price');
    const priceMap = {};
    if (brandsData) {
      brandsData.forEach(b => priceMap[b.id] = parseFloat(b.selling_price) || 0);
    }

    // 4. Fetch Daily Stock in Date Range to calculate Sales Revenue
    const { data: stockData } = await supabase
      .from('daily_stock')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .not('closing_balance', 'is', null); // Sirf wo jinki closing entry ho chuki hai

    let tSales = 0;
    if (stockData) {
      stockData.forEach(stock => {
        const key = `${stock.date}_${stock.brand_id}`;
        const purchQty = purchaseMap[key] || 0;
        const openBal = parseInt(stock.opening_balance) || 0;
        const closeBal = parseInt(stock.closing_balance) || 0;
        
        // Formula: Open + Purchase - Close = Sale Qty
        let saleQty = openBal + purchQty - closeBal;
        saleQty = saleQty < 0 ? 0 : saleQty; // Safety check

        const sellingPrice = priceMap[stock.brand_id] || 0;
        tSales += (saleQty * sellingPrice);
      });
    }

    // Set Final Summary
    setSummary({
      totalSales: tSales,
      totalPurchases: tPurchases,
      totalExpenses: tExpenses,
      netProfit: tSales - tPurchases - tExpenses
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
        date: expenseForm.date,
        description: expenseForm.description,
        amount: parseFloat(expenseForm.amount)
      }]);

    if (error) {
      alert("Error adding expense: " + error.message);
    } else {
      setExpenseForm({ ...expenseForm, description: '', amount: '' });
      fetchReportData(); // Refresh summary and list
    }
    setIsSubmitting(false);
  };

  const inputClass = "w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all duration-300 text-sm";

  return (
    <div className="space-y-6 transition-colors duration-300">
      
      {/* Header & Date Range Slicer */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 relative z-10">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
            <Wallet className="text-blue-500" /> P&L Statement
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Track your financial health and expenses.</p>
        </div>
        
        <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 px-2">
            <Calendar size={16} className="text-slate-500" />
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent border-none outline-none text-slate-800 dark:text-slate-200 text-sm font-semibold cursor-pointer"
            />
          </div>
          <span className="text-slate-400 font-bold">to</span>
          <div className="flex items-center gap-2 px-2">
            <Calendar size={16} className="text-slate-500" />
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent border-none outline-none text-slate-800 dark:text-slate-200 text-sm font-semibold cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 relative overflow-hidden group">
          <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wider">Generated Revenue</p>
          <h3 className="text-3xl font-black text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
            ₹{summary.totalSales.toLocaleString()}
          </h3>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 relative overflow-hidden group">
          <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wider">Purchase Cost</p>
          <h3 className="text-3xl font-black text-slate-800 dark:text-slate-100 group-hover:text-orange-500 dark:group-hover:text-orange-400 transition-colors">
            ₹{summary.totalPurchases.toLocaleString()}
          </h3>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 relative overflow-hidden group">
          <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wider">Total Expenses</p>
          <h3 className="text-3xl font-black text-slate-800 dark:text-slate-100 group-hover:text-red-500 dark:group-hover:text-red-400 transition-colors">
            ₹{summary.totalExpenses.toLocaleString()}
          </h3>
        </div>

        <div className={`p-6 rounded-2xl shadow-sm relative overflow-hidden group border ${summary.netProfit >= 0 ? 'bg-linear-to-br from-emerald-500 to-emerald-700 border-emerald-600' : 'bg-linear-to-br from-red-500 to-red-700 border-red-600'}`}>
          <div className="absolute right-0 top-0 opacity-20 transform translate-x-1/4 -translate-y-1/4">
            {summary.netProfit >= 0 ? <TrendingUp size={120} className="text-white"/> : <TrendingDown size={120} className="text-white"/>}
          </div>
          <p className="text-white/80 font-bold text-sm tracking-wider uppercase mb-2 relative z-10">Net Profit / Loss</p>
          <h3 className="text-4xl font-black text-white relative z-10">
            ₹{summary.netProfit.toLocaleString()}
          </h3>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Side: Add Expense Form */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 h-fit">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-5 flex items-center gap-2 border-b border-slate-50 dark:border-slate-800 pb-4">
            <div className="p-2 bg-red-50 dark:bg-red-900/30 rounded-lg text-red-600 dark:text-red-400">
              <Receipt size={18} />
            </div>
            Record Expense
          </h3>
          
          <form onSubmit={handleAddExpense} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5"><Calendar size={12} className="inline mr-1" /> Date</label>
              <input type="date" required value={expenseForm.date} onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })} className={inputClass} />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5"><FileText size={12} className="inline mr-1" /> Description / Reason</label>
              <input type="text" required value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} className={inputClass} placeholder="e.g., Light Bill, Chai/Nashta..." />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Amount (₹)</label>
              <input type="number" required min="1" step="any" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} className={inputClass} placeholder="0.00" />
            </div>

            <button type="submit" disabled={isSubmitting} className="w-full mt-2 bg-red-600 text-white font-medium py-2.5 px-4 rounded-xl hover:bg-red-700 focus:ring-4 focus:ring-red-100 dark:focus:ring-red-900 transition-all duration-300 disabled:opacity-50 flex justify-center items-center gap-2 shadow-sm">
              <Plus size={18} />
              {isSubmitting ? 'Saving...' : 'Add Expense'}
            </button>
          </form>
        </div>

        {/* Right Side: Expense Ledger */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden h-fit flex flex-col">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <FileText size={18} className="text-slate-400 dark:text-slate-500" />
              Expense Ledger (Filtered)
            </h3>
          </div>
          
          <div className="overflow-x-auto flex-1 max-h-100 custom-scrollbar">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50/80 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-semibold uppercase text-xs tracking-wider sticky top-0 backdrop-blur-md">
                <tr>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Description</th>
                  <th className="px-6 py-4 text-right">Amount (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr><td colSpan="3" className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">Calculating...</td></tr>
                ) : expenses.length === 0 ? (
                  <tr><td colSpan="3" className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">No expenses recorded for this period.</td></tr>
                ) : (
                  expenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        {new Date(exp.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-800 dark:text-slate-100">
                        {exp.description}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-red-600 dark:text-red-400">
                        ₹{parseFloat(exp.amount).toLocaleString()}
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