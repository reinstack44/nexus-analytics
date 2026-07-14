import { useState } from 'react';
import { supabase } from '../../config/supabaseClient';
import { Wine, Mail, Lock, ArrowRight, AlertCircle, Loader2, BarChart3, TrendingUp, ShieldCheck, Activity, LineChart } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
    }
    setLoading(false);
  };

  // Ultra-crisp modern input styling
  const inputClass = "w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 outline-none transition-all duration-300 text-sm font-medium shadow-xs";

  return (
    <div className="min-h-screen w-full flex bg-white dark:bg-[#0B1121] font-sans transition-colors duration-500">
      
      {/* ================= LEFT PANEL (ULTRA-PREMIUM ERP THEME) ================= */}
      <div className="hidden lg:flex w-[55%] relative overflow-hidden bg-slate-950 items-center justify-center p-12 border-r border-slate-800/60 shadow-2xl">
        
        {/* Dynamic Abstract Background Elements */}
        {/* Linter Fix: Used inline style for background size to be 100% error-free & cross-compatible */}
        <div 
          className="absolute inset-0 opacity-[0.03]" 
          style={{ 
            backgroundImage: 'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)', 
            backgroundSize: '32px 32px' 
          }}
        ></div>
        
        {/* Linter Fixes: Applied w-125 and h-125 instead of arbitrary px values */}
        <div className="absolute top-[-10%] left-[-10%] w-125 h-125 bg-blue-600/20 rounded-full blur-[120px] pointer-events-none mix-blend-screen animate-pulse duration-10000"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-125 h-125 bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none mix-blend-screen"></div>

        {/* Realistic Glassmorphism Dashboard Preview Layer */}
        <div className="relative z-10 w-full max-w-lg backdrop-blur-xl bg-white/5 border border-white/10 p-8 rounded-3xl shadow-[0_0_40px_rgba(0,0,0,0.5)] animate-in fade-in slide-in-from-bottom-8 duration-1000">
          
          {/* Mock Header */}
          <div className="flex items-center justify-between mb-8 pb-6 border-b border-white/10">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 bg-linear-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30 border border-blue-400/20">
                <Wine className="text-white" size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">Nexus Diary</h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">System Active</p>
                </div>
              </div>
            </div>
            <div className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-slate-300 text-xs font-medium flex items-center gap-2">
              <Activity size={14} className="text-blue-400" /> Live Sync
            </div>
          </div>
          
          {/* Mock Charts & Data (Enhancing Realism) */}
          <div className="space-y-4">
            <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-5 hover:bg-slate-900/80 transition-colors duration-300 relative overflow-hidden">
               <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-4 translate-y-4">
                 <LineChart size={100} />
               </div>
               <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider mb-2 relative z-10">
                 <BarChart3 size={16} className="text-blue-400"/> Daily Gross Revenue
               </div>
               <div className="text-4xl font-black text-white tracking-tight relative z-10">₹2.84<span className="text-xl text-slate-500 font-bold ml-1">L</span></div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-5 hover:bg-slate-900/80 transition-colors duration-300">
                 <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
                   <TrendingUp size={14} className="text-emerald-400"/> Avg. Margin
                 </div>
                 <div className="text-2xl font-black text-emerald-400 tracking-tight">+32<span className="text-lg opacity-80">%</span></div>
              </div>
              <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-5 hover:bg-slate-900/80 transition-colors duration-300">
                 <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
                   <ShieldCheck size={14} className="text-indigo-400"/> Ledger Status
                 </div>
                 <div className="text-xl font-bold text-white tracking-tight mt-1">Reconciled</div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ================= RIGHT PANEL (COMPACT & CRISP LOGIN) ================= */}
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-12 lg:px-24 bg-slate-50 dark:bg-[#0B1121] relative z-10">
        
        {/* Linter Fix: Applied max-w-90 canonical class */}
        <div className="mx-auto w-full max-w-90 animate-in fade-in slide-in-from-right-8 duration-700">
          
          {/* Mobile Logo (Visible only on small screens) */}
          <div className="lg:hidden flex justify-center mb-8">
            <div className="h-16 w-16 bg-linear-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30 border border-blue-400/20">
              <Wine className="text-white" size={32} />
            </div>
          </div>

          <div className="text-center lg:text-left mb-8">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-800 dark:text-white tracking-tight">
              Log In
            </h2>
            <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm font-medium">
              Securely access your business dashboard.
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400 p-3.5 rounded-xl mb-6 text-sm font-semibold animate-in slide-in-from-top-2 shadow-sm">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <p className="leading-relaxed">{error}</p>
            </div>
          )}

          {/* Compact Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
                Email Address
              </label>
              <div className="relative group">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 group-focus-within:text-blue-500 transition-colors">
                  <Mail size={16} />
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="Enter your email"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
                Secure Password
              </label>
              <div className="relative group">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 group-focus-within:text-blue-500 transition-colors">
                  <Lock size={16} />
                </span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-4 bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-3 px-4 rounded-xl focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900 transition-all duration-300 disabled:opacity-70 flex justify-center items-center gap-2 shadow-[0_4px_14px_0_rgba(37,99,235,0.39)] hover:shadow-[0_6px_20px_rgba(37,99,235,0.23)] hover:-translate-y-0.5 text-sm"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> Authenticating...
                </>
              ) : (
                <>
                  Access System <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* Footer Note */}
          <div className="mt-12 text-center lg:text-left">
            <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              © {new Date().getFullYear()} Nexus Diary
            </p>
          </div>
          
        </div>
      </div>
    </div>
  );
}