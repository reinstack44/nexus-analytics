import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { 
  Settings as SettingsIcon, AlertTriangle, Lock, Trash2, CheckCircle2, 
  ShieldAlert, X, CreditCard, Calendar, ShieldCheck, Sparkles, RefreshCw, AlertCircle
} from 'lucide-react';

export default function Settings() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Subscription State
  const [subscription, setSubscription] = useState(null);
  const [subLoading, setSubLoading] = useState(true);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancellingSub, setCancellingSub] = useState(false);

  // Database Wipe State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const fetchSubscription = useCallback(async () => {
    if (!user) {
      setSubLoading(false);
      return;
    }
    setSubLoading(true);
    const { data } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single();

    setSubscription(data || null);
    setSubLoading(false);
  }, [user]);

  useEffect(() => {
    let isMounted = true;
    const executeFetch = async () => {
      await Promise.resolve();
      if (isMounted) {
        fetchSubscription();
      }
    };
    executeFetch();
    return () => {
      isMounted = false;
    };
  }, [fetchSubscription]);

  const handleCancelSubscription = async () => {
    setCancellingSub(true);
    try {
      const { error } = await supabase
        .from('user_subscriptions')
        .update({
          status: 'canceled',
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);

      if (error) throw error;

      setIsCancelModalOpen(false);
      setSuccessMessage(t('settings.cancelSuccess', 'Subscription cancelled successfully.'));
      await fetchSubscription();
      setTimeout(() => {
        navigate('/subscription');
      }, 1500);
    } catch (err) {
      alert('Cancellation failed: ' + err.message);
    } finally {
      setCancellingSub(false);
    }
  };

  const openResetModal = () => {
    setPassword('');
    setErrorMessage('');
    setIsModalOpen(true);
  };

  const closeResetModal = () => {
    if (loading) return;
    setIsModalOpen(false);
    setPassword('');
    setErrorMessage('');
  };

  const handleResetDatabase = async (e) => {
    e.preventDefault();
    if (!password) {
      setErrorMessage(t('settings.passwordLabel', 'Enter your account password to confirm'));
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      // 1. Re-authenticate user with entered password
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: password,
      });

      if (authError) {
        setErrorMessage(t('settings.wrongPassword', 'Authentication failed: Password does not match.'));
        setLoading(false);
        return;
      }

      // 2. Cascade delete all user-scoped tables
      await Promise.all([
        supabase.from('daily_stock').delete().eq('user_id', user.id),
        supabase.from('expenses').delete().eq('user_id', user.id),
        supabase.from('owner_withdrawals').delete().eq('user_id', user.id),
        supabase.from('trader_transactions').delete().eq('user_id', user.id),
        supabase.from('traders').delete().eq('user_id', user.id),
        supabase.from('holidays').delete().eq('user_id', user.id),
        supabase.from('locked_ranges').delete().eq('user_id', user.id),
        supabase.from('brand_price_history').delete().eq('user_id', user.id),
        supabase.from('brands').delete().eq('user_id', user.id)
      ]);

      // 3. Clear transient storage
      sessionStorage.removeItem('global_startDate');
      sessionStorage.removeItem('global_endDate');
      sessionStorage.removeItem('dailyStock_startDate');
      sessionStorage.removeItem('dailyStock_endDate');
      sessionStorage.removeItem('profitLoss_startDate');
      sessionStorage.removeItem('profitLoss_endDate');
      sessionStorage.removeItem('mc_selectedMonth');

      setIsModalOpen(false);
      setSuccessMessage(t('settings.successMsg', 'All account data has been successfully deleted.'));
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    } catch (err) {
      setErrorMessage(err.message || 'An unexpected error occurred during database wipe.');
    } finally {
      setLoading(false);
    }
  };

  const isSubActive = subscription && subscription.status === 'active' && new Date(subscription.current_period_end) > new Date();

  return (
    <div className="space-y-6 transition-colors duration-300">
      
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
            <SettingsIcon className="text-blue-500" /> {t('settings.title', 'Account & System Settings')}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            {t('settings.description', 'Manage your system preferences and data lifecycle.')}
          </p>
        </div>

        <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 px-5 py-3 rounded-2xl border border-slate-100 dark:border-slate-800">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl text-blue-600 dark:text-blue-400">
            <Lock size={20} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active User</p>
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">{user?.email}</h4>
          </div>
        </div>
      </div>

      {successMessage && (
        <div className="flex items-center gap-2 p-4 rounded-2xl bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 size={20} />
          <span className="font-semibold">{successMessage}</span>
        </div>
      )}

      {/* ========================================================= */}
      {/* SECTION 1: SUBSCRIPTION MANAGEMENT (ABOVE DANGER ZONE)     */}
      {/* ========================================================= */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-linear-to-r from-blue-50/50 to-indigo-50/50 dark:from-slate-800/40 dark:to-slate-800/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-xl">
              <CreditCard size={22} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                {t('settings.subTitle', 'Subscription Management')}
                {isSubActive && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
                    Active
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                {t('settings.subDesc', 'View your current active plan details, renewal schedule, and manage subscription access.')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('/subscription')}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 w-fit cursor-pointer"
          >
            <Sparkles size={14} />
            {t('settings.renewButton', 'Upgrade / Renew Plan')}
          </button>
        </div>

        <div className="p-6 sm:p-8">
          {subLoading ? (
            <div className="flex items-center justify-center py-8 text-slate-400 text-sm font-medium">
              <RefreshCw className="animate-spin mr-2" size={18} /> Loading subscription details...
            </div>
          ) : isSubActive ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                    {t('settings.planLabel', 'Current Active Plan')}
                  </p>
                  <h4 className="text-lg font-black text-slate-800 dark:text-slate-100 mt-1 capitalize">
                    {subscription.plan_type === 'monthly' ? 'Monthly Pro (₹1,499)' : 'Annual Enterprise (₹14,999)'}
                  </h4>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                    {t('settings.renewsOnLabel', 'Valid / Renews On')}
                  </p>
                  <h4 className="text-lg font-black text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-1.5">
                    <Calendar size={18} />
                    {new Date(subscription.current_period_end).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </h4>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                    {t('settings.amountPaidLabel', 'Amount Paid')}
                  </p>
                  <h4 className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-1">
                    ₹{parseFloat(subscription.amount_paid || 0).toLocaleString('en-IN')}
                  </h4>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                    {t('settings.paymentIdLabel', 'Transaction ID')}
                  </p>
                  <h4 className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 mt-2 truncate" title={subscription.razorpay_payment_id}>
                    {subscription.razorpay_payment_id || 'N/A'}
                  </h4>
                </div>

              </div>

              {/* Cancellation Notice and Action */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-start gap-2.5 text-xs text-amber-700 dark:text-amber-400 max-w-xl">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>
                    <strong>Non-Refundable Policy:</strong> Subscriptions remain fully operational until canceled. Any cancellation is immediate and non-refundable.
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setIsCancelModalOpen(true)}
                  className="px-4 py-2.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/60 rounded-xl text-xs font-bold transition-colors cursor-pointer w-fit shrink-0"
                >
                  {t('settings.cancelSubButton', 'Cancel Subscription')}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <div className="p-3 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-full mb-3">
                <ShieldCheck size={28} />
              </div>
              <h4 className="text-base font-bold text-slate-800 dark:text-slate-200">
                {t('settings.noActiveSub', 'No active subscription found. Upgrade your account to unlock all features.')}
              </h4>
              <button
                type="button"
                onClick={() => navigate('/subscription')}
                className="mt-4 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-all shadow-md cursor-pointer"
              >
                {t('settings.renewButton', 'Upgrade / Renew Plan')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* SECTION 2: DANGER ZONE                                     */}
      {/* ========================================================= */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-red-200 dark:border-red-900/40 overflow-hidden">
        <div className="p-6 border-b border-red-100 dark:border-red-900/30 bg-red-50/40 dark:bg-red-950/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 rounded-xl">
              <ShieldAlert size={22} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-red-950 dark:text-red-300">
                {t('settings.dangerZone', 'Danger Zone')}
              </h3>
              <p className="text-xs text-red-700/70 dark:text-red-400/70 font-medium">
                {t('settings.dangerZoneDesc', 'Irreversible actions regarding your account and operational data.')}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-xl">
            <h4 className="text-base font-bold text-slate-800 dark:text-slate-100">
              {t('settings.resetTitle', 'Factory Reset & Wipe All Data')}
            </h4>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              {t('settings.resetDesc', 'Permanently delete all brands, daily stock, expenses, trader accounts, price histories, and ledger records for your account.')}
            </p>
          </div>

          <button
            type="button"
            onClick={openResetModal}
            className="shrink-0 px-6 py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer"
          >
            <Trash2 size={18} />
            {t('settings.resetButton', 'Reset & Wipe Data')}
          </button>
        </div>
      </div>

      {/* NON-REFUNDABLE CANCELLATION MODAL */}
      {isCancelModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-200 overflow-hidden">
            
            <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800 bg-red-50/50 dark:bg-red-950/30">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 rounded-xl">
                  <AlertTriangle size={20} />
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {t('settings.cancelSubConfirmTitle', 'Cancel Active Subscription?')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(false)}
                disabled={cancellingSub}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg outline-none cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 rounded-xl p-4 text-xs font-semibold text-red-800 dark:text-red-300 leading-relaxed">
                {t('settings.cancelSubWarning', 'Notice: Subscription cancellations are strictly NON-REFUNDABLE. You will immediately lose access to premium daily stock reconciliations and reports once canceled.')}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCancelModalOpen(false)}
                  disabled={cancellingSub}
                  className="flex-1 px-4 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  {t('common.cancel', 'Keep My Subscription')}
                </button>
                <button
                  type="button"
                  onClick={handleCancelSubscription}
                  disabled={cancellingSub}
                  className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  {cancellingSub ? t('settings.cancelling', 'Cancelling...') : t('settings.confirmCancelButton', 'Confirm Cancel')}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* COMPLETE DATABASE RESET MODAL (PASSWORD PROTECTED) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-200 overflow-hidden">
            
            <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800 bg-red-50/50 dark:bg-red-950/30">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 rounded-xl">
                  <AlertTriangle size={20} />
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {t('settings.modalTitle', 'Confirm Complete Data Wipe')}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeResetModal}
                disabled={loading}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg outline-none cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleResetDatabase} className="p-6 space-y-5">
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-xl p-4 text-xs font-semibold text-red-800 dark:text-red-300 leading-relaxed">
                {t('settings.modalWarning', 'This action is permanent and cannot be undone. All your inventory, sales, expenses, and ledgers will be permanently deleted from the cloud database.')}
              </div>

              {errorMessage && (
                <div className="flex items-start gap-2 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 p-3 rounded-xl text-xs font-semibold">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-2">
                  {t('settings.passwordLabel', 'Enter your account password to confirm')}
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                    <Lock size={16} />
                  </span>
                  <input
                    type="password"
                    required
                    autoFocus
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all text-sm font-semibold"
                    placeholder={t('settings.passwordPlaceholder', '••••••••')}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeResetModal}
                  disabled={loading}
                  className="flex-1 px-4 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={loading || !password}
                  className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Trash2 size={16} />
                  {loading ? t('settings.wiping', 'Wiping Database...') : t('settings.wipeButton', 'Permanently Wipe')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}