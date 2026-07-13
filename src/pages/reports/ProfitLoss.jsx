import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { Calendar, Wallet, Landmark, IndianRupee } from 'lucide-react';

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

  // Forms State
  const [expenseForm, setExpenseForm] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    amount: ''
  });

  const [withdrawalForm, setWithdrawalForm] = useState({
    date: new Date().toISOString().split('T')[0],
    description: 'Transferred to PhonePe',
    amount: '',
    mode: 'UPI/Bank'
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

    // 2. Fetch Withdrawals in Date Range
    const { data: withData } = await supabase
      .from('owner_withdrawals')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false });

    let tWithdrawals = 0;
    if (withData) {
      setWithdrawals(withData);
      withData.forEach(w => tWithdrawals += parseFloat(w.amount));
    }

    // 3. Fetch Purchases in Date Range
    const { data: purchData } = await supabase
      .from('purchases')
      .select('date, brand_id, quantity, total_amount')
      .gte('date', startDate)
      .lte('date', endDate);

    let tPurchases = 0;
    const purchaseMap = {}; 
    
    if (purchData) {
      purchData.forEach(p => {
        tPurchases += parseFloat(p.total_amount);
        const key = `${p.date}_${p.brand_id}`;
        purchaseMap[key] = (purchaseMap[key] || 0) + p.quantity;
      });
    }

    // 4. Fetch Brands (for selling price)
    const { data: brandsData } = await supabase.from('brands').select('id, selling_price');
    const priceMap = {};
    if (brandsData) {
      brandsData.forEach(b => priceMap[b.id] = parseFloat(b.selling_price) || 0);
    }

    // 5. Fetch Daily Stock in Date Range
    const { data: stockData } = await supabase
      .from('daily_stock')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
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
        date: expenseForm.date,
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
        date: withdrawalForm.date,
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
      
      {/* Header & Date Range Slicer */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 relative z-10 transition-colors duration-300">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight flex items-center gap-2 transition-colors duration-300">
            <Wallet className="text-blue-500" /> Financial Analytics
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 transition-colors duration-300">Track P&L (Tax Safe) and Owner Cash Withdrawals.</p>
        </div>
        
        <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 transition-colors duration-300">
          <div className="flex items-center gap-2 px-2">
            <Calendar size={16} className="text-slate-500 dark:text-slate-400" />
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent border-none outline-none text-slate-800 dark:text-slate-200 text-sm font-semibold cursor-pointer"
            />
          </div>
          <span className="text-slate-400 font-bold">to</span>
          <div className="flex items-center gap-2 px-2">
            <Calendar size={16} className="text-slate-500 dark:text-slate-400" />
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent border-none outline-none text-slate-800 dark:text-slate-200 text-sm font-semibold cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* --- BUSINESS P&L CARDS --- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
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
          <p className="text-white/80 font-bold text-sm tracking-wider uppercase mb-2 relative z-10">Net Profit / Loss</p>
          <h3 className="text-4xl font-black text-white relative z-10">₹{summary.netProfit.toLocaleString()}</h3>
        </div>
      </div>

      {/* --- INTERNAL CASH FLOW TRACKER --- */}
      <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-6 transition-colors duration-300">
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 h-fit overflow-hidden transition-colors duration-300">
          <div className="flex border-b border-slate-100 dark:border-slate-800">
            <button onClick={() => setActiveTab('expense')} className={`flex-1 py-4 text-sm font-bold text-center ${activeTab === 'expense' ? 'bg-red-50 dark:bg-red-900/20 text-red-600 border-b-2 border-red-600' : 'text-slate-500'}`}>Business Expense</button>
            <button onClick={() => setActiveTab('withdrawal')} className={`flex-1 py-4 text-sm font-bold text-center ${activeTab === 'withdrawal' ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500'}`}>Owner Withdrawal</button>
          </div>

          <div className="p-6">
            {activeTab === 'expense' ? (
              <form onSubmit={handleAddExpense} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Date</label>
                  <input type="date" required value={expenseForm.date} onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Description</label>
                  <input type="text" required value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} className={inputClass} placeholder="e.g., Light Bill" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Amount (₹)</label>
                  <input type="number" required min="1" step="any" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} className={inputClass} />
                </div>
                <button type="submit" disabled={isSubmitting} className="w-full mt-2 bg-red-600 text-white font-medium py-2.5 rounded-xl hover:bg-red-700">Add Expense</button>
              </form>
            ) : (
              <form onSubmit={handleAddWithdrawal} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Date</label>
                  <input type="date" required value={withdrawalForm.date} onChange={(e) => setWithdrawalForm({ ...withdrawalForm, date: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Description</label>
                  <input type="text" required value={withdrawalForm.description} onChange={(e) => setWithdrawalForm({ ...withdrawalForm, description: e.target.value })} className={inputClass} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Amount</label>
                    <input type="number" required min="1" value={withdrawalForm.amount} onChange={(e) => setWithdrawalForm({ ...withdrawalForm, amount: e.target.value })} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Mode</label>
                    <select value={withdrawalForm.mode} onChange={(e) => setWithdrawalForm({ ...withdrawalForm, mode: e.target.value })} className={inputClass}>
                      <option value="UPI/Bank">UPI/Bank</option>
                      <option value="Cash">Cash</option>
                    </select>
                  </div>
                </div>
                <button type="submit" disabled={isSubmitting} className="w-full mt-2 bg-indigo-600 text-white font-medium py-2.5 rounded-xl hover:bg-indigo-700">Record Withdrawal</button>
              </form>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden h-fit flex flex-col transition-colors duration-300">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{activeTab === 'expense' ? 'Expenses Ledger' : 'Withdrawals Ledger'}</h3>
          </div>
          
          <div className="overflow-x-auto flex-1 max-h-125 custom-scrollbar">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead className="bg-white dark:bg-slate-900 text-slate-400 font-semibold uppercase text-xs tracking-wider sticky top-0 border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Description</th>
                  <th className="px-6 py-4 text-right">Amount (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr><td colSpan="3" className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">Calculating...</td></tr>
                ) : (activeTab === 'expense' ? expenses : withdrawals).length === 0 ? (
                  <tr><td colSpan="3" className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">No records found for this period.</td></tr>
                ) : (
                  (activeTab === 'expense' ? expenses : withdrawals).map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                      <td className="px-6 py-4">{new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                      <td className="px-6 py-4 font-medium">{row.description}</td>
                      <td className="px-6 py-4 text-right font-bold text-slate-800 dark:text-slate-100">₹{parseFloat(row.amount).toLocaleString()}</td>
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