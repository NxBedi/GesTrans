import { useEffect, useState } from 'react';
import { accountantApi, generalExpensesApi, reportsApi, salaryApi } from '../utils/api.js';
import { useI18n } from '../i18n/I18nContext.jsx';
import { downloadCsv } from '../utils/accountant.js';

export default function AccountantReports() {
  const { t, fmt } = useI18n();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [dash, setDash] = useState(null);
  const [expSummary, setExpSummary] = useState(null);
  const [workerSummary, setWorkerSummary] = useState(null);
  const [typeSummary, setTypeSummary] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    const params = { from: dateFrom || undefined, to: dateTo || undefined };
    setLoading(true);
    accountantApi.dashboard().then(setDash).catch(() => {});
    generalExpensesApi.summary(params).then(setExpSummary).catch(() => {});
    reportsApi.expensesSummary(params).then(setWorkerSummary).catch(() => {});
    reportsApi.invoiceTypesSummary(params).then(setTypeSummary).catch(() => {});
    salaryApi.employees({ month }).then(setEmployees).catch(() => {});
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [dateFrom, dateTo, month]);

  const exportExpenses = () => {
    downloadCsv(
      `${t('pdf.reportSheet')}-${t('reports.companyExpenses')}`,
      [
        { key: 'category', label: t('generalExpenses.colCategory') },
        { key: 'count', label: t('generalExpenses.colOperations') },
        { key: 'total', label: t('common.total') },
      ],
      expSummary?.by_category || []
    );
  };

  const exportWages = () => {
    downloadCsv(
      `${t('pdf.reportSheet')}-${t('salary.title')}`,
      [
        { key: 'full_name', label: t('salary.col.employee') },
        { key: 'salary', label: t('users.salary') },
        { key: 'paid', label: t('salary.col.paid') },
        { key: 'remaining', label: t('salary.col.remaining') },
      ],
      employees
    );
  };

  const exportByType = () => {
    downloadCsv(
      `${t('pdf.reportSheet')}-${t('reports.colInvoiceType')}`,
      [
        { key: 'type_name', label: t('common.type') },
        { key: 'invoice_count', label: t('reports.invoiceCount') },
        { key: 'total', label: t('common.total') },
        { key: 'container_count', label: t('reports.colContainerCount') },
      ],
      typeSummary
    );
  };

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">{t('nav.accountantReports')}</h1>
          <p className="page-sub">{t('reports.subtitle')}</p>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">{t('reports.dateFrom')}</label>
          <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">{t('reports.dateTo')}</label>
          <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">{t('salary.month')}</label>
          <input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="card stat-card">
          <div className="stat-value">{fmt(dash?.expenses?.total)}</div>
          <div className="stat-label">{t('generalExpenses.totalExpenses')} ({t('common.periodAll')})</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{fmt(expSummary?.total)}</div>
          <div className="stat-label">{t('reports.companyExpenses')} ({t('common.filter')})</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{fmt(workerSummary?.total)}</div>
          <div className="stat-label">{t('accountant.workerExpenses')} ({t('common.filter')})</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#b45309' }}>{fmt(dash?.unpaid?.total)}</div>
          <div className="stat-label">{t('accountant.unpaidObligations')}</div>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <div className="card-header" style={{ padding: '16px 18px', marginBottom: 0 }}>
            <div className="card-title">{t('generalExpenses.byCategoryTitle')}</div>
            <button className="btn btn-outline btn-sm" onClick={exportExpenses}>⬇️ CSV</button>
          </div>
          <table className="table">
            <thead><tr><th>{t('generalExpenses.colCategory')}</th><th>{t('common.count')}</th><th>{t('common.total')}</th></tr></thead>
            <tbody>
              {(!expSummary?.by_category || expSummary.by_category.length === 0) && !loading && (
                <tr><td colSpan="3" className="muted" style={{ textAlign: 'center', padding: 20 }}>{t('common.noData')}</td></tr>
              )}
              {expSummary?.by_category?.map((c) => (
                <tr key={c.category}>
                  <td><b>{c.category}</b></td>
                  <td>{c.count}</td>
                  <td className="nowrap"><b>{fmt(c.total)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <div className="card-header" style={{ padding: '16px 18px', marginBottom: 0 }}>
            <div className="card-title">{t('accountant.employeesTitle', { month })}</div>
            <button className="btn btn-outline btn-sm" onClick={exportWages}>⬇️ CSV</button>
          </div>
          <table className="table">
            <thead><tr><th>{t('salary.col.employee')}</th><th>{t('users.salary')}</th><th>{t('salary.col.paid')}</th><th>{t('salary.col.remaining')}</th></tr></thead>
            <tbody>
              {employees.length === 0 && !loading && (
                <tr><td colSpan="4" className="muted" style={{ textAlign: 'center', padding: 20 }}>{t('accountant.noEmployees')}</td></tr>
              )}
              {employees.map((e) => (
                <tr key={e.id}>
                  <td><b>{e.full_name}</b></td>
                  <td className="nowrap">{fmt(e.salary)}</td>
                  <td className="nowrap">{fmt(e.paid)}</td>
                  <td className="nowrap" style={{ fontWeight: 800, color: Number(e.remaining) > 0 ? '#dc2626' : '#16a34a' }}>{fmt(e.remaining)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <div className="card-header" style={{ padding: '16px 18px', marginBottom: 0 }}>
          <div className="card-title">{t('reports.tabInvoiceTypes')}</div>
          <button className="btn btn-outline btn-sm" onClick={exportByType}>⬇️ CSV</button>
        </div>
        <table className="table">
          <thead><tr><th>{t('common.type')}</th><th>{t('reports.invoiceCount')}</th><th>{t('reports.colContainerCount')}</th><th>{t('common.total')}</th></tr></thead>
          <tbody>
            {typeSummary.length === 0 && !loading && (
              <tr><td colSpan="4" className="muted" style={{ textAlign: 'center', padding: 20 }}>{t('common.noData')}</td></tr>
            )}
            {typeSummary.map((row) => (
              <tr key={row.type_id}>
                <td>
                  {row.type_name}
                  {row.allowed_role === 'manager' && <span className="badge badge-priced" style={{ marginInlineStart: 6 }}>{t('expenses.badgeCustoms')}</span>}
                </td>
                <td>{row.invoice_count}</td>
                <td>{row.container_count}</td>
                <td className="nowrap"><b>{fmt(row.total)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
