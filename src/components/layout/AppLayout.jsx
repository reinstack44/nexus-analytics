import { useState, useEffect, useRef } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../config/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext'; 
import { useTranslation } from 'react-i18next'; 
import { 
  LayoutDashboard, Tag, ShoppingCart, Package, TrendingUp, LogOut, 
  Menu, X, ChevronLeft, ChevronRight, Sun, Moon, Globe, FileText, 
  Wand2, Settings, ShieldCheck, Crown, Sparkles, HeartHandshake, CheckCircle2, ArrowRight
} from 'lucide-react';

import nxDiaryLogo from '../../assets/nx diary logo.png';

// Welcoming VIP Dialog for Admin Granted Access
function AdminGrantedWelcomeModal({ isOpen, onClose, details }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const confettiCount = 90;
    const particles = [];
    const colors = ['#8b5cf6', '#6366f1', '#3b82f6', '#ec4899', '#f59e0b', '#10b981', '#ffffff'];

    for (let i = 0; i < confettiCount; i++) {
      particles.push({
        x: canvas.width / 2 + (Math.random() - 0.5) * 160,
        y: canvas.height / 2 + (Math.random() - 0.5) * 80,
        vx: (Math.random() - 0.5) * 9,
        vy: (Math.random() - 0.7) * 11,
        size: Math.random() * 5 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 8,
        opacity: 1,
        gravity: 0.28,
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

  const planTitle = details.plan_type === 'yearly' ? 'Annual Enterprise Plan' : 'Monthly Pro Plan';
  const expiryFormatted = details.current_period_end 
    ? new Date(details.current_period_end).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Active';

  return (
    <div className="fixed inset-0 z-100000 flex items-center justify-center p-4 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-300 font-sans">
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-10 w-full h-full" />

      <div className="relative z-20 w-full max-w-md bg-slate-900/98 border border-slate-700/80 rounded-3xl p-6 sm:p-7 shadow-[0_20px_60px_rgba(0,0,0,0.6)] text-center animate-in zoom-in-95 duration-200 overflow-hidden">
        
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-48 h-48 bg-purple-500/20 rounded-full blur-2xl pointer-events-none"></div>

        <div className="relative mb-3 flex flex-col items-center">
          <img src={nxDiaryLogo} alt="NX Diary Logo" className="h-8 w-auto object-contain mb-2.5 drop-shadow-md" />
          
          <div className="w-13 h-13 rounded-2xl bg-linear-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/40 text-purple-400 flex items-center justify-center shadow-md relative">
            <Crown size={26} className="animate-bounce duration-1000" />
            <Sparkles size={13} className="absolute -top-1 -right-1 text-amber-400 animate-pulse" />
          </div>
        </div>

        <div className="relative space-y-1 my-3">
          <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border bg-purple-500/15 border-purple-500/30 text-purple-300">
            <HeartHandshake size={11} /> Special Access Granted
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-tight pt-1">
            Congratulations! <br />
            <span className="bg-linear-to-r from-purple-400 via-indigo-300 to-blue-400 bg-clip-text text-transparent">
              Nexus Diary Has Granted Your Plan
            </span>
          </h2>

          <p className="text-[11px] text-slate-400 max-w-xs mx-auto leading-relaxed pt-0.5">
            Your store account has been upgraded with complimentary VIP access. All analytics engines are ready to use.
          </p>
        </div>

        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3 mb-4 text-left flex items-center justify-between">
          <div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Active Plan</span>
            <h4 className="text-xs font-black text-white capitalize">{planTitle}</h4>
          </div>
          <div className="text-right">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Valid Until</span>
            <h4 className="text-xs font-black text-purple-400 flex items-center gap-1">
              <ShieldCheck size={12} className="text-emerald-400" /> {expiryFormatted}
            </h4>
          </div>
        </div>

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

        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 px-5 bg-linear-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs rounded-xl transition-all shadow-[0_6px_25px_rgba(139,92,246,0.4)] hover:-translate-y-0.5 flex items-center justify-center gap-1.5 cursor-pointer"
        >
          Enter Store Dashboard <ArrowRight size={15} />
        </button>

      </div>
    </div>
  );
}

export default function AppLayout() {
  const { user, isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme(); 
  const { t, i18n } = useTranslation(); 
  const location = useLocation();
  const navigate = useNavigate();

  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false); 

  // First-time grant welcome popup state
  const [grantCelebrationOpen, setGrantCelebrationOpen] = useState(false);
  const [grantSubDetails, setGrantSubDetails] = useState(null);

  useEffect(() => {
    async function checkFirstTimeAdminGrant() {
      if (!user || isAdmin) return;
      const ackKey = `nexus_welcomed_grant_${user.id}`;
      const alreadyAcknowledged = localStorage.getItem(ackKey);
      if (alreadyAcknowledged) return;

      try {
        const { data } = await supabase
          .from('user_subscriptions')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (data && data.status === 'active' && data.razorpay_payment_id?.startsWith('admin_override')) {
          setGrantSubDetails(data);
          setGrantCelebrationOpen(true);
        }
      } catch {
        // silent catch
      }
    }

    checkFirstTimeAdminGrant();
  }, [user, isAdmin]);

  const handleCloseGrantCelebration = () => {
    if (user) {
      localStorage.setItem(`nexus_welcomed_grant_${user.id}`, 'true');
    }
    setGrantCelebrationOpen(false);
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 
    ? t('header.goodMorning', 'Good Morning ☀️') 
    : hour < 17 
      ? t('header.goodAfternoon', 'Good Afternoon 🌤️') 
      : t('header.goodEvening', 'Good Evening 🔮');

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (mobile) setIsMobileOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
    localStorage.setItem('app_lang', lng); 
    setIsLangMenuOpen(false);
  };

  const navItems = [
    { name: t('sidebar.dashboard', 'Dashboard'), path: '/', icon: LayoutDashboard },
    { name: t('sidebar.brands', 'Brand Master'), path: '/brands', icon: Tag },
    { name: t('sidebar.purchases', 'Purchases & Traders'), path: '/purchases', icon: ShoppingCart },
    { name: t('sidebar.stock', 'Daily Stock (Sale)'), path: '/daily-stock', icon: Package },
    { name: t('sidebar.profitloss', 'Profit & Loss'), path: '/profit-loss', icon: TrendingUp },
    { name: t('sidebar.magicChart', 'Magic Chart'), path: '/magic-chart', icon: Wand2 },
    { name: t('sidebar.reports', 'Reports'), path: '/reports', icon: FileText }, 
    { name: t('sidebar.settings', 'Settings'), path: '/settings', icon: Settings },
  ];

  if (isAdmin) {
    navItems.push({
      name: 'Admin Control',
      path: '/admin',
      icon: ShieldCheck
    });
  }

  return (
    <div className="flex h-screen bg-[#F8FAFC] dark:bg-slate-950 overflow-hidden font-sans transition-colors duration-300">
      
      {/* Admin Granted First-Time Welcoming Celebration Modal */}
      <AdminGrantedWelcomeModal
        isOpen={grantCelebrationOpen}
        onClose={handleCloseGrantCelebration}
        details={grantSubDetails}
      />

      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 z-40 lg:hidden backdrop-blur-sm transition-opacity"
          onClick={() => {
            setIsMobileOpen(false);
            setIsLangMenuOpen(false);
          }}
        />
      )}

      {/* Sidebar Container */}
      <div 
        className={`fixed inset-y-0 left-0 z-60 flex flex-col bg-[#0B1121] text-slate-300 transition-all duration-300 ease-in-out border-r border-slate-800/60 shadow-2xl lg:shadow-none
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 ${isCollapsed ? 'lg:w-20' : 'lg:w-64'} w-72`}
      >
        
        {/* Collapse / Expand Toggle Button */}
        {!isMobile && (
          <button 
            type="button"
            onClick={() => {
              setIsCollapsed(!isCollapsed);
              setIsLangMenuOpen(false);
            }}
            className="absolute -right-4 top-7 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-full p-1.5 shadow-2xl hover:bg-blue-50 dark:hover:bg-slate-700 hover:text-blue-600 dark:hover:text-blue-400 transition-all z-70 focus:outline-none cursor-pointer hover:scale-110"
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isCollapsed ? <ChevronRight size={14} strokeWidth={3} /> : <ChevronLeft size={14} strokeWidth={3} />}
          </button>
        )}

        <div className="h-20 flex items-center justify-between px-5 border-b border-slate-800/60 shrink-0">
          <Link to="/" className="flex items-center overflow-hidden w-full h-full py-4" onClick={() => setIsLangMenuOpen(false)}>
             <img 
               src={nxDiaryLogo} 
               alt="NX Diary Logo" 
               className={`transition-all duration-300 object-center block ${
                 isCollapsed 
                   ? 'h-8 w-10 object-cover' 
                   : 'h-20 w-55 sm:w-48 object-contain'
               }`}
             />
          </Link>

          <button 
            type="button"
            className="lg:hidden text-slate-400 hover:text-white bg-slate-800/50 p-2 rounded-lg outline-none ml-2 shrink-0 cursor-pointer" 
            onClick={() => {
              setIsMobileOpen(false);
              setIsLangMenuOpen(false);
            }}
          >
            <X size={20} />
          </button>
        </div>
        
        <nav className="flex-1 px-3 py-6 space-y-2 overflow-y-auto custom-scrollbar">
          {navItems.map((item, index) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            const isSpecialAdmin = item.path === '/admin';
            
            return (
              <Link
                key={index}
                to={item.path}
                onClick={() => {
                  if (isMobile) setIsMobileOpen(false);
                  setIsLangMenuOpen(false);
                }}
                className={`flex items-center px-3 py-3.5 rounded-xl transition-all duration-300 group relative
                  ${isActive 
                    ? isSpecialAdmin ? 'bg-purple-500/15 text-purple-400' : 'bg-blue-500/10 text-blue-400' 
                    : isSpecialAdmin ? 'text-purple-400 hover:bg-purple-500/10' : 'hover:bg-slate-800/40 hover:text-slate-200'
                  }`}
              >
                {isActive && (
                  <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full shadow-lg ${
                    isSpecialAdmin ? 'bg-purple-500 shadow-[0_0_12px_rgba(168,85,247,0.8)]' : 'bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.8)]'
                  }`}></div>
                )}

                <div className="min-w-6 flex justify-center">
                  <Icon size={22} className={`transition-colors duration-300 ${
                    isActive 
                      ? isSpecialAdmin ? 'text-purple-400' : 'text-blue-500' 
                      : isSpecialAdmin ? 'text-purple-400' : 'text-slate-500 group-hover:text-slate-300'
                  }`} />
                </div>
                
                <span className={`ml-4 font-semibold tracking-wide whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'opacity-0 w-0 hidden lg:block' : 'opacity-100 w-auto'}`}>
                  {item.name}
                </span>

                {isCollapsed && !isMobile && (
                  <div className="absolute left-14 bg-slate-800 text-white text-xs font-semibold px-3 py-2 rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap border border-slate-700 shadow-xl ml-2 pointer-events-none" style={{ zIndex: 100 }}>
                    {item.name}
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800/60 shrink-0">
          <button 
            type="button"
            onClick={handleLogout} 
            className="flex items-center px-3 py-3 w-full rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-300 group relative outline-none cursor-pointer"
          >
            <div className="min-w-6 flex justify-center">
              <LogOut size={22} className="group-hover:-translate-x-1 transition-transform" />
            </div>
            <span className={`ml-4 font-semibold whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'opacity-0 w-0 hidden lg:block' : 'opacity-100 w-auto'}`}>
              {t('sidebar.logout', 'Logout System')}
            </span>
            
            {isCollapsed && !isMobile && (
              <div className="absolute left-14 bg-red-900/90 text-red-100 text-xs font-semibold px-3 py-2 rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap border border-red-800 shadow-xl ml-2 pointer-events-none" style={{ zIndex: 100 }}>
                {t('sidebar.logout', 'Logout System')}
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out ${isCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
        
        <header className="h-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 flex justify-between items-center px-4 sm:px-8 z-30 sticky top-0 transition-colors duration-300">
          <div className="flex items-center gap-4">
            {isMobile && (
              <button 
                type="button"
                className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors focus:ring-2 focus:ring-blue-100 dark:focus:ring-slate-700 outline-none cursor-pointer"
                onClick={() => setIsMobileOpen(true)}
              >
                <Menu size={24} />
              </button>
            )}
            
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 tracking-tight hidden sm:block transition-colors duration-300 select-none">
              {greeting}
            </h1>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">

            {/* Language Dropdown */}
            <div className="relative">
              <button 
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsLangMenuOpen(!isLangMenuOpen);
                }} 
                className="flex items-center gap-2 p-2.5 text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all duration-300 outline-none shadow-sm font-semibold text-sm uppercase cursor-pointer"
                title={t('header.changeLanguage', 'Change Language')}
              >
                <Globe size={18} className="text-blue-600 dark:text-blue-400" />
                <span className="hidden sm:block">{i18n.language || 'EN'}</span>
              </button>
              
              {isLangMenuOpen && (
                <div 
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl py-2 z-99999 animate-in fade-in zoom-in-95 duration-150"
                  style={{ zIndex: 999999 }}
                >
                  <button 
                    type="button" 
                    onClick={() => changeLanguage('en')} 
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer flex items-center justify-between ${i18n.language === 'en' ? 'text-blue-600 dark:text-blue-400 font-bold bg-blue-50/50 dark:bg-blue-900/20' : 'text-slate-700 dark:text-slate-300'}`}
                  >
                    <span>English</span>
                    {i18n.language === 'en' && <span className="text-blue-600 dark:text-blue-400">✓</span>}
                  </button>
                  <button 
                    type="button" 
                    onClick={() => changeLanguage('hi')} 
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer flex items-center justify-between ${i18n.language === 'hi' ? 'text-blue-600 dark:text-blue-400 font-bold bg-blue-50/50 dark:bg-blue-900/20' : 'text-slate-700 dark:text-slate-300'}`}
                  >
                    <span>हिन्दी (Hindi)</span>
                    {i18n.language === 'hi' && <span className="text-blue-600 dark:text-blue-400">✓</span>}
                  </button>
                  <button 
                    type="button" 
                    onClick={() => changeLanguage('mr')} 
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer flex items-center justify-between ${i18n.language === 'mr' ? 'text-blue-600 dark:text-blue-400 font-bold bg-blue-50/50 dark:bg-blue-900/20' : 'text-slate-700 dark:text-slate-300'}`}
                  >
                    <span>मराठी (Marathi)</span>
                    {i18n.language === 'mr' && <span className="text-blue-600 dark:text-blue-400">✓</span>}
                  </button>
                </div>
              )}
            </div>

            <button 
              type="button"
              onClick={toggleTheme} 
              className="p-2.5 text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all duration-300 outline-none shadow-sm cursor-pointer"
              title={t('header.toggleTheme', 'Toggle Theme')}
            >
              {theme === 'dark' ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} className="text-blue-600" />}
            </button>

            <div className="flex items-center gap-3 border-l border-slate-200 dark:border-slate-700 pl-3 sm:pl-5 transition-colors duration-300">
              <div className="hidden sm:flex flex-col items-end">
                <div className="flex items-center gap-1.5">
                  {isAdmin && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 uppercase tracking-wider">
                      ADMIN
                    </span>
                  )}
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">
                    {t('header.activeSession', 'Active Session')}
                  </span>
                </div>
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 transition-colors duration-300">{user?.email}</span>
              </div>
              <div className="h-10 w-10 rounded-full bg-linear-to-br from-blue-50 to-blue-100 dark:from-blue-900 dark:to-blue-800 border border-blue-200 dark:border-blue-700 flex items-center justify-center text-blue-700 dark:text-blue-300 font-bold shadow-sm ring-4 ring-white dark:ring-slate-950 transition-colors duration-300 shrink-0 select-none">
                {user?.email?.charAt(0).toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 scroll-smooth" onClick={() => setIsLangMenuOpen(false)}>
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}