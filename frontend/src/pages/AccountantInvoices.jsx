import { useEffect, useState } from 'react';
import { accountantApi, reportsApi } from '../utils/api.js';
import { fmt } from './Dashboard.jsx';
import { downloadCsv, fmtDate } from '../utils/accountant.js';

export default function AccountantInvoices() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [users, setUsers] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    const params = {
      from: dateFrom || undefined,
      to: dateTo || undefined,
      employee_id: employeeId || undefined,
    };
    setLoading(true);
    reportsApi.expenses(params).then(setRows).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    accountantApi.employees().then(setUsers).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [dateFrom, dateTo, employeeId]);

  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);

  const exportCsv = () => {
    downloadCsv(
      'فواتير-الحاويات',
      [
        { key: 'entry_date', label: 'التاريخ', get: (r) => fmtDate(r.entry_date) },
        { key: 'invoice_number', label: 'رقم الفاتورة' },
        { key: 'type_name', label: 'النوع' },
        { key: 'amount', label: 'المبلغ' },
        { key: 'bl_number', label: 'الحاوية (BL)' },
        { key: 'container_number', label: 'رقم الحاوية' },
        { key: 'customer_name', label: 'الزبون' },
        { key: 'employee_name', label: 'سجلها' },
        { key: 'notes', label: 'ملاحظات' },
      ],
      rows
    );
  };

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">فواتير الحاويات</h1>
          <p className="page-sub">عرض فواتير الحاويات وتفاصيلها — قراءة فقط (لا يمكن للمحاسب إنشاء أو تعديل فاتورة)</p>
        </div>
        <button className="btn btn-outline" onClick={exportCsv}>⬇️ تصدير CSV</button>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">من تاريخ</label>
          <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">إلى تاريخ</label>
          <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">الموظف</label>
          <select className="select" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">الكل</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="card stat-card">
          <div className="stat-value">{fmt(total)}</div>
          <div className="stat-label">إجمالي الفواتير</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{rows.length}</div>
          <div className="stat-label">عدد الفواتير</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{new Set(rows.map((r) => r.bl_number)).size}</div>
          <div className="stat-label">عدد الحاويات</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <div className="card-header" style={{ padding: '16px 20px', marginBottom: 0 }}>
          <div className="card-title">🧾 سجل فواتير الحاويات</div>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>التاريخ</th><th>النوع</th><th>رقم الفاتورة</th><th>المبلغ</th>
              <th>الحاوية (BL)</th><th>الزبون</th><th>سجلها</th><th>ملاحظات</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr><td colSpan="8" className="muted" style={{ textAlign: 'center', padding: 20 }}>لا توجد فواتير مطابقة</td></tr>
            )}
            {rows.map((inv) => (
              <tr key={inv.id}>
                <td className="nowrap">{fmtDate(inv.entry_date)}</td>
                <td>
                  {inv.type_name}
                  {inv.allowed_role === 'manager' && <span className="badge badge-priced" style={{ marginInlineStart: 6 }}>جمارك</span>}
                </td>
                <td className="nowrap">{inv.invoice_number || '—'}</td>
                <td className="nowrap"><b>{fmt(inv.amount)}</b></td>
                <td className="nowrap">{inv.bl_number}</td>
                <td>{inv.customer_name}</td>
                <td>{inv.employee_name || '—'}</td>
                <td className="muted">{inv.notes || '—'}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: '2px solid #e2e8f0', fontWeight: 800 }}>
                <td colSpan="3">الإجمالي</td>
                <td>{fmt(total)}</td>
                <td colSpan="4"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
