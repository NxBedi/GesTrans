import { useEffect, useState } from 'react';
import { reportsApi, generalExpensesApi } from '../utils/api.js';
import { useI18n } from '../i18n/I18nContext.jsx';
import { exportExcel, exportPdf } from '../utils/export.js';
import { useFeedback } from '../components/Feedback.jsx';

export default function Reports() {
  const { t } = useI18n();
  const [tab, setTab] = useState('profits');
  const tabs = [
    { id: 'profits', label: t('reports.tabProfits') },
    { id: 'containers', label: t('reports.tabContainers') },
    { id: 'invoices', label: t('reports.tabInvoiceTypes') },
    { id: 'payments', label: t('reports.tabPayments') },
    { id: 'debts', label: t('reports.tabDebts') },
  ];

  return (
    <div className="page">
      <h1 className="page-title">{t('reports.title')}</h1>
      <p className="page-sub">{t('reports.subtitle')}</p>

      <div className="toolbar" style={{ gap: 8 }}>
        <div className="tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'profits' && <ProfitsReport />}
      {tab === 'containers' && <ContainersReport />}
      {tab === 'invoices' && <InvoiceTypesReport />}
      {tab === 'payments' && <PaymentsReport />}
      {tab === 'debts' && <DebtsReport />}
    </div>
  );
}

function ProfitsReport() {
  const { t, fmt, money, dmy } = useI18n();
  const [rows, setRows] = useState([]);
  const [genExp, setGenExp] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const { toast } = useFeedback();

  useEffect(() => {
    reportsApi.profits({ from: dateFrom || undefined, to: dateTo || undefined }).then(setRows).catch(() => {});
    generalExpensesApi.summary({ from: dateFrom || undefined, to: dateTo || undefined }).then(setGenExp).catch(() => {});
  }, [dateFrom, dateTo]);

  const totalRevenue = rows.reduce((s, r) => s + Number(r.final_price || 0), 0);
  const totalCosts = rows.reduce((s, r) => s + Number(r.total_costs || 0), 0);
  const totalProfit = rows.reduce((s, r) => s + Number(r.profit || 0), 0);
  const genExpTotal = genExp?.total ?? 0;
  const netProfit = totalProfit - Number(genExpTotal);

  const doExport = (kind) => {
    const headers = [
      { key: 'bl_number', header: 'BL' },
      { key: 'container_number', header: t('dashboard.colContainer') },
      { key: 'customer_name', header: t('common.customerName') },
      { key: 'total_costs', header: t('reports.colCosts') },
      { key: 'final_price', header: t('reports.colFinalPrice') },
      { key: 'profit', header: t('reports.colProfit') },
      { key: 'date', header: t('common.date') },
    ];
    const data = rows.map((r) => ({ ...r, date: dmy(r.updated_at), total_costs: money(r.total_costs), final_price: money(r.final_price), profit: money(r.profit) }));
    const sub = t('reports.profitsPeriod', { from: dmy(dateFrom), to: dmy(dateTo), net: money(netProfit) });
    if (kind === 'excel') exportExcel(t('reports.profitsFile'), headers, data);
    else exportPdf(t('reports.profitsTitle'), headers, data, sub);
    toast(t('reports.profitsToast'), 'info');
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 8, marginBottom: 14 }}>
        <button className="btn btn-primary btn-sm" onClick={() => doExport('excel')}>⬇ {t('common.exportExcel')}</button>
        <button className="btn btn-outline btn-sm" onClick={() => doExport('pdf')}>📄 {t('common.exportPdf')}</button>
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
          <label className="form-label">{t('reports.netFormula')}</label>
          <div className="muted" style={{ fontSize: 13, fontWeight: 700, paddingTop: 8 }}>
            {t('reports.netProfit')} <span style={{ color: netProfit >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(netProfit)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="card stat-card">
          <div className="stat-value">{fmt(totalRevenue)}</div>
          <div className="stat-label">{t('reports.totalFinalPrices')}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#dc2626' }}>{fmt(totalCosts)}</div>
          <div className="stat-label">{t('reports.containerCosts')}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#2563eb' }}>{fmt(totalProfit)}</div>
          <div className="stat-label">{t('reports.containerProfits')}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#dc2626' }}>{fmt(genExpTotal)}</div>
          <div className="stat-label">{t('reports.companyExpenses')}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <table className="table">
          <thead>
            <tr><th>BL</th><th>{t('dashboard.colContainer')}</th><th>{t('common.customerName')}</th><th>{t('reports.colCosts')}</th><th>{t('reports.colFinalPrice')}</th><th>{t('reports.colProfit')}</th><th>{t('common.date')}</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan="7" className="muted" style={{ textAlign: 'center', padding: 20 }}>{t('common.noData')}</td></tr>}
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="nowrap"><b>{r.bl_number}</b></td>
                <td>{r.container_number}</td>
                <td>{r.customer_name}</td>
                <td className="nowrap">{fmt(r.total_costs)}</td>
                <td className="nowrap"><b>{fmt(r.final_price)}</b></td>
                <td className="nowrap" style={{ color: r.profit >= 0 ? '#16a34a' : '#dc2626', fontWeight: 700 }}>{fmt(r.profit)}</td>
                <td className="nowrap">{dmy(r.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ContainersReport() {
  const { t, fmt, money, dmy, statusLabel } = useI18n();
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const { toast } = useFeedback();

  useEffect(() => {
    reportsApi.containers({ status: status || undefined, from: dateFrom || undefined, to: dateTo || undefined }).then(setRows).catch(() => {});
  }, [status, dateFrom, dateTo]);

  const counts = {
    registered: rows.filter((r) => r.status === 'registered').length,
    processing: rows.filter((r) => r.status === 'processing').length,
    closed: rows.filter((r) => r.status === 'closed').length,
    priced: rows.filter((r) => r.status === 'priced').length,
  };

  const doExport = (kind) => {
    const headers = [
      { key: 'bl_number', header: 'BL' },
      { key: 'container_number', header: t('dashboard.colContainer') },
      { key: 'customer_name', header: t('common.customerName') },
      { key: 'registration_date', header: t('common.date') },
      { key: 'total_costs', header: t('reports.colCosts') },
      { key: 'final_price', header: t('reports.colPrice') },
    ];
    const data = rows.map((r) => ({
      ...r,
      registration_date: dmy(r.registration_date),
      status: statusLabel(r.status),
      total_costs: money(r.total_costs), final_price: money(r.final_price),
    }));
    const sub = t('reports.containersPeriod', {
      status: status ? statusLabel(status) : t('common.all'),
      from: dmy(dateFrom),
      to: dmy(dateTo),
    });
    if (kind === 'excel') exportExcel(t('reports.containersFile'), headers, data);
    else exportPdf(t('reports.containersTitle'), headers, data, sub);
    toast(t('reports.containersToast'), 'info');
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 8, marginBottom: 14 }}>
        <button className="btn btn-primary btn-sm" onClick={() => doExport('excel')}>⬇ {t('common.exportExcel')}</button>
        <button className="btn btn-outline btn-sm" onClick={() => doExport('pdf')}>📄 {t('common.exportPdf')}</button>
      </div>
      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">{t('common.status')}</label>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t('common.allStatuses')}</option>
            <option value="registered">{statusLabel('registered')}</option>
            <option value="processing">{statusLabel('processing')}</option>
            <option value="closed">{statusLabel('closed')}</option>
            <option value="priced">{statusLabel('priced')}</option>
          </select>
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">{t('reports.dateFrom')}</label>
          <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">{t('reports.dateTo')}</label>
          <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#f59e0b' }}>{counts.registered + counts.processing}</div>
          <div className="stat-label">{t('reports.kpiProcessing')}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#7c3aed' }}>{counts.closed}</div>
          <div className="stat-label">{t('reports.kpiReady')}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#3b82f6' }}>{counts.priced}</div>
          <div className="stat-label">{t('reports.kpiPriced')}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#64748b' }}>{rows.length}</div>
          <div className="stat-label">{t('reports.kpiContainersInPeriod')}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <table className="table">
          <thead>
            <tr><th>BL</th><th>{t('dashboard.colContainer')}</th><th>{t('common.customerName')}</th><th>{t('common.date')}</th><th>{t('common.status')}</th><th>{t('reports.colCosts')}</th><th>{t('reports.colPrice')}</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan="7" className="muted" style={{ textAlign: 'center', padding: 20 }}>{t('common.noData')}</td></tr>}
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="nowrap"><b>{r.bl_number}</b></td>
                <td>{r.container_number}</td>
                <td>{r.customer_name}</td>
                <td className="nowrap">{dmy(r.registration_date)}</td>
                <td><span className={`badge badge-${r.status}`}>{statusLabel(r.status)}</span></td>
                <td className="nowrap">{fmt(r.total_costs)}</td>
                <td className="nowrap"><b>{fmt(r.final_price)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InvoiceTypesReport() {
  const { t, fmt } = useI18n();
  const [rows, setRows] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [includeManager, setIncludeManager] = useState(false);

  useEffect(() => {
    reportsApi.invoiceTypesSummary({
      from: dateFrom || undefined,
      to: dateTo || undefined,
      include_manager: includeManager ? 'true' : undefined,
    }).then(setRows).catch(() => {});
  }, [dateFrom, dateTo, includeManager]);

  const grandTotal = rows.reduce((s, r) => s + Number(r.total || 0), 0);
  const grandCount = rows.reduce((s, r) => s + r.invoice_count, 0);

  return (
    <div>
      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">{t('reports.dateFrom')}</label>
          <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">{t('reports.dateTo')}</label>
          <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className="form-row" style={{ marginBottom: 0, display: 'flex', alignItems: 'flex-end' }}>
          <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 700 }}>
            <input type="checkbox" checked={includeManager} onChange={(e) => setIncludeManager(e.target.checked)} />
            {t('reports.includeLiquidation')}
          </label>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <div className="card stat-card">
          <div className="stat-value">{fmt(grandTotal)}</div>
          <div className="stat-label">{t('reports.totalAmounts')}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{grandCount}</div>
          <div className="stat-label">{t('reports.invoiceCount')}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <table className="table">
          <thead>
            <tr><th>{t('reports.colInvoiceType')}</th><th>{t('reports.invoiceCount')}</th><th>{t('reports.colContainerCount')}</th><th>{t('common.total')}</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan="4" className="muted" style={{ textAlign: 'center', padding: 20 }}>{t('reports.noInvoicesPeriod')}</td></tr>}
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <b>{r.type_name}</b>
                  {r.allowed_role === 'manager' && <span className="badge badge-priced" style={{ marginRight: 6 }}>{t('reports.customsBadge')}</span>}
                </td>
                <td>{r.invoice_count}</td>
                <td>{r.container_count}</td>
                <td className="nowrap" style={{ fontWeight: 700 }}>{fmt(r.total)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: '2px solid #e2e8f0', fontWeight: 800 }}>
                <td>{t('common.total')}</td>
                <td>{grandCount}</td>
                <td></td>
                <td>{fmt(grandTotal)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function PaymentsReport() {
  const { t, fmt, money, dmy } = useI18n();
  const [data, setData] = useState({ records: [], count: 0, total: 0 });
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [q, setQ] = useState('');
  const { toast } = useFeedback();

  useEffect(() => {
    reportsApi.payments({ from: dateFrom || undefined, to: dateTo || undefined, q: q || undefined })
      .then(setData).catch(() => {});
  }, [dateFrom, dateTo, q]);

  const doExport = (kind) => {
    const headers = [
      { key: 'payment_date', header: t('common.date') },
      { key: 'customer_name', header: t('common.customerName') },
      { key: 'customer_phone', header: t('common.phone') },
      { key: 'bl_number', header: 'BL' },
      { key: 'amount', header: t('common.amount') },
      { key: 'notes', header: t('common.notes') },
      { key: 'created_by_name', header: t('reports.colCreatedBy') },
    ];
    const rows = data.records.map((r) => ({ ...r, payment_date: dmy(r.payment_date), amount: money(r.amount) }));
    const sub = t('reports.paymentsPeriod', { from: dmy(dateFrom), to: dmy(dateTo), total: money(data.total) });
    if (kind === 'excel') exportExcel(t('reports.paymentsFile'), headers, rows);
    else exportPdf(t('reports.paymentsTitle'), headers, rows, sub);
    toast(t('reports.paymentsToast'), 'info');
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <div className="grid grid-3" style={{ gap: 10, flex: 1 }}>
          <input className="input" placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
          <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={() => doExport('excel')}>⬇ {t('common.exportExcel')}</button>
          <button className="btn btn-outline btn-sm" onClick={() => doExport('pdf')}>📄 {t('common.exportPdf')}</button>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#16a34a' }}>{fmt(data.total)}</div>
          <div className="stat-label">{t('reports.totalPayments')}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{data.count}</div>
          <div className="stat-label">{t('reports.paymentCount')}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <table className="table">
          <thead>
            <tr><th>{t('common.date')}</th><th>{t('common.customerName')}</th><th>{t('common.phone')}</th><th>BL</th><th>{t('common.amount')}</th><th>{t('reports.colCreatedBy')}</th></tr>
          </thead>
          <tbody>
            {data.records.length === 0 && <tr><td colSpan="6" className="muted" style={{ textAlign: 'center', padding: 20 }}>{t('reports.noPaymentsPeriod')}</td></tr>}
            {data.records.map((r) => (
              <tr key={r.id}>
                <td className="nowrap">{dmy(r.payment_date)}</td>
                <td style={{ fontWeight: 700 }}>{r.customer_name}</td>
                <td className="nowrap" dir="ltr">{r.customer_phone || '—'}</td>
                <td className="nowrap">{r.bl_number || '—'}</td>
                <td className="nowrap" style={{ fontWeight: 800, color: '#16a34a' }}>{fmt(r.amount)}</td>
                <td>{r.created_by_name || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DebtsReport() {
  const { t, fmt, money, debtLabel } = useI18n();
  const [rows, setRows] = useState([]);
  const { toast } = useFeedback();

  useEffect(() => { reportsApi.balances().then(setRows).catch(() => {}); }, []);

  const totalDebt = rows.reduce((s, r) => s + Math.max(Number(r.balance), 0), 0);
  const overdue = rows.filter((r) => r.debt_status === 'overdue');
  const overdueAmt = overdue.reduce((s, r) => s + Math.max(Number(r.balance), 0), 0);

  const doExport = (kind) => {
    const headers = [
      { key: 'customer_name', header: t('common.customerName') },
      { key: 'phone', header: t('common.phone') },
      { key: 'container_count', header: t('reports.colContainerCount') },
      { key: 'total_billed', header: t('reports.colBilled') },
      { key: 'total_paid', header: t('reports.colPaid') },
      { key: 'balance', header: t('reports.colRemaining') },
      { key: 'debt_status', header: t('common.status') },
    ];
    const data = rows.map((r) => ({
      ...r,
      total_billed: money(r.total_billed), total_paid: money(r.total_paid), balance: money(r.balance),
      debt_status: debtLabel(r.debt_status),
    }));
    const sub = t('reports.debtsSummary', { total: money(totalDebt), overdue: money(overdueAmt), count: overdue.length });
    if (kind === 'excel') exportExcel(t('reports.debtsFile'), headers, data);
    else exportPdf(t('reports.debtsTitle'), headers, data, sub);
    toast(t('reports.debtsToast'), 'info');
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 8, marginBottom: 14 }}>
        <button className="btn btn-primary btn-sm" onClick={() => doExport('excel')}>⬇ {t('common.exportExcel')}</button>
        <button className="btn btn-outline btn-sm" onClick={() => doExport('pdf')}>📄 {t('common.exportPdf')}</button>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#d97706' }}>{fmt(totalDebt)}</div>
          <div className="stat-label">{t('dashboard.totalDebts')}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#dc2626' }}>{fmt(overdueAmt)}</div>
          <div className="stat-label">{t('reports.overdueCount', { count: overdue.length })}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{rows.length}</div>
          <div className="stat-label">{t('reports.customerCount')}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <table className="table">
          <thead>
            <tr><th>{t('common.customerName')}</th><th>{t('reports.colBilled')}</th><th>{t('reports.colPaid')}</th><th>{t('reports.colRemaining')}</th><th>{t('common.status')}</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan="5" className="muted" style={{ textAlign: 'center', padding: 20 }}>{t('common.noData')}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 700 }}>{r.customer_name}</td>
                <td className="nowrap">{fmt(r.total_billed)}</td>
                <td className="nowrap" style={{ color: '#16a34a' }}>{fmt(r.total_paid)}</td>
                <td className="nowrap" style={{ fontWeight: 800, color: Number(r.balance) > 0 ? '#d97706' : '#16a34a' }}>{fmt(r.balance)}</td>
                <td><span className={`badge ${r.debt_status === 'paid' ? 'badge-paid' : r.debt_status === 'partial' ? 'badge-partial' : r.debt_status === 'overdue' ? 'badge-overdue' : 'badge-due'}`}>{debtLabel(r.debt_status)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
