import { Fragment, useEffect, useState } from 'react';
import { salaryApi } from '../utils/api.js';
import { refreshDashboard } from '../utils/refresh.js';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useCompany } from '../contexts/CompanyContext.jsx';
import CompanyLogo from '../components/CompanyLogo.jsx';

const today = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => new Date().toISOString().slice(0, 7);

function pad(n) { return String(n).padStart(2, '0'); }

function monthRange(preset) {
  const now = new Date();
  if (preset === 'month') {
    return { from: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, to: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())}` };
  }
  if (preset === 'lastMonth') {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { from: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`, to: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())}` };
  }
  if (preset === '3m') {
    const s = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    return { from: `${s.getFullYear()}-${pad(s.getMonth() + 1)}-01`, to: monthRange('month').to };
  }
  return null;
}

const PRESETS = [
  { key: 'month' },
  { key: 'lastMonth' },
  { key: '3m' },
  { key: 'custom' },
];

export default function SalaryLedger() {
  const { company } = useCompany();
  const { t, fmt, money, dmy, companyName } = useI18n();
  const [employees, setEmployees] = useState([]);
  const [month, setMonth] = useState(currentMonth());
  const [selected, setSelected] = useState(null);
  const [stmt, setStmt] = useState(null);
  const [txs, setTxs] = useState([]);
  const [showAdvance, setShowAdvance] = useState(false);
  const [advForm, setAdvForm] = useState({ amount: '', txn_date: today(), notes: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [exportEmp, setExportEmp] = useState(null);
  const [showExport, setShowExport] = useState(false);
  const [stmtDoc, setStmtDoc] = useState(null);
  const [expPreset, setExpPreset] = useState('month');
  const [expFrom, setExpFrom] = useState('');
  const [expTo, setExpTo] = useState('');

  const loadEmployees = () => salaryApi.employees({ month }).then(setEmployees).catch(() => {});
  useEffect(() => { loadEmployees(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [month]);

  useEffect(() => {
    document.body.classList.toggle('printing-export', showExport);
    return () => document.body.classList.remove('printing-export');
  }, [showExport]);

  const loadDetail = (empId) => {
    if (empId) {
      salaryApi.statement(empId).then(setStmt).catch(() => setStmt(null));
      salaryApi.transactions({ employee_id: empId }).then(setTxs).catch(() => setTxs([]));
    }
  };

  const loadStmtDoc = async (empId, from, to) => {
    setStmtDoc(null);
    try {
      const d = await salaryApi.statement(empId, { from, to });
      setStmtDoc(d);
    } catch (err) { alert(err.message || t('common.error')); }
  };

  const openExport = (emp, e) => {
    e.stopPropagation();
    const r = monthRange('month');
    setExportEmp(emp);
    setExpPreset('month');
    setExpFrom(r.from);
    setExpTo(r.to);
    setShowExport(true);
    loadStmtDoc(emp.id, r.from, r.to);
  };

  const changePreset = (p) => {
    setExpPreset(p);
    const r = monthRange(p);
    if (r) {
      setExpFrom(r.from);
      setExpTo(r.to);
      if (exportEmp) loadStmtDoc(exportEmp.id, r.from, r.to);
    }
  };

  const closeExport = () => { setShowExport(false); setExportEmp(null); setStmtDoc(null); };

  const openEmployee = (emp) => {
    if (selected && selected.id === emp.id) { setSelected(null); setStmt(null); setTxs([]); return; }
    setSelected(emp);
    loadDetail(emp.id);
  };

  const afterChange = () => {
    loadEmployees();
    if (selected) loadDetail(selected.id);
    refreshDashboard();
  };

  const openAdvance = (emp, e) => {
    e.stopPropagation();
    setSelected(emp);
    setAdvForm({ amount: '', txn_date: today(), notes: '' });
    setMsg('');
    setShowAdvance(true);
  };

  const saveAdvance = async (ev) => {
    ev.preventDefault();
    setMsg('');
    setBusy(true);
    try {
      await salaryApi.advance({ user_id: selected.id, amount: Number(advForm.amount), txn_date: advForm.txn_date, notes: advForm.notes });
      setShowAdvance(false);
      afterChange();
    } catch (err) { setMsg(err.message || t('common.error')); }
    finally { setBusy(false); }
  };

  const payRemainder = async (emp) => {
    if (emp.remaining <= 0) { alert(t('salary.pay.noRemainder', { name: emp.full_name })); return; }
    const amountStr = prompt(
      t('salary.pay.confirmPrompt', {
        name: emp.full_name,
        month,
        salary: fmt(emp.salary),
        advance: fmt(emp.paid),
        remaining: fmt(emp.remaining),
      }),
      String(emp.remaining)
    );
    if (amountStr === null || amountStr === '') return;
    try {
      const res = await salaryApi.remainder({ user_id: emp.id, txn_date: today(), notes: t('salary.pay.note', { month }) });
      alert(t('salary.pay.done', { amount: fmt(res.remainder) }));
      afterChange();
      if (selected && selected.id === emp.id) loadDetail(emp.id);
    } catch (err) { alert(err.message || t('common.error')); }
  };

  const remove = async (tx) => {
    if (!confirm(t('salary.statement.confirmDelete', { amount: fmt(Math.abs(tx.amount)) }))) return;
    try {
      await salaryApi.remove(tx.id);
      afterChange();
      if (selected) loadDetail(selected.id);
    } catch (err) { alert(err.message || t('common.error')); }
  };

  const totals = employees.reduce(
    (a, e) => ({ salary: a.salary + e.salary, paid: a.paid + e.paid, remaining: a.remaining + e.remaining }),
    { salary: 0, paid: 0, remaining: 0 }
  );

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">{t('salary.title')}</h1>
          <p className="page-sub">{t('salary.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label className="form-label">{t('salary.month')}</label>
            <input className="input" type="month" style={{ width: 140 }} value={month} max={currentMonth()} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <button className="btn btn-outline btn-sm" onClick={afterChange}>🔄</button>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#2563eb' }}>{fmt(totals.salary)}</div>
          <div className="stat-label">{t('salary.stats.totalMonth', { month })}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#dc2626' }}>{fmt(totals.paid)}</div>
          <div className="stat-label">{t('salary.stats.paidFromCash')}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#16a34a' }}>{fmt(totals.remaining)}</div>
          <div className="stat-label">{t('salary.stats.remainingForEmployees')}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'auto', marginBottom: 16 }}>
        <table className="table">
          <thead>
            <tr>
              <th>{t('salary.col.employee')}</th>
              <th style={{ textAlign: 'center' }}>{t('salary.col.monthlySalary')}</th>
              <th style={{ textAlign: 'center' }}>{t('salary.col.advance')}</th>
              <th style={{ textAlign: 'center' }}>{t('salary.col.remainder')}</th>
              <th style={{ textAlign: 'center' }}>{t('salary.col.paid')}</th>
              <th style={{ textAlign: 'center' }}>{t('salary.col.remaining')}</th>
              <th style={{ textAlign: 'center' }}>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 && (
              <tr><td colSpan="7" className="muted" style={{ textAlign: 'center', padding: 20 }}>{t('salary.empty')}</td></tr>
            )}
            {employees.map((emp) => {
              const open = selected && selected.id === emp.id;
              return (
                <Fragment key={emp.id}>
                  <tr style={{ cursor: 'pointer', background: open ? '#f0f7ff' : undefined }} onClick={() => openEmployee(emp)}>
                    <td><b>{emp.full_name}</b>{!emp.is_active && <span className="muted"> {t('salary.inactive')}</span>}</td>
                    <td className="nowrap" style={{ textAlign: 'center', fontWeight: 800 }}>{fmt(emp.salary)}</td>
                    <td className="nowrap" style={{ textAlign: 'center', fontWeight: 700, color: '#d97706' }}>{fmt(emp.advance_paid)}</td>
                    <td className="nowrap" style={{ textAlign: 'center', fontWeight: 700, color: '#2563eb' }}>{fmt(emp.remainder_paid)}</td>
                    <td className="nowrap" style={{ textAlign: 'center', fontWeight: 800, color: '#dc2626' }}>{fmt(emp.paid)}</td>
                    <td className="nowrap" style={{ textAlign: 'center', fontWeight: 800, color: emp.remaining === 0 ? '#64748b' : '#16a34a' }}>
                      {fmt(emp.remaining)} {emp.remaining === 0 && <span className="muted" style={{ fontSize: 12 }}>{t('salary.settled')}</span>}
                    </td>
                    <td className="nowrap" style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-primary btn-sm" onClick={(e) => openExport(emp, e)} title={t('salary.exportPdfTitle')}>📄 {t('salary.exportPdf')}</button>{' '}
                      <button className="btn btn-success btn-sm" onClick={(e) => openAdvance(emp, e)}>{t('salary.payAdvance')}</button>{' '}
                      <button className="btn btn-outline btn-sm" onClick={() => payRemainder(emp)}>{t('salary.payRemainder')}</button>
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan="7" style={{ padding: '0 20px 16px', background: '#f0f7ff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '12px 0 8px', flexWrap: 'wrap', gap: 8 }}>
                          <b>{t('salary.statement.heading', { name: selected.full_name })}</b>
                          <span className="muted">{t('salary.statement.txCount', { count: txs.length })}</span>
                        </div>

                        <div className="grid grid-4" style={{ marginBottom: 12 }}>
                          <div className="stat-card" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}>
                            <div className="stat-value" style={{ color: '#2563eb', fontSize: 18 }}>{fmt(stmt?.employee?.salary ?? 0)}</div>
                            <div className="stat-label">{t('salary.statement.monthlySalary')}</div>
                          </div>
                          <div className="stat-card" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}>
                            <div className="stat-value" style={{ color: '#d97706', fontSize: 18 }}>{fmt(stmt?.months?.[0]?.advance ?? 0)}</div>
                            <div className="stat-label">{t('salary.statement.lastMonthAdvance')}</div>
                          </div>
                          <div className="stat-card" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}>
                            <div className="stat-value" style={{ color: '#2563eb', fontSize: 18 }}>{fmt(stmt?.months?.[0]?.remainder ?? 0)}</div>
                            <div className="stat-label">{t('salary.statement.lastMonthRemainder')}</div>
                          </div>
                          <div className="stat-card" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}>
                            <div className="stat-value" style={{ color: '#16a34a', fontSize: 18 }}>{fmt(stmt?.months?.[0]?.remaining ?? 0)}</div>
                            <div className="stat-label">{t('salary.statement.lastMonthRemaining')}</div>
                          </div>
                        </div>

                        <div style={{ fontWeight: 800, margin: '12px 0 6px' }}>{t('salary.statement.monthlyDues')}</div>
                        {!stmt || stmt.months.length === 0 ? (
                          <p className="muted" style={{ margin: '4px 0 12px' }}>{t('salary.statement.noMoves')}</p>
                        ) : (
                          <div className="table-scroll">
                            <table className="table" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 12 }}>
                              <thead>
                                <tr><th>{t('salary.month')}</th><th>{t('salary.col.monthlySalary')}</th><th>{t('salary.col.advance')}</th><th>{t('salary.col.remainder')}</th><th>{t('salary.col.totalPaid')}</th><th>{t('salary.col.remaining')}</th></tr>
                              </thead>
                              <tbody>
                                {stmt.months.map((m) => (
                                  <tr key={m.month}>
                                    <td className="nowrap"><b>{m.month}</b></td>
                                    <td className="nowrap">{fmt(m.salary)}</td>
                                    <td className="nowrap" style={{ color: '#d97706', fontWeight: 700 }}>{fmt(m.advance)}</td>
                                    <td className="nowrap" style={{ color: '#2563eb', fontWeight: 700 }}>{fmt(m.remainder)}</td>
                                    <td className="nowrap" style={{ color: '#dc2626', fontWeight: 700 }}>{fmt(m.paid)}</td>
                                    <td className="nowrap" style={{ color: m.remaining === 0 ? '#64748b' : '#16a34a', fontWeight: 800 }}>{fmt(m.remaining)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        <div style={{ fontWeight: 800, margin: '12px 0 6px' }}>{t('salary.statement.paymentsHistory')}</div>
                        {txs.length === 0 ? (
                          <p className="muted" style={{ margin: 4 }}>{t('salary.statement.noPayments')}</p>
                        ) : (
                          <div className="table-scroll">
                          <table className="table" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                            <thead>
                              <tr><th>{t('common.date')}</th><th>{t('common.type')}</th><th>{t('common.amount')}</th><th>{t('common.notes')}</th><th>{t('salary.statement.createdBy')}</th><th></th></tr>
                            </thead>
                            <tbody>
                              {txs.map((tx) => (
                                <tr key={tx.id}>
                                  <td className="nowrap">{dmy(tx.txn_date)}</td>
                                  <td>{tx.kind === 'advance'
                                    ? <span className="badge badge-processing">{t('salary.statement.kindAdvance')}</span>
                                    : <span className="badge badge-priced">{t('salary.statement.kindRemainder')}</span>}</td>
                                  <td className="nowrap" style={{ fontWeight: 700, color: '#dc2626' }}>{fmt(Math.abs(tx.amount))}</td>
                                  <td className="muted">{tx.notes || '—'}</td>
                                  <td className="muted">{tx.created_by_name || '—'}</td>
                                  <td><button className="btn btn-danger btn-sm" onClick={() => remove(tx)}>{t('common.delete')}</button></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {showAdvance && (
        <div className="modal-overlay" onClick={() => setShowAdvance(false)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{t('salary.advance.title')}</div>
            <div className="modal-sub">{t('salary.advance.sub', { name: selected.full_name })}</div>
            <form onSubmit={saveAdvance}>
              <div className="form-row">
                <label className="form-label">{t('salary.advance.amount')}</label>
                <input className="input" type="number" step="0.01" min="0" dir="ltr" value={advForm.amount} onChange={(e) => setAdvForm({ ...advForm, amount: e.target.value })} required />
              </div>
              <div className="form-row">
                <label className="form-label">{t('salary.advance.date')}</label>
                <input className="input" type="date" value={advForm.txn_date} onChange={(e) => setAdvForm({ ...advForm, txn_date: e.target.value })} required />
              </div>
              <div className="form-row">
                <label className="form-label">{t('common.notes')}</label>
                <input className="input" value={advForm.notes} onChange={(e) => setAdvForm({ ...advForm, notes: e.target.value })} placeholder={t('salary.advance.notesPlaceholder')} />
              </div>
              {msg && <div className="form-error">{msg}</div>}
              <div className="modal-actions">
                <button className="btn btn-outline btn-sm" type="button" onClick={() => setShowAdvance(false)}>{t('common.cancel')}</button>
                <button className="btn btn-success btn-sm" type="submit" disabled={busy}>{busy ? '...' : t('common.save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showExport && exportEmp && (
        <div className="print-only-all" style={{ position: 'fixed', inset: 0, background: '#f1f5f9', zIndex: 200, overflow: 'auto', padding: 20 }}>
          <div className="no-print card" style={{ maxWidth: 860, margin: '0 auto 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div className="modal-title">📄 {t('salary.statement.heading', { name: exportEmp.full_name })}</div>
                <div className="muted" style={{ fontSize: 13 }}>{t('salary.export.subtitle')}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-outline btn-sm" onClick={closeExport}>{t('common.close')}</button>
                <button className="btn btn-primary btn-sm" onClick={() => window.print()}>{t('salary.export.print')}</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {PRESETS.map((p) => (
                <button key={p.key} className={'btn btn-sm ' + (expPreset === p.key ? 'btn-primary' : 'btn-outline')} onClick={() => changePreset(p.key)}>{t(`salary.export.presets.${p.key}`)}</button>
              ))}
              <div className="form-row" style={{ margin: 0 }}>
                <label className="form-label">{t('common.from')}</label>
                <input className="input" type="date" dir="ltr" style={{ width: 150 }} value={expFrom} onChange={(e) => { setExpFrom(e.target.value); if (exportEmp && e.target.value && expTo) loadStmtDoc(exportEmp.id, e.target.value, expTo); }} />
              </div>
              <div className="form-row" style={{ margin: 0 }}>
                <label className="form-label">{t('common.to')}</label>
                <input className="input" type="date" dir="ltr" style={{ width: 150 }} value={expTo} onChange={(e) => { setExpTo(e.target.value); if (exportEmp && expFrom && e.target.value) loadStmtDoc(exportEmp.id, expFrom, e.target.value); }} />
              </div>
            </div>
          </div>

          <div className="print-area card" style={{ maxWidth: 860, margin: '0 auto', padding: 32 }}>
            <div className="print-header">
              <CompanyLogo className="print-logo" alt={t('salary.export.logoAlt', { name: companyName(company) })} />
              <div style={{ textAlign: 'center' }}>
                <div className="print-company-name">{companyName(company)}</div>
                <div className="muted" dir="ltr">{company.nameFr} — {company.form}</div>
                <div className="muted" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.7, direction: 'ltr', textAlign: 'center' }}>
                  {t('common.email')} : {company.email}<br />
                  {t('common.phone')} : {company.tel}<br />
                  {company.nifRcAgrement}
                </div>
                <div className="page-title" style={{ marginTop: 12, marginBottom: 0 }}>{t('salary.export.docTitle')}</div>
              </div>
              <div className="print-header-info" style={{ textAlign: 'right' }}>
                <div>{t('pdf.issuedOn', { date: dmy(new Date()) })}</div>
              </div>
            </div>

            {!stmtDoc ? (
              <p style={{ padding: '40px 0', textAlign: 'center' }} className="muted">{t('common.loading')}</p>
            ) : (
              <>
                <table className="table" style={{ marginTop: 16 }}>
                  <tbody>
                    <tr><th style={{ width: 200 }}>{t('salary.export.docEmployee')}</th><td><b>{stmtDoc.employee.full_name}</b></td></tr>
                    <tr><th>{t('salary.export.docMonthlySalary')}</th><td><b>{money(stmtDoc.employee.salary)}</b></td></tr>
                    <tr><th>{t('common.period')}</th><td>{stmtDoc.from && stmtDoc.to ? t('salary.export.periodValue', { from: dmy(stmtDoc.from), to: dmy(stmtDoc.to) }) : t('salary.export.periodAll')}</td></tr>
                  </tbody>
                </table>

                <h3 className="print-section">{t('salary.export.periodSummary')}</h3>
                <table className="table">
                  <tbody>
                    <tr><th style={{ width: 280 }}>{t('salary.export.monthlySalaryMru', { currency: t('common.currency') })}</th><td>{fmt(stmtDoc.period.salary)}</td></tr>
                    <tr><th>{t('salary.export.totalAdvancePaid')}</th><td>{fmt(stmtDoc.period.advance)}</td></tr>
                    <tr><th>{t('salary.export.totalRemainderPaid')}</th><td>{fmt(stmtDoc.period.remainder)}</td></tr>
                    <tr><th>{t('salary.export.totalPaidPeriod')}</th><td><b>{fmt(stmtDoc.period.paid)}</b></td></tr>
                    <tr>
                      <th>{t('salary.export.remainingPeriod')}</th>
                      <td><b style={{ color: stmtDoc.period.remaining === 0 ? '#64748b' : '#16a34a' }}>{fmt(stmtDoc.period.remaining)}</b></td>
                    </tr>
                  </tbody>
                </table>

                <h3 className="print-section">{t('salary.export.paymentsInPeriod')}</h3>
                {stmtDoc.transactions.length === 0 ? (
                  <p className="muted">{t('salary.export.noPaymentsInPeriod')}</p>
                ) : (
                  <table className="table">
                    <thead>
                      <tr><th>{t('common.date')}</th><th>{t('common.type')}</th><th>{t('salary.export.amountMru', { currency: t('common.currency') })}</th><th>{t('common.notes')}</th><th>{t('salary.export.by')}</th></tr>
                    </thead>
                    <tbody>
                      {stmtDoc.transactions.map((tx) => (
                        <tr key={tx.id}>
                          <td className="nowrap">{dmy(tx.txn_date)}</td>
                          <td>{tx.kind === 'advance' ? t('salary.statement.kindAdvance') : t('salary.statement.kindRemainder')}</td>
                          <td className="nowrap"><b>{fmt(Math.abs(tx.amount))}</b></td>
                          <td className="muted">{tx.notes || '—'}</td>
                          <td className="muted">{tx.created_by_name || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <h3 className="print-section">{t('salary.export.monthlySummary')}</h3>
                {stmtDoc.months.length === 0 ? (
                  <p className="muted">{t('salary.export.noMovesRecorded')}</p>
                ) : (
                  <table className="table">
                    <thead>
                      <tr><th>{t('salary.month')}</th><th>{t('salary.col.monthlySalary')}</th><th>{t('salary.col.advance')}</th><th>{t('salary.col.remainder')}</th><th>{t('salary.col.totalPaid')}</th><th>{t('salary.col.remaining')}</th></tr>
                    </thead>
                    <tbody>
                      {stmtDoc.months.map((m) => (
                        <tr key={m.month}>
                          <td className="nowrap"><b>{m.month}</b></td>
                          <td className="nowrap">{fmt(m.salary)}</td>
                          <td className="nowrap">{fmt(m.advance)}</td>
                          <td className="nowrap">{fmt(m.remainder)}</td>
                          <td className="nowrap"><b>{fmt(m.paid)}</b></td>
                          <td className="nowrap">{fmt(m.remaining)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <div className="print-sign" style={{ display: 'flex', alignItems: 'flex-end', marginTop: 48, minHeight: 140 }}>
                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>{t('salary.export.managerSignature')}</div>
                    <div style={{ width: 220, borderBottom: '1px solid #64748b', height: 40 }} />
                  </div>
                </div>

                <div className="print-footer muted">
                  {t('salary.export.footer', { company: companyName(company) })}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
