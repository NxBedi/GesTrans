import { useEffect, useMemo, useState } from 'react';
import { reportsApi, customersApi } from '../utils/api.js';
import { fmt, money, dmy, DEBT_LABELS, DEBT_BADGE } from '../utils/format.js';
import { exportExcel } from '../utils/export.js';
import { useFeedback } from '../components/Feedback.jsx';

const STATUS_OPTS = [
  { v: '', l: 'كل الحالات' },
  { v: 'overdue', l: 'متأخر' },
  { v: 'partial', l: 'جزئي' },
  { v: 'due', l: 'مستحق' },
  { v: 'paid', l: 'مدفوع' },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function Debts() {
  const { toast, confirm } = useFeedback();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [showPay, setShowPay] = useState(null);
  const [payForm, setPayForm] = useState({ amount: '', payment_date: today(), notes: '' });
  const [payErr, setPayErr] = useState('');
  const [history, setHistory] = useState(null);
  const [paying, setPaying] = useState(false);
  const [dueForm, setDueForm] = useState(null);
  const [dueDate, setDueDate] = useState('');

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

  const openPay = (row) => {
    setShowPay(row);
    setPayForm({ amount: '', payment_date: today(), notes: '' });
    setPayErr('');
  };

  const submitPay = async (e) => {
    e.preventDefault();
    setPayErr('');
    const amt = Number(payForm.amount);
    if (!payForm.amount || !isFinite(amt) || amt <= 0) { setPayErr('أدخل مبلغاً صحيحاً أكبر من صفر'); return; }
    setPaying(true);
    try {
      await customersApi.addPayment(showPay.id, {
        amount: amt,
        payment_date: payForm.payment_date,
        notes: payForm.notes || '',
      });
      toast(`تم تسجيل دفعة ${fmt(amt)} لصالح ${showPay.customer_name}`);
      setShowPay(null);
      load();
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
    if (!(await confirm(`حذف الدفعة بمبلغ ${fmt(pay.amount)} بتاريخ ${dmy(pay.payment_date)}؟`, { danger: true, okLabel: 'حذف' }))) return;
    try {
      await customersApi.removePayment(customer.id, pay.id);
      toast('تم حذف الدفعة');
      viewHistory(customer);
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const saveDueDate = async (e) => {
    e.preventDefault();
    try {
      await customersApi.update(dueForm.id, { due_date: dueDate || null });
      toast('تم تحديث تاريخ الاستحقاق');
      setDueForm(null);
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const doExport = () => {
    exportExcel('ديون_العملاء', [
      { key: 'customer_name', header: 'العميل' },
      { key: 'phone', header: 'الهاتف' },
      { key: 'container_count', header: 'عدد الحاويات' },
      { key: 'total_billed', header: 'الإجمالي المحاسب' },
      { key: 'total_paid', header: 'المدفوع' },
      { key: 'balance', header: 'المتبقي' },
      { key: 'last_payment_date', header: 'آخر دفعة' },
      { key: 'due_date', header: 'تاريخ الاستحقاق' },
      { key: 'debt_status', header: 'الحالة' },
    ], filtered.map((r) => ({
      ...r,
      total_billed: money(r.total_billed),
      total_paid: money(r.total_paid),
      balance: money(r.balance),
      last_payment_date: dmy(r.last_payment_date),
      due_date: dmy(r.due_date),
      debt_status: DEBT_LABELS[r.debt_status] || r.debt_status,
    })));
  };

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">العملاء والديون</h1>
          <p className="page-sub">تتبع أرصدة العملاء: المدفوع، المتبقي، حالات الاستحقاق والتأخر</p>
        </div>
        <button className="btn btn-primary" onClick={doExport}>⬇ تصدير Excel</button>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: '#fef2f2' }}>💳</div>
          <div className="kpi-body">
            <div className="kpi-label">إجمالي الديون</div>
            <div className="kpi-value">{fmt(totals.total)}</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: '#fff7ed' }}>⏰</div>
          <div className="kpi-body">
            <div className="kpi-label">ديون متأخرة</div>
            <div className="kpi-value">{fmt(totals.overdue)}</div>
            <div className="kpi-sub">{totals.overdue_count} عميل متأخر</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: '#eff6ff' }}>👥</div>
          <div className="kpi-body">
            <div className="kpi-label">عملاء مدينون</div>
            <div className="kpi-value">{totals.debtors}</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: '#f0fdf4' }}>✓</div>
          <div className="kpi-body">
            <div className="kpi-label">عملاء يسددون</div>
            <div className="kpi-value">{rows.length - totals.debtors}</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'auto', marginBottom: 18 }}>
        <div className="card-header" style={{ padding: '16px 18px', marginBottom: 0, borderBottom: '1px solid var(--border)' }}>
          <div className="card-title">قائمة الأرصدة</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input className="input" style={{ width: 230 }} placeholder="بحث بالاسم، الهاتف...🔍" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="select" style={{ width: 150 }} value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_OPTS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </div>
        </div>
        <table className="table" style={{ minWidth: 1000 }}>
          <thead>
            <tr>
              <th>العميل</th><th>الهاتف</th><th>عدد الحاويات</th><th>إجمالي المُحاسَب</th>
              <th>المدفوع</th><th>المتبقي</th><th>آخر دفعة</th><th>تاريخ الاستحقاق</th><th>الحالة</th><th style={{ textAlign: 'center' }}>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="10"><div className="empty-state"><span className="spinner" /></div></td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan="10"><div className="empty-state"><span className="empty-ico">📭</span>لا توجد بيانات مطابقة</div></td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 800 }}>{r.customer_name}</td>
                <td className="nowrap" dir="ltr">{r.phone || '—'}</td>
                <td>{r.container_count}</td>
                <td className="nowrap">{fmt(r.total_billed)}</td>
                <td className="nowrap" style={{ color: '#16a34a', fontWeight: 700 }}>{fmt(r.total_paid)}</td>
                <td className="nowrap" style={{ fontWeight: 800, color: Number(r.balance) > 0 ? '#d97706' : '#16a34a' }}>{fmt(r.balance)}</td>
                <td className="nowrap">{dmy(r.last_payment_date)}</td>
                <td className="nowrap">{dmy(r.due_date)}</td>
                <td><span className={`badge ${DEBT_BADGE[r.debt_status] || 'badge-due'}`}>{DEBT_LABELS[r.debt_status] || r.debt_status}</span></td>
                <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <button className="btn btn-success btn-sm" onClick={() => openPay(r)}>💳 دفعة</button>{' '}
                  <button className="btn btn-outline btn-sm" onClick={() => viewHistory(r)}>سجل</button>{' '}
                  <button className="btn btn-outline btn-sm" onClick={() => { setDueForm(r); setDueDate(r.due_date ? String(r.due_date).slice(0, 10) : ''); }}>📅</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showPay && (
        <div className="modal-overlay" onClick={() => setShowPay(null)}>
          <form className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()} onSubmit={submitPay}>
            <div className="modal-title">تسجيل دفعة — {showPay.customer_name}</div>
            <div className="modal-sub">المتبقي على العميل: <b style={{ color: '#d97706' }}>{fmt(showPay.balance)}</b></div>
            <div className="form-row">
              <label className="form-label">المبلغ *</label>
              <input className="input" type="number" step="0.01" min="0" autoFocus dir="ltr" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
            </div>
            <div className="form-row">
              <label className="form-label">التاريخ *</label>
              <input className="input" type="date" value={payForm.payment_date} onChange={(e) => setPayForm({ ...payForm, payment_date: e.target.value })} />
            </div>
            <div className="form-row">
              <label className="form-label">ملاحظات</label>
              <input className="input" value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} placeholder="مثال: دفعة نقدية / تحويل" />
            </div>
            {payErr && <div className="form-error">{payErr}</div>}
            <div className="modal-actions">
              <button className="btn btn-outline" type="button" onClick={() => setShowPay(null)}>إلغاء</button>
              <button className="btn btn-success" type="submit" disabled={paying}>{paying ? '...' : 'حفظ الدفعة'}</button>
            </div>
          </form>
        </div>
      )}

      {dueForm && (
        <div className="modal-overlay" onClick={() => setDueForm(null)}>
          <form className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()} onSubmit={saveDueDate}>
            <div className="modal-title">تاريخ استحقاق — {dueForm.customer_name}</div>
            <div className="modal-sub">تُحسب حالات التأخر اعتماداً على هذا التاريخ</div>
            <div className="form-row">
              <label className="form-label">تاريخ الاستحقاق</label>
              <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" type="button" onClick={() => setDueForm(null)}>إلغاء</button>
              <button className="btn btn-primary" type="submit">حفظ</button>
            </div>
          </form>
        </div>
      )}

      {history && (
        <div className="modal-overlay" onClick={() => setHistory(null)}>
          <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">سجل دفعات — {history.customer.customer_name}</div>
            <div className="modal-sub">إجمالي المدفوعات: <b style={{ color: '#16a34a' }}>{fmt(history.customer.total_paid)}</b> — المتبقي: <b style={{ color: '#d97706' }}>{fmt(history.customer.balance)}</b></div>
            {history.payments.length === 0 && <div className="empty-state"><span className="empty-ico">💤</span>لا توجد دفعات مسجلة</div>}
            {history.payments.length > 0 && (
              <table className="table">
                <thead><tr><th>التاريخ</th><th>المبلغ</th><th>ملاحظات</th><th></th></tr></thead>
                <tbody>
                  {history.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="nowrap">{dmy(p.payment_date)}</td>
                      <td className="nowrap" style={{ fontWeight: 800, color: '#16a34a' }}>{fmt(p.amount)}</td>
                      <td>{p.notes || '—'}</td>
                      <td><button className="btn btn-danger btn-sm" onClick={() => removePayment(p, history.customer)}>حذف</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setHistory(null)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}