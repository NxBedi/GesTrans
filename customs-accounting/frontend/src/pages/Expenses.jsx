import { useEffect, useState } from 'react';
import { reportsApi, usersApi, invoiceTypesApi } from '../utils/api.js';
import { useI18n } from '../i18n/I18nContext.jsx';
import { exportPdf, exportExcel } from '../utils/export.js';
import { useFeedback } from '../components/Feedback.jsx';

export default function Expenses() {
  const { t, fmt, dmy, roleLabel } = useI18n();
  const { toast } = useFeedback();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [includeLiquidation, setIncludeLiquidation] = useState(false);

  const [users, setUsers] = useState([]);
  const [types, setTypes] = useState([]);
  const [summary, setSummary] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    usersApi.list().then((u) => setUsers(u)).catch(() => {});
    invoiceTypesApi.list().then(setTypes).catch(() => {});
  }, []);

  useEffect(() => {
    const params = {
      from: dateFrom || undefined,
      to: dateTo || undefined,
      employee_id: employeeId || undefined,
      type_id: typeId || undefined,
      include_manager: includeLiquidation ? 'true' : undefined,
    };
    setLoading(true);
    reportsApi.expensesSummary(params).then(setSummary).catch(() => {}).finally(() => setLoading(false));
    reportsApi.expenses(params).then(setInvoices).catch(() => {});
  }, [dateFrom, dateTo, employeeId, typeId, includeLiquidation]);

  const userTitle = (u) => `${u.full_name}${u.role === 'manager' ? ` (${roleLabel('manager')})` : ''}`;

  const exportColumns = () => [
    { key: 'date', header: t('common.date') },
    { key: 'type', header: t('common.type') },
    { key: 'invoice', header: t('expenses.colInvoiceNumber') },
    { key: 'amount', header: t('common.amount') },
    { key: 'container', header: t('expenses.colContainer') },
    { key: 'customer', header: t('common.customer') },
    { key: 'enteredBy', header: t('expenses.colEnteredBy') },
    { key: 'notes', header: t('common.notes') },
  ];

  const exportRows = () => invoices.map((inv) => ({
    date: dmy(inv.entry_date),
    type: inv.type_name,
    invoice: inv.invoice_number || '—',
    amount: fmt(inv.amount),
    container: inv.bl_number || '',
    customer: inv.customer_name || '',
    enteredBy: inv.employee_name || '—',
    notes: inv.notes || '',
  }));

  const periodLabel = () => {
    if (!dateFrom && !dateTo) return t('pdf.periodAll');
    return t('pdf.period', {
      from: dateFrom ? dmy(dateFrom) : '—',
      to: dateTo ? dmy(dateTo) : t('common.now'),
    });
  };

  const exportExcelFile = () => {
    exportExcel(t('expenses.exportFile'), exportColumns(), exportRows());
  };

  const exportPdfFile = async () => {
    try {
      await exportPdf(t('expenses.pdfTitle'), exportColumns(), exportRows(), periodLabel());
    } catch (err) {
      toast(err.message || t('common.error'), 'error');
    }
  };

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">{t('expenses.title')}</h1>
          <p className="page-sub">{t('expenses.subtitle', { role: roleLabel('manager') })}</p>
        </div>
        <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={includeLiquidation} onChange={(e) => setIncludeLiquidation(e.target.checked)} />
          {t('expenses.includeLiquidation')}
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-outline btn-sm" onClick={exportExcelFile}>⬇ {t('common.exportExcel')}</button>
          <button className="btn btn-primary btn-sm" onClick={exportPdfFile}>📄 {t('common.exportPdf')}</button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
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
            {users.map((u) => <option key={u.id} value={u.id}>{userTitle(u)}</option>)}
          </select>
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">{t('expenses.fieldInvoiceType')}</label>
          <select className="select" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            <option value="">{t('common.all')}</option>
            {types.map((ty) => <option key={ty.id} value={ty.id}>{ty.name}</option>)}
          </select>
        </div>
      </div>

      {/* Summary cards */}
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
          <div className="stat-value">{summary?.daily ? Object.keys(summary.daily).length : 0}</div>
          <div className="stat-label">{t('expenses.spendDays')}</div>
        </div>
      </div>

      <div className="grid grid-2">
        {/* Daily aggregation */}
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <h3 style={{ padding: '16px 20px 0' }}>{t('expenses.dailyTitle')}</h3>
          <div style={{ padding: 12 }}>
            <table className="table">
              <thead>
                <tr><th>{t('common.date')}</th><th>{t('expenses.invoiceCount')}</th><th>{t('common.total')}</th></tr>
              </thead>
              <tbody>
                {(!summary?.daily || summary.daily.length === 0) && !loading && (
                  <tr><td colSpan="3" className="muted" style={{ textAlign: 'center', padding: 20 }}>{t('expenses.noExpenses')}</td></tr>
                )}
                {summary?.daily.map((d) => (
                  <tr key={d.entry_date}>
                    <td className="nowrap"><b>{dmy(d.entry_date)}</b></td>
                    <td>{d.invoice_count}</td>
                    <td className="nowrap"><b>{fmt(d.total)}</b></td>
                  </tr>
                ))}
              </tbody>
              {summary?.daily?.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: '2px solid #e2e8f0', fontWeight: 800 }}>
                    <td>{t('common.total')}</td>
                    <td>{summary.invoice_count}</td>
                    <td>{fmt(summary.total)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Per-employee */}
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <h3 style={{ padding: '16px 20px 0' }}>{t('expenses.byEmployeeTitle')}</h3>
          <div style={{ padding: 12 }}>
            <table className="table">
              <thead>
                <tr><th>{t('expenses.fieldEmployee')}</th><th>{t('expenses.invoiceCount')}</th><th>{t('common.total')}</th></tr>
              </thead>
              <tbody>
                {(!summary?.by_employee || summary.by_employee.length === 0) && !loading && (
                  <tr><td colSpan="3" className="muted" style={{ textAlign: 'center', padding: 20 }}>{t('common.noData')}</td></tr>
                )}
                {summary?.by_employee.map((e) => (
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

      {/* Detailed trackable list */}
      <div className="card" style={{ padding: 0, overflow: 'auto', marginTop: 16 }}>
        <h3 style={{ padding: '16px 20px 0' }}>{t('expenses.allInvoicesTitle')}</h3>
        <div style={{ padding: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th>{t('common.date')}</th><th>{t('common.type')}</th><th>{t('expenses.colInvoiceNumber')}</th><th>{t('common.amount')}</th>
                <th>{t('expenses.colContainer')}</th><th>{t('common.customer')}</th><th>{t('expenses.colEnteredBy')}</th><th>{t('common.notes')}</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 && !loading && (
                <tr><td colSpan="8" className="muted" style={{ textAlign: 'center', padding: 20 }}>{t('expenses.noMatch')}</td></tr>
              )}
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="nowrap">{dmy(inv.entry_date)}</td>
                  <td>
                    {inv.type_name}
                    {inv.allowed_role === 'manager' && <span className="badge badge-priced" style={{ marginInlineEnd: 6 }}>{t('expenses.badgeCustoms')}</span>}
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
          </table>
        </div>
      </div>
    </div>
  );
}
