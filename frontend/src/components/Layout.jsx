import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useCompany } from '../contexts/CompanyContext.jsx';
import { accountantApi, reportsApi } from '../utils/api.js';
import CompanyLogo from './CompanyLogo.jsx';

function share(ico, label, to) {
  return { ico, label, to };
}

const employeeLinks = [
  share('🏠', 'لوحة التحكم', '/'),
  share('📦', 'الحاويات', '/containers'),
  share('📅', 'مصاريفي اليومية', '/my-expenses'),
];

const mainNav = [
  share('🏠', 'لوحة التحكم', '/'),
  share('👥', 'العملاء والديون', '/debts'),
  share('📦', 'الحاويات', '/containers'),
  share('💵', 'الصندوق', '/financial'),
  share('📊', 'التقارير', '/reports'),
];

const financeLinks = [
  { to: '/general-expenses', label: 'مصاريف المؤسسة', ico: '🏢' },
  { to: '/expenses', label: 'مصاريف العمال', ico: '💸' },
  { to: '/salary', label: 'كشوفات الموظفين', ico: '💵' },
];

const opsLinks = [
  { to: '/liquidations', label: 'LIQUIDATION المدفوعة', ico: '✅' },
  { to: '/pricing-queue', label: 'جاهزة للتسعير', ico: '💰' },
  { to: '/finished', label: 'إنهاء الحسابات', ico: '🧾' },
  { to: '/invoice-types', label: 'أنواع الفواتير', ico: '🧾' },
  { to: '/users', label: 'المستخدمون والصلاحيات', ico: '🛡️' },
];

const accountantLinks = [
  { to: '/accountant', label: 'لوحة المحاسب', ico: '🧮' },
  { to: '/accountant/wages', label: 'الرواتب', ico: '💵' },
  { to: '/accountant/expenses', label: 'مصاريف المؤسسة', ico: '🏢' },
  { to: '/accountant/worker-expenses', label: 'مصاريف العمال', ico: '💸' },
  { to: '/accountant/invoices', label: 'فواتير الحاويات', ico: '🧾' },
  { to: '/accountant/cashbox', label: 'الصندوق', ico: '🏦' },
  { to: '/accountant/reports', label: 'التقارير المالية', ico: '📊' },
  { to: '/accountant/audit', label: 'سجل التدقيق', ico: '🕒' },
];

const settingsLinks = [{ to: '/settings', label: 'إعدادات النظام', ico: '⚙️' }];

export default function Layout() {
  const { user, logout } = useAuth();
  const { company } = useCompany();
  const navigate = useNavigate();
  const isManager = user?.role === 'manager';
  const isAccountant = user?.role === 'accountant';
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [cash, setCash] = useState(null);

  useEffect(() => {
    if (isManager) reportsApi.dashboard().then((d) => setCash(Number(d?.cash_in_hand ?? 0))).catch(() => {});
    if (isAccountant) accountantApi.dashboard().then((d) => setCash(Number(d?.cash_in_hand ?? 0))).catch(() => {});
  }, [isManager, isAccountant]);


  const closeSidebar = () => setSidebarOpen(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const NavBtn = ({ l }) => (
    <NavLink
      key={l.to}
      to={l.to}
      end={l.to === '/' || l.to === '/accountant'}
      onClick={closeSidebar}
      className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
    >
      <span className="nav-ico">{l.ico}</span>
      <span>{l.label}</span>
      {((l.to === '/financial' && isManager) || (l.to === '/accountant/cashbox' && isAccountant)) && cash != null && (
        <span style={{ marginInlineStart: 'auto', background: 'rgba(255,255,255,.14)', borderRadius: 20, padding: '1px 8px', fontSize: 11, direction: 'ltr', fontWeight: 800 }}>
          {new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(cash)}
        </span>
      )}
    </NavLink>
  );

  return (
    <div className={`layout${sidebarOpen ? ' sidebar-open' : ''}`}>
      <button
        className="menu-toggle"
        onClick={() => setSidebarOpen(true)}
        aria-label="فتح القائمة"
      >
        ☰
      </button>
      {sidebarOpen && <div className="sidebar-backdrop" onClick={closeSidebar} />}
      <aside className="sidebar">
        <button className="sidebar-close" onClick={closeSidebar} aria-label="إغلاق القائمة">✕</button>
        <div className="sidebar-brand">
          <CompanyLogo className="sidebar-logo" alt={company.nameAr} />
          <div className="sidebar-brand-name">{company.nameAr}</div>
          <div className="sidebar-brand-sub" dir="ltr">{company.form}</div>
        </div>
        <nav className="sidebar-nav">
          {isAccountant ? (
            <>
              <div className="nav-group">
                <div className="nav-group-title">الرئيسية</div>
                {accountantLinks.slice(0, 1).map((l) => <NavBtn key={l.to} l={l} />)}
              </div>
              <div className="nav-group">
                <div className="nav-group-title">الوحدة المالية</div>
                {accountantLinks.slice(1).map((l) => <NavBtn key={l.to} l={l} />)}
              </div>
            </>
          ) : (
            <>
              <div className="nav-group">
                <div className="nav-group-title">الرئيسية</div>
                {(isManager ? mainNav : employeeLinks).map((l) => <NavBtn key={l.to} l={l} />)}
              </div>
              {isManager && (
                <div className="nav-group">
                  <div className="nav-group-title">العمليات والمالية</div>
                  {financeLinks.map((l) => <NavBtn key={l.to} l={l} />)}
                </div>
              )}
              {isManager && (
                <div className="nav-group">
                  <div className="nav-group-title">إدارة</div>
                  {opsLinks.map((l) => <NavBtn key={l.to} l={l} />)}
                  {settingsLinks.map((l) => <NavBtn key={l.to} l={l} />)}
                </div>
              )}
            </>
          )}
        </nav>
        <div className="sidebar-user">
          <div className="name">{user?.full_name}</div>
          <div className="role">{isManager ? 'مدير' : isAccountant ? 'محاسب' : 'موظف'}</div>
          <button className="btn btn-outline btn-sm" style={{ width: '100%', marginTop: 10, color: '#e2e8f0', borderColor: '#334155' }} onClick={handleLogout}>
            تسجيل الخروج
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}