import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useCompany } from '../contexts/CompanyContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import { accountantApi, reportsApi } from '../utils/api.js';
import CompanyLogo from './CompanyLogo.jsx';
import LanguageSwitcher from './LanguageSwitcher.jsx';

function share(ico, label, to) {
  return { ico, label, to };
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { company } = useCompany();
  const { t, fmt, companyName, roleLabel } = useI18n();
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

  const employeeLinks = [
    share('🏠', t('nav.dashboard'), '/'),
    share('📦', t('nav.containers'), '/containers'),
    share('📅', t('nav.myExpenses'), '/my-expenses'),
  ];

  const mainNav = [
    share('🏠', t('nav.dashboard'), '/'),
    share('👥', t('nav.customersDebts'), '/debts'),
    share('📦', t('nav.containers'), '/containers'),
    share('💵', t('nav.cashbox'), '/financial'),
    share('📊', t('nav.reports'), '/reports'),
  ];

  const financeLinks = [
    { to: '/general-expenses', label: t('nav.institutionExpenses'), ico: '🏢' },
    { to: '/expenses', label: t('nav.workerExpenses'), ico: '💸' },
    { to: '/salary', label: t('nav.salarySheets'), ico: '💵' },
  ];

  const opsLinks = [
    { to: '/liquidations', label: t('nav.liquidations'), ico: '✅' },
    { to: '/pricing-queue', label: t('nav.pricingQueue'), ico: '💰' },
    { to: '/finished', label: t('nav.finished'), ico: '🧾' },
    { to: '/invoice-types', label: t('nav.invoiceTypes'), ico: '🧾' },
    { to: '/users', label: t('nav.users'), ico: '🛡️' },
  ];

  const accountantLinks = [
    { to: '/accountant', label: t('nav.accountantDashboard'), ico: '🧮' },
    { to: '/accountant/wages', label: t('nav.accountantWages'), ico: '💵' },
    { to: '/accountant/expenses', label: t('nav.institutionExpenses'), ico: '🏢' },
    { to: '/accountant/worker-expenses', label: t('nav.workerExpenses'), ico: '💸' },
    { to: '/accountant/invoices', label: t('nav.accountantInvoices'), ico: '🧾' },
    { to: '/accountant/cashbox', label: t('nav.accountantCashbox'), ico: '🏦' },
    { to: '/accountant/reports', label: t('nav.accountantReports'), ico: '📊' },
    { to: '/accountant/audit', label: t('nav.accountantAudit'), ico: '🕒' },
  ];

  const settingsLinks = [{ to: '/settings', label: t('nav.settings'), ico: '⚙️' }];

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
          {fmt(cash, { maximumFractionDigits: 0 })}
        </span>
      )}
    </NavLink>
  );

  return (
    <div className={`layout${sidebarOpen ? ' sidebar-open' : ''}`}>
      <button
        className="menu-toggle"
        onClick={() => setSidebarOpen(true)}
        aria-label={t('nav.openMenu')}
      >
        ☰
      </button>
      {sidebarOpen && <div className="sidebar-backdrop" onClick={closeSidebar} />}
      <aside className="sidebar">
        <button className="sidebar-close" onClick={closeSidebar} aria-label={t('nav.closeMenu')}>✕</button>
        <div className="sidebar-brand">
          <CompanyLogo className="sidebar-logo" alt={companyName(company)} />
          <div className="sidebar-brand-name">{companyName(company)}</div>
          <div className="sidebar-brand-sub" dir="ltr">{company.form}</div>
        </div>
        <nav className="sidebar-nav">
          {isAccountant ? (
            <>
              <div className="nav-group">
                <div className="nav-group-title">{t('nav.main')}</div>
                {accountantLinks.slice(0, 1).map((l) => <NavBtn key={l.to} l={l} />)}
              </div>
              <div className="nav-group">
                <div className="nav-group-title">{t('nav.operations')}</div>
                {accountantLinks.slice(1).map((l) => <NavBtn key={l.to} l={l} />)}
              </div>
            </>
          ) : (
            <>
              <div className="nav-group">
                <div className="nav-group-title">{t('nav.main')}</div>
                {(isManager ? mainNav : employeeLinks).map((l) => <NavBtn key={l.to} l={l} />)}
              </div>
              {isManager && (
                <div className="nav-group">
                  <div className="nav-group-title">{t('nav.operations')}</div>
                  {financeLinks.map((l) => <NavBtn key={l.to} l={l} />)}
                </div>
              )}
              {isManager && (
                <div className="nav-group">
                  <div className="nav-group-title">{t('nav.administration')}</div>
                  {opsLinks.map((l) => <NavBtn key={l.to} l={l} />)}
                  {settingsLinks.map((l) => <NavBtn key={l.to} l={l} />)}
                </div>
              )}
            </>
          )}
        </nav>
        <div className="sidebar-user">
          <div className="name">{user?.full_name}</div>
          <div className="role">{roleLabel(user?.role) || (isManager ? t('nav.roleManager') : t('nav.roleEmployee'))}</div>
          <LanguageSwitcher className="lang-switch-sidebar" />
          <button className="btn btn-outline btn-sm" style={{ width: '100%', marginTop: 10, color: '#e2e8f0', borderColor: '#334155' }} onClick={handleLogout}>
            {t('nav.logout')}
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
