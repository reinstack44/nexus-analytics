import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/auth/Login';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/dashboard/Dashboard';
import BrandMaster from './pages/inventory/BrandMaster'; 
import PurchaseManager from './pages/purchases/PurchaseManager'; 
import DailyStock from './pages/stock/DailyStock'; 
import ProfitLoss from './pages/reports/ProfitLoss'; 
import Reports from './pages/reports/Reports';
import MagicChart from './pages/reports/MagicChart';

function App() {
  const { user } = useAuth();

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Login Route: Redirects to dashboard if user session is already active */}
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />

        {/* Private Shell Routes: Protected by active authentication checks */}
        <Route path="/" element={user ? <AppLayout /> : <Navigate to="/login" />}>
          <Route index element={<Dashboard />} />
          <Route path="brands" element={<BrandMaster />} />
          <Route path="purchases" element={<PurchaseManager />} />
          <Route path="daily-stock" element={<DailyStock />} />
          <Route path="profit-loss" element={<ProfitLoss />} />
          <Route path="reports" element={<Reports />} />
          <Route path="magic-chart" element={<MagicChart />} />
        </Route>

        {/* Wildcard Fallback: Catches invalid paths and redirects back to dashboard */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;