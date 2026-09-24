import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/auth/Login';
import Subscription from './pages/subscription/Subscription';
import RequireSubscription from './components/auth/RequireSubscription';
import RequireAdmin from './components/auth/RequireAdmin';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/dashboard/Dashboard';
import BrandMaster from './pages/inventory/BrandMaster'; 
import PurchaseManager from './pages/purchases/PurchaseManager'; 
import DailyStock from './pages/stock/DailyStock'; 
import ProfitLoss from './pages/reports/ProfitLoss'; 
import Reports from './pages/reports/Reports';
import MagicChart from './pages/reports/MagicChart';
import Settings from './pages/settings/Settings';
import AdminDashboard from './pages/admin/AdminDashboard';

function App() {
  const { user, isAdmin } = useAuth();

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Login Route: Admin goes to /admin directly, Regular user to / */}
        <Route 
          path="/login" 
          element={
            !user ? (
              <Login />
            ) : isAdmin ? (
              <Navigate to="/admin" replace />
            ) : (
              <Navigate to="/" replace />
            )
          } 
        />

        {/* Subscription Route: Admin is redirected to /admin immediately */}
        <Route 
          path="/subscription" 
          element={
            !user ? (
              <Navigate to="/login" replace />
            ) : isAdmin ? (
              <Navigate to="/admin" replace />
            ) : (
              <Subscription />
            )
          } 
        />

        {/* Super Admin Control Center */}
        <Route element={<RequireAdmin />}>
          <Route element={<AppLayout />}>
            <Route path="admin" element={<AdminDashboard />} />
          </Route>
        </Route>

        {/* Regular Store Users (Gated by Subscription) */}
        <Route element={<RequireSubscription />}>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="brands" element={<BrandMaster />} />
            <Route path="purchases" element={<PurchaseManager />} />
            <Route path="daily-stock" element={<DailyStock />} />
            <Route path="profit-loss" element={<ProfitLoss />} />
            <Route path="reports" element={<Reports />} />
            <Route path="magic-chart" element={<MagicChart />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to={isAdmin ? "/admin" : "/"} replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;