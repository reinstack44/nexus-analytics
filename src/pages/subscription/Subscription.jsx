import { useState, useEffect } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useModal } from '../../context/ModalContext';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Check, Sparkles, Zap, Lock, LogOut, ArrowRight, Loader2 } from 'lucide-react';
import logoImg from '../../assets/nx diary logo.png';

export default function Subscription() {
  const { user } = useAuth();
  const { showAlert } = useModal();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [selectedPlan, setSelectedPlan] = useState('monthly');
  const [loading, setLoading] = useState(false);
  const [activeSub, setActiveSub] = useState(null);

  useEffect(() => {
    async function checkExistingSubscription() {
      if (!user) return;
      const { data } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (data && new Date(data.current_period_end) > new Date() && data.status === 'active') {
        setActiveSub(data);
      }
    }
    checkExistingSubscription();
  }, [user]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const handleSubscribe = async () => {
    if (!window.Razorpay) {
      showAlert({ title: "SDK Error", message: "Razorpay SDK failed to load. Please check your internet connection.", type: "error" });
      return;
    }

    setLoading(true);

    const isMonthly = selectedPlan === 'monthly';
    const amountInRupees = isMonthly ? 1499 : 14999;
    const amountInPaise = amountInRupees * 100;
    const planName = isMonthly ? t('subscription.monthlyBilling', 'Monthly Pro Plan') : t('subscription.annualBilling', 'Annual Enterprise Plan');

    const razorpayKey = import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_placeholder';

    const options = {
      key: razorpayKey,
      amount: amountInPaise,
      currency: 'INR',
      name: 'Nexus Diary',
      description: `Subscription: ${planName}`,
      image: logoImg,
      prefill: {
        email: user?.email || '',
        contact: '',
      },
      notes: {
        plan_type: selectedPlan,
        user_id: user?.id,
      },
      theme: {
        color: '#2563eb',
        backdrop_color: '#030510',
      },
      modal: {
        confirm_close: true,
        ondismiss: function () {
          setLoading(false);
        },
      },
      handler: async function (response) {
        try {
          const startDate = new Date();
          const endDate = new Date();
          if (isMonthly) {
            endDate.setMonth(endDate.getMonth() + 1);
          } else {
            endDate.setFullYear(endDate.getFullYear() + 1);
          }

          const subscriptionPayload = {
            user_id: user.id,
            plan_type: selectedPlan,
            status: 'active',
            current_period_start: startDate.toISOString(),
            current_period_end: endDate.toISOString(),
            razorpay_payment_id: response.razorpay_payment_id || `pay_${Date.now()}`,
            amount_paid: amountInRupees,
            updated_at: new Date().toISOString(),
          };

          const { error } = await supabase
            .from('user_subscriptions')
            .upsert([subscriptionPayload], { onConflict: 'user_id' });

          if (error) throw error;

          showAlert({
            title: "Payment Successful",
            message: `${planName} is now active on your account.`,
            type: "success",
            onClose: () => navigate('/', { replace: true })
          });
        } catch (err) {
          showAlert({ title: "Activation Failed", message: "Payment succeeded but activating account failed: " + err.message, type: "error" });
        } finally {
          setLoading(false);
        }
      },
    };

    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', function (response) {
      showAlert({ title: "Payment Failed", message: response.error?.description || "Transaction declined", type: "error" });
      setLoading(false);
    });
    rzp.open();
  };

  return (
    <div className="min-h-screen bg-[#030510] text-slate-100 flex flex-col justify-between p-4 sm:p-8 relative overflow-hidden font-sans">
      
      {/* Background Lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-120 h-120 bg-blue-600/10 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="absolute bottom-10 left-10 w-80 h-80 bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none"></div>

      {/* Top Navigation */}
      <div className="max-w-6xl w-full mx-auto flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <img src={logoImg} alt="NX Diary Logo" className="h-10 w-auto object-contain" />
          <span className="font-black tracking-widest text-lg uppercase text-white">Nexus Diary</span>
        </div>

        <div className="flex items-center gap-4">
          <span className="hidden sm:inline text-xs font-semibold text-slate-400">
            Logged in as <strong className="text-slate-200">{user?.email}</strong>
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-red-400 bg-slate-900/80 px-3.5 py-2 rounded-xl border border-slate-800 transition-colors cursor-pointer"
          >
            <LogOut size={14} /> {t('sidebar.logout', 'Logout')}
          </button>
        </div>
      </div>

      {/* Pricing Header */}
      <div className="max-w-4xl mx-auto text-center my-8 z-10">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-extrabold uppercase tracking-widest mb-4">
          <Sparkles size={14} /> {t('subscription.premiumMembership', 'Premium Membership')}
        </div>
        <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight">
          {t('subscription.title', 'Select a Plan to Access')} <br />
          <span className="bg-linear-to-r from-blue-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
            {t('subscription.subtitle', 'Your Business Intelligence')}
          </span>
        </h1>
        <p className="text-slate-400 text-sm sm:text-base mt-3 max-w-xl mx-auto">
          {t('subscription.description', 'Get unrestricted access to Daily Stock reconciliations, FIFO price tracking, Official Reports, and Magic Charts.')}
        </p>

        {activeSub && (
          <div className="mt-6 p-4 rounded-2xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs font-bold inline-flex items-center gap-2">
            <ShieldCheck size={18} /> {t('subscription.activeUntil', 'Active subscription valid until')} {new Date(activeSub.current_period_end).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            <button
              onClick={() => navigate('/')}
              className="ml-3 underline hover:text-emerald-100 cursor-pointer"
            >
              {t('subscription.goToDashboard', 'Go to Dashboard →')}
            </button>
          </div>
        )}
      </div>

      {/* Pricing Cards Grid */}
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 w-full z-10">
        
        {/* Monthly Plan */}
        <div 
          onClick={() => setSelectedPlan('monthly')}
          className={`relative bg-slate-950/70 border rounded-3xl p-8 cursor-pointer transition-all duration-300 backdrop-blur-md flex flex-col justify-between ${
            selectedPlan === 'monthly'
              ? 'border-blue-500 ring-2 ring-blue-500/30 shadow-[0_0_40px_rgba(37,99,235,0.2)]'
              : 'border-slate-800/80 hover:border-slate-700'
          }`}
        >
          <div>
            <div className="flex justify-between items-center mb-4">
              <span className="text-xs font-black uppercase tracking-widest text-slate-400">{t('subscription.monthlyBilling', 'Monthly Billing')}</span>
              <div className={`h-6 w-6 rounded-full border flex items-center justify-center transition-colors ${
                selectedPlan === 'monthly' ? 'bg-blue-600 border-blue-500 text-white' : 'border-slate-700'
              }`}>
                {selectedPlan === 'monthly' && <Check size={14} strokeWidth={3} />}
              </div>
            </div>

            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-4xl sm:text-5xl font-black text-white">₹1,499</span>
              <span className="text-slate-400 font-semibold text-sm">{t('subscription.perMonth', '/ month')}</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed mb-6">
              {t('subscription.monthlyDesc', 'Full monthly access with continuous cloud sync and daily reconciliations.')}
            </p>

            <ul className="space-y-3 text-xs font-semibold text-slate-300 border-t border-slate-800/60 pt-6">
              <li className="flex items-center gap-2.5">
                <Check size={16} className="text-blue-400 shrink-0" /> {t('subscription.feature1', 'Full Brand Master & Custom Sizes')}
              </li>
              <li className="flex items-center gap-2.5">
                <Check size={16} className="text-blue-400 shrink-0" /> {t('subscription.feature2', 'Daily Stock (Sale) Dual-FIFO Engine')}
              </li>
              <li className="flex items-center gap-2.5">
                <Check size={16} className="text-blue-400 shrink-0" /> {t('subscription.feature3', 'Trader Accounts & Ledger Statements')}
              </li>
              <li className="flex items-center gap-2.5">
                <Check size={16} className="text-blue-400 shrink-0" /> {t('subscription.feature4', 'Official Printable PDF Reports')}
              </li>
              <li className="flex items-center gap-2.5">
                <Check size={16} className="text-blue-400 shrink-0" /> {t('subscription.feature5', 'Magic Chart (Marathi Rakaana) Analysis')}
              </li>
            </ul>
          </div>
        </div>

        {/* Yearly Plan */}
        <div 
          onClick={() => setSelectedPlan('yearly')}
          className={`relative bg-slate-950/70 border rounded-3xl p-8 cursor-pointer transition-all duration-300 backdrop-blur-md flex flex-col justify-between ${
            selectedPlan === 'yearly'
              ? 'border-indigo-500 ring-2 ring-indigo-500/30 shadow-[0_0_40px_rgba(99,102,241,0.25)]'
              : 'border-slate-800/80 hover:border-slate-700'
          }`}
        >
          <div className="absolute -top-3.5 right-6 px-3 py-1 rounded-full bg-linear-to-r from-emerald-500 to-teal-600 text-[10px] font-black uppercase tracking-wider text-white shadow-md">
            {t('subscription.saveTag', 'Save ₹2,989 (2 Months Free)')}
          </div>

          <div>
            <div className="flex justify-between items-center mb-4">
              <span className="text-xs font-black uppercase tracking-widest text-indigo-400">{t('subscription.annualBilling', 'Annual Billing')}</span>
              <div className={`h-6 w-6 rounded-full border flex items-center justify-center transition-colors ${
                selectedPlan === 'yearly' ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-slate-700'
              }`}>
                {selectedPlan === 'yearly' && <Check size={14} strokeWidth={3} />}
              </div>
            </div>

            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-4xl sm:text-5xl font-black text-white">₹14,999</span>
              <span className="text-slate-400 font-semibold text-sm">{t('subscription.perYear', '/ year')}</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed mb-6">
              {t('subscription.annualDesc', 'Best value for long-term stores. Priority database sync and all features included.')}
            </p>

            <ul className="space-y-3 text-xs font-semibold text-slate-300 border-t border-slate-800/60 pt-6">
              <li className="flex items-center gap-2.5">
                <Check size={16} className="text-emerald-400 shrink-0" /> {t('subscription.feature1', 'Everything in Monthly Plan')}
              </li>
              <li className="flex items-center gap-2.5">
                <Check size={16} className="text-emerald-400 shrink-0" /> {t('subscription.feature6', '12 Months Continuous Access')}
              </li>
              <li className="flex items-center gap-2.5">
                <Check size={16} className="text-emerald-400 shrink-0" /> {t('subscription.feature7', 'Priority Cloud Backup & Realtime Sync')}
              </li>
              <li className="flex items-center gap-2.5">
                <Check size={16} className="text-emerald-400 shrink-0" /> {t('subscription.feature8', 'Unlimited Excel CSV Exports')}
              </li>
              <li className="flex items-center gap-2.5">
                <Zap size={16} className="text-amber-400 shrink-0" /> {t('subscription.feature9', 'Discounted Annual Rate')}
              </li>
            </ul>
          </div>
        </div>

      </div>

      {/* Direct Razorpay Action Button */}
      <div className="max-w-md mx-auto w-full mt-8 mb-6 z-10">
        <button
          type="button"
          disabled={loading}
          onClick={handleSubscribe}
          className="w-full py-4 px-6 bg-linear-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-600 text-white font-extrabold rounded-2xl transition-all shadow-[0_10px_30px_rgba(37,99,235,0.3)] hover:shadow-[0_15px_40px_rgba(37,99,235,0.45)] hover:-translate-y-0.5 flex items-center justify-center gap-3 text-base cursor-pointer disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 size={20} className="animate-spin" /> {t('subscription.openingGateway', 'Opening Razorpay Gateway...')}
            </>
          ) : (
            <>
              {t('subscription.proceedPay', 'Proceed to Pay')} ({selectedPlan === 'monthly' ? '₹1,499' : '₹14,999'}) <ArrowRight size={18} />
            </>
          )}
        </button>
        <p className="text-center text-[11px] text-slate-500 mt-3 flex items-center justify-center gap-1.5 font-medium">
          <Lock size={12} /> {t('subscription.secureBadge', '100% Secure 256-Bit Encrypted Razorpay Checkout')}
        </p>
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-slate-600 z-10">
        © {new Date().getFullYear()} Nexus Diary. All rights reserved.
      </div>

    </div>
  );
}