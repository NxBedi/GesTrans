import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { accountantApi, financialApi } from '../utils/api.js';
import { onDashboardRefresh } from '../utils/refresh.js';
import { useI18n } from '../i18n/I18nContext.jsx';

export default function AccountantDashboard() {
  const { t, fmt, dmy, kindLabel, roleLabel } = useI18n();
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

  const modules = [
    { to: '/accountant/wages', ico: '💵', label: t('nav.accountantWages'), desc: t('salary.subtitle') },
    { to: '/accountant/expenses', ico: '🏢', label: t('accountant.institutionExpenses'), desc: t('generalExpenses.subtitle') },
    { to: '/accountant/worker-expenses', ico: '💸', label: t('accountant.workerExpenses'), desc: t('expenses.subtitle', { role: roleLabel('employee') }) },
    { to: '/accountant/invoices', ico: '🧾', label: t('nav.accountantInvoices'), desc: t('expenses.allInvoicesTitle') },
    { to: '/accountant/cashbox', ico: '🏦', label: t('nav.accountantCashbox'), desc: t('financial.cashBox') },
    { to: '/accountant/reports', ico: '📊', label: t('nav.accountantReports'), desc: t('reports.subtitle') },
    { to: '/accountant/audit', ico: '🕒', label: t('nav.accountantAudit'), desc: t('accountant.auditSubtitle') },
  ];

  const kpis = dash
    ? [
        { ico: '🏦', lbl: t('dashboard.cash'), val: fmt(dash.cash_in_hand), sub: t('accountant.cashOnly'), color: '#16a34a', to: '/accountant/cashbox' },
        { ico: '📅', lbl: t('dashboard.todayExpense'), val: fmt(dash.today.expense), sub: `${t('dashboard.todayIncome')} ${fmt(dash.today.income)} — ${t('dashboard.todayNet')} ${fmt(dash.today.net)}`, color: '#dc2626', to: '/accountant/reports' },
        { ico: '📆', lbl: t('accountant.monthlyExpense'), val: fmt(dash.month.expense), sub: `${t('dashboard.todayIncome')} ${fmt(dash.month.income)} — ${t('dashboard.todayNet')} ${fmt(dash.month.net)}`, color: '#d97706', to: '/accountant/reports' },
        { ico: '💸', lbl: t('generalExpenses.totalExpenses'), val: fmt(dash.expenses.total), sub: t('dashboard.expensesBreakdown', { institution: fmt(dash.expenses.institution), salaries: fmt(dash.expenses.salaries) }), color: '#7c3aed', to: '/accountant/expenses' },
        { ico: '🏦', lbl: t('accountant.nonCashNote'), val: fmt(dash.expenses.institution_non_cash + dash.expenses.salaries_non_cash), sub: t('accountant.bankAndCredit'), color: '#0284c7', to: '/accountant/expenses' },
        { ico: '⏳', lbl: t('accountant.unpaidObligations'), val: fmt(dash.unpaid.total), sub: t('accountant.unpaidCredit'), color: '#b45309', to: '/accountant/reports' },
        { ico: '👷', lbl: t('accountant.salariesRemaining'), val: fmt(dash.wages.remaining), sub: `${t('accountant.employeeCount', { count: dash.wages.employees_count })} — ${t('salary.col.monthlySalary')} ${fmt(dash.wages.payroll_month)}`, color: '#2563eb', to: '/accountant/wages' },
        { ico: '🧾', lbl: t('accountant.workerExpenses'), val: fmt(dash.worker_expenses.total), sub: t('accountant.invoiceCount', { count: dash.worker_expenses.count }), color: '#0891b2', to: '/accountant/worker-expenses' },
      ]
    : [];

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">{t('nav.accountantDashboard')}</h1>
          <p className="page-sub">{t('accountant.dashboardSubtitle')}</p>
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
              <b>{t('accountant.notice')}</b> {t('accountant.reverseNotice', { expenses: dash.reversed.expenses, salaries: dash.reversed.salaries })} {t('accountant.reverseHistoryNote')}
            </div>
          )}

          <div className="grid grid-4" style={{ marginBottom: 18 }}>
            {modules.map((m) => (
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
              <div className="card-title">{t('financial.movementsTitle')}</div>
              <Link to="/accountant/cashbox" className="btn btn-outline btn-sm">{t('common.viewAll')}</Link>
            </div>
            <table className="table">
              <thead><tr><th>{t('common.date')}</th><th>{t('common.type')}</th><th>{t('common.description')}</th><th>{t('accountant.reference')}</th><th>{t('common.amount')}</th></tr></thead>
              <tbody>
                {movements.length === 0 && (
                  <tr><td colSpan="5" className="muted" style={{ textAlign: 'center', padding: 20 }}>{t('financial.noMovements')}</td></tr>
                )}
                {movements.map((m, i) => (
                  <tr key={i}>
                    <td className="nowrap">{dmy(m.d)}</td>
                    <td><span className="badge badge-processing">{kindLabel(m.kind)}</span></td>
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
