import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext.jsx';
import Login from './pages/Login.jsx';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Debts from './pages/Debts.jsx';
import Settings from './pages/Settings.jsx';
import ListeBL from './pages/ListeBL.jsx';
import PricingQueue from './pages/PricingQueue.jsx';
import FinishedContainers from './pages/FinishedContainers.jsx';
import Customers from './pages/Customers.jsx';
import ClientAccount from './pages/ClientAccount.jsx';
import Users from './pages/Users.jsx';
import InvoiceTypes from './pages/InvoiceTypes.jsx';
import Reports from './pages/Reports.jsx';
import Expenses from './pages/Expenses.jsx';
import MyExpenses from './pages/MyExpenses.jsx';
import GeneralExpenses from './pages/GeneralExpenses.jsx';
import Financial from './pages/Financial.jsx';
import SalaryLedger from './pages/SalaryLedger.jsx';
import Liquidations from './pages/Liquidations.jsx';
import AccountantDashboard from './pages/AccountantDashboard.jsx';
import AccountantWages from './pages/AccountantWages.jsx';
import AccountantExpenses from './pages/AccountantExpenses.jsx';
import AccountantWorkerExpenses from './pages/AccountantWorkerExpenses.jsx';
import AccountantInvoices from './pages/AccountantInvoices.jsx';
import AccountantCashbox from './pages/AccountantCashbox.jsx';
import AccountantReports from './pages/AccountantReports.jsx';
import AccountantAudit from './pages/AccountantAudit.jsx';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <div className="page">جارٍ التحميل...</div>;

  const isManager = user?.role === 'manager';
  const isAccountant = user?.role === 'accountant';

  // المحاسب لديه وحدته المالية الخاصة ولا يرى وحدات التشغيل
  const accountantOnly = (element) => (isAccountant ? element : <Navigate to="/" />);
  const managerOnly = (element) => (isManager ? element : <Navigate to="/" />);

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
      <Route element={<Layout />}>
        <Route index element={user ? (isAccountant ? <AccountantDashboard /> : <Dashboard />) : <Navigate to="/login" />} />

        {/* المحاسب — الوحدة المالية */}
        <Route path="/accountant" element={accountantOnly(<AccountantDashboard />)} />
        <Route path="/accountant/wages" element={accountantOnly(<AccountantWages />)} />
        <Route path="/accountant/expenses" element={accountantOnly(<AccountantExpenses />)} />
        <Route path="/accountant/worker-expenses" element={accountantOnly(<AccountantWorkerExpenses />)} />
        <Route path="/accountant/invoices" element={accountantOnly(<AccountantInvoices />)} />
        <Route path="/accountant/cashbox" element={accountantOnly(<AccountantCashbox />)} />
        <Route path="/accountant/reports" element={accountantOnly(<AccountantReports />)} />
        <Route path="/accountant/audit" element={accountantOnly(<AccountantAudit />)} />

        {/* المدير — كل الصلاحيات */}
        <Route path="/debts" element={managerOnly(<Debts />)} />
        <Route path="/settings" element={managerOnly(<Settings />)} />
        <Route path="/liquidations" element={managerOnly(<Liquidations />)} />
        <Route path="/pricing-queue" element={managerOnly(<PricingQueue />)} />
        <Route path="/finished" element={managerOnly(<FinishedContainers />)} />
        <Route path="/users" element={managerOnly(<Users />)} />
        <Route path="/invoice-types" element={managerOnly(<InvoiceTypes />)} />
        <Route path="/reports" element={managerOnly(<Reports />)} />
        <Route path="/expenses" element={managerOnly(<Expenses />)} />
        <Route path="/general-expenses" element={managerOnly(<GeneralExpenses />)} />
        <Route path="/financial" element={managerOnly(<Financial />)} />
        <Route path="/salary" element={managerOnly(<SalaryLedger />)} />

        {/* التشغيل — للمدير والعامل */}
        <Route path="/containers" element={user && !isAccountant ? <ListeBL /> : <Navigate to="/" />} />
        <Route path="/my-expenses" element={user && !isAccountant ? <MyExpenses /> : <Navigate to="/" />} />
        <Route path="/customers" element={user && !isAccountant ? <Customers /> : <Navigate to="/" />} />
        {/*French client list + one-click account statement (manager only: financial data)*/}
        <Route path="/clients" element={managerOnly(<Customers />)} />
        <Route path="/clients/:id/compte" element={managerOnly(<ClientAccount />)} />
      </Route>
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
