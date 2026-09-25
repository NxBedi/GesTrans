import { useEffect, useMemo, useState } from 'react';
import { reportsApi, customersApi } from '../utils/api.js';
import { fmt, money, dmy } from '../utils/format.js';
import { exportExcel } from '../utils/export.js';
import { useFeedback } from '../components/Feedback.jsx';

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function Payments() {
  const { toast } = useFeedback();
  const [data, setData] = useState({ records: [], count: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [customers, setCustomers] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [payForm, setPayForm] = useState({ customer_id: '', amount: '', payment_date: today(), notes: '' });
  const [payErr, setPayErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    reportsApi.payments({ q: q || undefined, from: from || undefined, to: to || undefined })
      .then(setData).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [q, from, to]);

  useEffect(() => {
    customersApi.list().then(setCustomers).catch(() => {});
  }, []);

  const submitPay = async (e) => {
    e.preventDefault();
    setPayErr('');
    const amt = Number(payForm.amount);
    if (!payForm.customer_id) { setPayErr('اختر العميل'); return; }
    if (!payForm.amount || !isFinite(amt) || amt <= 0) { setPayErr('أدخل مبلغاً صحيحاً أكبر من صفر'); return; }
    setBusy(true);
    try {
      const r = await customersApi.addPayment(Number(payForm.customer_id), {
        amount: amt, payment_date: payForm.payment_date, notes: payForm.notes || '',
      });
      toast(`تم تسجيل الدفعة ${fmt(r.amount)}`);
      setShowAdd(false);
      setPayForm({ customer_id: '', amount: '', payment_date: today(), notes: '' });
      load();
    } catch (err) { setPayErr(err.message); }
    finally { setBusy(false); }
  };

  const doExport = () => {
    exportExcel(`دفعات_${from || 'كل'}_${to || 'الوقت'}`, [
      { key: 'payment_date', header: 'التاريخ' },
      { key: 'customer_name', header: 'العميل' },
      { key: 'customer_phone', header: 'الهاتف' },
      { key: 'bl_number', header: 'BL' },
      { key: 'container_number', header: 'رقم الحاوية' },
      { key: 'amount', header: 'المبلغ' },
      { key: 'notes', header: 'ملاحظات' },
      { key: 'created_by_name', header: 'سجّل بواسطة' },
    ], data.records.map((r) => ({
      ...r, payment_date: dmy(r.payment_date), amount: money(r.amount),
    })));
  };

  const doneRows = useMemo(() => data.records.filter((r) => r), [data.records]);

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">الدفعات</h1>
          <p className="page-sub">سجل كل دفعات العملاء حسب الفترة</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={doExport} disabled={!doneRows.length}>⬇ Excel</button>
          <button className="btn btn-success" onClick={() => { setPayForm({ ...payForm, payment_date: today() }); setPayErr(''); setShowAdd(true); }}>+ دفعة جديدة</button>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: '#f0fdf4' }}>💳</div>
          <div className="kpi-body">
            <div className="kpi-label">إجمالي الدفعات (الفترة)</div>
            <div className="kpi-value">{fmt(data.total)}</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: '#eff6ff' }}>🧾</div>
          <div className="kpi-body">
            <div className="kpi-label">عدد الدفعات</div>
            <div className="kpi-value">{data.count}</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'auto', marginBottom: 18 }}>
        <div className="card-header" style={{ padding: '16px 18px', marginBottom: 0, borderBottom: '1px solid var(--border)' }}>
          <div className="card-title">سجل الدفعات</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input className="input" style={{ width: 210 }} placeholder="بحث: عميل، هاتف، BL...🔍" value={q} onChange={(e) => setQ(e.target.value)} />
            <input className="input" style={{ width: 150 }} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input className="input" style={{ width: 150 }} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <table className="table" style={{ minWidth: 900 }}>
          <thead>
            <tr><th>التاريخ</th><th>العميل</th><th>الهاتف</th><th>BL</th><th>رقم الحاوية</th><th>المبلغ</th><th>ملاحظات</th><th>سجّل بواسطة</th></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="8"><div className="empty-state"><span className="spinner" /></div></td></tr>}
            {!loading && doneRows.length === 0 && (
              <tr><td colSpan="8"><div className="empty-state"><span className="empty-ico">🛒</span>لا توجد دفعات في هذه الفترة</div></td></tr>
            )}
            {doneRows.map((r) => (
              <tr key={r.id}>
                <td className="nowrap">{dmy(r.payment_date)}</td>
                <td style={{ fontWeight: 800 }}>{r.customer_name}</td>
                <td className="nowrap" dir="ltr">{r.customer_phone || '—'}</td>
                <td className="nowrap">{r.bl_number || '—'}</td>
                <td>{r.container_number || '—'}</td>
                <td className="nowrap" style={{ fontWeight: 800, color: '#16a34a' }}>{fmt(r.amount)}</td>
                <td className="muted">{r.notes || '—'}</td>
                <td>{r.created_by_name || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <form className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()} onSubmit={submitPay}>
            <div className="modal-title">تسجيل دفعة</div>
            <div className="modal-sub">أضف دفعة لصالح عميل</div>
            <div className="form-row">
              <label className="form-label">العميل *</label>
              <select className="select" value={payForm.customer_id} onChange={(e) => setPayForm({ ...payForm, customer_id: e.target.value })}>
                <option value="">— اختر —</option>
                {customers.filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
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
              <input className="input" value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} />
            </div>
            {payErr && <div className="form-error">{payErr}</div>}
            <div className="modal-actions">
              <button className="btn btn-outline" type="button" onClick={() => setShowAdd(false)}>إلغاء</button>
              <button className="btn btn-success" type="submit" disabled={busy}>{busy ? '...' : 'حفظ الدفعة'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}