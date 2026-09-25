import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { reportsApi, containersApi } from '../utils/api.js';
import { dmy, STATUS_LABELS, money } from '../utils/format.js';

const pctOf = (cur, prev) => (cur === 0 && prev === 0 ? 0 : prev === 0 ? 100 : Math.round(((cur - prev) / Math.abs(prev)) * 100));

export default function Dashboard() {
  const { user } = useAuth();
  const isManager = user?.role === 'manager';
  const [dash, setDash] = useState(null);
  const [recent, setRecent] = useState([]);
  const [recentPay, setRecentPay] = useState([]);

  useEffect(() => {
    if (isManager) reportsApi.dashboard().then(setDash).catch(() => {});
    containersApi.list().then((rows) => setRecent(rows.slice(0, 8))).catch(() => {});
    if (isManager) reportsApi.recentPayments().then((p) => setRecentPay(p.recent || [])).catch(() => {});
  }, [user]);

  // KPI: cash + flows with previous-period comparison
  const kpis = useMemo(() => {
    const d = dash;
    if (!d) return null;
    const incomeUp = (d.income_change_pct ?? 0) >= 0;
    const expUp = (d.expense_change_pct ?? 0) >= 0;
    return [
      { ico: '💰', bg: '#f0fdf4', lbl: 'نقدية الصندوق', val: money(d.cash_in_hand), sub: 'رصيد الحركات النقدية', color: '#16a34a' },
      { ico: '📥', bg: '#eff6ff', lbl: 'دخل اليوم', val: money(d.today?.income), sub: `مقارنة بالبارح ${d.income_change_pct > 0 ? '+' : ''}${d.income_change_pct}%`, delta: `${d.income_change_pct > 0 ? '+' : ''}${d.income_change_pct}%`, deltaCls: incomeUp ? 'up' : 'down' },
      { ico: '📤', bg: '#fef2f2', lbl: 'مصروف اليوم', val: money(d.today?.expense), sub: `مقارنة بالبارح ${d.expense_change_pct > 0 ? '+' : ''}${d.expense_change_pct}%`, delta: `${d.expense_change_pct > 0 ? '+' : ''}${d.expense_change_pct}%`, deltaCls: expUp ? 'down' : 'up' },
      { ico: '⚖️', bg: '#f5f3ff', lbl: 'صافي اليوم', val: money(d.today?.net), sub: 'دخل − مصروف', color: d.today?.net >= 0 ? '#16a34a' : '#dc2626' },
    ];
  }, [dash]);

  const debtKpis = useMemo(() => {
    const d = dash?.debts;
    if (!d) return null;
    return [
      { ico: '📒', bg: '#fef2f2', lbl: 'إجمالي الديون', val: money(d.total), sub: `${d.debtors} عميل مدين` },
      { ico: '⏰', bg: '#fff7ed', lbl: 'ديون متأخرة', val: money(d.overdue_amount), sub: `${d.overdue_count} حالات متأخرة`, color: '#d97706' },
      { ico: '📦', bg: '#eff6ff', lbl: 'حاويات جارية', val: d.containers?.present || 0, sub: 'مسجلة + قيد تسجيل الفواتير' },
      { ico: '🔒', bg: '#f0fdf4', lbl: 'جاهزة للتسعير', val: d.containers?.in_transit || 0, sub: 'حاويات مغلقة (LIQUIDATION)' },
      { ico: '✅', bg: '#f5f3ff', lbl: 'حاويات مسعّرة', val: d.containers?.received || 0, sub: 'تم التسعير وإحالتها للحسابات' },
      { ico: '🧾', bg: '#f0f9ff', lbl: 'أرباح الحاويات', val: money(d.profit_total), sub: `محاسَب ${money(d.billed_total)}` },
    ];
  }, [dash]);

  if (!isManager) {
    return (
      <div className="page">
        <h1 className="page-title">مرحباً {user?.full_name}</h1>
        <p className="page-sub">أحدث الحاويات المسجلة</p>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <ContainerTable rows={recent} />
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">لوحة التحكم</h1>
          <p className="page-sub">نظرة شاملة على النقدية، الديون، الحاويات والأرباح</p>
        </div>
        <div className="tabs" style={{ pointerEvents: 'none', opacity: 0.9 }}>
          <span className="tab active">ملخص يومي</span>
        </div>
      </div>

      {!dash && <div className="empty-state"><span className="spinner" /></div>}

      {kpis && (
        <div className="kpi-grid" style={{ marginBottom: 18 }}>
          {kpis.map((k, i) => <KpiCard key={i} k={k} />)}
        </div>
      )}

      {debtKpis && (
        <div className="kpi-grid" style={{ marginBottom: 18 }}>
          {debtKpis.map((k, i) => <KpiCard key={`d${i}`} k={k} />)}
        </div>
      )}

      <div className="grid grid-2" style={{ marginBottom: 18 }}>
        {/* Containers status breakdown */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="card-header" style={{ padding: '16px 18px', marginBottom: 0 }}><div className="card-title">📦 الحاويات حسب الحالة</div></div>
          <div style={{ padding: 12 }}>
            <StatusBar data={dash?.containers} />
          </div>
        </div>
        {/* Recent payments */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="card-header" style={{ padding: '16px 18px', marginBottom: 0 }}>
            <div className="card-title">🕐 آخر الدفعات</div>
            <Link to="/payments" className="btn btn-outline btn-sm">كل الدفعات</Link>
          </div>
          <div style={{ padding: 12 }}>
            <table className="table">
              <thead><tr><th>العميل</th><th>التاريخ</th><th>المبلغ</th></tr></thead>
              <tbody>
                {recentPay.length === 0 && <tr><td colSpan="3" className="muted" style={{ textAlign: 'center', padding: 20 }}>لا دفعات بعد</td></tr>}
                {recentPay.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 700 }}>{p.customer_name}</td>
                    <td className="nowrap">{dmy(p.payment_date)}</td>
                    <td className="nowrap" style={{ color: '#16a34a', fontWeight: 800 }}>{fmt(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="card-header" style={{ padding: '16px 18px', marginBottom: 0 }}>
          <div className="card-title">🆕 أحدث الحاويات المسجلة</div>
          <Link to="/containers" className="btn btn-outline btn-sm">عرض الكل</Link>
        </div>
        <ContainerTable rows={recent} />
      </div>
    </div>
  );
}

function KpiCard({ k }) {
  return (
    <div className="kpi-card" style={{ marginBottom: 0 }}>
      <div className="kpi-icon" style={{ background: k.bg }}>{k.ico}</div>
      <div className="kpi-body">
        <div className="kpi-label">
          {k.lbl}
          {k.delta != null && <span className={`kpi-delta ${k.deltaCls}`}>{k.delta}</span>}
        </div>
        <div className="kpi-value" style={{ color: k.color || undefined }}>{k.val}</div>
        {k.sub && <div className="kpi-sub">{k.sub}</div>}
      </div>
    </div>
  );
}

function StatusBar({ data }) {
  if (!data) return <div className="empty-state"><span className="spinner" /></div>;
  const total = Math.max(data.total || 0, 1);
  const segs = [
    { v: data.by_status?.registered || 0, l: 'مسجلة', c: '#94a3b8' },
    { v: data.by_status?.processing || 0, l: 'قيد التسجيل', c: '#3b82f6' },
    { v: data.by_status?.closed || 0, l: 'جاهزة للتسعير', c: '#0ea5e9' },
    { v: data.by_status?.priced || 0, l: 'مسعّرة', c: '#10b981' },
  ].filter((s) => s.v > 0);
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 120, padding: '0 4px' }}>
        {segs.length === 0 && <div className="muted" style={{ textAlign: 'center', width: '100%' }}>لا حاويات في هذا التصنيف</div>}
        {segs.map((s, i) => (
          <div key={i} style={{ flex: s.v, minWidth: 30, maxWidth: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end' }}>
            <div style={{ width: '70%', background: s.c, borderRadius: 6, height: Math.max(8, (s.v / Math.max(...segs.map((x) => x.v))) * 90), transition: 'height .3s' }} />
            <div style={{ fontSize: 11, color: '#334155', fontWeight: 800, marginTop: 6 }}>{s.v}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{s.l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function fmt(n) { return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(Number(n || 0)); }

export function ContainerTable({ rows, onClose = null }) {
  if (!rows.length) return <p className="muted" style={{ textAlign: 'center', padding: 20 }}>لا توجد بيانات</p>;
  return (
    <table className="table">
      <thead>
        <tr>
          <th>BL</th><th>رقم الحاوية</th><th>النوع</th><th>الزبون</th><th>التاريخ</th><th>الحالة</th>{onClose && <th>الإجراءات</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.id}>
            <td className="nowrap"><b>{c.bl_number}</b></td>
            <td>{c.container_number}</td>
            <td className="nowrap">{c.container_type ? `${c.container_type}′` : '—'}</td>
            <td>{c.customer_name}</td>
            <td className="nowrap">{dmy(c.registration_date)}</td>
            <td><span className={`badge badge-${c.status}`}>{STATUS_LABELS[c.status] || c.status}</span></td>
            {onClose && ['registered', 'processing'].includes(c.status) && (
              <td><button className="btn btn-danger btn-sm" onClick={() => onClose(c)}>إغلاق</button></td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}