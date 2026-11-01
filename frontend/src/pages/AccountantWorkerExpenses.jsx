import { useEffect, useState } from 'react';
import { accountantApi, reportsApi } from '../utils/api.js';
import { fmt } from './Dashboard.jsx';
import { downloadCsv, fmtDate } from '../utils/accountant.js';

export default function AccountantWorkerExpenses() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [users, setUsers] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    const params = {
      from: dateFrom || undefined,
      to: dateTo || undefined,
      employee_id: employeeId || undefined,
    };
    setLoading(true);
    reportsApi.expensesSummary(params).then(setSummary).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    accountantApi.employees().then(setUsers).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [dateFrom, dateTo, employeeId]);

  const exportCsv = () => {
    downloadCsv(
      'مصاريف-العمال',
      [
        { key: 'entry_date', label: 'التاريخ', get: (r) => fmtDate(r.entry_date) },
        { key: 'employee_name', label: 'الموظف' },
        { key: 'invoice_count', label: 'عدد الفواتير' },
        { key: 'total', label: 'الإجمالي' },
      ],
      summary?.by_employee || []
    );
  };

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">مصاريف العمال</h1>
          <p className="page-sub">مصاريف العمال اليومية المحصّلة — قراءة فقط (التسجيل يكون من صفحة «مصاريفي اليومية»)</p>
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
          <div className="stat-value">{fmt(summary?.total)}</div>
          <div className="stat-label">إجمالي مصاريف العمال</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{summary?.invoice_count ?? 0}</div>
          <div className="stat-label">عدد الفواتير</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{summary?.by_employee?.length ?? 0}</div>
          <div className="stat-label">عدد العمال</div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <h3 style={{ padding: '16px 20px 0' }}>📅 المصاريف اليومية</h3>
          <table className="table">
            <thead><tr><th>التاريخ</th><th>عدد الفواتير</th><th>الإجمالي</th></tr></thead>
            <tbody>
              {(!summary?.daily || summary.daily.length === 0) && !loading && (
                <tr><td colSpan="3" className="muted" style={{ textAlign: 'center', padding: 20 }}>لا توجد مصاريف</td></tr>
              )}
              {summary?.daily?.map((d) => (
                <tr key={d.entry_date}>
                  <td className="nowrap"><b>{fmtDate(d.entry_date)}</b></td>
                  <td>{d.invoice_count}</td>
                  <td className="nowrap"><b>{fmt(d.total)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <h3 style={{ padding: '16px 20px 0' }}>👤 المصاريف حسب الموظف</h3>
          <table className="table">
            <thead><tr><th>الموظف</th><th>عدد الفواتير</th><th>الإجمالي</th></tr></thead>
            <tbody>
              {(!summary?.by_employee || summary.by_employee.length === 0) && !loading && (
                <tr><td colSpan="3" className="muted" style={{ textAlign: 'center', padding: 20 }}>لا توجد بيانات</td></tr>
              )}
              {summary?.by_employee?.map((e) => (
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
  );
}
