import { useEffect, useState } from 'react';
import { reportsApi, generalExpensesApi } from '../utils/api.js';
import { fmt } from './Dashboard.jsx';

export default function Reports() {
  const [tab, setTab] = useState('profits');
  const tabs = [
    { id: 'profits', label: '📊 الأرباح' },
    { id: 'containers', label: '📦 الحاويات' },
    { id: 'invoices', label: '🧾 الفواتير حسب النوع' },
  ];

  return (
    <div className="page">
      <h1 className="page-title">التقارير</h1>
      <p className="page-sub">تحليل الأرباح وحالة الحاويات وإجماليات الفواتير حسب النوع</p>

      <div className="toolbar" style={{ gap: 8 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`btn btn-sm ${tab === t.id ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'profits' && <ProfitsReport />}
      {tab === 'containers' && <ContainersReport />}
      {tab === 'invoices' && <InvoiceTypesReport />}
    </div>
  );
}

function ProfitsReport() {
  const [rows, setRows] = useState([]);
  const [genExp, setGenExp] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    reportsApi.profits({ from: dateFrom || undefined, to: dateTo || undefined }).then(setRows).catch(() => {});
    generalExpensesApi.summary({ from: dateFrom || undefined, to: dateTo || undefined }).then(setGenExp).catch(() => {});
  }, [dateFrom, dateTo]);

  const totalRevenue = rows.reduce((s, r) => s + Number(r.final_price || 0), 0);
  const totalCosts = rows.reduce((s, r) => s + Number(r.total_costs || 0), 0);
  const totalProfit = rows.reduce((s, r) => s + Number(r.profit || 0), 0);
  const genExpTotal = genExp?.total ?? 0;
  const netProfit = totalProfit - Number(genExpTotal);

  return (
    <div>
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
          <label className="form-label">ربح الحاويات − مصاريف المؤسسة في نفس الفترة</label>
          <div className="muted" style={{ fontSize: 13, fontWeight: 700, paddingTop: 8 }}>
            صافي الربح: <span style={{ color: netProfit >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(netProfit)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="card stat-card">
          <div className="stat-value">{fmt(totalRevenue)}</div>
          <div className="stat-label">إجمالي الأسعار النهائية</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#dc2626' }}>{fmt(totalCosts)}</div>
          <div className="stat-label">تكاليف الحاويات</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#2563eb' }}>{fmt(totalProfit)}</div>
          <div className="stat-label">أرباح الحاويات</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#dc2626' }}>{fmt(genExpTotal)}</div>
          <div className="stat-label">مصاريف المؤسسة</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="table">
          <thead>
            <tr><th>BL</th><th>الحاوية</th><th>الزبون</th><th>التكاليف</th><th>السعر النهائي</th><th>الربح</th><th>التاريخ</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan="7" className="muted" style={{ textAlign: 'center', padding: 20 }}>لا توجد بيانات</td></tr>}
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="nowrap"><b>{r.bl_number}</b></td>
                <td>{r.container_number}</td>
                <td>{r.customer_name}</td>
                <td className="nowrap">{fmt(r.total_costs)}</td>
                <td className="nowrap"><b>{fmt(r.final_price)}</b></td>
                <td className="nowrap" style={{ color: r.profit >= 0 ? '#16a34a' : '#dc2626', fontWeight: 700 }}>{fmt(r.profit)}</td>
                <td className="nowrap">{new Date(r.updated_at).toLocaleDateString('ar')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ContainersReport() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    reportsApi.containers({ status: status || undefined, from: dateFrom || undefined, to: dateTo || undefined }).then(setRows).catch(() => {});
  }, [status, dateFrom, dateTo]);

  const statusLabels = { registered: 'مسجلة', processing: 'قيد تسجيل الفواتير', closed: 'جاهزة للتسعير', priced: 'تم التسعير' };

  const counts = {
    registered: rows.filter((r) => r.status === 'registered').length,
    processing: rows.filter((r) => r.status === 'processing').length,
    closed: rows.filter((r) => r.status === 'closed').length,
    priced: rows.filter((r) => r.status === 'priced').length,
  };

  return (
    <div>
      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">الحالة</label>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">كل الحالات</option>
            <option value="registered">مسجلة</option>
            <option value="processing">قيد تسجيل الفواتير</option>
            <option value="closed">جاهزة للتسعير</option>
            <option value="priced">تم التسعير</option>
          </select>
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">من تاريخ</label>
          <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">إلى تاريخ</label>
          <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#f59e0b' }}>{counts.registered + counts.processing}</div>
          <div className="stat-label">قيد المعالجة</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#7c3aed' }}>{counts.closed}</div>
          <div className="stat-label">جاهزة للتسعير</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#3b82f6' }}>{counts.priced}</div>
          <div className="stat-label">تم التسعير</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#64748b' }}>{rows.length}</div>
          <div className="stat-label">إجمالي الحاويات في الفترة</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="table">
          <thead>
            <tr><th>BL</th><th>الحاوية</th><th>الزبون</th><th>التاريخ</th><th>الحالة</th><th>التكاليف</th><th>السعر</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan="7" className="muted" style={{ textAlign: 'center', padding: 20 }}>لا توجد بيانات</td></tr>}
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="nowrap"><b>{r.bl_number}</b></td>
                <td>{r.container_number}</td>
                <td>{r.customer_name}</td>
                <td className="nowrap">{r.registration_date}</td>
                <td><span className={`badge badge-${r.status}`}>{statusLabels[r.status]}</span></td>
                <td className="nowrap">{fmt(r.total_costs)}</td>
                <td className="nowrap"><b>{fmt(r.final_price)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InvoiceTypesReport() {
  const [rows, setRows] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [includeManager, setIncludeManager] = useState(false);

  useEffect(() => {
    reportsApi.invoiceTypesSummary({
      from: dateFrom || undefined,
      to: dateTo || undefined,
      include_manager: includeManager ? 'true' : undefined,
    }).then(setRows).catch(() => {});
  }, [dateFrom, dateTo, includeManager]);

  const grandTotal = rows.reduce((s, r) => s + Number(r.total || 0), 0);
  const grandCount = rows.reduce((s, r) => s + r.invoice_count, 0);

  return (
    <div>
      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">من تاريخ</label>
          <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">إلى تاريخ</label>
          <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className="form-row" style={{ marginBottom: 0, display: 'flex', alignItems: 'flex-end' }}>
          <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 700 }}>
            <input type="checkbox" checked={includeManager} onChange={(e) => setIncludeManager(e.target.checked)} />
            إدراج LIQUIDATION (الجمارك)
          </label>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <div className="card stat-card">
          <div className="stat-value">{fmt(grandTotal)}</div>
          <div className="stat-label">إجمالي المبالغ</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{grandCount}</div>
          <div className="stat-label">عدد الفواتير</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="table">
          <thead>
            <tr><th>نوع الفاتورة</th><th>عدد الفواتير</th><th>عدد الحاويات</th><th>الإجمالي</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan="4" className="muted" style={{ textAlign: 'center', padding: 20 }}>لا توجد فواتير في هذه الفترة</td></tr>}
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <b>{r.type_name}</b>
                  {r.allowed_role === 'manager' && <span className="badge badge-priced" style={{ marginRight: 6 }}>جمارك</span>}
                </td>
                <td>{r.invoice_count}</td>
                <td>{r.container_count}</td>
                <td className="nowrap" style={{ fontWeight: 700 }}>{fmt(r.total)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: '2px solid #e2e8f0', fontWeight: 800 }}>
                <td>الإجمالي</td>
                <td>{grandCount}</td>
                <td></td>
                <td>{fmt(grandTotal)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}