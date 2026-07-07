import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { Package, Calendar, Save, Calculator, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function DailyStock() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);

  // Date selection (Default is today)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Main Data State
  const [stockRows, setStockRows] = useState([]);
  const [dailySummary, setDailySummary] = useState({ totalSalesQty: 0, totalRevenue: 0 });

  const fetchDailyData = useCallback(async () => {
    setLoading(true);
    setSaveMessage(null);

    // Calculate Yesterday's Date safely
    const [year, month, day] = selectedDate.split('-').map(Number);
    const prevDate = new Date(year, month - 1, day - 1);
    const prevDateStr = prevDate.getFullYear() + '-' + 
                      String(prevDate.getMonth() + 1).padStart(2, '0') + '-' + 
                      String(prevDate.getDate()).padStart(2, '0');

    // Fetch All Brands
    const { data: brandsData } = await supabase.from('brands').select('*').order('brand_name', { ascending: true });
    
    // Fetch Saved Daily Stock for Today
    const { data: stockData } = await supabase
      .from('daily_stock')
      .select('*')
      .eq('date', selectedDate);

    // Fetch Saved Daily Stock for Yesterday (To get base opening)
    const { data: prevStockData } = await supabase
      .from('daily_stock')
      .select('*')
      .eq('date', prevDateStr);

    if (brandsData) {
      const stockMap = {};
      if (stockData) {
        stockData.forEach(s => {
          stockMap[s.brand_id] = s;
        });
      }

      const prevStockMap = {};
      if (prevStockData) {
        prevStockData.forEach(s => {
          prevStockMap[s.brand_id] = s;
        });
      }

      let totalQty = 0;
      let totalRev = 0;

      const rows = brandsData.map(brand => {
        const existingStock = stockMap[brand.id];
        const prevStock = prevStockMap[brand.id];
        
        // 1. Base Opening hamesha Kal (Yesterday) ka Closing rahega. (Agar closing nahi hai, toh opening uthayega)
        let baseOpening = 0;
        if (prevStock && prevStock.closing_balance !== null && prevStock.closing_balance !== undefined) {
          baseOpening = prevStock.closing_balance;
        } else if (prevStock && prevStock.opening_balance !== null && prevStock.opening_balance !== undefined) {
          baseOpening = prevStock.opening_balance;
        }

        // 2. Aaj ka Opening and Purchase Qty Calculation
        let purchaseQty = 0; 
        let opening = baseOpening;

        // Agar database me aaj ka record already save hai
        if (existingStock && existingStock.opening_balance !== null && existingStock.opening_balance !== undefined) {
          opening = existingStock.opening_balance;
          // Purchase Qty ko reverse-calculate kar lenge (Saved Total - Base Opening)
          purchaseQty = opening - baseOpening;
          if (purchaseQty < 0) purchaseQty = 0; // Sanity check for negative bugs
        }

        const closing = existingStock?.closing_balance !== null && existingStock?.closing_balance !== undefined ? existingStock.closing_balance : ''; 
        
        let salesQty = 0;
        let salesAmount = 0;
        if (closing !== '') {
          salesQty = opening - parseInt(closing);
          salesQty = salesQty < 0 ? 0 : salesQty; 
          salesAmount = salesQty * brand.selling_price;
          
          totalQty += salesQty;
          totalRev += salesAmount;
        }

        return {
          brand_id: brand.id,
          brand_name: brand.brand_name,
          bottle_size: brand.bottle_size,
          selling_price: brand.selling_price,
          base_opening: baseOpening, // Permanent hold for yesterday's stock
          purchase_qty: purchaseQty, // Now dynamically populated if data exists
          opening_balance: opening,
          closing_balance: closing,
          sales_qty: salesQty,
          sales_amount: salesAmount,
        };
      });

      setStockRows(rows);
      setDailySummary({ totalSalesQty: totalQty, totalRevenue: totalRev });
    }
    
    setLoading(false);
  }, [selectedDate]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDailyData();
  }, [fetchDailyData]);

  // Handle Input Changes with Auto-Sum Logic
  const handleInputChange = (brandId, field, value) => {
    const numericValue = value === '' ? '' : parseInt(value) || 0;

    setStockRows(prevRows => {
      const updatedRows = prevRows.map(row => {
        if (row.brand_id === brandId) {
          const updatedRow = { ...row, [field]: numericValue };
          
          // Agar user ne purchase qty box me badlav kiya hai
          if (field === 'purchase_qty') {
            const currentPurchase = value === '' ? 0 : parseInt(value) || 0;
            // Formula: Opening Balance = Base Opening + Manual Purchases Qty
            updatedRow.opening_balance = updatedRow.base_opening + currentPurchase;
          }

          // Dynamic Sales Quantity and Amount Calculation
          if (updatedRow.closing_balance !== '') {
            let sQty = updatedRow.opening_balance - parseInt(updatedRow.closing_balance);
            sQty = sQty < 0 ? 0 : sQty;
            updatedRow.sales_qty = sQty;
            updatedRow.sales_amount = sQty * updatedRow.selling_price;
          } else {
            updatedRow.sales_qty = 0;
            updatedRow.sales_amount = 0;
          }
          return updatedRow;
        }
        return row;
      });

      // Recalculate Top Metric Cards
      let tQty = 0;
      let tRev = 0;
      updatedRows.forEach(r => {
        tQty += r.sales_qty;
        tRev += r.sales_amount;
      });
      setDailySummary({ totalSalesQty: tQty, totalRevenue: tRev });

      return updatedRows;
    });
  };

  const handleSaveStock = async () => {
    setIsSaving(true);
    setSaveMessage(null);

    const upsertData = stockRows.map(row => ({
      user_id: user.id,
      date: selectedDate,
      brand_id: row.brand_id,
      opening_balance: parseInt(row.opening_balance) || 0,
      closing_balance: row.closing_balance === '' ? null : parseInt(row.closing_balance),
    }));

    const { error } = await supabase
      .from('daily_stock')
      .upsert(upsertData, { onConflict: 'date, brand_id, user_id' });

    if (error) {
      setSaveMessage({ type: 'error', text: 'Failed to save stock: ' + error.message });
    } else {
      setSaveMessage({ type: 'success', text: 'Stock ledger updated successfully!' });
      setTimeout(() => setSaveMessage(null), 3000);
    }
    
    setIsSaving(false);
  };

  const inputClass = "w-24 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all duration-300 text-sm text-center font-semibold";

  return (
    <div className="space-y-6 transition-colors duration-300 relative">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
            <Package className="text-blue-500" /> Daily Stock Ledger
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Reconcile opening stock, purchases, and closing stock to generate sales.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700">
            <Calendar size={18} className="text-slate-500 dark:text-slate-400 ml-1" />
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent border-none outline-none text-slate-800 dark:text-slate-100 font-bold text-sm cursor-pointer"
            />
          </div>
          
          <button 
            onClick={handleSaveStock}
            disabled={isSaving}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900 transition-all shadow-sm disabled:opacity-50"
          >
            <Save size={18} /> {isSaving ? 'Saving...' : 'Save Ledger'}
          </button>
        </div>
      </div>

      {saveMessage && (
        <div className={`flex items-center gap-2 p-4 rounded-xl border ${saveMessage.type === 'success' ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'} animate-in fade-in slide-in-from-top-2`}>
          {saveMessage.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <span className="font-semibold">{saveMessage.text}</span>
        </div>
      )}

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="bg-linear-to-br from-indigo-500 to-indigo-700 p-6 rounded-2xl shadow-sm text-white relative overflow-hidden group">
          <div className="absolute right-0 top-0 opacity-10 transform translate-x-1/4 -translate-y-1/4"><Calculator size={120} /></div>
          <p className="text-indigo-100 font-medium text-sm tracking-wider uppercase mb-2 relative z-10">Total Sales Qty (Auto)</p>
          <h3 className="text-4xl font-black relative z-10">{dailySummary.totalSalesQty} <span className="text-lg font-medium opacity-80">Units</span></h3>
        </div>

        <div className="bg-linear-to-br from-emerald-500 to-emerald-700 p-6 rounded-2xl shadow-sm text-white relative overflow-hidden group">
          <div className="absolute right-0 top-0 opacity-10 transform translate-x-1/4 -translate-y-1/4"><Calculator size={120} /></div>
          <p className="text-emerald-100 font-medium text-sm tracking-wider uppercase mb-2 relative z-10">Generated Revenue (Auto)</p>
          <h3 className="text-4xl font-black relative z-10">₹{dailySummary.totalRevenue.toLocaleString()}</h3>
        </div>
      </div>

      {/* Main Calculation Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
            <thead className="bg-slate-50/80 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-semibold uppercase text-[11px] tracking-wider border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-6 py-4">Brand Details</th>
                <th className="px-4 py-4 text-center">Opening Bal.<br/><span className="text-slate-400 dark:text-slate-500 text-[10px] font-normal">(Auto-Sum)</span></th>
                <th className="px-4 py-4 text-center">Purchases Qty<br/><span className="text-slate-400 dark:text-slate-500 text-[10px] font-normal">(Manual Input)</span></th>
                <th className="px-4 py-4 text-center">Closing Bal.<br/><span className="text-slate-400 dark:text-slate-500 text-[10px] font-normal">(Input)</span></th>
                <th className="px-4 py-4 text-center text-indigo-600 dark:text-indigo-400">Sale Qty<br/><span className="text-slate-400 dark:text-slate-500 text-[10px] font-normal">(Auto)</span></th>
                <th className="px-6 py-4 text-right text-emerald-600 dark:text-emerald-400">Sale Amount<br/><span className="text-slate-400 dark:text-slate-500 text-[10px] font-normal">(Auto)</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr><td colSpan="6" className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">Syncing stock data...</td></tr>
              ) : stockRows.length === 0 ? (
                <tr><td colSpan="6" className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">No brands found. Go to Brand Master to add items.</td></tr>
              ) : (
                stockRows.map((row) => (
                  <tr key={row.brand_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-800 dark:text-slate-100">{row.brand_name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{row.bottle_size} | ₹{row.selling_price} rate</div>
                    </td>
                    
                    {/* Opening Balance Cell with Permanent Green breakdown math tag */}
                    <td className="px-4 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {row.purchase_qty > 0 && (
                          <span className="text-xs font-bold text-green-600 dark:text-green-400 whitespace-nowrap">
                            {row.base_opening} + {row.purchase_qty} →
                          </span>
                        )}
                        <input 
                          type="number" 
                          readOnly
                          value={row.opening_balance} 
                          className={`${inputClass} bg-slate-100 dark:bg-slate-800/80 cursor-not-allowed`}
                        />
                      </div>
                    </td>
                    
                    {/* Purchases Qty Column */}
                    <td className="px-4 py-4 text-center">
                      <input 
                        type="number"
                        min="0"
                        placeholder="0"
                        value={row.purchase_qty === 0 ? '' : row.purchase_qty}
                        onChange={(e) => handleInputChange(row.brand_id, 'purchase_qty', e.target.value)}
                        className={`${inputClass} border-emerald-300 dark:border-emerald-800 focus:ring-emerald-500 font-bold`}
                      />
                    </td>
                    
                    {/* Closing Balance (Input) */}
                    <td className="px-4 py-4 text-center">
                      <input 
                        type="number" 
                        min="0"
                        placeholder="Qty"
                        value={row.closing_balance} 
                        onChange={(e) => handleInputChange(row.brand_id, 'closing_balance', e.target.value)}
                        className={`${inputClass} border-blue-300 dark:border-blue-700 bg-blue-50/30 dark:bg-blue-900/10 focus:ring-blue-500`}
                      />
                    </td>
                    
                    {/* Sale Qty (Auto Calculated) */}
                    <td className="px-4 py-4 text-center font-black text-indigo-600 dark:text-indigo-400 text-lg">
                      {row.closing_balance === '' ? '-' : row.sales_qty}
                    </td>
                    
                    {/* Sale Amount (Auto Calculated) */}
                    <td className="px-6 py-4 text-right font-black text-emerald-600 dark:text-emerald-400 text-lg">
                      {row.closing_balance === '' ? '-' : `₹${row.sales_amount.toLocaleString()}`}
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