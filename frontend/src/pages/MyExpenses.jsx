import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { myExpensesApi, usersApi } from '../utils/api.js';
import { fmt } from './Dashboard.jsx';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fmtTime(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleTimeString('fr', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

export default function MyExpenses() {
  const { user } = useAuth();
  const isManager = user?.role === 'manager';

  const [date, setDate] = useState(today());
  const [employeeId, setEmployeeId] = useState('');
  const [users, setUsers] = useState([]);
  const [data, setData] = useState({ date: today(), count: 0, total: 0, invoices: [] });
  const [loading, setLoading] = useState(true);

  const load = () => {
    const params = { date: date || undefined };
    if (isManager && employeeId) params.employee_id = employeeId;
    setLoading(true);
    myExpensesApi.list(params).then(setData).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isManager) usersApi.list().then((u) => setUsers(u.filter((x) => x.role === 'employee'))).catch(() => {});
  }, [isManager]);

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [date, employeeId]);

  // Live update: refresh when the tab regains focus and on a short poll while open.
  useEffect(() => {
    window.addEventListener('focus', load);
    const timer = setInterval(load, 30000);
    return () => { window.removeEventListener('focus', load); clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const colSpan = 6 + (isManager ? 1 : 0);

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">مصاريفي اليومية</h1>
          <p className="page-sub">
            {isManager ? 'كل الفواتير المسجلة في اليوم، مع اسم من سجّلها' : 'الفواتير التي سجلتها أنت فقط'}
          </p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={load} disabled={loading}>
          {loading ? '...' : '🔄 تحديث'}
        </button>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">التاريخ</label>
          <input className="input" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
        </div>
        {isManager && (
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label className="form-label">الموظف</label>
            <select className="select" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">كل الموظفين</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>
        )}
        <div className="card stat-card" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="stat-value" style={{ color: '#2563eb' }}>{fmt(data.total)}</div>
          <div className="stat-label">إجمالي مصاريف اليوم</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <h3 style={{ padding: '16px 20px 0' }}>🧾 الفواتير — {data.date} <span className="muted">({data.count})</span></h3>
        <div style={{ padding: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th>الوقت</th>
                <th>النوع</th>
                <th>رقم الفاتورة</th>
                <th>المبلغ</th>
                <th>الحاوية (BL)</th>
                <th>الزبون</th>
                {isManager && <th>سجّلها</th>}
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {data.invoices.length === 0 && !loading && (
                <tr><td colSpan={colSpan} className="muted" style={{ textAlign: 'center', padding: 20 }}>لا توجد مصاريف مسجلة في هذا اليوم</td></tr>
              )}
              {data.invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="nowrap" dir="ltr">{fmtTime(inv.created_at)}</td>
                  <td>
                    {inv.type_name}
                    {inv.allowed_role === 'manager' && <span className="badge badge-priced" style={{ marginRight: 6 }}>جمارك</span>}
                  </td>
                  <td className="nowrap">{inv.invoice_number || '—'}</td>
                  <td className="nowrap"><b>{fmt(inv.amount)}</b></td>
                  <td className="nowrap">{inv.bl_number} <span className="muted">({inv.container_number})</span></td>
                  <td>{inv.customer_name}</td>
                  {isManager && <td className="nowrap">{inv.employee_name || '—'}</td>}
                  <td>
                    {inv.container_status === 'priced'
                      ? <span className="badge badge-priced">مُرحَّلة على الحساب</span>
                      : <span className="badge badge-processing">قيد المعالجة</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            {data.invoices.length > 0 && (
              <tfoot>
                <tr style={{ fontWeight: 800 }}>
                  <td colSpan="3">الإجمالي</td>
                  <td className="nowrap">{fmt(data.total)}</td>
                  <td colSpan={colSpan - 4} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}