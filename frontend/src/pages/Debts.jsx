import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { reportsApi, customersApi } from '../utils/api.js';
import { refreshDashboard } from '../utils/refresh.js';
import { DEBT_BADGE } from '../utils/format.js';
import { exportExcel } from '../utils/export.js';
import { useFeedback } from '../components/Feedback.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function Debts() {
  const { t, fmt, money, dmy, debtLabel } = useI18n();
  const { toast, confirm } = useFeedback();
  const navigate = useNavigate();
  const location = useLocation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(() => location.state?.q || '');
  const [status, setStatus] = useState(() => location.state?.status || '');
  const [showPay, setShowPay] = useState(null);
  const [payForm, setPayForm] = useState({ amount: '', payment_date: today(), notes: '' });
  const [payErr, setPayErr] = useState('');
  const [history, setHistory] = useState(null);
  const [paying, setPaying] = useState(false);
  const [dueForm, setDueForm] = useState(null);
  const [dueDate, setDueDate] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ name: '', phone: '', address: '', notes: '' });
  const [newErr, setNewErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [showOldDebt, setShowOldDebt] = useState(false);
  const [oldForm, setOldForm] = useState({ amount: '', debt_date: today(), notes: '' });
  const [oldErr, setOldErr] = useState('');
  const [oldSaving, setOldSaving] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [odSearch, setOdSearch] = useState('');
  const [odOpen, setOdOpen] = useState(false);

  const statusOpts = [
    { v: '', l: t('common.allStatuses') },
    { v: 'overdue', l: debtLabel('overdue') },
    { v: 'partial', l: debtLabel('partial') },
    { v: 'due', l: debtLabel('due') },
    { v: 'paid', l: debtLabel('paid') },
  ];

  const load = () => {
    reportsApi.balances().then(setRows).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = rows;
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      list = list.filter((r) =>
        [r.customer_name, r.phone, r.email].some((v) => String(v || '').toLowerCase().includes(s))
      );
    }
    if (status) list = list.filter((r) => r.debt_status === status);
    return [...list].sort((a, b) => {
      const oa = a.debt_status === 'overdue' ? 1 : 0;
      const ob = b.debt_status === 'overdue' ? 1 : 0;
      if (oa !== ob) return ob - oa;
      return Number(b.balance) - Number(a.balance);
    });
  }, [rows, q, status]);

  const totals = useMemo(() => ({
    total: rows.reduce((s, r) => s + Math.max(Number(r.balance), 0), 0),
    overdue: rows.filter((r) => r.debt_status === 'overdue').reduce((s, r) => s + Math.max(Number(r.balance), 0), 0),
    overdue_count: rows.filter((r) => r.debt_status === 'overdue').length,
    debtors: rows.filter((r) => Number(r.balance) > 0).length,
  }), [rows]);

  // searchable list used inside the "دين قديم" modal
  const filteredCustomers = useMemo(() => {
    const s = odSearch.trim().toLowerCase();
    return rows.filter((c) => !s || [c.customer_name, c.phone].some((v) => String(v || '').toLowerCase().includes(s)));
  }, [rows, odSearch]);

  const openPay = (row) => {
    setShowPay(row);
    setPayForm({ amount: '', payment_date: today(), notes: '' });
    setPayErr('');
  };

  const submitPay = async (e) => {
    e.preventDefault();
    setPayErr('');
    const amt = Number(payForm.amount);
    if (!payForm.amount || !isFinite(amt) || amt <= 0) { setPayErr(t('debts.errAmount')); return; }
    setPaying(true);
    try {
      await customersApi.addPayment(showPay.id, {
        amount: amt,
        payment_date: payForm.payment_date,
        notes: payForm.notes || '',
      });
      toast(t('debts.toastPayment', { amount: fmt(amt), name: showPay.customer_name }));
      setShowPay(null);
      load();
      refreshDashboard();
    } catch (err) { setPayErr(err.message); }
    finally { setPaying(false); }
  };

  const viewHistory = async (row) => {
    try {
      const p = await customersApi.payments(row.id);
      setHistory({ customer: row, payments: p });
    } catch (err) { toast(err.message, 'error'); }
  };

  const removePayment = async (pay, customer) => {
    if (!(await confirm(t('debts.confirmDeletePayment', { amount: fmt(pay.amount), date: dmy(pay.payment_date) }), { danger: true, okLabel: t('common.delete') }))) return;
    try {
      await customersApi.removePayment(customer.id, pay.id);
      toast(t('debts.toastPaymentDeleted'));
      viewHistory(customer);
      load();
      refreshDashboard();
    } catch (err) { toast(err.message, 'error'); }
  };

  const saveDueDate = async (e) => {
    e.preventDefault();
    try {
      await customersApi.update(dueForm.id, { due_date: dueDate || null });
      toast(t('debts.toastDueUpdated'));
      setDueForm(null);
      load();
      refreshDashboard();
    } catch (err) { toast(err.message, 'error'); }
  };

  const openNew = () => { setNewForm({ name: '', phone: '', address: '', notes: '' }); setNewErr(''); setShowNew(true); };

  const openOldDebt = () => {
    setSelectedCustomer(null);
    setOdSearch('');
    setOdOpen(false);
    setOldForm({ amount: '', debt_date: today(), notes: '' });
    setOldErr('');
    setShowOldDebt(true);
  };

  // سجل دين قديم (رصيد سابق) داخل حساب الزبون بتاريخه الأصلي — لا يؤثر على الصندوق أو رأس المال
  const submitOldDebt = async (e) => {
    e.preventDefault();
    setOldErr('');
    if (!selectedCustomer) { setOldErr(t('debts.errCustomer')); return; }
    const amt = Number(oldForm.amount);
    if (!oldForm.amount || !isFinite(amt) || amt <= 0) { setOldErr(t('debts.errAmount')); return; }
    if (!oldForm.debt_date) { setOldErr(t('debts.errDateRequired')); return; }
    if (oldForm.debt_date > today()) { setOldErr(t('debts.errFutureDate')); return; }
    setOldSaving(true);
    try {
      await customersApi.addOldDebt(selectedCustomer.id, {
        amount: amt,
        debt_date: oldForm.debt_date,
        notes: oldForm.notes || '',
      });
      toast(t('debts.toastOldDebt', { amount: fmt(amt), name: selectedCustomer.customer_name }));
      setShowOldDebt(false);
      load();
      refreshDashboard();
    } catch (err) { setOldErr(err.message); }
    finally { setOldSaving(false); }
  };

  const saveNew = async (e) => {
    e.preventDefault();
    setNewErr('');
    if (!newForm.name.trim()) { setNewErr(t('debts.errName')); return; }
    setSaving(true);
    try {
      const r = await customersApi.create(newForm);
      toast(t('debts.toastCustomerAdded', { name: r.name }));
      setShowNew(false);
      load();
      refreshDashboard();
    } catch (err) { setNewErr(err.message); }
    finally { setSaving(false); }
  };

  const doExport = () => {
    exportExcel(t('debts.exportFile'), [
      { key: 'customer_name', header: t('debts.colCustomer') },
      { key: 'phone', header: t('debts.colPhone') },
      { key: 'container_count', header: t('debts.colContainers') },
      { key: 'total_billed', header: t('debts.colBilled') },
      { key: 'old_debts', header: t('debts.colOldDebt') },
      { key: 'total_paid', header: t('debts.colPaid') },
      { key: 'balance', header: t('debts.colBalance') },

      { key: 'debt_status', header: t('common.status') },
    ], filtered.map((r) => ({
      ...r,
      total_billed: money(r.total_billed),
      old_debts: money(r.old_debts),
      total_paid: money(r.total_paid),
      balance: money(r.balance),

      debt_status: debtLabel(r.debt_status),
    })));
  };

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">{t('debts.title')}</h1>
          <p className="page-sub">{t('debts.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={openNew}>➕ {t('debts.newCustomer')}</button>
          <button className="btn btn-outline" onClick={openOldDebt}>➕ {t('debts.oldDebt')}</button>
          <button className="btn btn-outline" onClick={doExport}>⬇ {t('common.exportExcel')}</button>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: '#fef2f2' }}>💳</div>
          <div className="kpi-body">
            <div className="kpi-label">{t('debts.kpiTotal')}</div>
            <div className="kpi-value">{fmt(totals.total)}</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: '#fff7ed' }}>⏰</div>
          <div className="kpi-body">
            <div className="kpi-label">{t('debts.kpiOverdue')}</div>
            <div className="kpi-value">{fmt(totals.overdue)}</div>
            <div className="kpi-sub">{t('debts.overdueCount', { count: totals.overdue_count })}</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: '#eff6ff' }}>👥</div>
          <div className="kpi-body">
            <div className="kpi-label">{t('debts.kpiDebtors')}</div>
            <div className="kpi-value">{totals.debtors}</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: '#f0fdf4' }}>✓</div>
          <div className="kpi-body">
            <div className="kpi-label">{t('debts.kpiSettled')}</div>
            <div className="kpi-value">{rows.length - totals.debtors}</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'auto', marginBottom: 18 }}>
        <div className="card-header" style={{ padding: '16px 18px', marginBottom: 0, borderBottom: '1px solid var(--border)' }}>
          <div className="card-title">{t('debts.listTitle')}</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input className="input" style={{ width: 230 }} placeholder={t('debts.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="select" style={{ width: 150 }} value={status} onChange={(e) => setStatus(e.target.value)}>
              {statusOpts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </div>
        </div>
        <table className="table" style={{ minWidth: 1000 }}>
          <thead>
            <tr>
              <th>{t('debts.colCustomer')}</th><th>{t('debts.colPhone')}</th><th>{t('debts.colContainers')}</th><th>{t('debts.colBilled')}</th>
              <th>{t('debts.colOldDebt')}</th><th>{t('debts.colPaid')}</th><th>{t('debts.colBalance')}</th><th>{t('common.status')}</th><th style={{ textAlign: 'center' }}>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="9"><div className="empty-state"><span className="spinner" /></div></td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan="9"><div className="empty-state"><span className="empty-ico">📭</span>{t('debts.noMatch')}</div></td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 800 }}>{r.customer_name}</td>
                <td className="nowrap" dir="ltr">{r.phone || '—'}</td>
                <td>{r.container_count}</td>
                <td className="nowrap">{fmt(r.total_billed)}</td>
                <td className="nowrap" style={{ color: Number(r.old_debts) > 0 ? '#f59e0b' : 'var(--muted)' }}>{Number(r.old_debts) > 0 ? fmt(r.old_debts) : '—'}</td>
                <td className="nowrap" style={{ color: '#16a34a', fontWeight: 700 }}>{fmt(r.total_paid)}</td>
                <td className="nowrap" style={{ fontWeight: 800, color: Number(r.balance) > 0 ? '#d97706' : '#16a34a' }}>{fmt(r.balance)}</td>

                <td><span className={`badge ${DEBT_BADGE[r.debt_status] || 'badge-due'}`}>{debtLabel(r.debt_status)}</span></td>
                <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <button className="btn btn-success btn-sm" onClick={() => openPay(r)}>💳 {t('debts.btnPayment')}</button>{' '}
                  <button className="btn btn-primary btn-sm" onClick={() => navigate(`/clients/${r.id}/compte`, { state: { back: '/debts', backState: { q, status } } })}>{t('debts.btnStatement')}</button>{' '}
                  <button className="btn btn-outline btn-sm" onClick={() => viewHistory(r)}>{t('debts.btnHistory')}</button>{' '}
                  <button className="btn btn-outline btn-sm" onClick={() => { setDueForm(r); setDueDate(r.due_date ? String(r.due_date).slice(0, 10) : ''); }}>📅</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showNew && (
        <div className="modal-overlay" onClick={() => setShowNew(false)}>
          <form className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()} onSubmit={saveNew}>
            <div className="modal-title">{t('debts.newCustomer')}</div>
            <div className="modal-sub">{t('debts.newSub')}</div>
            <div className="form-row">
              <label className="form-label">{t('debts.fieldName')}</label>
              <input className="input" value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} autoFocus />
            </div>
            <div className="form-row">
              <label className="form-label">{t('common.phone')}</label>
              <input className="input" dir="ltr" value={newForm.phone} onChange={(e) => setNewForm({ ...newForm, phone: e.target.value })} />
            </div>
            <div className="form-row">
              <label className="form-label">{t('common.address')}</label>
              <input className="input" value={newForm.address} onChange={(e) => setNewForm({ ...newForm, address: e.target.value })} />
            </div>
            <div className="form-row">
              <label className="form-label">{t('common.notes')}</label>
              <textarea className="input" rows={2} value={newForm.notes} onChange={(e) => setNewForm({ ...newForm, notes: e.target.value })} />
            </div>
            {newErr && <div className="form-error">{newErr}</div>}
            <div className="modal-actions">
              <button className="btn btn-outline" type="button" onClick={() => setShowNew(false)}>{t('common.cancel')}</button>
              <button className="btn btn-success" type="submit" disabled={saving}>{saving ? '...' : t('debts.saveCustomer')}</button>
            </div>
          </form>
        </div>
      )}

      {showPay && (
        <div className="modal-overlay" onClick={() => setShowPay(null)}>
          <form className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()} onSubmit={submitPay}>
            <div className="modal-title">{t('debts.payTitle', { name: showPay.customer_name })}</div>
            <div className="modal-sub">{t('debts.payRemaining')} <b style={{ color: '#d97706' }}>{fmt(showPay.balance)}</b></div>
            <div className="form-row">
              <label className="form-label">{t('debts.fieldAmount')}</label>
              <input className="input" type="number" step="0.01" min="0" autoFocus dir="ltr" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
            </div>
            <div className="form-row">
              <label className="form-label">{t('debts.fieldDate')}</label>
              <input className="input" type="date" value={payForm.payment_date} onChange={(e) => setPayForm({ ...payForm, payment_date: e.target.value })} />
            </div>
            <div className="form-row">
              <label className="form-label">{t('common.notes')}</label>
              <input className="input" value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} placeholder={t('debts.payNotesPlaceholder')} />
            </div>
            {payErr && <div className="form-error">{payErr}</div>}
            <div className="modal-actions">
              <button className="btn btn-outline" type="button" onClick={() => setShowPay(null)}>{t('common.cancel')}</button>
              <button className="btn btn-success" type="submit" disabled={paying}>{paying ? '...' : t('debts.savePayment')}</button>
            </div>
          </form>
        </div>
      )}

      {dueForm && (
        <div className="modal-overlay" onClick={() => setDueForm(null)}>
          <form className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()} onSubmit={saveDueDate}>
            <div className="modal-title">{t('debts.dueTitle', { name: dueForm.customer_name })}</div>
            <div className="modal-sub">{t('debts.dueSub')}</div>
            <div className="form-row">
              <label className="form-label">{t('debts.fieldDueDate')}</label>
              <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" type="button" onClick={() => setDueForm(null)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" type="submit">{t('common.save')}</button>
            </div>
          </form>
        </div>
      )}

      {showOldDebt && (
        <div className="modal-overlay" onClick={() => setShowOldDebt(false)}>
          <form className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()} onSubmit={submitOldDebt}>
            <div className="modal-title">{t('debts.oldTitle')}</div>
            <div className="modal-sub">{t('debts.oldSub')}</div>
            <div className="form-row">
              <label className="form-label">{t('debts.fieldCustomer')}</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="input"
                  autoFocus
                  value={selectedCustomer ? selectedCustomer.customer_name : odSearch}
                  onChange={(e) => { setSelectedCustomer(null); setOdSearch(e.target.value); }}
                  onFocus={() => setOdOpen(true)}
                  onBlur={() => setTimeout(() => setOdOpen(false), 150)}
                  placeholder={t('debts.searchCustomerPlaceholder')}
                />
                {odOpen && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, maxHeight: 220, overflow: 'auto', boxShadow: 'var(--shadow-lg)' }}>
                    {filteredCustomers.length === 0 && <div className="muted" style={{ padding: 10, textAlign: 'center' }}>{t('debts.noResults')}</div>}
                    {filteredCustomers.map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => { setSelectedCustomer(c); setOdOpen(false); }}
                        style={{ display: 'block', width: '100%', textAlign: 'start', padding: '10px 12px', border: 'none', borderBottom: '1px solid var(--border)', background: 'none', cursor: 'pointer' }}
                      >
                        <b>{c.customer_name}</b>{' '}
                        {c.phone ? <span className="muted">— {c.phone}</span> : null}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="form-row">
              <label className="form-label">{t('debts.fieldAmount')}</label>
              <input className="input" type="number" step="0.01" min="0" dir="ltr" value={oldForm.amount} onChange={(e) => setOldForm({ ...oldForm, amount: e.target.value })} placeholder={t('debts.amountPlaceholder')} />
            </div>
            <div className="form-row">
              <label className="form-label">{t('debts.fieldOldDate')}</label>
              <input className="input" type="date" max={today()} value={oldForm.debt_date} onChange={(e) => setOldForm({ ...oldForm, debt_date: e.target.value })} />
            </div>
            <div className="form-row">
              <label className="form-label">{t('common.notes')}</label>
              <input className="input" value={oldForm.notes} onChange={(e) => setOldForm({ ...oldForm, notes: e.target.value })} placeholder={t('debts.oldNotesPlaceholder')} />
            </div>
            {oldErr && <div className="form-error">{oldErr}</div>}
            <div className="modal-actions">
              <button className="btn btn-outline" type="button" onClick={() => setShowOldDebt(false)}>{t('common.cancel')}</button>
              <button className="btn btn-success" type="submit" disabled={oldSaving}>{oldSaving ? t('debts.saving') : t('debts.saveOldDebt')}</button>
            </div>
          </form>
        </div>
      )}

      {history && (
        <div className="modal-overlay" onClick={() => setHistory(null)}>
          <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{t('debts.historyTitle', { name: history.customer.customer_name })}</div>
            <div className="modal-sub">{t('debts.historyPaid')} <b style={{ color: '#16a34a' }}>{fmt(history.customer.total_paid)}</b> — {t('debts.historyRemaining')} <b style={{ color: '#d97706' }}>{fmt(history.customer.balance)}</b></div>
            {history.payments.length === 0 && <div className="empty-state"><span className="empty-ico">💤</span>{t('debts.noPayments')}</div>}
            {history.payments.length > 0 && (
              <table className="table">
                <thead><tr><th>{t('common.date')}</th><th>{t('common.amount')}</th><th>{t('common.notes')}</th><th></th></tr></thead>
                <tbody>
                  {history.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="nowrap">{dmy(p.payment_date)}</td>
                      <td className="nowrap" style={{ fontWeight: 800, color: '#16a34a' }}>{fmt(p.amount)}</td>
                      <td>{p.notes || '—'}</td>
                      <td><button className="btn btn-danger btn-sm" onClick={() => removePayment(p, history.customer)}>{t('common.delete')}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setHistory(null)}>{t('common.close')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
