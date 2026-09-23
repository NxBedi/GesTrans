import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { reportsApi, containersApi } from '../utils/api.js';

const statusLabels = { registered: 'مسجلة', processing: 'قيد تسجيل الفواتير', closed: 'جاهزة للتسعير', priced: 'تم التسعير' };

export default function Dashboard() {
  const { user } = useAuth();
  const isManager = user?.role === 'manager';
  const [summary, setSummary] = useState(null);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    if (isManager) reportsApi.summary().then(setSummary).catch(() => {});
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

  return (
    <div className="page">
      <h1 className="page-title">لوحة التحكم</h1>
      <p className="page-sub">نظرة عامة على النشاط</p>

      <div className="grid grid-4">
        <StatCard label="قيد المعالجة" value={(summary?.containers?.registered ?? 0) + (summary?.containers?.processing ?? 0)} tint="#f59e0b" />
        <StatCard label="جاهزة للتسعير" value={summary?.containers?.closed ?? 0} tint="#7c3aed" />
        <StatCard label="مُسعّرة" value={summary?.containers?.priced ?? 0} tint="#3b82f6" />
        <StatCard label="إجمالي الحاويات" value={(summary?.containers?.registered ?? 0) + (summary?.containers?.processing ?? 0) + (summary?.containers?.closed ?? 0) + (summary?.containers?.priced ?? 0)} tint="#64748b" />
      </div>

      <div className="grid grid-3" style={{ marginTop: 16 }}>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: Number(summary?.cash_box) >= 0 ? '#0d9488' : '#dc2626' }}>{fmt(summary?.cash_box)}</div>
          <div className="stat-label">النقد في الصندوق</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: Number(summary?.opening_debts) > 0 ? '#7c3aed' : '#16a34a' }}>{fmt(summary?.opening_debts)}</div>
          <div className="stat-label">الديون القديمة المتبقية</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#16a34a' }}>{fmt(summary?.totals?.profit)}</div>
          <div className="stat-label">إجمالي الأرباح</div>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginTop: 16 }}>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#dc2626' }}>{fmt(summary?.general_expenses)}</div>
          <div className="stat-label">مصاريف المؤسسة</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: Number(summary?.totals?.profit) - Number(summary?.general_expenses) >= 0 ? '#16a34a' : '#dc2626' }}>
            {fmt(Number(summary?.totals?.profit) - Number(summary?.general_expenses))}
          </div>
          <div className="stat-label">الربح الصافي (بعد مصاريف المؤسسة)</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: Number(summary?.customer_debt) > 0 ? '#dc2626' : '#16a34a' }}>{fmt(summary?.customer_debt)}</div>
          <div className="stat-label">صافي مستحقات الزبائن (موجب = دين لنا)</div>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 12 }}>أحدث الحاويات</h2>
        <ContainerTable rows={recent} />
      </div>
    </div>
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