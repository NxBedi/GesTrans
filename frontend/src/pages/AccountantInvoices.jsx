import { useEffect, useState } from 'react';
import { accountantApi, reportsApi } from '../utils/api.js';
import { useI18n } from '../i18n/I18nContext.jsx';
import { downloadCsv, fmtDate } from '../utils/accountant.js';

export default function AccountantInvoices() {
  const { t, fmt, dmy } = useI18n();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [users, setUsers] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    const params = {
      from: dateFrom || undefined,
      to: dateTo || undefined,
      employee_id: employeeId || undefined,
    };
    setLoading(true);
    reportsApi.expenses(params).then(setRows).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    accountantApi.employees().then(setUsers).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [dateFrom, dateTo, employeeId]);

  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);

  const exportCsv = () => {
    downloadCsv(
      t('nav.accountantInvoices'),
      [
        { key: 'entry_date', label: t('common.date'), get: (r) => fmtDate(r.entry_date) },
        { key: 'invoice_number', label: t('expenses.colInvoiceNumber') },
        { key: 'type_name', label: t('common.type') },
        { key: 'amount', label: t('common.amount') },
        { key: 'bl_number', label: t('expenses.colContainer') },
        { key: 'container_number', label: t('containers.containerNoField') },
        { key: 'customer_name', label: t('common.customer') },
        { key: 'employee_name', label: t('expenses.colEnteredBy') },
        { key: 'notes', label: t('common.notes') },
      ],
      rows
    );
  };

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">{t('nav.accountantInvoices')}</h1>
          <p className="page-sub">{t('expenses.allInvoicesTitle')} — {t('financial.readOnly')}</p>
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
          <div className="stat-value">{fmt(total)}</div>
          <div className="stat-label">{t('reports.totalAmounts')}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{rows.length}</div>
          <div className="stat-label">{t('reports.invoiceCount')}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{new Set(rows.map((r) => r.bl_number)).size}</div>
          <div className="stat-label">{t('reports.colContainerCount')}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <div className="card-header" style={{ padding: '16px 20px', marginBottom: 0 }}>
          <div className="card-title">🧾 {t('nav.accountantInvoices')}</div>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>{t('common.date')}</th><th>{t('common.type')}</th><th>{t('expenses.colInvoiceNumber')}</th><th>{t('common.amount')}</th>
              <th>{t('expenses.colContainer')}</th><th>{t('common.customer')}</th><th>{t('expenses.colEnteredBy')}</th><th>{t('common.notes')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr><td colSpan="8" className="muted" style={{ textAlign: 'center', padding: 20 }}>{t('expenses.noMatch')}</td></tr>
            )}
            {rows.map((inv) => (
              <tr key={inv.id}>
                <td className="nowrap">{dmy(inv.entry_date)}</td>
                <td>
                  {inv.type_name}
                  {inv.allowed_role === 'manager' && <span className="badge badge-priced" style={{ marginInlineStart: 6 }}>{t('expenses.badgeCustoms')}</span>}
                </td>
                <td className="nowrap">{inv.invoice_number || '—'}</td>
                <td className="nowrap"><b>{fmt(inv.amount)}</b></td>
                <td className="nowrap">{inv.bl_number}</td>
                <td>{inv.customer_name}</td>
                <td>{inv.employee_name || '—'}</td>
                <td className="muted">{inv.notes || '—'}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: '2px solid #e2e8f0', fontWeight: 800 }}>
                <td colSpan="3">{t('common.total')}</td>
                <td>{fmt(total)}</td>
                <td colSpan="4"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
