import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../config/supabaseClient';
import { Users, Plus, FileText, Calendar, Wallet, ArrowRightLeft, Edit2, Trash2, X } from 'lucide-react'; // Trash2 import kiya gaya hai

export default function PurchaseManager() {
  const [activeTab, setActiveTab] = useState('ledger'); 
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Data States
  const [traders, setTraders] = useState([]);
  const [selectedTraderId, setSelectedTraderId] = useState('');
  const [ledgerRows, setStockLedgerRows] = useState([]);

  // Modal States for Transaction Editing
  const [isEditTxModalOpen, setIsEditTxModalOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState(null);
  const [editTxForm, setEditTxForm] = useState({
    date: '',
    purchaseAmount: '',
    paidAmount: '',
    manualRemaining: ''
  });

  // Forms States
  const [traderForm, setTraderForm] = useState({
    name: ''
  });
  
  const [ledgerForm, setLedgerForm] = useState({
    date: new Date().toISOString().split('T')[0],
    purchaseAmount: '',
    paidAmount: '',
    manualRemaining: '', 
  });

  // Fetch Traders Master List
  const fetchTraders = useCallback(async () => {
    setLoading(true);
    const { data: tData } = await supabase.from('traders').select('*').order('trader_name', { ascending: true });
    if (tData) {
      setTraders(tData);
      if (tData.length > 0 && !selectedTraderId) {
        setSelectedTraderId(tData[0].id);
      }
    }
    setLoading(false);
  }, [selectedTraderId]);

  // Fetch Chronological Account Ledger for selected Trader
  const fetchTraderLedger = useCallback(async () => {
    if (!selectedTraderId) return;
    setLoading(true);

    const { data: transactions } = await supabase
      .from('trader_transactions')
      .select('*')
      .eq('trader_id', selectedTraderId)
      .order('date', { ascending: true })
      .order('created_at', { ascending: true });

    const computedLedger = [];
    let currentRemaining = 0; 

    if (transactions) {
      transactions.forEach(tx => {
        const pAmt = parseFloat(tx.purchase_amount) || 0;
        const paidAmt = parseFloat(tx.paid_amount) || 0;
        
        if (tx.manual_remaining !== null && tx.manual_remaining !== undefined) {
          currentRemaining = parseFloat(tx.manual_remaining);
        } else {
          currentRemaining = currentRemaining + pAmt - paidAmt;
        }

        computedLedger.push({
          id: tx.id,
          date: tx.date,
          purchase_amount: pAmt,
          paid_amount: paidAmt,
          manual_remaining: tx.manual_remaining,
          remaining_amount: currentRemaining
        });
      });
    }

    setStockLedgerRows(computedLedger);
    setLoading(false);
  }, [selectedTraderId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTraders();
  }, [fetchTraders]);

  useEffect(() => {
    if (selectedTraderId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchTraderLedger();
    }
  }, [selectedTraderId, fetchTraderLedger]);

  // Add New Trader Action
  const handleAddTrader = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const { error } = await supabase.from('traders').insert([{ 
      trader_name: traderForm.name
    }]);

    if (error) {
      alert("Error: " + error.message);
    } else {
      setTraderForm({ name: '' });
      fetchTraders();
    }
    setIsSubmitting(false);
  };

  // Save Transaction Log
  const handleAddLedgerEntry = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    const pAmt = ledgerForm.purchaseAmount === '' ? 0 : parseFloat(ledgerForm.purchaseAmount) || 0;
    const paidAmt = ledgerForm.paidAmount === '' ? 0 : parseFloat(ledgerForm.paidAmount) || 0;
    const manualRem = ledgerForm.manualRemaining === '' ? null : parseFloat(ledgerForm.manualRemaining);

    const { error } = await supabase.from('trader_transactions').insert([{
      date: ledgerForm.date,
      trader_id: selectedTraderId,
      purchase_amount: pAmt,
      paid_amount: paidAmt,
      manual_remaining: manualRem
    }]);

    if (error) {
      alert("Error: " + error.message);
    } else {
      setLedgerForm({ ...ledgerForm, purchaseAmount: '', paidAmount: '', manualRemaining: '' });
      fetchTraderLedger();
    }
    setIsSubmitting(false);
  };

  // --- DELETE TRANSACTION LOGIC ---
  const handleDeleteTx = async (txId) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this transaction entry?");
    if (!confirmDelete) return;

    setIsSubmitting(true);
    const { error } = await supabase
      .from('trader_transactions')
      .delete()
      .eq('id', txId);

    if (error) {
      alert("Error deleting transaction: " + error.message);
    } else {
      fetchTraderLedger(); // Refresh table after deletion
    }
    setIsSubmitting(false);
  };

  // --- OPEN EDIT TRANSACTION MODAL ---
  const handleEditTxClick = (tx) => {
    setSelectedTx(tx);
    setEditTxForm({
      date: tx.date,
      purchaseAmount: tx.purchase_amount === 0 ? '' : tx.purchase_amount,
      paidAmount: tx.paid_amount === 0 ? '' : tx.paid_amount,
      manualRemaining: tx.manual_remaining !== null && tx.manual_remaining !== undefined ? tx.manual_remaining : ''
    });
    setIsEditTxModalOpen(true);
  };

  // --- SUBMIT TRANSACTION UPDATES ---
  const handleEditTxSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    const updatedPAmt = editTxForm.purchaseAmount === '' ? 0 : parseFloat(editTxForm.purchaseAmount) || 0;
    const updatedPaidAmt = editTxForm.paidAmount === '' ? 0 : parseFloat(editTxForm.paidAmount) || 0;
    const updatedManualRem = editTxForm.manualRemaining === '' ? null : parseFloat(editTxForm.manualRemaining);

    const { error } = await supabase
      .from('trader_transactions')
      .update({
        date: editTxForm.date,
        purchase_amount: updatedPAmt,
        paid_amount: updatedPaidAmt,
        manual_remaining: updatedManualRem
      })
      .eq('id', selectedTx.id);

    if (error) {
      alert("Error updating ledger entry: " + error.message);
    } else {
      setIsEditTxModalOpen(false);
      fetchTraderLedger();
    }
    
    setIsSubmitting(false);
  };

  const inputClass = "w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all duration-300 text-sm";

  return (
    <div className="space-y-6 transition-colors duration-300">
      
      {/* Tabs Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">Traders & Account Ledgers</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Track financial transaction histories, credits, and remaining balance sheets.</p>
        </div>
        
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 w-fit">
          <button 
            onClick={() => setActiveTab('ledger')}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${activeTab === 'ledger' ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
          >
            <ArrowRightLeft size={16} /> Account Ledger
          </button>
          <button 
            onClick={() => setActiveTab('traders')}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${activeTab === 'traders' ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
          >
            <Users size={16} /> Manage Traders
          </button>
        </div>
      </div>

      {/* ================= LEDGER TAB ================= */}
      {activeTab === 'ledger' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
          
          {/* Form Side */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 h-fit">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-5 flex items-center gap-2 border-b border-slate-50 dark:border-slate-800 pb-4">
              <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                <Wallet size={18} />
              </div>
              Record Transaction
            </h3>
            
            <form onSubmit={handleAddLedgerEntry} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Select Trader</label>
                <select value={selectedTraderId} onChange={(e) => setSelectedTraderId(e.target.value)} className={inputClass} required>
                  <option value="" disabled>-- Choose Registered Trader --</option>
                  {traders.map(t => <option key={t.id} value={t.id}>{t.trader_name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5"><Calendar size={12} className="inline mr-1" /> Transaction Date</label>
                <input type="date" required value={ledgerForm.date} onChange={(e) => setLedgerForm({ ...ledgerForm, date: e.target.value })} className={inputClass} />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Purchase Amount (₹) <span className="text-slate-400 font-normal text-[10px]">(Optional)</span></label>
                <input type="number" min="0" value={ledgerForm.purchaseAmount} onChange={(e) => setLedgerForm({ ...ledgerForm, purchaseAmount: e.target.value })} className={inputClass} placeholder="0" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Paid Amount (₹) <span className="text-slate-400 font-normal text-[10px]">(Optional)</span></label>
                <input type="number" min="0" value={ledgerForm.paidAmount} onChange={(e) => setLedgerForm({ ...ledgerForm, paidAmount: e.target.value })} className={inputClass} placeholder="0" />
              </div>

              <div className="border-t border-dashed border-slate-200 dark:border-slate-800 pt-3">
                <label className="block text-xs font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-wider mb-1.5">Direct Remaining Amount (₹) <span className="text-slate-400 font-normal text-[10px]">(Optional)</span></label>
                <input type="number" min="0" value={ledgerForm.manualRemaining} onChange={(e) => setLedgerForm({ ...ledgerForm, manualRemaining: e.target.value })} className={`${inputClass} border-indigo-200 dark:border-indigo-900/60 focus:ring-indigo-500`} placeholder="Set custom balance" />
              </div>

              <button type="submit" disabled={isSubmitting || !selectedTraderId} className="w-full mt-2 bg-blue-600 text-white font-medium py-2.5 px-4 rounded-xl hover:bg-blue-700 transition-all duration-300 disabled:opacity-50 flex justify-center items-center gap-2 shadow-sm">
                Save Ledger Entry
              </button>
            </form>
          </div>

          {/* Table Ledger Display */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden h-fit flex flex-col">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <FileText size={18} className="text-slate-400 dark:text-slate-500" />
                Statement Account Ledger
              </h3>
            </div>
            
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50/80 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-semibold uppercase text-xs tracking-wider border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4 text-center">Purchase Amount</th>
                    <th className="px-6 py-4 text-center">Paid Amount</th>
                    <th className="px-6 py-4 text-center text-indigo-600 dark:text-indigo-400">Remaining Balance</th>
                    <th className="px-4 py-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <tr><td colSpan="5" className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">Compiling account nodes...</td></tr>
                  ) : ledgerRows.length === 0 ? (
                    <tr><td colSpan="5" className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">No transactions recorded for this trader yet.</td></tr>
                  ) : (
                    ledgerRows.map((row) => (
                      <tr key={row.id} className="transition-colors duration-200 hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                        <td className="px-6 py-4 font-medium whitespace-nowrap">
                          {new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-6 py-4 text-center font-semibold text-red-600 dark:text-red-400">
                          {row.purchase_amount > 0 ? `₹${row.purchase_amount.toLocaleString()}` : '-'}
                        </td>
                        <td className="px-6 py-4 text-center font-semibold text-emerald-600 dark:text-emerald-400">
                          {row.paid_amount > 0 ? `₹${row.paid_amount.toLocaleString()}` : '-'}
                        </td>
                        <td className="px-6 py-4 text-center font-black text-slate-900 dark:text-white bg-slate-50/30 dark:bg-slate-950/20 text-base">
                          ₹{row.remaining_amount.toLocaleString()}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button 
                              onClick={() => handleEditTxClick(row)}
                              title="Edit Entry" 
                              className="p-1.5 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors outline-none"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button 
                              onClick={() => handleDeleteTx(row.id)}
                              title="Delete Entry" 
                              className="p-1.5 text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors outline-none"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================= EDIT TRANSACTION MODAL ================= */}
      {isEditTxModalOpen && (
        <div className="fixed inset-0 z-100 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center p-5 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Edit2 size={18} className="text-blue-500" /> Edit Ledger Entry
              </h3>
              <button onClick={() => setIsEditTxModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 outline-none"><X size={20} /></button>
            </div>
            
            <form onSubmit={handleEditTxSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Transaction Date</label>
                <input type="date" required value={editTxForm.date} onChange={(e) => setEditTxForm({ ...editTxForm, date: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Purchase Amount (₹)</label>
                <input type="number" min="0" value={editTxForm.purchaseAmount} onChange={(e) => setEditTxForm({ ...editTxForm, purchaseAmount: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Paid Amount (₹)</label>
                <input type="number" min="0" value={editTxForm.paidAmount} onChange={(e) => setEditTxForm({ ...editTxForm, paidAmount: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-wider mb-1.5">Direct Remaining Amount Override (₹)</label>
                <input type="number" min="0" value={editTxForm.manualRemaining} onChange={(e) => setEditTxForm({ ...editTxForm, manualRemaining: e.target.value })} className={inputClass} placeholder="Leave empty for auto math" />
              </div>
              
              <button type="submit" disabled={isSubmitting} className="w-full mt-2 bg-blue-600 text-white font-medium py-2.5 rounded-xl hover:bg-blue-700 transition-colors">
                {isSubmitting ? 'Updating...' : 'Update Transaction'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ================= TRADERS TAB ================= */}
      {activeTab === 'traders' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 h-fit">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-5 flex items-center gap-2 border-b border-slate-50 dark:border-slate-800 pb-4">
              <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
                <Users size={18} />
              </div>
              Add New Trader
            </h3>
            <form onSubmit={handleAddTrader} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Trader Name / Agency</label>
                <input type="text" required value={traderForm.name} onChange={(e) => setTraderForm({...traderForm, name: e.target.value})} className={inputClass} placeholder="e.g., Sai Traders" />
              </div>
              <button type="submit" disabled={isSubmitting} className="w-full mt-2 bg-indigo-600 text-white font-medium py-2.5 px-4 rounded-xl hover:bg-indigo-700 transition-all duration-300 flex justify-center items-center gap-2 shadow-sm">
                <Plus size={18} /> Register Trader
              </button>
            </form>
          </div>

          <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden h-fit flex flex-col">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Users size={18} className="text-slate-400 dark:text-slate-500" /> Registered Traders
              </h3>
            </div>
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50/80 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-semibold uppercase text-xs tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Trader Name</th>
                    <th className="px-6 py-4 text-right">Registered On</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {traders.length === 0 ? (
                    <tr><td colSpan="2" className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">No traders registered.</td></tr>
                  ) : (
                    traders.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-6 py-4 font-bold text-slate-800 dark:text-slate-100">{t.trader_name}</td>
                        <td className="px-6 py-4 text-right">{new Date(t.created_at).toLocaleDateString('en-IN')}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}