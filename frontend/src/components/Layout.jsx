import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { reportsApi } from '../utils/api.js';
import logo from '../assets/logo.png';

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
  share('💳', 'الدفعات', '/payments'),
  share('📦', 'الحاويات', '/containers'),
  share('💵', 'الصندوق', '/financial'),
  share('📊', 'التقارير', '/reports'),
];

const financeLinks = [
  { to: '/general-expenses', label: 'مصاريف المؤسسة', ico: '🏢' },
  { to: '/expenses', label: 'مصاريف العمال', ico: '💸' },
  { to: '/salary', label: 'كشوفات الموظفين', ico: '💵' },
  { to: '/balances', label: 'حسابات الزبائن', ico: '🧾' },
];

const opsLinks = [
  { to: '/liquidations', label: 'LIQUIDATION المدفوعة', ico: '✅' },
  { to: '/pricing-queue', label: 'جاهزة للتسعير', ico: '💰' },
  { to: '/finished', label: 'إنهاء الحسابات', ico: '🧾' },
  { to: '/invoice-types', label: 'أنواع الفواتير', ico: '🧾' },
  { to: '/users', label: 'المستخدمون والصلاحيات', ico: '🛡️' },
];

const settingsLinks = [{ to: '/settings', label: 'إعدادات النظام', ico: '⚙️' }];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isManager = user?.role === 'manager';
  const [compact] = useState(false);
  const [cash, setCash] = useState(null);

  useEffect(() => {
    if (isManager) reportsApi.dashboard().then((d) => setCash(Number(d?.cash_in_hand ?? 0))).catch(() => {});
  }, [isManager]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const NavBtn = ({ l }) => (
    <NavLink key={l.to} to={l.to} end={l.to === '/'} className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
      <span className="nav-ico">{l.ico}</span>
      <span>{l.label}</span>
      {l.to === '/financial' && isManager && cash != null && (
        <span style={{ marginInlineStart: 'auto', background: 'rgba(255,255,255,.14)', borderRadius: 20, padding: '1px 8px', fontSize: 11, direction: 'ltr', fontWeight: 800 }}>
          {new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(cash)}
        </span>
      )}
    </NavLink>
  );

  return (
    <div className={`layout${compact ? ' sidebar-open' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src={logo} alt="شعار الوكالة الموريتانية للخدمات" className="sidebar-logo" />
          <div className="sidebar-brand-name">الوكالة الموريتانية للخدمات</div>
          <div className="sidebar-brand-sub">A.M.S - Sarl</div>
        </div>
        <nav className="sidebar-nav">
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
        </nav>
        <div className="sidebar-user">
          <div className="name">{user?.full_name}</div>
          <div className="role">{isManager ? 'مدير' : 'موظف'}</div>
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