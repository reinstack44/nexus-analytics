import { useState, useEffect, useCallback, forwardRef } from 'react';
import { supabase } from '../../config/supabaseClient';
import { IndianRupee, TrendingUp, ShoppingCart, Receipt, Trophy, BarChart3, Calendar, ChevronDown, Users } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { useTheme } from '../../context/ThemeContext';

const CustomDateInput = forwardRef(({ value, onClick, placeholder }, ref) => (
  <button
    type="button"
    onClick={onClick}
    ref={ref}
    className="flex items-center px-4 py-2 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-all duration-200 text-sm font-semibold text-slate-700 dark:text-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-500/50"
  >
    <Calendar size={16} className="text-blue-500 mr-2" />
    {value || placeholder}
    <ChevronDown size={14} className="text-slate-400 dark:text-slate-500 ml-3 shrink-0" />
  </button>
));
CustomDateInput.displayName = "CustomDateInput";

export default function Dashboard() {
  const { theme } = useTheme(); 
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  const parseDBDate = (str) => {
    if (!str) return new Date();
    const [y, m, d] = str.split('-');
    return new Date(y, m - 1, d);
  };

  const formatDateForDB = (date) => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // एकीकृत साझा कीज़ (Unified Session Storage)
  const [startDate, setStartDate] = useState(() => {
    const saved = sessionStorage.getItem('global_startDate');
    return saved ? new Date(saved) : new Date();
  });
  const [endDate, setEndDate] = useState(() => {
    const saved = sessionStorage.getItem('global_endDate');
    return saved ? new Date(saved) : new Date();
  });

  useEffect(() => {
    if (startDate) sessionStorage.setItem('global_startDate', startDate.toISOString());
    if (endDate) sessionStorage.setItem('global_endDate', endDate.toISOString());
  }, [startDate, endDate]);

  // रीयल-टाइम डेटाबेस लिसनर
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_stock' }, () => setRefreshTrigger(prev => prev + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => setRefreshTrigger(prev => prev + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchases' }, () => setRefreshTrigger(prev => prev + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'brands' }, () => setRefreshTrigger(prev => prev + 1))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const [stats, setStats] = useState({
    revenue: 0,
    bottlesSold: 0,
    totalPurchases: 0,
    totalExpenses: 0
  });
  
  const [chartData, setChartData] = useState([]);
  const [topBrands, setTopBrands] = useState([]);
  const [traderSummary, setTraderSummary] = useState([]);
  const [loading, setLoading] = useState(true);

  const handleStartDateChange = (date) => {
    setStartDate(date);
    if (date) sessionStorage.setItem('global_startDate', date.toISOString());
  };

  const handleEndDateChange = (date) => {
    setEndDate(date);
    if (date) sessionStorage.setItem('global_endDate', date.toISOString());
  };

  const fetchDashboardData = useCallback(async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    
    const startStr = formatDateForDB(startDate);
    const endStr = formatDateForDB(endDate);

    try {
      const [
        { data: brandsData },
        { data: purchasesData },
        { data: expensesData },
        { data: stockData }
      ] = await Promise.all([
        supabase.from('brands').select('id, brand_name, selling_price, mrp_price'),
        supabase.from('purchases').select('date, brand_id, quantity, total_amount, traders(trader_name)').gte('date', startStr).lte('date', endStr),
        supabase.from('expenses').select('amount').gte('date', startStr).lte('date', endStr),
        supabase.from('daily_stock').select('*').gte('date', startStr).lte('date', endStr + 'T23:59:59').order('date', { ascending: true })
      ]);

      const brandMap = {};
      brandsData?.forEach(b => brandMap[b.id] = b);

      let tPurchases = 0;
      const tSummaryMap = {};
      purchasesData?.forEach(p => {
        tPurchases += parseFloat(p.total_amount) || 0;
        const traderName = p.traders?.trader_name || 'Unknown';
        if (!tSummaryMap[traderName]) tSummaryMap[traderName] = { qty: 0, amount: 0 };
        tSummaryMap[traderName].qty += p.quantity;
        tSummaryMap[traderName].amount += parseFloat(p.total_amount);
      });

      let tExpenses = 0;
      expensesData?.forEach(e => tExpenses += parseFloat(e.amount) || 0);

      // मानक FIFO सेल्स सिमुलेशन इंजन
      let tRevenue = 0;
      let tBottles = 0;
      const salesByDate = {};
      const brandSalesMap = {};

      const prevClosings = {};
      const { data: beforeStock } = await supabase.from('daily_stock').select('*').lt('date', startStr).order('date', { ascending: false });
      beforeStock?.forEach(s => {
        if (prevClosings[s.brand_id] === undefined && s.closing_balance !== null) {
          prevClosings[s.brand_id] = { closing_balance: parseInt(s.closing_balance), price: s.unit_price ? parseFloat(s.unit_price) : null };
        }
      });

      const stockByDate = {};
      stockData?.forEach(s => {
        const sDate = parseDBDate(s.date);
        if (sDate) {
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

          const state = runningStates[brand.id] || { closing: 0, price: parseFloat(brand.selling_price) };
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

            tRevenue += sAmt;
            tBottles += sQty;

            if (!salesByDate[date]) salesByDate[date] = 0;
            salesByDate[date] += sAmt;

            if (!brandSalesMap[brand.brand_name]) brandSalesMap[brand.brand_name] = 0;
            brandSalesMap[brand.brand_name] += sQty;

            runningStates[brand.id] = { closing: closing, price: pPrice };
          }
        });
      });

      const formattedChartData = Object.keys(salesByDate).map(date => {
        const d = parseDBDate(date);
        return {
          name: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          revenue: salesByDate[date]
        };
      });

      const top5 = Object.entries(brandSalesMap)
        .map(([name, qty]) => ({ name, qty }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);

      const traderArray = Object.entries(tSummaryMap)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.amount - a.amount);

      setStats({
        revenue: tRevenue,
        bottlesSold: tBottles,
        totalPurchases: tPurchases,
        totalExpenses: tExpenses
      });
      
      setChartData(formattedChartData);
      setTopBrands(top5);
      setTraderSummary(traderArray);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  // एसिंक्रोनस प्रॉमिस रैपर जो ESLint की "setState-in-effect" त्रुटि को दूर करता है
  useEffect(() => {
    let isMounted = true;
    const executeFetch = async () => {
      await Promise.resolve();
      if (isMounted) {
        fetchDashboardData();
      }
    };
    executeFetch();
    return () => { isMounted = false; };
  }, [fetchDashboardData, refreshTrigger]);

  if (loading && !chartData.length) {
    return (
      <div className="flex flex-col justify-center items-center h-[70vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
        <p className="text-slate-500 dark:text-slate-400 font-medium animate-pulse">Syncing Business Data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-8 transition-colors duration-300">
      <style>{`
        .react-datepicker-wrapper { display: block; }
        .react-datepicker-popper { z-index: 99999 !important; }
        .react-datepicker { 
          background-color: #ffffff !important; border: 1px solid #e2e8f0 !important; 
          border-radius: 1.25rem !important; box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1) !important; 
          font-family: inherit !important; padding: 0.75rem !important; overflow: hidden;
        }
        .react-datepicker__month-container { background-color: #ffffff !important; }
        .react-datepicker__header { 
          background-color: #ffffff !important; border-bottom: 1px solid #f8fafc !important; 
          padding-top: 0.25rem !important;
        }
        .react-datepicker__current-month { 
          color: #1e293b; font-weight: 700; font-size: 1rem; margin-bottom: 1rem !important; 
        }
        .react-datepicker__header select {
          background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 0.5rem;
          padding: 0.25rem 0.5rem; font-weight: 600; color: #1e293b; outline: none;
          cursor: pointer; margin: 0 0.25rem 0.75rem 0.25rem;
        }
        .react-datepicker__header select:focus { border-color: #3b82f6; }
        .react-datepicker__day-name { color: #94a3b8 !important; font-weight: 600 !important; width: 2.25rem !important; margin: 0.1rem !important; }
        .react-datepicker__day { 
          color: #334155 !important; border-radius: 50% !important; width: 2.25rem !important;
          line-height: 2.25rem !important; transition: all 0.2s ease !important; margin: 0.1rem !important; background-color: transparent !important;
        }
        .react-datepicker__day:hover { background-color: #f1f5f9 !important; color: #0f172a !important; }
        .react-datepicker__day--selected, .react-datepicker__day--keyboard-selected { 
          background-color: #2563eb !important; color: #ffffff !important; font-weight: 600 !important; 
          box-shadow: 0 4px 6px -1px rgb(37 99 235 / 0.4) !important;
        }
        .react-datepicker__triangle { display: none !important; }

        .dark .react-datepicker { background-color: #0f172a !important; border-color: #1e293b !important; }
        .dark .react-datepicker__month-container { background-color: #0f172a !important; }
        .dark .react-datepicker__header { background-color: #0f172a !important; border-color: #1e293b !important; }
        .dark .react-datepicker__current-month { color: #f8fafc !important; }
        .dark .react-datepicker__header select { background-color: #1e293b !important; color: #f8fafc !important; border-color: #334155 !important; }
        .dark .react-datepicker__day-name { color: #64748b !important; }
        .dark .react-datepicker__day { color: #cbd5e1 !important; }
        .dark .react-datepicker__day:hover { background-color: #1e293b !important; color: #f8fafc !important; }
        .dark .react-datepicker__day--selected, .dark .react-datepicker__day--keyboard-selected { background-color: #3b82f6 !important; color: #ffffff !important; }
      `}</style>

      {/* HEADER WITH SLICER */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 relative z-50">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-white tracking-tight">Executive Dashboard</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm sm:text-base">Real-time overview filtered by your selected timeline.</p>
        </div>
        
        <div className="flex items-center gap-2 bg-white/60 dark:bg-slate-900/60 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm backdrop-blur-sm relative z-50">
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
          <span className="text-slate-400 font-semibold px-1">to</span>
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
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
        
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group relative overflow-hidden">
          {loading && <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm z-10 flex items-center justify-center"><div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div></div>}
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wider">Revenue (Sales)</p>
              <h3 className="text-3xl font-black text-slate-800 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">₹{stats.revenue.toLocaleString()}</h3>
            </div>
            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl text-emerald-500 dark:text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-colors duration-300">
              <IndianRupee size={24} strokeWidth={2.5} />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group relative overflow-hidden">
          {loading && <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm z-10 flex items-center justify-center"><div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div></div>}
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wider">Bottles Sold</p>
              <h3 className="text-3xl font-black text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{stats.bottlesSold.toLocaleString()}</h3>
            </div>
            <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-xl text-blue-500 dark:text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300">
              <TrendingUp size={24} strokeWidth={2.5} />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wider">Total Purchases</p>
              <h3 className="text-3xl font-black text-slate-800 dark:text-slate-100 group-hover:text-amber-500 transition-colors">₹{stats.totalPurchases.toLocaleString()}</h3>
            </div>
            <div className="p-3 bg-amber-50 dark:bg-amber-900/30 rounded-xl text-amber-500 dark:text-amber-400 group-hover:bg-amber-500 group-hover:text-white transition-colors duration-300">
              <ShoppingCart size={24} strokeWidth={2.5} />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wider">Total Expenses</p>
              <h3 className="text-3xl font-black text-slate-800 dark:text-slate-100 group-hover:text-red-500 transition-colors">₹{stats.totalExpenses.toLocaleString()}</h3>
            </div>
            <div className="p-3 bg-red-50 dark:bg-red-900/30 rounded-xl text-red-500 dark:text-red-400 group-hover:bg-red-500 group-hover:text-white transition-colors duration-300">
              <Receipt size={24} strokeWidth={2.5} />
            </div>
          </div>
        </div>

      </div>

      {/* Middle Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10">
        
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 relative overflow-hidden">
          {loading && <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm z-10"></div>}
          <div className="flex items-center gap-2 mb-6">
            <BarChart3 size={20} className="text-blue-500" />
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Sales Trend (Revenue)</h3>
          </div>
          
          <div className="h-75 w-full">
            {chartData.length === 0 && !loading ? (
               <div className="h-full flex items-center justify-center text-slate-400 font-medium">No sales recorded (Ensure closing stock is entered).</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={theme === 'dark' ? 0.4 : 0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} tickFormatter={(value) => `₹${value}`} dx={-10} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: '1px solid ' + (theme === 'dark' ? '#1e293b' : '#f1f5f9'), backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff', color: theme === 'dark' ? '#f8fafc' : '#0f172a', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value) => [`₹${value.toLocaleString()}`, 'Revenue']}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col relative overflow-hidden">
          {loading && <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm z-10"></div>}
          <div className="flex items-center gap-2 mb-6">
            <Trophy size={20} className="text-amber-500" />
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Top Brands Sold</h3>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {topBrands.length === 0 && !loading ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">No sales data for this period.</div>
            ) : (
              <div className="space-y-4">
                {topBrands.map((brand, index) => (
                  <div key={index} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border border-transparent hover:border-slate-100 dark:hover:border-slate-700">
                    <div className="flex items-center gap-3">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm ${index === 0 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 shadow-sm' : index === 1 ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shadow-sm' : index === 2 ? 'bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 shadow-sm' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}>
                        #{index + 1}
                      </div>
                      <span className="font-semibold text-slate-700 dark:text-slate-200">{brand.name}</span>
                    </div>
                    <span className="font-bold text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-lg text-sm">{brand.qty} Units</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden transition-all duration-300 relative z-10">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg">
              <Users size={20} className="text-indigo-500 dark:text-indigo-400" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Trader Purchases Summary</h3>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
            <thead className="bg-slate-50/50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-semibold uppercase text-xs tracking-wider">
              <tr>
                <th className="px-6 py-4">Trader Name</th>
                <th className="px-6 py-4 text-center">Total Quantity Bought</th>
                <th className="px-6 py-4 text-right">Total Amount Billed (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {traderSummary.length === 0 ? (
                <tr>
                  <td colSpan="3" className="px-6 py-10 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <p className="text-slate-600 dark:text-slate-400 font-medium text-base">No purchases recorded for selected dates.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                traderSummary.map((trader, index) => (
                  <tr key={index} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4 font-semibold text-slate-800 dark:text-slate-100">{trader.name}</td>
                    <td className="px-6 py-4 text-center font-bold text-slate-700 dark:text-slate-300">{trader.qty} Units</td>
                    <td className="px-6 py-4 text-right font-black text-orange-600 dark:text-orange-400">
                      ₹{trader.amount.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}