import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import logo from '../assets/logo.png';

const employeeLinks = [
  { to: '/', label: 'لوحة التحكم', icon: '🏠' },
  { to: '/containers', label: 'الحاويات', icon: '📦' },
  { to: '/my-expenses', label: 'مصاريفي اليومية', icon: '📅' },
];

const managerLinks = [
  { to: '/', label: 'لوحة التحكم', icon: '🏠' },
  { to: '/liquidations', label: 'LIQUIDATION المدفوعة', icon: '✅' },
  { to: '/containers', label: 'الحاويات', icon: '📦' },
  { to: '/pricing-queue', label: 'جاهزة للتسعير', icon: '💰' },
  { to: '/finished', label: 'الحسابات', icon: '🧾' },
  { to: '/customers', label: 'الزبائن', icon: '👥' },
  { to: '/invoice-types', label: 'أنواع الفواتير', icon: '🧾' },
  { to: '/reports', label: 'التقارير والأرباح', icon: '📊' },
  { to: '/expenses', label: 'مصاريف العمال', icon: '💸' },
  { to: '/general-expenses', label: 'مصاريف المؤسسة', icon: '🏢' },
  { to: '/financial', label: 'الصندوق ورأس المال', icon: '💰' },
  { to: '/salary', label: 'كشوفات حسابات الموظفين', icon: '💵' },
  { to: '/balances', label: 'ديون الزبناء', icon: '💰' },
  { to: '/users', label: 'المستخدمون', icon: '👤' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const links = user?.role === 'manager' ? managerLinks : employeeLinks;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src={logo} alt="شعار الوكالة الموريتانية للخدمات" className="sidebar-logo" />
          <div>
            <div className="sidebar-brand-name">الوكالة الموريتانية للخدمات</div>
            <div className="sidebar-brand-sub">A.M.S - Sarl</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.to === '/'} className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
              <span>{l.icon}</span> {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-user">
          <div className="name">{user?.full_name}</div>
          <div className="role">{user?.role === 'manager' ? 'مدير' : 'موظف'}</div>
          <button className="btn btn-outline btn-sm" style={{ width: '100%', marginTop: 10, color: '#fff', borderColor: '#334155' }} onClick={handleLogout}>
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