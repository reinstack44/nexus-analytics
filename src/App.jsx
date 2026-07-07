import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/auth/Login';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/dashboard/Dashboard';
import BrandMaster from './pages/inventory/BrandMaster'; // Naya Brand Master
import PurchaseManager from './pages/purchases/PurchaseManager'; // Naya Purchase Manager
import DailyStock from './pages/stock/DailyStock'; // Naya Daily Stock
import ProfitLoss from './pages/reports/ProfitLoss'; // Naya P&L

function App() {
  const { user } = useAuth();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />

        <Route path="/" element={user ? <AppLayout /> : <Navigate to="/login" />}>
          <Route index element={<Dashboard />} />
          <Route path="brands" element={<BrandMaster />} />
          <Route path="purchases" element={<PurchaseManager />} />
          <Route path="daily-stock" element={<DailyStock />} />
          <Route path="profit-loss" element={<ProfitLoss />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;