import { useState, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../config/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext'; 
import { useTranslation } from 'react-i18next'; 
import { LayoutDashboard, Tag, ShoppingCart, Package, TrendingUp, LogOut, Menu, X, Wine, ChevronLeft, ChevronRight, Sun, Moon, Globe, FileText } from 'lucide-react';

export default function AppLayout() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme(); 
  const { t, i18n } = useTranslation(); 
  const location = useLocation();
  const navigate = useNavigate();

  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false); 

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
    { name: t('sidebar.reports', 'Reports'), path: '/reports', icon: FileText }, 
  ];

  return (
    <div className="flex h-screen bg-[#F8FAFC] dark:bg-slate-950 overflow-hidden font-sans transition-colors duration-300">
      
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 z-40 lg:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <div 
        className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-[#0B1121] text-slate-300 transition-all duration-300 ease-in-out border-r border-slate-800/60 shadow-2xl lg:shadow-none
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 ${isCollapsed ? 'lg:w-20' : 'lg:w-64'} w-72`}
      >
        
        {!isMobile && (
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="absolute -right-3.5 top-8 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-full p-1.5 shadow-md hover:bg-blue-50 dark:hover:bg-slate-700 hover:text-blue-600 dark:hover:text-blue-400 transition-colors z-60 focus:outline-none"
          >
            {isCollapsed ? <ChevronRight size={14} strokeWidth={3} /> : <ChevronLeft size={14} strokeWidth={3} />}
          </button>
        )}

        <div className="h-20 flex items-center justify-between px-5 border-b border-slate-800/60 shrink-0">
          <div className="flex items-center overflow-hidden whitespace-nowrap">
            <div className="min-w-10 flex items-center justify-center">
              <div className="h-10 w-10 bg-linear-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Wine className="text-white" size={22} />
              </div>
            </div>
            <span className={`ml-3 text-lg font-bold text-white tracking-wide transition-all duration-300 ${isCollapsed ? 'opacity-0 w-0 hidden lg:block' : 'opacity-100 w-auto'}`}>
              {t('header.brandName', 'Elixir Store')}
            </span>
          </div>
          
          <button className="lg:hidden text-slate-400 hover:text-white bg-slate-800/50 p-2 rounded-lg outline-none" onClick={() => setIsMobileOpen(false)}>
            <X size={20} />
          </button>
        </div>
        
        <nav className="flex-1 px-3 py-6 space-y-2 overflow-y-auto custom-scrollbar">
          {navItems.map((item, index) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            return (
              <Link
                key={index}
                to={item.path}
                onClick={() => isMobile && setIsMobileOpen(false)}
                className={`flex items-center px-3 py-3.5 rounded-xl transition-all duration-300 group relative
                  ${isActive 
                    ? 'bg-blue-500/10 text-blue-400' 
                    : 'hover:bg-slate-800/40 hover:text-slate-200'
                  }`}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-500 rounded-r-full shadow-[0_0_12px_rgba(59,130,246,0.8)]"></div>
                )}

                <div className="min-w-6 flex justify-center">
                  <Icon size={22} className={`transition-colors duration-300 ${isActive ? 'text-blue-500' : 'text-slate-500 group-hover:text-slate-300'}`} />
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
            onClick={handleLogout} 
            className="flex items-center px-3 py-3 w-full rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-300 group relative outline-none"
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

      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out ${isCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
        
        <header className="h-20 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 flex justify-between items-center px-4 sm:px-8 z-30 sticky top-0 transition-colors duration-300">
          <div className="flex items-center gap-4">
            
            {isMobile && (
              <button 
                className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors focus:ring-2 focus:ring-blue-100 dark:focus:ring-slate-700 outline-none"
                onClick={() => setIsMobileOpen(true)}
              >
                <Menu size={24} />
              </button>
            )}
            
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 tracking-tight hidden sm:block transition-colors duration-300">
              {t('header.ownerPortal', 'Welcome Owner..')}
            </h1>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">

            <div className="relative">
              <button 
                onClick={() => setIsLangMenuOpen(!isLangMenuOpen)} 
                className="flex items-center gap-2 p-2.5 text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all duration-300 outline-none shadow-sm font-semibold text-sm uppercase"
                title="Change Language"
              >
                <Globe size={18} className="text-blue-600 dark:text-blue-400" />
                <span className="hidden sm:block">{i18n.language || 'EN'}</span>
              </button>
              
              {isLangMenuOpen && (
                <div className="absolute right-0 mt-2 w-36 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl shadow-lg py-2" style={{ zIndex: 99999 }}>
                  <button onClick={() => changeLanguage('en')} className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${i18n.language === 'en' ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-700 dark:text-slate-300'}`}>English</button>
                  <button onClick={() => changeLanguage('hi')} className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${i18n.language === 'hi' ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-700 dark:text-slate-300'}`}>हिन्दी (Hindi)</button>
                  <button onClick={() => changeLanguage('mr')} className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${i18n.language === 'mr' ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-700 dark:text-slate-300'}`}>मराठी (Marathi)</button>
                </div>
              )}
            </div>

            <button 
              onClick={toggleTheme} 
              className="p-2.5 text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all duration-300 outline-none shadow-sm"
              title="Toggle Theme"
            >
              {theme === 'dark' ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} className="text-blue-600" />}
            </button>

            <div className="flex items-center gap-3 border-l border-slate-200 dark:border-slate-700 pl-3 sm:pl-5 transition-colors duration-300">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">
                  {t('header.activeSession', 'Active Session')}
                </span>
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 transition-colors duration-300">{user?.email}</span>
              </div>
              <div className="h-10 w-10 rounded-full bg-linear-to-br from-blue-50 to-blue-100 dark:from-blue-900 dark:to-blue-800 border border-blue-200 dark:border-blue-700 flex items-center justify-center text-blue-700 dark:text-blue-300 font-bold shadow-sm ring-4 ring-white dark:ring-slate-950 transition-colors duration-300 shrink-0">
                {user?.email?.charAt(0).toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        {/* FIX: Z-index 10 is removed to prevent modal clipping issues */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 scroll-smooth" onClick={() => setIsLangMenuOpen(false)}>
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}