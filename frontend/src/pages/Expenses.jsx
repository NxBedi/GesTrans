import { useEffect, useState } from 'react';
import { reportsApi, usersApi, invoiceTypesApi } from '../utils/api.js';
import { fmt } from './Dashboard.jsx';

export default function Expenses() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [includeLiquidation, setIncludeLiquidation] = useState(false);

  const [users, setUsers] = useState([]);
  const [types, setTypes] = useState([]);
  const [summary, setSummary] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    usersApi.list().then((u) => setUsers(u)).catch(() => {});
    invoiceTypesApi.list().then(setTypes).catch(() => {});
  }, []);

  useEffect(() => {
    const params = {
      from: dateFrom || undefined,
      to: dateTo || undefined,
      employee_id: employeeId || undefined,
      type_id: typeId || undefined,
      include_manager: includeLiquidation ? 'true' : undefined,
    };
    setLoading(true);
    reportsApi.expensesSummary(params).then(setSummary).catch(() => {}).finally(() => setLoading(false));
    reportsApi.expenses(params).then(setInvoices).catch(() => {});
  }, [dateFrom, dateTo, employeeId, typeId, includeLiquidation]);

  const userTitle = (u) => `${u.full_name}${u.role === 'manager' ? ' (المدير)' : ''}`;

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">مصاريف العمال</h1>
          <p className="page-sub">تتبع كل فاتورة وجمع المصاريف اليومية — اختر «المدير» في فلتر الموظف لعرض مصاريفك الشخصية</p>
        </div>
        <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={includeLiquidation} onChange={(e) => setIncludeLiquidation(e.target.checked)} />
          إدراج LIQUIDATION (الجمارك)
        </label>
      </div>

      {/* Filters */}
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
          <label className="form-label">الموظف</label>
          <select className="select" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">الكل</option>
            {users.map((u) => <option key={u.id} value={u.id}>{userTitle(u)}</option>)}
          </select>
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">نوع الفاتورة</label>
          <select className="select" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            <option value="">الكل</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="card stat-card">
          <div className="stat-value">{fmt(summary?.total)}</div>
          <div className="stat-label">إجمالي المصاريف</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{summary?.invoice_count ?? 0}</div>
          <div className="stat-label">عدد الفواتير</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{summary?.daily ? Object.keys(summary.daily).length : 0}</div>
          <div className="stat-label">أيام الصرف</div>
        </div>
      </div>

      <div className="grid grid-2">
        {/* Daily aggregation */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <h3 style={{ padding: '16px 20px 0' }}>📅 المصاريف اليومية</h3>
          <div style={{ padding: 12 }}>
            <table className="table">
              <thead>
                <tr><th>التاريخ</th><th>عدد الفواتير</th><th>الإجمالي</th></tr>
              </thead>
              <tbody>
                {(!summary?.daily || summary.daily.length === 0) && !loading && (
                  <tr><td colSpan="3" className="muted" style={{ textAlign: 'center', padding: 20 }}>لا توجد مصاريف</td></tr>
                )}
                {summary?.daily.map((d) => (
                  <tr key={d.entry_date}>
                    <td className="nowrap"><b>{d.entry_date}</b></td>
                    <td>{d.invoice_count}</td>
                    <td className="nowrap"><b>{fmt(d.total)}</b></td>
                  </tr>
                ))}
              </tbody>
              {summary?.daily?.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: '2px solid #e2e8f0', fontWeight: 800 }}>
                    <td>الإجمالي</td>
                    <td>{summary.invoice_count}</td>
                    <td>{fmt(summary.total)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Per-employee */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <h3 style={{ padding: '16px 20px 0' }}>👤 المصاريف حسب الموظف</h3>
          <div style={{ padding: 12 }}>
            <table className="table">
              <thead>
                <tr><th>الموظف</th><th>عدد الفواتير</th><th>الإجمالي</th></tr>
              </thead>
              <tbody>
                {(!summary?.by_employee || summary.by_employee.length === 0) && !loading && (
                  <tr><td colSpan="3" className="muted" style={{ textAlign: 'center', padding: 20 }}>لا توجد بيانات</td></tr>
                )}
                {summary?.by_employee.map((e) => (
                  <tr key={e.employee_id}>
                    <td><b>{e.employee_name}</b></td>
                    <td>{e.invoice_count}</td>
                    <td className="nowrap"><b>{fmt(e.total)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Detailed trackable list */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: 16 }}>
        <h3 style={{ padding: '16px 20px 0' }}>🧾 كل الفواتير — قابلة للتتبع</h3>
        <div style={{ padding: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th>التاريخ</th><th>النوع</th><th>رقم الفاتورة</th><th>المبلغ</th>
                <th>الحاوية (BL)</th><th>الزبون</th><th>سجلها</th><th>ملاحظات</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 && !loading && (
                <tr><td colSpan="8" className="muted" style={{ textAlign: 'center', padding: 20 }}>لا توجد فواتير مطابقة</td></tr>
              )}
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="nowrap">{inv.entry_date}</td>
                  <td>
                    {inv.type_name}
                    {inv.allowed_role === 'manager' && <span className="badge badge-priced" style={{ marginRight: 6 }}>جمارك</span>}
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
          </table>
        </div>
      </div>
    </div>
  );
}