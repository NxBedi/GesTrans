import { useEffect, useState } from 'react';
import { generalExpensesApi } from '../utils/api.js';
import { refreshDashboard } from '../utils/refresh.js';
import { fmt } from './Dashboard.jsx';
import { PAYMENT_METHODS, PAYMENT_METHOD_SHORT, newIdempotencyKey, downloadCsv } from '../utils/accountant.js';

const SUGGESTED = ['إيجار المقر', 'كهرباء', 'هاتف وانترنت', 'قرطاسية', 'صيانة', 'قرطاسية ومطبوعات', 'ضيافة وهدايا', 'مصاريف أخرى'];

const emptyForm = () => ({
  category: '',
  description: '',
  amount: '',
  expense_date: new Date().toISOString().slice(0, 10),
  payment_method: 'cash',
  idempotency_key: newIdempotencyKey(),
});

export default function AccountantExpenses() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [categories, setCategories] = useState([]);
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [msg, setMsg] = useState('');
  const [rowMsg, setRowMsg] = useState({});

  const load = () => {
    const params = {
      from: dateFrom || undefined,
      to: dateTo || undefined,
      category: filterCategory || undefined,
    };
    setLoading(true);
    generalExpensesApi.summary(params).then(setSummary).catch(() => {}).finally(() => setLoading(false));
    generalExpensesApi.list(params).then(setRows).catch(() => {});
  };

  useEffect(() => {
    generalExpensesApi.categories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [dateFrom, dateTo, filterCategory]);

  const openNew = () => {
    setForm(emptyForm());
    setMsg('');
    setShowForm(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await generalExpensesApi.create({
        category: form.category,
        description: form.description,
        amount: Number(form.amount),
        expense_date: form.expense_date,
        payment_method: form.payment_method,
        idempotency_key: form.idempotency_key,
      });
      setShowForm(false);
      setForm(emptyForm());
      generalExpensesApi.categories().then(setCategories).catch(() => {});
      load();
      refreshDashboard();
    } catch (err) {
      setMsg(err.message);
    }
  };

  const reverse = async (r) => {
    const note = prompt(`سبب عكس المصروف «${r.category}» بمبلغ ${fmt(r.amount)}؟`, 'عكس قيد');
    if (note === null) return;
    setRowMsg((m) => ({ ...m, [r.id]: '' }));
    try {
      await generalExpensesApi.reverse(r.id, { note: note || null });
      load();
      refreshDashboard();
    } catch (err) {
      setRowMsg((m) => ({ ...m, [r.id]: err.message }));
    }
  };

  const exportCsv = () => {
    downloadCsv(
      'مصاريف-المؤسسة',
      [
        { key: 'expense_date', label: 'التاريخ' },
        { key: 'category', label: 'البند' },
        { key: 'amount', label: 'المبلغ' },
        { key: 'payment_method', label: 'طريقة الدفع', get: (r) => PAYMENT_METHOD_SHORT[r.payment_method] || r.payment_method },
        { key: 'description', label: 'التفاصيل' },
        { key: 'entered_by_name', label: 'سجلها' },
      ],
      rows
    );
  };

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">مصاريف المؤسسة</h1>
          <p className="page-sub">تسجيل مصاريف المؤسسة — المصروف النقدي يخصم الصندوق، أما الحوالات والآجل فلا تمسّه</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={exportCsv}>⬇️ تصدير CSV</button>
          <button className="btn btn-primary" onClick={openNew}>➕ مصروف جديد</button>
        </div>
      </div>

      {showForm && (
        <form className="card" onSubmit={save} style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 16 }}>مصروف جديد</h3>
          <div className="grid grid-4">
            <div className="form-row">
              <label className="form-label">البند / النوع *</label>
              <input className="input" list="acc-genexp-cats" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="مثال: إيجار المقر" required />
              <datalist id="acc-genexp-cats">
                {categories.map((c) => <option key={c} value={c} />)}
                {SUGGESTED.filter((s) => !categories.includes(s)).map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div className="form-row">
              <label className="form-label">المبلغ *</label>
              <input className="input" type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
            </div>
            <div className="form-row">
              <label className="form-label">التاريخ *</label>
              <input className="input" type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} required />
            </div>
            <div className="form-row">
              <label className="form-label">طريقة الدفع *</label>
              <select className="select" value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
                {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <label className="form-label">التفاصيل</label>
            <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="ملاحظات توضيحية" />
          </div>
          {msg && <div className="form-error" style={{ marginTop: 0 }}>{msg}</div>}
          <button className="btn btn-success btn-sm" type="submit">حفظ</button>{' '}
          <button className="btn btn-outline btn-sm" type="button" onClick={() => setShowForm(false)}>إلغاء</button>
        </form>
      )}

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">من تاريخ</label>
          <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">إلى تاريخ</label>
          <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">البند</label>
          <select className="select" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="">الكل</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">التصدير</label>
          <button className="btn btn-outline" style={{ width: '100%' }} onClick={exportCsv}>⬇️ CSV</button>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="card stat-card">
          <div className="stat-value">{fmt(summary?.total)}</div>
          <div className="stat-label">إجمالي المصاريف</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{fmt(summary?.by_method?.find((m) => m.payment_method === 'cash')?.total)}</div>
          <div className="stat-label">نقدي — يخصم الصندوق</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">
            {fmt((summary?.by_method?.find((m) => m.payment_method === 'bank')?.total || 0) + (summary?.by_method?.find((m) => m.payment_method === 'credit')?.total || 0))}
          </div>
          <div className="stat-label">غير نقدي — لا يمس الصندوق</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <div className="card-header" style={{ padding: '16px 20px', marginBottom: 0 }}>
          <div className="card-title">🧾 سجل مصاريف المؤسسة</div>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>التاريخ</th><th>البند</th><th>المبلغ</th><th>طريقة الدفع</th><th>التفاصيل</th><th>سجلها</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr><td colSpan="7" className="muted" style={{ textAlign: 'center', padding: 20 }}>لا توجد مصاريف مطابقة</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="nowrap">{r.expense_date}</td>
                <td><span className="badge badge-priced">{r.category}</span></td>
                <td className="nowrap"><b>{fmt(r.amount)}</b></td>
                <td className="nowrap">
                  <span className={r.payment_method === 'cash' ? 'badge badge-paid' : 'badge badge-processing'}>
                    {PAYMENT_METHOD_SHORT[r.payment_method] || r.payment_method}
                  </span>
                </td>
                <td className="muted">{r.description || '—'}</td>
                <td>{r.entered_by_name || '—'}</td>
                <td className="nowrap">
                  {rowMsg[r.id] && <span className="form-error" style={{ marginInlineEnd: 10 }}>{rowMsg[r.id]}</span>}
                  <button className="btn btn-outline btn-sm" onClick={() => reverse(r)}>عكس</button>
                </td>
              </tr>
            ))}
          </tbody>
          {summary?.count > 0 && (
            <tfoot>
              <tr style={{ borderTop: '2px solid #e2e8f0', fontWeight: 800 }}>
                <td colSpan="2">الإجمالي</td>
                <td>{fmt(summary.total)}</td>
                <td colSpan="4"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
