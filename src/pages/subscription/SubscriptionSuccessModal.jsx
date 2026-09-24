import { useEffect, useRef } from 'react';
import { Sparkles, Crown, CheckCircle2, ArrowRight, ShieldCheck, Zap, HeartHandshake } from 'lucide-react';
import logoImg from '../../assets/nx diary logo.png';

export default function SubscriptionSuccessModal({ isOpen, onClose, details }) {
  const canvasRef = useRef(null);

  // High-performance GPU particle confetti + golden shimmer engine
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const confettiCount = 140;
    const particles = [];
    const colors = ['#3b82f6', '#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#ffffff'];

    for (let i = 0; i < confettiCount; i++) {
      particles.push({
        x: canvas.width / 2 + (Math.random() - 0.5) * 200,
        y: canvas.height / 2 + (Math.random() - 0.5) * 100,
        vx: (Math.random() - 0.5) * 14,
        vy: (Math.random() - 0.7) * 16,
        size: Math.random() * 7 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10,
        opacity: 1,
        gravity: 0.35,
      });
    }

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.rotation += p.rotationSpeed;
        p.opacity = Math.max(0, p.opacity - 0.006);

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.5);
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
    <div className="fixed inset-0 z-100000 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-300 font-sans">
      
      {/* 60FPS Confetti Cannon Background */}
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-10 w-full h-full" />

      {/* VIP Modal Card */}
      <div className="relative z-20 w-full max-w-lg bg-slate-900/95 border border-slate-700/80 rounded-3xl p-6 sm:p-8 shadow-[0_0_60px_rgba(59,130,246,0.25)] text-center animate-in zoom-in-95 duration-300 overflow-hidden">
        
        {/* Top Ambient Glow */}
        <div className={`absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full blur-3xl pointer-events-none ${
          isGrantedByAdmin ? 'bg-purple-500/25' : 'bg-blue-500/25'
        }`}></div>

        {/* Brand & Crown Badge Header */}
        <div className="relative mb-5 flex flex-col items-center">
          <img src={logoImg} alt="NX Diary Logo" className="h-10 w-auto object-contain mb-3 drop-shadow-md" />
          
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg border relative ${
            isGrantedByAdmin 
              ? 'bg-linear-to-br from-purple-500/20 to-indigo-500/20 border-purple-500/40 text-purple-400 shadow-purple-500/20' 
              : 'bg-linear-to-br from-blue-500/20 to-emerald-500/20 border-blue-500/40 text-blue-400 shadow-blue-500/20'
          }`}>
            <Crown size={34} className="animate-bounce duration-1000" />
            <Sparkles size={16} className="absolute -top-1.5 -right-1.5 text-amber-400 animate-pulse" />
          </div>
        </div>

        {/* Dynamic Welcoming Title */}
        <div className="relative space-y-1.5 mb-6">
          <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${
            isGrantedByAdmin 
              ? 'bg-purple-500/15 border-purple-500/30 text-purple-300' 
              : 'bg-blue-500/15 border-blue-500/30 text-blue-300'
          }`}>
            {isGrantedByAdmin ? <HeartHandshake size={13} /> : <Zap size={13} />}
            {isGrantedByAdmin ? 'Special Complimentary Access' : 'VIP Membership Activated'}
          </div>

          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">
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

          <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed pt-1">
            {isGrantedByAdmin
              ? 'Your store account has been upgraded with complimentary VIP access. All advanced analytics features are fully unlocked.'
              : `Your payment was processed successfully. You now have full unlocked access to ${planTitle}.`
            }
          </p>
        </div>

        {/* Plan Overview Pill Box */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 mb-6 text-left flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Plan</span>
            <h4 className="text-sm font-black text-white capitalize">{planTitle}</h4>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Valid Until</span>
            <h4 className="text-sm font-black text-blue-400 flex items-center gap-1">
              <ShieldCheck size={14} className="text-emerald-400" /> {expiryFormatted}
            </h4>
          </div>
        </div>

        {/* Feature Unlock Checklist */}
        <div className="space-y-2.5 text-left text-xs font-semibold text-slate-300 mb-8 px-2">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <span>Dual-FIFO Daily Stock & Custom Batch Pricing</span>
          </div>
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <span>Trader Statements, Payment Ledgers & Balance Sheet</span>
          </div>
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <span>Magic Chart (Marathi 7-Rakaana) Excise Accounting</span>
          </div>
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <span>Official Multi-Page A4 PDF & Excel CSV Exports</span>
          </div>
        </div>

        {/* Action Button */}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-4 px-6 bg-linear-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-600 text-white font-black text-sm rounded-2xl transition-all shadow-[0_10px_35px_rgba(37,99,235,0.4)] hover:shadow-[0_15px_45px_rgba(37,99,235,0.55)] hover:-translate-y-0.5 flex items-center justify-center gap-2 cursor-pointer"
        >
          Enter Store Dashboard <ArrowRight size={18} />
        </button>

      </div>
    </div>
  );
}