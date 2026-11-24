import { useEffect, useState } from 'react';
import { salaryApi } from '../utils/api.js';
import { refreshDashboard } from '../utils/refresh.js';
import { useI18n } from '../i18n/I18nContext.jsx';
import { PAYMENT_METHODS, PAYMENT_METHOD_SHORT, newIdempotencyKey, downloadCsv } from '../utils/accountant.js';

const monthEnd = (month) => {
  const [year, mm] = month.split('-').map(Number);
  const lastDay = new Date(year, mm, 0).getDate();
  return `${month}-${String(lastDay).padStart(2, '0')}`;
};

const emptyForm = () => ({
  user_id: '',
  amount: '',
  txn_date: new Date().toISOString().slice(0, 10),
  notes: '',
  payment_method: 'cash',
  idempotency_key: newIdempotencyKey(),
});

export default function AccountantWages() {
  const { t, fmt, dmy } = useI18n();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [employees, setEmployees] = useState([]);
  const [txs, setTxs] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [msg, setMsg] = useState('');
  const [rowMsg, setRowMsg] = useState({});
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    salaryApi.employees({ month }).then(setEmployees).catch(() => {}).finally(() => setLoading(false));
    salaryApi.transactions({ from: `${month}-01`, to: monthEnd(month) }).then(setTxs).catch(() => {});
  };

  useEffect(() => {
    load();
  }, [month]);

  const selected = employees.find((e) => String(e.id) === String(form.user_id));

  const openNew = (emp) => {
    setForm({ ...emptyForm(), user_id: emp ? String(emp.id) : '' });
    setMsg('');
    setShowForm(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await salaryApi.advance({
        user_id: Number(form.user_id),
        amount: Number(form.amount),
        txn_date: form.txn_date,
        notes: form.notes,
        payment_method: form.payment_method,
        idempotency_key: form.idempotency_key,
      });
      setShowForm(false);
      setForm(emptyForm());
      load();
      refreshDashboard();
    } catch (err) {
      setMsg(err.message);
    }
  };

  const payRemainder = async (emp) => {
    if (!confirm(t('salary.pay.confirmPrompt', {
      name: emp.full_name,
      month,
      salary: fmt(emp.salary),
      advance: fmt(emp.advance_paid),
      remaining: fmt(emp.remaining),
    }))) return;
    try {
      await salaryApi.remainder({
        user_id: emp.id,
        txn_date: new Date().toISOString().slice(0, 10),
        payment_method: 'cash',
        idempotency_key: newIdempotencyKey(),
      });
      load();
      refreshDashboard();
    } catch (err) {
      alert(err.message);
    }
  };

  const reverse = async (tx) => {
    const note = prompt(t('accountant.reversePromptSalary', { amount: fmt(tx.amount) }), t('accountant.reverseDefaultNote'));
    if (note === null) return;
    setRowMsg((m) => ({ ...m, [tx.id]: '' }));
    try {
      await salaryApi.reverse(tx.id, { note: note || null });
      load();
      refreshDashboard();
    } catch (err) {
      setRowMsg((m) => ({ ...m, [tx.id]: err.message }));
    }
  };

  const exportCsv = () => {
    downloadCsv(
      t('salary.title'),
      [
        { key: 'txn_date', label: t('common.date') },
        { key: 'employee_name', label: t('salary.col.employee') },
        { key: 'kind', label: t('common.type'), get: (r) => (r.kind === 'advance' ? t('salary.statement.kindAdvance') : t('salary.statement.kindRemainder')) },
        { key: 'amount', label: t('common.amount'), get: (r) => Math.abs(Number(r.amount)) },
        { key: 'payment_method', label: t('accountant.paymentMethod'), get: (r) => PAYMENT_METHOD_SHORT[r.payment_method] || r.payment_method },
        { key: 'notes', label: t('common.notes') },
        { key: 'created_by_name', label: t('salary.statement.createdBy') },
      ],
      txs
    );
  };

  const totals = employees.reduce(
    (a, e) => {
      a.salary += Number(e.salary || 0);
      a.paid += Number(e.paid || 0);
      a.remaining += Number(e.remaining || 0);
      return a;
    },
    { salary: 0, paid: 0, remaining: 0 }
  );

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">{t('nav.accountantWages')}</h1>
          <p className="page-sub">{t('salary.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" type="month" style={{ width: 170 }} value={month} onChange={(e) => setMonth(e.target.value)} />
          <button className="btn btn-outline" onClick={exportCsv}>⬇️ {t('common.export')} CSV</button>
          <button className="btn btn-primary" onClick={() => openNew()}>{t('salary.payAdvance')}</button>
        </div>
      </div>

      {showForm && (
        <form className="card" onSubmit={save} style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 16 }}>{t('salary.advance.title')}</h3>
          <div className="grid grid-4">
            <div className="form-row">
              <label className="form-label">{t('salary.col.employee')} *</label>
              <select className="select" value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })} required>
                <option value="">— {t('common.select')} {t('salary.col.employee')} —</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name} — {t('salary.col.remaining')} {fmt(e.remaining)} / {t('salary.col.monthlySalary')} {fmt(e.salary)}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label className="form-label">{t('salary.advance.amount')}</label>
              <input className="input" type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
              {selected && Number(form.amount) > Number(selected.remaining) && (
                <div className="form-error" style={{ marginTop: 6 }}>{t('accountant.amountExceedsRemaining', { amount: fmt(selected.remaining) })}</div>
              )}
            </div>
            <div className="form-row">
              <label className="form-label">{t('salary.advance.date')}</label>
              <input className="input" type="date" value={form.txn_date} onChange={(e) => setForm({ ...form, txn_date: e.target.value })} required />
            </div>
            <div className="form-row">
              <label className="form-label">{t('accountant.paymentMethod')} *</label>
              <select className="select" value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
                {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <label className="form-label">{t('common.notes')}</label>
            <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={t('salary.advance.notesPlaceholder')} />
          </div>
          {msg && <div className="form-error" style={{ marginTop: 0 }}>{msg}</div>}
          <button className="btn btn-success btn-sm" type="submit">{t('debts.savePayment')}</button>{' '}
          <button className="btn btn-outline btn-sm" type="button" onClick={() => setShowForm(false)}>{t('common.cancel')}</button>
        </form>
      )}

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="card stat-card">
          <div className="stat-value">{fmt(totals.salary)}</div>
          <div className="stat-label">{t('generalExpenses.totalExpenses')} ({t('accountant.employeeCount', { count: employees.length })})</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{fmt(totals.paid)}</div>
          <div className="stat-label">{t('salary.col.paid')} — {month}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: totals.remaining > 0 ? '#dc2626' : '#16a34a' }}>{fmt(totals.remaining)}</div>
          <div className="stat-label">{t('salary.col.remaining')}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'auto', marginBottom: 16 }}>
        <div className="card-header" style={{ padding: '16px 20px', marginBottom: 0 }}>
          <div className="card-title">👷 {t('accountant.openSalaries')}</div>
        </div>
        <table className="table">
          <thead>
            <tr><th>{t('salary.col.employee')}</th><th>{t('salary.col.monthlySalary')}</th><th>{t('salary.statement.kindAdvance')}</th><th>{t('salary.statement.kindRemainder')}</th><th>{t('salary.col.paid')}</th><th>{t('salary.col.remaining')}</th><th></th></tr>
          </thead>
          <tbody>
            {employees.length === 0 && !loading && (
              <tr><td colSpan="7" className="muted" style={{ textAlign: 'center', padding: 20 }}>{t('accountant.noEmployees')}</td></tr>
            )}
            {employees.map((e) => (
              <tr key={e.id}>
                <td><b>{e.full_name}</b></td>
                <td className="nowrap">{fmt(e.salary)}</td>
                <td className="nowrap">{fmt(e.advance_paid)}</td>
                <td className="nowrap">{fmt(e.remainder_paid)}</td>
                <td className="nowrap">{fmt(e.paid)}</td>
                <td className="nowrap" style={{ fontWeight: 800, color: Number(e.remaining) > 0 ? '#dc2626' : '#16a34a' }}>{fmt(e.remaining)}</td>
                <td className="nowrap">
                  <button className="btn btn-outline btn-sm" onClick={() => openNew(e)}>{t('salary.statement.kindAdvance')}</button>{' '}
                  <button className="btn btn-success btn-sm" disabled={Number(e.remaining) <= 0} onClick={() => payRemainder(e)}>{t('salary.payRemainder')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <div className="card-header" style={{ padding: '16px 20px', marginBottom: 0 }}>
          <div className="card-title">💵 {t('salary.statement.paymentsHistory')} — {month}</div>
        </div>
        <table className="table">
          <thead>
            <tr><th>{t('common.date')}</th><th>{t('salary.col.employee')}</th><th>{t('common.type')}</th><th>{t('common.amount')}</th><th>{t('accountant.paymentMethod')}</th><th>{t('common.notes')}</th><th>{t('salary.statement.createdBy')}</th><th></th></tr>
          </thead>
          <tbody>
            {txs.length === 0 && (
              <tr><td colSpan="8" className="muted" style={{ textAlign: 'center', padding: 20 }}>{t('salary.export.noMovesRecorded')}</td></tr>
            )}
            {txs.map((tx) => (
              <tr key={tx.id}>
                <td className="nowrap">{dmy(tx.txn_date)}</td>
                <td>{tx.employee_name}</td>
                <td>{tx.kind === 'advance' ? t('salary.statement.kindAdvance') : t('salary.statement.kindRemainder')}</td>
                <td className="nowrap"><b>{fmt(Math.abs(Number(tx.amount)))}</b></td>
                <td className="nowrap">
                  <span className={tx.payment_method === 'cash' ? 'badge badge-paid' : 'badge badge-processing'}>
                    {PAYMENT_METHOD_SHORT[tx.payment_method] || tx.payment_method}
                  </span>
                </td>
                <td className="muted">{tx.notes || '—'}</td>
                <td>{tx.created_by_name || '—'}</td>
                <td className="nowrap">
                  {rowMsg[tx.id] && <span className="form-error" style={{ marginInlineEnd: 10 }}>{rowMsg[tx.id]}</span>}
                  <button className="btn btn-outline btn-sm" onClick={() => reverse(tx)}>{t('accountant.reverse')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
