import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useModal } from '../../context/ModalContext';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { 
  ShieldCheck, Check, Sparkles, Zap, Lock, LogOut, ArrowRight, 
  Loader2, ArrowUpCircle, Crown, CheckCircle2, HeartHandshake 
} from 'lucide-react';
import logoImg from '../../assets/nx diary logo.png';

// Compact & Balanced VIP Celebration Modal
function SubscriptionSuccessModal({ isOpen, onClose, details }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const confettiCount = 100;
    const particles = [];
    const colors = ['#3b82f6', '#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#ffffff'];

    for (let i = 0; i < confettiCount; i++) {
      particles.push({
        x: canvas.width / 2 + (Math.random() - 0.5) * 160,
        y: canvas.height / 2 + (Math.random() - 0.5) * 80,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.7) * 12,
        size: Math.random() * 5 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 8,
        opacity: 1,
        gravity: 0.3,
      });
    }

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.rotation += p.rotationSpeed;
        p.opacity = Math.max(0, p.opacity - 0.007);

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.4);
        ctx.restore();
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isOpen]);

  if (!isOpen || !details) return null;

  const isGrantedByAdmin = details.isGrantedByAdmin || details.paymentId?.startsWith('admin_override');
  const planTitle = details.planType === 'yearly' ? 'Annual Enterprise Plan' : 'Monthly Pro Plan';
  const expiryFormatted = details.validUntil 
    ? new Date(details.validUntil).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Active';

  return (
    <div className="fixed inset-0 z-100000 flex items-center justify-center p-4 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-300 font-sans">
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-10 w-full h-full" />

      {/* Compact Floating VIP Card */}
      <div className="relative z-20 w-full max-w-md bg-slate-900/98 border border-slate-700/80 rounded-3xl p-6 sm:p-7 shadow-[0_20px_60px_rgba(0,0,0,0.6)] text-center animate-in zoom-in-95 duration-200 overflow-hidden max-h-[90vh] flex flex-col justify-between">
        
        {/* Soft Ambient Glow */}
        <div className={`absolute -top-16 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full blur-2xl pointer-events-none ${
          isGrantedByAdmin ? 'bg-purple-500/20' : 'bg-blue-500/20'
        }`}></div>

        {/* Icon & Brand Header */}
        <div className="relative flex flex-col items-center">
          <img src={logoImg} alt="NX Diary Logo" className="h-8 w-auto object-contain mb-2.5 drop-shadow-md" />
          
          <div className={`w-13 h-13 rounded-2xl flex items-center justify-center shadow-md border relative ${
            isGrantedByAdmin 
              ? 'bg-linear-to-br from-purple-500/20 to-indigo-500/20 border-purple-500/40 text-purple-400' 
              : 'bg-linear-to-br from-blue-500/20 to-emerald-500/20 border-blue-500/40 text-blue-400'
          }`}>
            <Crown size={26} className="animate-bounce duration-1000" />
            <Sparkles size={13} className="absolute -top-1 -right-1 text-amber-400 animate-pulse" />
          </div>
        </div>

        {/* Heading text */}
        <div className="relative space-y-1 my-3">
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${
            isGrantedByAdmin 
              ? 'bg-purple-500/15 border-purple-500/30 text-purple-300' 
              : 'bg-blue-500/15 border-blue-500/30 text-blue-300'
          }`}>
            {isGrantedByAdmin ? <HeartHandshake size={11} /> : <Zap size={11} />}
            {isGrantedByAdmin ? 'Complimentary VIP Access' : 'VIP Membership Activated'}
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-tight pt-1">
            {isGrantedByAdmin ? (
              <>
                Congratulations! <br />
                <span className="bg-linear-to-r from-purple-400 via-indigo-300 to-blue-400 bg-clip-text text-transparent">
                  Nexus Diary Granted Your Access
                </span>
              </>
            ) : (
              <>
                Welcome to Nexus Diary VIP! <br />
                <span className="bg-linear-to-r from-blue-400 via-indigo-300 to-emerald-400 bg-clip-text text-transparent">
                  You Have Subscribed Successfully
                </span>
              </>
            )}
          </h2>

          <p className="text-[11px] text-slate-400 max-w-xs mx-auto leading-relaxed pt-0.5">
            {isGrantedByAdmin
              ? 'Your store account has been upgraded with complimentary VIP access. All features are fully unlocked.'
              : `Your payment was processed successfully. You now have full access to ${planTitle}.`
            }
          </p>
        </div>

        {/* Compact Plan Details Box */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3 mb-4 text-left flex items-center justify-between">
          <div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Active Plan</span>
            <h4 className="text-xs font-black text-white capitalize">{planTitle}</h4>
          </div>
          <div className="text-right">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Valid Until</span>
            <h4 className="text-xs font-black text-blue-400 flex items-center gap-1">
              <ShieldCheck size={12} className="text-emerald-400" /> {expiryFormatted}
            </h4>
          </div>
        </div>

        {/* Checklist */}
        <div className="space-y-1.5 text-left text-[11px] font-semibold text-slate-300 mb-5 px-1">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
            <span>Dual-FIFO Daily Stock & Custom Batch Pricing</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
            <span>Trader Statements, Payment Ledgers & Balance Sheet</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
            <span>Magic Chart (Marathi 7-Rakaana) Excise Accounting</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
            <span>Official Multi-Page A4 PDF & Excel CSV Exports</span>
          </div>
        </div>

        {/* Button */}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 px-5 bg-linear-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-600 text-white font-black text-xs rounded-xl transition-all shadow-[0_6px_25px_rgba(37,99,235,0.4)] hover:-translate-y-0.5 flex items-center justify-center gap-1.5 cursor-pointer"
        >
          Enter Store Dashboard <ArrowRight size={15} />
        </button>

      </div>
    </div>
  );
}

export default function Subscription() {
  const { user } = useAuth();
  const { showAlert } = useModal();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [selectedPlan, setSelectedPlan] = useState('monthly');
  const [loading, setLoading] = useState(false);
  const [activeSub, setActiveSub] = useState(null);

  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [successDetails, setSuccessDetails] = useState(null);

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
        if (data.plan_type === 'monthly') {
          setSelectedPlan('yearly');
        }
      } else {
        setActiveSub(null);
      }
    }
    checkExistingSubscription();
  }, [user]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const isMonthlyActive = activeSub && activeSub.status === 'active' && activeSub.plan_type === 'monthly' && new Date(activeSub.current_period_end) > new Date();
  const isYearlyActive = activeSub && activeSub.status === 'active' && activeSub.plan_type === 'yearly' && new Date(activeSub.current_period_end) > new Date();

  const handleSubscribe = async () => {
    if (isYearlyActive) {
      const isGranted = activeSub.razorpay_payment_id?.startsWith('admin_override');
      setSuccessDetails({
        planType: 'yearly',
        validUntil: activeSub.current_period_end,
        paymentId: activeSub.razorpay_payment_id,
        isGrantedByAdmin: isGranted
      });
      setSuccessModalOpen(true);
      return;
    }

    if (isMonthlyActive && selectedPlan === 'monthly') {
      const isGranted = activeSub.razorpay_payment_id?.startsWith('admin_override');
      setSuccessDetails({
        planType: 'monthly',
        validUntil: activeSub.current_period_end,
        paymentId: activeSub.razorpay_payment_id,
        isGrantedByAdmin: isGranted
      });
      setSuccessModalOpen(true);
      return;
    }

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
      description: isMonthlyActive ? `Upgrade to: ${planName}` : `Subscription: ${planName}`,
      image: logoImg,
      prefill: {
        email: user?.email || '',
        contact: '',
      },
      notes: {
        plan_type: selectedPlan,
        user_id: user?.id,
        is_upgrade: isMonthlyActive ? 'true' : 'false'
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
          let endDate = new Date();

          if (isMonthlyActive && activeSub?.current_period_end) {
            const currentExpiry = new Date(activeSub.current_period_end);
            endDate = currentExpiry > startDate ? currentExpiry : startDate;
            endDate.setFullYear(endDate.getFullYear() + 1);
          } else {
            if (isMonthly) {
              endDate.setMonth(endDate.getMonth() + 1);
            } else {
              endDate.setFullYear(endDate.getFullYear() + 1);
            }
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

          // Set localStorage flag so user is acknowledged
          localStorage.setItem(`nexus_welcomed_grant_${user.id}`, 'true');

          setSuccessDetails({
            planType: selectedPlan,
            validUntil: endDate.toISOString(),
            paymentId: subscriptionPayload.razorpay_payment_id,
            isGrantedByAdmin: false
          });
          setSuccessModalOpen(true);
        } catch (err) {
          showAlert({ title: "Activation Failed", message: "Payment succeeded but activating plan failed: " + err.message, type: "error" });
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

  const handleCloseCelebration = () => {
    setSuccessModalOpen(false);
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#030510] text-slate-100 flex flex-col justify-between p-4 sm:p-8 relative overflow-hidden font-sans">
      
      {/* Compact VIP Celebration Welcoming Modal */}
      <SubscriptionSuccessModal
        isOpen={successModalOpen}
        onClose={handleCloseCelebration}
        details={successDetails}
      />

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
      <div className="max-w-4xl mx-auto text-center my-6 z-10">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-extrabold uppercase tracking-widest mb-3">
          <Sparkles size={14} /> {isMonthlyActive ? 'Plan Upgrade Center' : t('subscription.premiumMembership', 'Premium Membership')}
        </div>
        
        <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight">
          {isMonthlyActive ? (
            <>
              Upgrade to Annual Plan & <br />
              <span className="bg-linear-to-r from-emerald-400 via-teal-300 to-blue-400 bg-clip-text text-transparent">
                Save ₹2,989 per Year
              </span>
            </>
          ) : (
            <>
              {t('subscription.title', 'Select a Plan to Access')} <br />
              <span className="bg-linear-to-r from-blue-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
                {t('subscription.subtitle', 'Your Business Intelligence')}
              </span>
            </>
          )}
        </h1>

        <p className="text-slate-400 text-sm sm:text-base mt-2 max-w-xl mx-auto">
          {isMonthlyActive 
            ? 'Upgrade your current active monthly plan to the Annual Enterprise tier. Unused monthly balance seamlessly extends your 1-year timeline.'
            : t('subscription.description', 'Get unrestricted access to Daily Stock reconciliations, FIFO price tracking, Official Reports, and Magic Charts.')
          }
        </p>

        {isMonthlyActive && (
          <div className="mt-4 p-3.5 rounded-2xl bg-blue-950/40 border border-blue-800/60 text-blue-300 text-xs font-bold inline-flex items-center gap-2">
            <ShieldCheck size={18} className="text-blue-400 shrink-0" /> 
            <span>Current Active: <strong>Monthly Pro Plan</strong> (Valid until {new Date(activeSub.current_period_end).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })})</span>
          </div>
        )}

        {isYearlyActive && (
          <div className="mt-4 p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs font-bold inline-flex items-center gap-2">
            <ShieldCheck size={18} className="text-emerald-400 shrink-0" /> 
            <span>Highest Tier Active: <strong>Annual Enterprise Plan</strong> (Valid until {new Date(activeSub.current_period_end).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })})</span>
          </div>
        )}
      </div>

      {/* Pricing Cards Grid */}
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 w-full z-10">
        
        {/* Monthly Plan */}
        <div 
          onClick={() => {
            if (!isMonthlyActive && !isYearlyActive) {
              setSelectedPlan('monthly');
            }
          }}
          className={`relative bg-slate-950/70 border rounded-3xl p-8 transition-all duration-300 backdrop-blur-md flex flex-col justify-between ${
            isMonthlyActive 
              ? 'border-slate-800 opacity-60 cursor-not-allowed bg-slate-950/40'
              : selectedPlan === 'monthly'
                ? 'border-blue-500 ring-2 ring-blue-500/30 shadow-[0_0_40px_rgba(37,99,235,0.2)] cursor-pointer'
                : 'border-slate-800/80 hover:border-slate-700 cursor-pointer'
          }`}
        >
          {isMonthlyActive && (
            <div className="absolute -top-3.5 left-6 px-3 py-1 rounded-full bg-blue-600 text-[10px] font-black uppercase tracking-wider text-white shadow-md">
              Current Active Plan
            </div>
          )}

          <div>
            <div className="flex justify-between items-center mb-4">
              <span className="text-xs font-black uppercase tracking-widest text-slate-400">{t('subscription.monthlyBilling', 'Monthly Billing')}</span>
              <div className={`h-6 w-6 rounded-full border flex items-center justify-center transition-colors ${
                isMonthlyActive 
                  ? 'bg-blue-600/40 border-blue-500/40 text-blue-200' 
                  : selectedPlan === 'monthly' ? 'bg-blue-600 border-blue-500 text-white' : 'border-slate-700'
              }`}>
                {(selectedPlan === 'monthly' || isMonthlyActive) && <Check size={14} strokeWidth={3} />}
              </div>
            </div>

            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-4xl sm:text-5xl font-black text-white">₹1,499</span>
              <span className="text-slate-400 font-semibold text-sm">{t('subscription.perMonth', '/ month')}</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed mb-6">
              {isMonthlyActive 
                ? `Active until ${new Date(activeSub.current_period_end).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}. Cannot purchase again while active.`
                : t('subscription.monthlyDesc', 'Full monthly access with continuous cloud sync and daily reconciliations.')
              }
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
          onClick={() => {
            if (!isYearlyActive) {
              setSelectedPlan('yearly');
            }
          }}
          className={`relative bg-slate-950/70 border rounded-3xl p-8 transition-all duration-300 backdrop-blur-md flex flex-col justify-between ${
            isYearlyActive 
              ? 'border-slate-800 opacity-60 cursor-not-allowed bg-slate-950/40'
              : selectedPlan === 'yearly'
                ? 'border-indigo-500 ring-2 ring-indigo-500/30 shadow-[0_0_40px_rgba(99,102,241,0.25)] cursor-pointer'
                : 'border-slate-800/80 hover:border-slate-700 cursor-pointer'
          }`}
        >
          <div className="absolute -top-3.5 right-6 px-3 py-1 rounded-full bg-linear-to-r from-emerald-500 to-teal-600 text-[10px] font-black uppercase tracking-wider text-white shadow-md">
            {isMonthlyActive ? 'RECOMMENDED UPGRADE (2 MONTHS FREE)' : t('subscription.saveTag', 'Save ₹2,989 (2 Months Free)')}
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
              {isMonthlyActive 
                ? 'Upgrade now: 12 months will be added to your current monthly subscription expiry.'
                : t('subscription.annualDesc', 'Best value for long-term stores. Priority database sync and all features included.')
              }
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

      {/* Direct Action Button */}
      <div className="max-w-md mx-auto w-full mt-8 mb-6 z-10">
        <button
          type="button"
          disabled={loading || isYearlyActive}
          onClick={handleSubscribe}
          className={`w-full py-4 px-6 font-extrabold rounded-2xl transition-all shadow-[0_10px_30px_rgba(37,99,235,0.3)] hover:shadow-[0_15px_40px_rgba(37,99,235,0.45)] hover:-translate-y-0.5 flex items-center justify-center gap-3 text-base cursor-pointer disabled:opacity-50 ${
            isMonthlyActive 
              ? 'bg-linear-to-r from-emerald-600 via-teal-600 to-indigo-600 text-white' 
              : 'bg-linear-to-r from-blue-600 via-indigo-600 to-blue-700 text-white'
          }`}
        >
          {loading ? (
            <>
              <Loader2 size={20} className="animate-spin" /> {t('subscription.openingGateway', 'Opening Razorpay Gateway...')}
            </>
          ) : isYearlyActive ? (
            <>
              {t('subscription.goToDashboard', 'Go to Dashboard')} <ArrowRight size={18} />
            </>
          ) : isMonthlyActive ? (
            <>
              <ArrowUpCircle size={20} /> Upgrade to Annual Plan (₹14,999) <ArrowRight size={18} />
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