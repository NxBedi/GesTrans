import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { customersApi, reportsApi } from '../utils/api.js';
import { fmt } from './Dashboard.jsx';

const today = () => new Date().toISOString().slice(0, 10);

export default function CustomerBalance() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [depositFor, setDepositFor] = useState(null);
  const [depForm, setDepForm] = useState({ amount: '', payment_date: today(), notes: '' });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    reportsApi.balances().then(setRows).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const totalContainers = rows.reduce((s, r) => s + Number(r.container_count || 0), 0);
  const totalPaid = rows.reduce((s, r) => s + Number(r.total_paid || 0), 0);
  const totalBalance = rows.reduce((s, r) => s + Number(r.balance || 0), 0);

  const openDeposit = (id) => {
    setMsg('');
    setDepForm({ amount: '', payment_date: today(), notes: '' });
    setDepositFor(id);
  };

  const submitDeposit = async (e) => {
    e.preventDefault();
    setMsg('');
    if (!depositFor) return;
    const amountNum = Number(depForm.amount);
    if (!amountNum || amountNum <= 0) return setMsg('أدخل مبلغاً صحيحاً');
    try {
      await customersApi.addPayment(depositFor, {
        amount: amountNum,
        payment_date: depForm.payment_date,
        notes: depForm.notes || 'إيداع من الزبون',
      });
      setDepositFor(null);
      setDepForm({ amount: '', payment_date: today(), notes: '' });
      reportsApi.balances().then(setRows);
    } catch (err) { setMsg(err.message); }
  };

  const depositCustomer = rows.find((r) => r.id === depositFor);

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">ديون الزبناء</h1>
          <p className="page-sub">حساب كل زبون: قيمة الحاويات (البيع) − المحصل = المتبقي</p>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <div className="card stat-card">
          <div className="stat-value">{fmt(totalContainers)}</div>
          <div className="stat-label">إجمالي عدد الحاويات</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#16a34a' }}>{fmt(totalPaid)}</div>
          <div className="stat-label">إجمالي المحصل</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: totalBalance > 0 ? '#dc2626' : '#16a34a' }}>{fmt(totalBalance)}</div>
          <div className="stat-label">إجمالي المتبقي على الزبناء</div>
        </div>
      </div>

      {depositFor && (
        <form className="card" onSubmit={submitDeposit} style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 16 }}>💰 إيداع إلى {depositCustomer?.customer_name}</h3>
          <div className="grid grid-4">
            <div className="form-row">
              <label className="form-label">المبلغ *</label>
              <input className="input" type="number" step="0.01" min="0" autoFocus value={depForm.amount} onChange={(e) => setDepForm({ ...depForm, amount: e.target.value })} required />
            </div>
            <div className="form-row">
              <label className="form-label">التاريخ *</label>
              <input className="input" type="date" value={depForm.payment_date} onChange={(e) => setDepForm({ ...depForm, payment_date: e.target.value })} required />
            </div>
            <div className="form-row" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">ملاحظات</label>
              <input className="input" value={depForm.notes} onChange={(e) => setDepForm({ ...depForm, notes: e.target.value })} placeholder="اختياري" />
            </div>
          </div>
          {msg && <div className="form-error" style={{ marginTop: 0 }}>{msg}</div>}
          <button className="btn btn-success btn-sm" type="submit">حفظ الإيداع</button>{' '}
          <button className="btn btn-outline btn-sm" type="button" onClick={() => setDepositFor(null)}>إلغاء</button>
        </form>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="table">
          <thead>
            <tr><th>الزبون</th><th>عدد الحاويات</th><th>المدفوع</th><th>المتبقي</th><th></th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr><td colSpan="5" className="muted" style={{ textAlign: 'center', padding: 20 }}>لا توجد بيانات — أضف زبائن أو قم بتسعير حاويات أولاً</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td><b>{r.customer_name}</b></td>
                <td style={{ fontWeight: 700 }}>{r.container_count ?? 0}</td>
                <td style={{ color: '#16a34a', fontWeight: 700 }}>{fmt(r.total_paid)}</td>
                <td style={{ color: r.balance > 0 ? '#dc2626' : r.balance < 0 ? '#f59e0b' : '#16a34a', fontWeight: 700 }}>{fmt(r.balance)}</td>
                <td className="nowrap">
                  <button className={`btn btn-success btn-sm ${depositFor === r.id ? 'active' : ''}`} onClick={() => (depositFor === r.id ? setDepositFor(null) : openDeposit(r.id))}>
                    💵 إيداع
                  </button>{' '}
                  <Link className="btn btn-outline btn-sm" to={`/customers/${r.id}/statement`}>🧾 كشف حساب</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}