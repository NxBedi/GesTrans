import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext.jsx';
import Login from './pages/Login.jsx';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Debts from './pages/Debts.jsx';
import Payments from './pages/Payments.jsx';
import Settings from './pages/Settings.jsx';
import ListeBL from './pages/ListeBL.jsx';
import PricingQueue from './pages/PricingQueue.jsx';
import FinishedContainers from './pages/FinishedContainers.jsx';
import Customers from './pages/Customers.jsx';
import Users from './pages/Users.jsx';
import InvoiceTypes from './pages/InvoiceTypes.jsx';
import Reports from './pages/Reports.jsx';
import Expenses from './pages/Expenses.jsx';
import MyExpenses from './pages/MyExpenses.jsx';
import GeneralExpenses from './pages/GeneralExpenses.jsx';
import Financial from './pages/Financial.jsx';
import SalaryLedger from './pages/SalaryLedger.jsx';
import CustomerBalance from './pages/CustomerBalance.jsx';
import CustomerStatement from './pages/CustomerStatement.jsx';
import Liquidations from './pages/Liquidations.jsx';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <div className="page">جارٍ التحميل...</div>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
      <Route element={<Layout />}>
        <Route index element={user ? <Dashboard /> : <Navigate to="/login" />} />
        <Route path="/debts" element={user && user.role === 'manager' ? <Debts /> : <Navigate to="/" />} />
        <Route path="/payments" element={user && user.role === 'manager' ? <Payments /> : <Navigate to="/" />} />
        <Route path="/settings" element={user && user.role === 'manager' ? <Settings /> : <Navigate to="/" />} />
        <Route path="/containers" element={user ? <ListeBL /> : <Navigate to="/login" />} />
        <Route path="/liquidations" element={user && user.role === 'manager' ? <Liquidations /> : <Navigate to="/" />} />
        <Route path="/my-expenses" element={user ? <MyExpenses /> : <Navigate to="/login" />} />
        <Route path="/pricing-queue" element={user && user.role === 'manager' ? <PricingQueue /> : <Navigate to="/" />} />
        <Route path="/finished" element={user && user.role === 'manager' ? <FinishedContainers /> : <Navigate to="/" />} />
        <Route path="/customers" element={user ? <Customers /> : <Navigate to="/login" />} />
        <Route path="/users" element={user && user.role === 'manager' ? <Users /> : <Navigate to="/" />} />
        <Route path="/invoice-types" element={user && user.role === 'manager' ? <InvoiceTypes /> : <Navigate to="/" />} />
        <Route path="/reports" element={user && user.role === 'manager' ? <Reports /> : <Navigate to="/" />} />
        <Route path="/expenses" element={user && user.role === 'manager' ? <Expenses /> : <Navigate to="/" />} />
        <Route path="/general-expenses" element={user && user.role === 'manager' ? <GeneralExpenses /> : <Navigate to="/" />} />
        <Route path="/financial" element={user && user.role === 'manager' ? <Financial /> : <Navigate to="/" />} />
        <Route path="/salary" element={user && user.role === 'manager' ? <SalaryLedger /> : <Navigate to="/" />} />
        <Route path="/balances" element={user && user.role === 'manager' ? <CustomerBalance /> : <Navigate to="/" />} />
        <Route path="/customers/:id/statement" element={user && user.role === 'manager' ? <CustomerStatement /> : <Navigate to="/" />} />
      </Route>
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}