import { useEffect, useState } from 'react';
import { salaryApi } from '../utils/api.js';
import { refreshDashboard } from '../utils/refresh.js';
import { fmt } from './Dashboard.jsx';
import { PAYMENT_METHODS, PAYMENT_METHOD_SHORT, newIdempotencyKey, downloadCsv } from '../utils/accountant.js';

const emptyForm = () => ({
  user_id: '',
  amount: '',
  txn_date: new Date().toISOString().slice(0, 10),
  notes: '',
  payment_method: 'cash',
  idempotency_key: newIdempotencyKey(),
});

export default function AccountantWages() {
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
    salaryApi.transactions({ from: `${month}-01`, to: `${month}-31` }).then(setTxs).catch(() => {});
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
    if (!confirm(`دفع بقية راتب ${emp.full_name} عن شهر ${month} (${fmt(emp.remaining)})؟`)) return;
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

  const reverse = async (t) => {
    const note = prompt(`سبب عكس حركة الراتب (${fmt(t.amount)})؟`, 'عكس قيد');
    if (note === null) return;
    setRowMsg((m) => ({ ...m, [t.id]: '' }));
    try {
      await salaryApi.reverse(t.id, { note: note || null });
      load();
      refreshDashboard();
    } catch (err) {
      setRowMsg((m) => ({ ...m, [t.id]: err.message }));
    }
  };

  const exportCsv = () => {
    downloadCsv(
      'رواتب-العمال',
      [
        { key: 'txn_date', label: 'التاريخ' },
        { key: 'employee_name', label: 'الموظف' },
        { key: 'kind', label: 'النوع', get: (r) => (r.kind === 'advance' ? 'مقدم' : 'بقية الراتب') },
        { key: 'amount', label: 'المبلغ', get: (r) => Math.abs(Number(r.amount)) },
        { key: 'payment_method', label: 'طريقة الدفع', get: (r) => PAYMENT_METHOD_SHORT[r.payment_method] || r.payment_method },
        { key: 'notes', label: 'ملاحظات' },
        { key: 'created_by_name', label: 'سجلها' },
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
          <h1 className="page-title">الرواتب</h1>
          <p className="page-sub">تسجيل دفع الرواتب ومتابعة المتبقي على كل موظف — الدفع النقدي يخصم الصندوق مباشرة</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" type="month" style={{ width: 170 }} value={month} onChange={(e) => setMonth(e.target.value)} />
          <button className="btn btn-outline" onClick={exportCsv}>⬇️ تصدير CSV</button>
          <button className="btn btn-primary" onClick={() => openNew()}>➕ دفع مقدم</button>
        </div>
      </div>

      {showForm && (
        <form className="card" onSubmit={save} style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 16 }}>تسجيل دفعة راتب</h3>
          <div className="grid grid-4">
            <div className="form-row">
              <label className="form-label">الموظف *</label>
              <select className="select" value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })} required>
                <option value="">— اختر الموظف —</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name} — متبقٍ {fmt(e.remaining)} من {fmt(e.salary)}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label className="form-label">المبلغ *</label>
              <input className="input" type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
              {selected && Number(form.amount) > Number(selected.remaining) && (
                <div className="form-error" style={{ marginTop: 6 }}>المبلغ يتجاوز المتبقي ({fmt(selected.remaining)})</div>
              )}
            </div>
            <div className="form-row">
              <label className="form-label">التاريخ *</label>
              <input className="input" type="date" value={form.txn_date} onChange={(e) => setForm({ ...form, txn_date: e.target.value })} required />
            </div>
            <div className="form-row">
              <label className="form-label">طريقة الدفع *</label>
              <select className="select" value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
                {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <label className="form-label">ملاحظات</label>
            <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="مثال: دفعة مقدمة لشهر March" />
          </div>
          {msg && <div className="form-error" style={{ marginTop: 0 }}>{msg}</div>}
          <button className="btn btn-success btn-sm" type="submit">حفظ الدفعة</button>{' '}
          <button className="btn btn-outline btn-sm" type="button" onClick={() => setShowForm(false)}>إلغاء</button>
        </form>
      )}

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="card stat-card">
          <div className="stat-value">{fmt(totals.salary)}</div>
          <div className="stat-label">إجمالي الرواتب ({employees.length} موظف)</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{fmt(totals.paid)}</div>
          <div className="stat-label">المدفوع عن {month}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: totals.remaining > 0 ? '#dc2626' : '#16a34a' }}>{fmt(totals.remaining)}</div>
          <div className="stat-label">المتبقي</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'auto', marginBottom: 16 }}>
        <div className="card-header" style={{ padding: '16px 20px', marginBottom: 0 }}>
          <div className="card-title">👷 كشوف الموظفين</div>
        </div>
        <table className="table">
          <thead>
            <tr><th>الموظف</th><th>الراتب</th><th>مقدم</th><th>بقية</th><th>المدفوع</th><th>المتبقي</th><th></th></tr>
          </thead>
          <tbody>
            {employees.length === 0 && !loading && (
              <tr><td colSpan="7" className="muted" style={{ textAlign: 'center', padding: 20 }}>لا يوجد موظفون</td></tr>
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
                  <button className="btn btn-outline btn-sm" onClick={() => openNew(e)}>مقدم</button>{' '}
                  <button className="btn btn-success btn-sm" disabled={Number(e.remaining) <= 0} onClick={() => payRemainder(e)}>دفع البقية</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <div className="card-header" style={{ padding: '16px 20px', marginBottom: 0 }}>
          <div className="card-title">💵 حركات الرواتب — {month}</div>
        </div>
        <table className="table">
          <thead>
            <tr><th>التاريخ</th><th>الموظف</th><th>النوع</th><th>المبلغ</th><th>طريقة الدفع</th><th>ملاحظات</th><th>سجلها</th><th></th></tr>
          </thead>
          <tbody>
            {txs.length === 0 && (
              <tr><td colSpan="8" className="muted" style={{ textAlign: 'center', padding: 20 }}>لا توجد حركات في هذا الشهر</td></tr>
            )}
            {txs.map((t) => (
              <tr key={t.id}>
                <td className="nowrap">{t.txn_date}</td>
                <td>{t.employee_name}</td>
                <td>{t.kind === 'advance' ? 'مقدم' : 'بقية الراتب'}</td>
                <td className="nowrap"><b>{fmt(Math.abs(Number(t.amount)))}</b></td>
                <td className="nowrap">
                  <span className={t.payment_method === 'cash' ? 'badge badge-paid' : 'badge badge-processing'}>
                    {PAYMENT_METHOD_SHORT[t.payment_method] || t.payment_method}
                  </span>
                </td>
                <td className="muted">{t.notes || '—'}</td>
                <td>{t.created_by_name || '—'}</td>
                <td className="nowrap">
                  {rowMsg[t.id] && <span className="form-error" style={{ marginInlineEnd: 10 }}>{rowMsg[t.id]}</span>}
                  <button className="btn btn-outline btn-sm" onClick={() => reverse(t)}>عكس</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
