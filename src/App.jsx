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
  const { user } = useAuth();

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Login */}
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />

        {/* Subscription Selection */}
        <Route path="/subscription" element={user ? <Subscription /> : <Navigate to="/login" />} />

        {/* Protected Customer Routes */}
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

            {/* Super Admin Restricted Control Route */}
            <Route element={<RequireAdmin />}>
              <Route path="admin" element={<AdminDashboard />} />
            </Route>
          </Route>
        </Route>

        {/* Wildcard Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;