import { Fragment, useEffect, useState } from 'react';
import { salaryApi } from '../utils/api.js';
import { fmt } from './Dashboard.jsx';
import { COMPANY } from '../utils/company.js';
import logo from '../assets/logo.png';

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
  { key: 'month', label: 'الشهر الحالي' },
  { key: 'lastMonth', label: 'الشهر الماضي' },
  { key: '3m', label: 'آخر 3 أشهر' },
  { key: 'custom', label: 'نطاق مخصص' },
];

export default function SalaryLedger() {
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
    } catch (err) { alert(err.message); }
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
    } catch (err) { setMsg(err.message); }
    finally { setBusy(false); }
  };

  const payRemainder = async (emp) => {
    if (emp.remaining <= 0) { alert(`لا بقية تُدفع لـ«${emp.full_name}» — الراتب مستوفى بالكامل`); return; }
    const amountStr = prompt(
      `دفع بقية راتب «${emp.full_name}» — شهر ${month}\nالراتب: ${fmt(emp.salary)}\nسلف المدفوع: ${fmt(emp.paid)}\nالبقية المستحقة: ${fmt(emp.remaining)}\n\nتأكيد دفع المبلغ؟ (فارغ للإلغاء)`,
      String(emp.remaining)
    );
    if (amountStr === null || amountStr === '') return;
    try {
      const res = await salaryApi.remainder({ user_id: emp.id, txn_date: today(), notes: `بقية راتب شهر ${month}` });
      alert(`تم دفع بقية الراتب: ${fmt(res.remainder)} — خُصمت من الصندوق`);
      afterChange();
      if (selected && selected.id === emp.id) loadDetail(emp.id);
    } catch (err) { alert(err.message); }
  };

  const remove = async (tx) => {
    if (!confirm(`حذف هذه الحركة (${fmt(Math.abs(tx.amount))})؟`)) return;
    try {
      await salaryApi.remove(tx.id);
      afterChange();
      if (selected) loadDetail(selected.id);
    } catch (err) { alert(err.message); }
  };

  const totals = employees.reduce(
    (a, e) => ({ salary: a.salary + e.salary, paid: a.paid + e.paid, remaining: a.remaining + e.remaining }),
    { salary: 0, paid: 0, remaining: 0 }
  );

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">رواتب الموظفين</h1>
          <p className="page-sub">دفع مقدم من الراتب أو بقية الراتب — يُخصم كلاهما تلقائياً من الصندوق</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label className="form-label">الشهر</label>
            <input className="input" type="month" style={{ width: 140 }} value={month} max={currentMonth()} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <button className="btn btn-outline btn-sm" onClick={afterChange}>🔄</button>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#2563eb' }}>{fmt(totals.salary)}</div>
          <div className="stat-label">إجمالي رواتب الشهر ({month})</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#dc2626' }}>{fmt(totals.paid)}</div>
          <div className="stat-label">المدفوع من الصندوق</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#16a34a' }}>{fmt(totals.remaining)}</div>
          <div className="stat-label">المتبقي للموظفين</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        <table className="table">
          <thead>
            <tr>
              <th>الموظف</th>
              <th style={{ textAlign: 'center' }}>الراتب الشهري</th>
              <th style={{ textAlign: 'center' }}>مقدم (سلف)</th>
              <th style={{ textAlign: 'center' }}>بقية</th>
              <th style={{ textAlign: 'center' }}>المدفوع</th>
              <th style={{ textAlign: 'center' }}>المتبقي</th>
              <th style={{ textAlign: 'center' }}>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 && (
              <tr><td colSpan="7" className="muted" style={{ textAlign: 'center', padding: 20 }}>لا يوجد موظفون نشطون</td></tr>
            )}
            {employees.map((emp) => {
              const open = selected && selected.id === emp.id;
              return (
                <Fragment key={emp.id}>
                  <tr style={{ cursor: 'pointer', background: open ? '#f0f7ff' : undefined }} onClick={() => openEmployee(emp)}>
                    <td><b>{emp.full_name}</b>{!emp.is_active && <span className="muted"> (معطل)</span>}</td>
                    <td className="nowrap" style={{ textAlign: 'center', fontWeight: 800 }}>{fmt(emp.salary)}</td>
                    <td className="nowrap" style={{ textAlign: 'center', fontWeight: 700, color: '#d97706' }}>{fmt(emp.advance_paid)}</td>
                    <td className="nowrap" style={{ textAlign: 'center', fontWeight: 700, color: '#2563eb' }}>{fmt(emp.remainder_paid)}</td>
                    <td className="nowrap" style={{ textAlign: 'center', fontWeight: 800, color: '#dc2626' }}>{fmt(emp.paid)}</td>
                    <td className="nowrap" style={{ textAlign: 'center', fontWeight: 800, color: emp.remaining === 0 ? '#64748b' : '#16a34a' }}>
                      {fmt(emp.remaining)} {emp.remaining === 0 && <span className="muted" style={{ fontSize: 12 }}>(مسدد)</span>}
                    </td>
                    <td className="nowrap" style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-primary btn-sm" onClick={(e) => openExport(emp, e)} title="تصدير كشف الحساب PDF">📄 كشف PDF</button>{' '}
                      <button className="btn btn-success btn-sm" onClick={(e) => openAdvance(emp, e)}>💵 دفع مقدم</button>{' '}
                      <button className="btn btn-outline btn-sm" onClick={() => payRemainder(emp)}>دفع بقية الراتب</button>
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan="7" style={{ padding: '0 20px 16px', background: '#f0f7ff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '12px 0 8px', flexWrap: 'wrap', gap: 8 }}>
                          <b>كشف حساب: {selected.full_name}</b>
                          <span className="muted">{txs.length} عملية</span>
                        </div>

                        <div className="grid grid-4" style={{ marginBottom: 12 }}>
                          <div className="stat-card" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}>
                            <div className="stat-value" style={{ color: '#2563eb', fontSize: 18 }}>{fmt(stmt?.employee?.salary ?? 0)}</div>
                            <div className="stat-label">الراتب الشهري</div>
                          </div>
                          <div className="stat-card" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}>
                            <div className="stat-value" style={{ color: '#d97706', fontSize: 18 }}>{fmt(stmt?.months?.[0]?.advance ?? 0)}</div>
                            <div className="stat-label">مقدم آخر شهر</div>
                          </div>
                          <div className="stat-card" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}>
                            <div className="stat-value" style={{ color: '#2563eb', fontSize: 18 }}>{fmt(stmt?.months?.[0]?.remainder ?? 0)}</div>
                            <div className="stat-label">بقية آخر شهر</div>
                          </div>
                          <div className="stat-card" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}>
                            <div className="stat-value" style={{ color: '#16a34a', fontSize: 18 }}>{fmt(stmt?.months?.[0]?.remaining ?? 0)}</div>
                            <div className="stat-label">المتبقي آخر شهر</div>
                          </div>
                        </div>

                        <div style={{ fontWeight: 800, margin: '12px 0 6px' }}>المستحقات الشهرية (كشف الحساب)</div>
                        {!stmt || stmt.months.length === 0 ? (
                          <p className="muted" style={{ margin: '4px 0 12px' }}>لا توجد حركات مسجلة بعد</p>
                        ) : (
                          <table className="table" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 12 }}>
                            <thead>
                              <tr><th>الشهر</th><th>الراتب</th><th>مقدم</th><th>بقية</th><th>الإجمالي المدفوع</th><th>المتبقي</th></tr>
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
                        )}

                        <div style={{ fontWeight: 800, margin: '12px 0 6px' }}>تاريخ المدفوعات</div>
                        {txs.length === 0 ? (
                          <p className="muted" style={{ margin: 4 }}>لا توجد دفعات</p>
                        ) : (
                          <table className="table" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                            <thead>
                              <tr><th>التاريخ</th><th>النوع</th><th>المبلغ</th><th>ملاحظات</th><th>سجّلها</th><th></th></tr>
                            </thead>
                            <tbody>
                              {txs.map((tx) => (
                                <tr key={tx.id}>
                                  <td className="nowrap">{tx.txn_date}</td>
                                  <td>{tx.kind === 'advance'
                                    ? <span className="badge badge-processing">مقدم</span>
                                    : <span className="badge badge-priced">بقية</span>}</td>
                                  <td className="nowrap" style={{ fontWeight: 700, color: '#dc2626' }}>{fmt(Math.abs(tx.amount))}</td>
                                  <td className="muted">{tx.notes || '—'}</td>
                                  <td className="muted">{tx.created_by_name || '—'}</td>
                                  <td><button className="btn btn-danger btn-sm" onClick={() => remove(tx)}>حذف</button></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
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
            <div className="modal-title">💵 دفع مقدم من الراتب</div>
            <div className="modal-sub">على حساب «{selected.full_name}» — يُخصم تلقائياً من الصندوق</div>
            <form onSubmit={saveAdvance}>
              <div className="form-row">
                <label className="form-label">المبلغ *</label>
                <input className="input" type="number" step="0.01" min="0" dir="ltr" value={advForm.amount} onChange={(e) => setAdvForm({ ...advForm, amount: e.target.value })} required />
              </div>
              <div className="form-row">
                <label className="form-label">التاريخ *</label>
                <input className="input" type="date" value={advForm.txn_date} onChange={(e) => setAdvForm({ ...advForm, txn_date: e.target.value })} required />
              </div>
              <div className="form-row">
                <label className="form-label">ملاحظات</label>
                <input className="input" value={advForm.notes} onChange={(e) => setAdvForm({ ...advForm, notes: e.target.value })} placeholder="مثال: سلفة على راتب الشهر" />
              </div>
              {msg && <div className="form-error">{msg}</div>}
              <div className="modal-actions">
                <button className="btn btn-outline btn-sm" type="button" onClick={() => setShowAdvance(false)}>إلغاء</button>
                <button className="btn btn-success btn-sm" type="submit" disabled={busy}>{busy ? '...' : 'حفظ'}</button>
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
                <div className="modal-title">📄 كشف حساب: {exportEmp.full_name}</div>
                <div className="muted" style={{ fontSize: 13 }}>حدد الفترة ثم صدّر الملف الرسمي (PDF)</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-outline btn-sm" onClick={closeExport}>إغلاق</button>
                <button className="btn btn-primary btn-sm" onClick={() => window.print()}>🖨️ تصدير PDF / طباعة</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {PRESETS.map((p) => (
                <button key={p.key} className={'btn btn-sm ' + (expPreset === p.key ? 'btn-primary' : 'btn-outline')} onClick={() => changePreset(p.key)}>{p.label}</button>
              ))}
              <div className="form-row" style={{ margin: 0 }}>
                <label className="form-label">من</label>
                <input className="input" type="date" dir="ltr" style={{ width: 150 }} value={expFrom} onChange={(e) => { setExpFrom(e.target.value); if (exportEmp && e.target.value && expTo) loadStmtDoc(exportEmp.id, e.target.value, expTo); }} />
              </div>
              <div className="form-row" style={{ margin: 0 }}>
                <label className="form-label">إلى</label>
                <input className="input" type="date" dir="ltr" style={{ width: 150 }} value={expTo} onChange={(e) => { setExpTo(e.target.value); if (exportEmp && expFrom && e.target.value) loadStmtDoc(exportEmp.id, expFrom, e.target.value); }} />
              </div>
            </div>
          </div>

          <div className="print-area card" style={{ maxWidth: 860, margin: '0 auto', padding: 32 }}>
            <div className="print-header">
              <img src={logo} alt={`شعار ${COMPANY.nameAr}`} className="print-logo" />
              <div style={{ textAlign: 'center' }}>
                <div className="print-company-name">{COMPANY.nameAr}</div>
                <div className="muted">{COMPANY.nameFr} — {COMPANY.form}</div>
                <div className="muted" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.7 }}>
                  E-MAIL : {COMPANY.email}<br />
                  Tel : {COMPANY.tel}<br />
                  {COMPANY.nifRcAgrement}
                </div>
                <div className="page-title" style={{ marginTop: 12, marginBottom: 0 }}>كشف حساب موظف</div>
              </div>
              <div className="print-header-info" style={{ textAlign: 'right' }}>
                <div>تاريخ الإصدار: {new Date().toLocaleDateString('ar')}</div>
              </div>
            </div>

            {!stmtDoc ? (
              <p style={{ padding: '40px 0', textAlign: 'center' }} className="muted">جارٍ التحميل...</p>
            ) : (
              <>
                <table className="table" style={{ marginTop: 16 }}>
                  <tbody>
                    <tr><th style={{ width: 200 }}>اسم الموظف</th><td><b>{stmtDoc.employee.full_name}</b></td></tr>
                    <tr><th>الراتب الشهري الثابت</th><td><b>{fmt(stmtDoc.employee.salary)} MRU</b></td></tr>
                    <tr><th>الفترة</th><td>{stmtDoc.from && stmtDoc.to ? `من ${stmtDoc.from} إلى ${stmtDoc.to}` : 'كامل الفترات المسجلة'}</td></tr>
                  </tbody>
                </table>

                <h3 className="print-section">ملخص الفترة</h3>
                <table className="table">
                  <tbody>
                    <tr><th style={{ width: 280 }}>الراتب الشهري الثابت (MRU)</th><td>{fmt(stmtDoc.period.salary)}</td></tr>
                    <tr><th>إجمالي المقدم المدفوع (سلف)</th><td>{fmt(stmtDoc.period.advance)}</td></tr>
                    <tr><th>إجمالي بقية الراتب المدفوع</th><td>{fmt(stmtDoc.period.remainder)}</td></tr>
                    <tr><th>الإجمالي المدفوع ضمن الفترة</th><td><b>{fmt(stmtDoc.period.paid)}</b></td></tr>
                    <tr>
                      <th>الرصيد المتبقي ضمن الفترة</th>
                      <td><b style={{ color: stmtDoc.period.remaining === 0 ? '#64748b' : '#16a34a' }}>{fmt(stmtDoc.period.remaining)}</b></td>
                    </tr>
                  </tbody>
                </table>

                <h3 className="print-section">حركة المدفوعات ضمن الفترة</h3>
                {stmtDoc.transactions.length === 0 ? (
                  <p className="muted">لا توجد مدفوعات ضمن الفترة المحددة</p>
                ) : (
                  <table className="table">
                    <thead>
                      <tr><th>التاريخ</th><th>النوع</th><th>المبلغ (MRU)</th><th>ملاحظات</th><th>بواسطة</th></tr>
                    </thead>
                    <tbody>
                      {stmtDoc.transactions.map((tx) => (
                        <tr key={tx.id}>
                          <td className="nowrap">{tx.txn_date}</td>
                          <td>{tx.kind === 'advance' ? 'مقدم' : 'بقية الراتب'}</td>
                          <td className="nowrap"><b>{fmt(Math.abs(tx.amount))}</b></td>
                          <td className="muted">{tx.notes || '—'}</td>
                          <td className="muted">{tx.created_by_name || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <h3 className="print-section">الملخص الشهري</h3>
                {stmtDoc.months.length === 0 ? (
                  <p className="muted">لا توجد حركات مسجلة</p>
                ) : (
                  <table className="table">
                    <thead>
                      <tr><th>الشهر</th><th>الراتب</th><th>مقدم</th><th>بقية</th><th>الإجمالي المدفوع</th><th>المتبقي</th></tr>
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

                <div className="print-sign" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 48, minHeight: 140 }}>
                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>توقيع المدير</div>
                    <div style={{ width: 220, borderBottom: '1px solid #64748b', height: 40 }} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div className="muted" style={{ marginBottom: 6 }}>ختم الوكالة</div>
                    <img src="/stamp.svg" alt="ختم الوكالة الموريتانية للخدمات" style={{ width: 130, height: 130, objectFit: 'contain' }} />
                  </div>
                </div>

                <div className="print-footer muted">
                  صدر هذا الكشف رسمياً من نظام الوكالة الموريتانية للخدمات — السجل دليل على راتبه ومدفوعاته
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}