import { useEffect, useState } from 'react';
import { accountantApi, reportsApi } from '../utils/api.js';
import { useI18n } from '../i18n/I18nContext.jsx';
import { downloadCsv, fmtDate } from '../utils/accountant.js';

export default function AccountantWorkerExpenses() {
  const { t, fmt, dmy, roleLabel } = useI18n();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [users, setUsers] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    const params = {
      from: dateFrom || undefined,
      to: dateTo || undefined,
      employee_id: employeeId || undefined,
    };
    setLoading(true);
    reportsApi.expensesSummary(params).then(setSummary).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    accountantApi.employees().then(setUsers).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [dateFrom, dateTo, employeeId]);

  const exportCsv = () => {
    downloadCsv(
      t('expenses.exportFile'),
      [
        { key: 'entry_date', label: t('common.date'), get: (r) => fmtDate(r.entry_date) },
        { key: 'employee_name', label: t('expenses.fieldEmployee') },
        { key: 'invoice_count', label: t('expenses.invoiceCount') },
        { key: 'total', label: t('common.total') },
      ],
      summary?.by_employee || []
    );
  };

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">{t('expenses.title')}</h1>
          <p className="page-sub">{t('expenses.subtitle', { role: roleLabel('employee') })}</p>
        </div>
        <button className="btn btn-outline" onClick={exportCsv}>⬇️ {t('common.export')} CSV</button>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">{t('expenses.fieldFrom')}</label>
          <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">{t('expenses.fieldTo')}</label>
          <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">{t('expenses.fieldEmployee')}</label>
          <select className="select" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">{t('common.all')}</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="card stat-card">
          <div className="stat-value">{fmt(summary?.total)}</div>
          <div className="stat-label">{t('expenses.totalExpenses')}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{summary?.invoice_count ?? 0}</div>
          <div className="stat-label">{t('expenses.invoiceCount')}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{summary?.by_employee?.length ?? 0}</div>
          <div className="stat-label">{t('accountant.employeeCount', { count: summary?.by_employee?.length ?? 0 })}</div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <h3 style={{ padding: '16px 20px 0' }}>{t('expenses.dailyTitle')}</h3>
          <table className="table">
            <thead><tr><th>{t('common.date')}</th><th>{t('expenses.invoiceCount')}</th><th>{t('common.total')}</th></tr></thead>
            <tbody>
              {(!summary?.daily || summary.daily.length === 0) && !loading && (
                <tr><td colSpan="3" className="muted" style={{ textAlign: 'center', padding: 20 }}>{t('expenses.noExpenses')}</td></tr>
              )}
              {summary?.daily?.map((d) => (
                <tr key={d.entry_date}>
                  <td className="nowrap"><b>{dmy(d.entry_date)}</b></td>
                  <td>{d.invoice_count}</td>
                  <td className="nowrap"><b>{fmt(d.total)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <h3 style={{ padding: '16px 20px 0' }}>{t('expenses.byEmployeeTitle')}</h3>
          <table className="table">
            <thead><tr><th>{t('expenses.fieldEmployee')}</th><th>{t('expenses.invoiceCount')}</th><th>{t('common.total')}</th></tr></thead>
            <tbody>
              {(!summary?.by_employee || summary.by_employee.length === 0) && !loading && (
                <tr><td colSpan="3" className="muted" style={{ textAlign: 'center', padding: 20 }}>{t('common.noData')}</td></tr>
              )}
              {summary?.by_employee?.map((e) => (
                <tr key={e.employee_id}>
                  <td><b>{e.employee_name}</b></td>
                  <td>{e.invoice_count}</td>
                  <td className="nowrap"><b>{fmt(e.total)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
