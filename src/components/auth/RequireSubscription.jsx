import { useEffect, useState } from 'react';
import { Navigate, Outlet, useNavigate } from 'react-router-dom';
import { supabase } from '../../config/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { PauseCircle, PhoneCall, LogOut } from 'lucide-react';
import logoImg from '../../assets/nx diary logo.png';

export default function RequireSubscription() {
  const { user, isAdmin, profile, loading: authLoading } = useAuth();
  const [hasSubscription, setHasSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;

    async function verifySubscription() {
      if (!user) {
        if (isMounted) setLoading(false);
        return;
      }

      // If user account is paused by admin
      if (profile && profile.is_active === false) {
        if (isMounted) {
          setHasSubscription(false);
          setLoading(false);
        }
        return;
      }

      // Admin bypasses subscription gate
      if (isAdmin) {
        if (isMounted) {
          setHasSubscription(true);
          setLoading(false);
        }
        return;
      }

      try {
        const { data, error } = await supabase
          .from('user_subscriptions')
          .select('status, current_period_end')
          .eq('user_id', user.id)
          .single();

        if (error || !data) {
          if (isMounted) setHasSubscription(false);
        } else {
          const isValid = data.status === 'active' && new Date(data.current_period_end) > new Date();
          if (isMounted) setHasSubscription(isValid);
        }
      } catch (err) {
        console.error('Subscription verification failed:', err);
        if (isMounted) setHasSubscription(false);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    if (!authLoading) {
      verifySubscription();
    }

    return () => {
      isMounted = false;
    };
  }, [user, isAdmin, profile, authLoading]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#030510] flex flex-col items-center justify-center text-slate-400">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="font-semibold text-sm animate-pulse">Verifying Account Subscription...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // PAUSED SERVICES UI SCREEN
  if (profile?.is_active === false) {
    return (
      <div className="min-h-screen bg-[#030510] flex items-center justify-center p-4 relative overflow-hidden font-sans">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-120 h-120 bg-amber-600/10 rounded-full blur-[140px] pointer-events-none"></div>

        <div className="max-w-md w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl relative z-10 backdrop-blur-md animate-in fade-in zoom-in duration-300">
          <img src={logoImg} alt="NX Diary Logo" className="h-12 w-auto mx-auto mb-6 object-contain" />
          
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-4">
            <PauseCircle size={36} />
          </div>

          <h2 className="text-2xl font-black text-white tracking-tight">Services Paused</h2>
          <p className="text-sm text-slate-300 mt-3 leading-relaxed">
            Your store services are temporarily paused. Please contact your service provider to resume your access.
          </p>

          <div className="mt-6 p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center gap-2 text-xs font-bold text-slate-400">
            <PhoneCall size={16} className="text-blue-400" />
            <span>Support: contact your system administrator</span>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="w-full mt-6 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut size={16} /> Logout Account
          </button>
        </div>
      </div>
    );
  }

  if (!hasSubscription) {
    return <Navigate to="/subscription" replace />;
  }

  return <Outlet />;
}