import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { generalExpensesApi, financialApi, reportsApi, salaryApi } from '../utils/api.js';
import { useI18n } from '../i18n/I18nContext.jsx';

const currentMonth = () => new Date().toISOString().slice(0, 7);

// first/last day of a "YYYY-MM" month, without timezone surprises
function monthRange(month) {
  const [year, mon] = String(month).split('-').map(Number);
  const lastDay = new Date(year, mon, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` };
}

// Finance home for the accountant role: institution expenses, the expenses
// recorded by the staff and the monthly salary position of every employee.
export default function AccountantDashboard() {
  const { t, fmt, money } = useI18n();
  const [month, setMonth] = useState(currentMonth());
  const [institution, setInstitution] = useState(null);
  const [staff, setStaff] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [finance, setFinance] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { from, to } = monthRange(month);
    let alive = true;
    setLoading(true);
    Promise.all([
      generalExpensesApi.summary({ from, to }).catch(() => null),
      reportsApi.expensesSummary({ from, to }).catch(() => null),
      salaryApi.employees({ month }).catch(() => []),
      financialApi.overview().catch(() => null),
    ]).then(([gen, exp, emps, fin]) => {
      if (!alive) return;
      setInstitution(gen);
      setStaff(exp);
      setEmployees(Array.isArray(emps) ? emps : []);
      setFinance(fin);
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [month]);

  const totals = useMemo(
    () => employees.reduce(
      (acc, e) => ({
        salary: acc.salary + Number(e.salary || 0),
        paid: acc.paid + Number(e.paid || 0),
        remaining: acc.remaining + Number(e.remaining || 0),
      }),
      { salary: 0, paid: 0, remaining: 0 }
    ),
    [employees]
  );

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">{t('accountant.title')}</h1>
          <p className="page-sub">{t('accountant.subtitle')}</p>
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">{t('accountant.month')}</label>
          <input
            className="input"
            type="month"
            style={{ width: 150 }}
            value={month}
            max={currentMonth()}
            onChange={(e) => setMonth(e.target.value || currentMonth())}
          />
        </div>
      </div>

      {loading && <div className="empty-state"><span className="spinner" /></div>}

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: Number(finance?.cash_box) >= 0 ? '#16a34a' : '#dc2626' }}>{money(finance?.cash_box ?? 0)}</div>
          <div className="stat-label">{t('accountant.cashBox')}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#8b5cf6' }}>{money(finance?.capital_invested ?? 0)}</div>
          <div className="stat-label">{t('accountant.capitalInvested')}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: Number(finance?.operational_cash_result) >= 0 ? '#2563eb' : '#dc2626' }}>{money(finance?.operational_cash_result ?? 0)}</div>
          <div className="stat-label">{t('accountant.operatingResult')}</div>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#2563eb' }}>{money(institution?.total ?? 0)}</div>
          <div className="stat-label">{t('accountant.institutionExpenses')}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#dc2626' }}>{money(staff?.total ?? 0)}</div>
          <div className="stat-label">{t('accountant.workerExpenses')}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{staff?.invoice_count ?? 0}</div>
          <div className="stat-label">{t('accountant.workerInvoices')}</div>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="card stat-card">
          <div className="stat-value">{money(totals.salary)}</div>
          <div className="stat-label">{t('accountant.salariesDue')}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#dc2626' }}>{money(totals.paid)}</div>
          <div className="stat-label">{t('accountant.salariesPaid')}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#16a34a' }}>{money(totals.remaining)}</div>
          <div className="stat-label">{t('accountant.salariesRemaining')}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'auto', marginBottom: 16 }}>
        <h3 style={{ padding: '16px 20px 0' }}>{t('accountant.employeesTitle', { month })}</h3>
        <div style={{ padding: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th>{t('salary.col.employee')}</th>
                <th style={{ textAlign: 'center' }}>{t('salary.col.monthlySalary')}</th>
                <th style={{ textAlign: 'center' }}>{t('salary.col.advance')}</th>
                <th style={{ textAlign: 'center' }}>{t('salary.col.remainder')}</th>
                <th style={{ textAlign: 'center' }}>{t('salary.col.paid')}</th>
                <th style={{ textAlign: 'center' }}>{t('salary.col.remaining')}</th>
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 && !loading && (
                <tr><td colSpan="6" className="muted" style={{ textAlign: 'center', padding: 20 }}>{t('accountant.noEmployees')}</td></tr>
              )}
              {employees.map((e) => (
                <tr key={e.id}>
                  <td><b>{e.full_name}</b>{!e.is_active && <span className="muted"> {t('salary.inactive')}</span>}</td>
                  <td className="nowrap" style={{ textAlign: 'center', fontWeight: 800 }}>{fmt(e.salary)}</td>
                  <td className="nowrap" style={{ textAlign: 'center', color: '#d97706', fontWeight: 700 }}>{fmt(e.advance_paid)}</td>
                  <td className="nowrap" style={{ textAlign: 'center', color: '#2563eb', fontWeight: 700 }}>{fmt(e.remainder_paid)}</td>
                  <td className="nowrap" style={{ textAlign: 'center', color: '#dc2626', fontWeight: 800 }}>{fmt(e.paid)}</td>
                  <td className="nowrap" style={{ textAlign: 'center', color: Number(e.remaining) === 0 ? '#64748b' : '#16a34a', fontWeight: 800 }}>
                    {fmt(e.remaining)} {Number(e.remaining) === 0 && <span className="muted" style={{ fontSize: 12 }}>{t('salary.settled')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Link className="btn btn-outline btn-sm" to="/financial">💵 {t('accountant.openCashbox')}</Link>
        <Link className="btn btn-outline btn-sm" to="/general-expenses">🏢 {t('accountant.openInstitution')}</Link>
        <Link className="btn btn-outline btn-sm" to="/expenses">💸 {t('accountant.openWorkers')}</Link>
        <Link className="btn btn-outline btn-sm" to="/salary">💵 {t('accountant.openSalaries')}</Link>
      </div>
    </div>
  );
}
