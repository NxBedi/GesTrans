import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { reportsApi, containersApi } from '../utils/api.js';

const statusLabels = { registered: 'مسجلة', processing: 'قيد تسجيل الفواتير', closed: 'جاهزة للتسعير', priced: 'تم التسعير' };

const mru = (n) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(Number(n || 0)) + ' MRU';
const ddmm = (iso) => {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  return `${d}/${m}/${y}`;
};

export default function Dashboard() {
  const { user } = useAuth();
  const isManager = user?.role === 'manager';
  const [summary, setSummary] = useState(null);
  const [payments, setPayments] = useState({ today_total: 0, recent: [] });
  const [balances, setBalances] = useState([]);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    if (isManager) {
      reportsApi.summary().then(setSummary).catch(() => {});
      reportsApi.recentPayments().then(setPayments).catch(() => {});
      reportsApi.balances().then(setBalances).catch(() => {});
    }
    containersApi.list().then((rows) => setRecent(rows.slice(0, 8))).catch(() => {});
  }, [user]);

  if (!isManager) {
    return (
      <div className="page">
        <h1 className="page-title">مرحباً {user?.full_name} 👋</h1>
        <p className="page-sub">أحدث الحاويات المسجلة</p>
        <ContainerTable rows={recent} />
      </div>
    );
  }

  const clients = summary?.customers ?? 0;
  const solde = Number(summary?.cash_box ?? 0);
  const totalBL = Object.values(summary?.containers ?? {}).reduce((a, b) => a + b, 0);
  const endettes = balances.filter((b) => Number(b.balance) > 0).length;
  const charges = Number(summary?.totals?.costs ?? 0);
  const todayTotal = Number(payments.today_total ?? 0);
  const derniers = (payments.recent || []).slice(0, 5);

  return (
    <div className="page">
      <div className="dash-row">
        <SummaryCard icon="👥" iconBg="#8b5cf6" label="Clients" to="/customers" value={fmt(clients)} valueColor="#0f172a" />
        <SummaryCard icon="🏦" iconBg="#16a34a" label="Solde caisse" to="/financial" value={mru(solde)} valueColor="#16a34a" />
        <SummaryCard icon="📄" iconBg="#f59e0b" label="Total BL" to="/containers" value={fmt(totalBL)} valueColor="#d97706" />
        <SummaryCard icon="⚠️" iconBg="#dc2626" label="Clients endettés" to="/balances" value={fmt(endettes)} valueColor="#dc2626" />
      </div>

      <div className="dash-row-2">
        <div className="card">
          <div className="dash-label">Charges payées (total) <span className="dash-arrow">↗</span></div>
          <div className="dash-big-value" style={{ color: '#e11d48', textAlign: 'left' }}>{mru(charges)}</div>
        </div>
        <div className="card">
          <div className="dash-label">Versements aujourd'hui <span className="dash-arrow">↗</span></div>
          <div className="dash-big-value" style={{ color: '#16a34a', textAlign: 'left' }}>{mru(todayTotal)}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: 16 }}>
        <h3 style={{ padding: '16px 20px 0' }}>🕐 Derniers versements</h3>
        <div style={{ padding: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ textAlign: 'right' }}>Client</th>
                <th style={{ textAlign: 'right' }}>Date</th>
                <th style={{ textAlign: 'right' }}>Montant</th>
              </tr>
            </thead>
            <tbody>
              {derniers.length === 0 && (
                <tr><td colSpan="3" className="muted" style={{ textAlign: 'center', padding: 20 }}>Aucun versement</td></tr>
              )}
              {derniers.map((p) => (
                <tr key={p.id}>
                  <td style={{ textAlign: 'right' }}>{p.customer_name}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{ddmm(p.payment_date)}</td>
                  <td style={{ textAlign: 'right', color: '#16a34a', fontWeight: 800, whiteSpace: 'nowrap' }}>{mru(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ icon, iconBg, label, to, value, valueColor }) {
  return (
    <Link to={to} className="card dash-card">
      <div className="dash-icon" style={{ background: iconBg }}><span>{icon}</span></div>
      <div style={{ minWidth: 0 }}>
        <div className="dash-label">{label} <span className="dash-arrow">↗</span></div>
        <div className="dash-value" style={{ color: valueColor }}>{value}</div>
      </div>
    </Link>
  );
}

function StatCard({ label, value, tint }) {
  return (
    <div className="card stat-card">
      <div className="stat-value" style={{ color: tint }}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export function fmt(n) {
  return new Intl.NumberFormat('ar-MA', { maximumFractionDigits: 2 }).format(Number(n || 0));
}

export function ContainerTable({ rows, onClose = null }) {
  if (!rows.length) return <p className="muted">لا توجد بيانات</p>;
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <table className="table">
        <thead>
          <tr>
            <th>BL</th>
            <th>رقم الحاوية</th>
            <th>النوع</th>
            <th>الزبون</th>
            <th>التاريخ</th>
            <th>الحالة</th>
            <th>الإجراءات</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td className="nowrap"><b>{c.bl_number}</b></td>
              <td>{c.container_number}</td>
              <td className="nowrap">{c.container_type ? `${c.container_type}′` : '—'}</td>
              <td>{c.customer_name}</td>
              <td className="nowrap">{c.registration_date}</td>
              <td><span className={`badge badge-${c.status}`}>{statusLabels[c.status] || c.status}</span></td>
              <td className="nowrap">
                {onClose && ['registered', 'processing'].includes(c.status) && (
                  <button className="btn btn-danger btn-sm" onClick={() => onClose(c)}>إغلاق</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}