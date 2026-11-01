import { useEffect, useState } from 'react';
import { accountantApi, generalExpensesApi, reportsApi, salaryApi } from '../utils/api.js';
import { fmt } from './Dashboard.jsx';
import { downloadCsv } from '../utils/accountant.js';

export default function AccountantReports() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [dash, setDash] = useState(null);
  const [expSummary, setExpSummary] = useState(null);
  const [workerSummary, setWorkerSummary] = useState(null);
  const [typeSummary, setTypeSummary] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    const params = { from: dateFrom || undefined, to: dateTo || undefined };
    setLoading(true);
    accountantApi.dashboard().then(setDash).catch(() => {});
    generalExpensesApi.summary(params).then(setExpSummary).catch(() => {});
    reportsApi.expensesSummary(params).then(setWorkerSummary).catch(() => {});
    reportsApi.invoiceTypesSummary(params).then(setTypeSummary).catch(() => {});
    salaryApi.employees({ month }).then(setEmployees).catch(() => {});
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [dateFrom, dateTo, month]);

  const exportExpenses = () => {
    downloadCsv(
      'تقرير-مصاريف-المؤسسة',
      [
        { key: 'category', label: 'البند' },
        { key: 'count', label: 'عدد العمليات' },
        { key: 'total', label: 'الإجمالي' },
      ],
      expSummary?.by_category || []
    );
  };

  const exportWages = () => {
    downloadCsv(
      'تقرير-الرواتب',
      [
        { key: 'full_name', label: 'الموظف' },
        { key: 'salary', label: 'الراتب' },
        { key: 'paid', label: 'المدفوع' },
        { key: 'remaining', label: 'المتبقي' },
      ],
      employees
    );
  };

  const exportByType = () => {
    downloadCsv(
      'تقرير-مصاريف-حسب-النوع',
      [
        { key: 'type_name', label: 'النوع' },
        { key: 'invoice_count', label: 'عدد الفواتير' },
        { key: 'total', label: 'الإجمالي' },
        { key: 'container_count', label: 'عدد الحاويات' },
      ],
      typeSummary
    );
  };

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">التقارير المالية</h1>
          <p className="page-sub">تقارير المصاريف والرواتب ونوع الفواتير — مع تصدير CSV</p>
        </div>
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
          <label className="form-label">شهر الرواتب</label>
          <input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="card stat-card">
          <div className="stat-value">{fmt(dash?.expenses?.total)}</div>
          <div className="stat-label">إجمالي المصاريف (كل الفترات)</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{fmt(expSummary?.total)}</div>
          <div className="stat-label">مصاريف المؤسسة (حسب الفلتر)</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{fmt(workerSummary?.total)}</div>
          <div className="stat-label">مصاريف العمال (حسب الفلتر)</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#b45309' }}>{fmt(dash?.unpaid?.total)}</div>
          <div className="stat-label">التزامات غير مدفوعة</div>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <div className="card-header" style={{ padding: '16px 18px', marginBottom: 0 }}>
            <div className="card-title">🏢 مصاريف المؤسسة حسب البند</div>
            <button className="btn btn-outline btn-sm" onClick={exportExpenses}>⬇️ CSV</button>
          </div>
          <table className="table">
            <thead><tr><th>البند</th><th>العدد</th><th>الإجمالي</th></tr></thead>
            <tbody>
              {(!expSummary?.by_category || expSummary.by_category.length === 0) && !loading && (
                <tr><td colSpan="3" className="muted" style={{ textAlign: 'center', padding: 20 }}>لا توجد بيانات</td></tr>
              )}
              {expSummary?.by_category?.map((c) => (
                <tr key={c.category}>
                  <td><b>{c.category}</b></td>
                  <td>{c.count}</td>
                  <td className="nowrap"><b>{fmt(c.total)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <div className="card-header" style={{ padding: '16px 18px', marginBottom: 0 }}>
            <div className="card-title">💵 كشف الرواتب — {month}</div>
            <button className="btn btn-outline btn-sm" onClick={exportWages}>⬇️ CSV</button>
          </div>
          <table className="table">
            <thead><tr><th>الموظف</th><th>الراتب</th><th>المدفوع</th><th>المتبقي</th></tr></thead>
            <tbody>
              {employees.length === 0 && !loading && (
                <tr><td colSpan="4" className="muted" style={{ textAlign: 'center', padding: 20 }}>لا يوجد موظفون</td></tr>
              )}
              {employees.map((e) => (
                <tr key={e.id}>
                  <td><b>{e.full_name}</b></td>
                  <td className="nowrap">{fmt(e.salary)}</td>
                  <td className="nowrap">{fmt(e.paid)}</td>
                  <td className="nowrap" style={{ fontWeight: 800, color: Number(e.remaining) > 0 ? '#dc2626' : '#16a34a' }}>{fmt(e.remaining)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <div className="card-header" style={{ padding: '16px 18px', marginBottom: 0 }}>
          <div className="card-title">🧾 مصاريف العمال حسب نوع الفاتورة</div>
          <button className="btn btn-outline btn-sm" onClick={exportByType}>⬇️ CSV</button>
        </div>
        <table className="table">
          <thead><tr><th>النوع</th><th>عدد الفواتير</th><th>عدد الحاويات</th><th>الإجمالي</th></tr></thead>
          <tbody>
            {typeSummary.length === 0 && !loading && (
              <tr><td colSpan="4" className="muted" style={{ textAlign: 'center', padding: 20 }}>لا توجد بيانات</td></tr>
            )}
            {typeSummary.map((t) => (
              <tr key={t.type_id}>
                <td>
                  {t.type_name}
                  {t.allowed_role === 'manager' && <span className="badge badge-priced" style={{ marginInlineStart: 6 }}>جمارك</span>}
                </td>
                <td>{t.invoice_count}</td>
                <td>{t.container_count}</td>
                <td className="nowrap"><b>{fmt(t.total)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
