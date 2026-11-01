import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { accountantApi, financialApi } from '../utils/api.js';
import { onDashboardRefresh } from '../utils/refresh.js';
import { fmt } from './Dashboard.jsx';
import { movementKindLabel } from '../utils/accountant.js';

const MODULES = [
  { to: '/accountant/wages', ico: '💵', label: 'الرواتب', desc: 'تسجيل دفع الرواتب ومتابعة المتبقي على كل موظف' },
  { to: '/accountant/expenses', ico: '🏢', label: 'مصاريف المؤسسة', desc: 'تسجيل مصاريف المؤسسة (إيجار، كهرباء، قرطاسية…)' },
  { to: '/accountant/worker-expenses', ico: '💸', label: 'مصاريف العمال', desc: 'قراءة مصاريف العمال اليومية المحصّلة' },
  { to: '/accountant/invoices', ico: '🧾', label: 'فواتير الحاويات', desc: 'عرض فواتير الحاويات وتفاصيلها' },
  { to: '/accountant/cashbox', ico: '🏦', label: 'الصندوق', desc: 'نقدية الصندوق وحركاته (قراءة فقط)' },
  { to: '/accountant/reports', ico: '📊', label: 'التقارير المالية', desc: 'تقارير المصاريف والرواتب مع التصدير' },
  { to: '/accountant/audit', ico: '🕒', label: 'سجل التدقيق', desc: 'تتبّع كل عملية مالية: من نفّذها ومتى' },
];

export default function AccountantDashboard() {
  const [dash, setDash] = useState(null);
  const [movements, setMovements] = useState([]);
  const [err, setErr] = useState('');

  const load = () => {
    accountantApi.dashboard().then(setDash).catch((e) => setErr(e.message));
    financialApi.movements().then((m) => setMovements((m || []).slice(0, 8))).catch(() => {});
  };

  useEffect(() => {
    load();
    const off = onDashboardRefresh(load);
    return off;
  }, []);

  const kpis = dash
    ? [
        { ico: '🏦', lbl: 'نقدية الصندوق', val: fmt(dash.cash_in_hand), sub: 'الحركات النقدية غير المعكوسة فقط', color: '#16a34a', to: '/accountant/cashbox' },
        { ico: '📅', lbl: 'مصروف اليوم', val: fmt(dash.today.expense), sub: `مداخيل ${fmt(dash.today.income)} — صافي ${fmt(dash.today.net)}`, color: '#dc2626', to: '/accountant/reports' },
        { ico: '📆', lbl: 'مصروف الشهر', val: fmt(dash.month.expense), sub: `مداخيل ${fmt(dash.month.income)} — صافي ${fmt(dash.month.net)}`, color: '#d97706', to: '/accountant/reports' },
        { ico: '💸', lbl: 'إجمالي المصاريف', val: fmt(dash.expenses.total), sub: `مؤسسة ${fmt(dash.expenses.institution)} + رواتب ${fmt(dash.expenses.salaries)}`, color: '#7c3aed', to: '/accountant/expenses' },
        { ico: '🏦', lbl: 'غير نقدي (لا يمس الصندوق)', val: fmt(dash.expenses.institution_non_cash + dash.expenses.salaries_non_cash), sub: 'حوالات وآجل', color: '#0284c7', to: '/accountant/expenses' },
        { ico: '⏳', lbl: 'التزامات غير مدفوعة', val: fmt(dash.unpaid.total), sub: 'آجل لم يُسدَّد بعد', color: '#b45309', to: '/accountant/reports' },
        { ico: '👷', lbl: 'رواتب متبقية', val: fmt(dash.wages.remaining), sub: `${dash.wages.employees_count} موظف — راتب الشهر ${fmt(dash.wages.payroll_month)}`, color: '#2563eb', to: '/accountant/wages' },
        { ico: '🧾', lbl: 'مصاريف العمال (الشهر)', val: fmt(dash.worker_expenses.total), sub: `${dash.worker_expenses.count} فاتورة`, color: '#0891b2', to: '/accountant/worker-expenses' },
      ]
    : [];

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">لوحة المحاسب</h1>
          <p className="page-sub">نظرة مالية شاملة: الصندوق، الرواتب، مصاريف المؤسسة والعمال — مع كل الأرقام مشتقّة من سجلّات النظام نفسها</p>
        </div>
      </div>

      {err && <div className="form-error">{err}</div>}
      {!dash && !err && <div className="empty-state"><span className="spinner" /></div>}

      {dash && (
        <>
          <div className="kpi-grid" style={{ marginBottom: 18 }}>
            {kpis.map((k, i) => (
              <Link key={i} to={k.to} className="kpi-card kpi-link">
                <div className="kpi-icon">{k.ico}</div>
                <div className="kpi-body">
                  <div className="kpi-label">{k.lbl}</div>
                  <div className="kpi-value" style={{ color: k.color }}>{k.val}</div>
                  <div className="kpi-sub">{k.sub}</div>
                </div>
              </Link>
            ))}
          </div>

          {dash.reversed && (dash.reversed.expenses > 0 || dash.reversed.salaries > 0) && (
            <div className="card" style={{ marginBottom: 18, padding: 14, borderInlineStart: '4px solid #d97706' }}>
              <b>تنبيه:</b> يوجد {dash.reversed.expenses} مصروف و {dash.reversed.salaries} حركة راتب معكوسة.
              العمليات المعكوسة لا تُحتسب في الصندوق، لكنها محفوظة في السجل التاريخي.
            </div>
          )}

          <div className="grid grid-4" style={{ marginBottom: 18 }}>
            {MODULES.map((m) => (
              <Link key={m.to} to={m.to} className="kpi-card kpi-link">
                <div className="kpi-icon">{m.ico}</div>
                <div className="kpi-body">
                  <div className="kpi-label">{m.label}</div>
                  <div className="kpi-sub">{m.desc}</div>
                </div>
              </Link>
            ))}
          </div>

          <div className="card" style={{ padding: 0, overflow: 'auto' }}>
            <div className="card-header" style={{ padding: '16px 18px', marginBottom: 0 }}>
              <div className="card-title">آخر حركات الصندوق</div>
              <Link to="/accountant/cashbox" className="btn btn-outline btn-sm">كل الحركات</Link>
            </div>
            <table className="table">
              <thead><tr><th>التاريخ</th><th>النوع</th><th>البيان</th><th>المرجع</th><th>المبلغ</th></tr></thead>
              <tbody>
                {movements.length === 0 && (
                  <tr><td colSpan="5" className="muted" style={{ textAlign: 'center', padding: 20 }}>لا توجد حركات</td></tr>
                )}
                {movements.map((m, i) => (
                  <tr key={i}>
                    <td className="nowrap">{m.d}</td>
                    <td><span className="badge badge-processing">{movementKindLabel(m.kind)}</span></td>
                    <td>{m.descr}</td>
                    <td className="muted">{m.ref || '—'}</td>
                    <td className="nowrap" style={{ fontWeight: 800, color: Number(m.amount) >= 0 ? '#16a34a' : '#dc2626' }}>
                      {fmt(m.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
