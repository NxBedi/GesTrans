import { useEffect, useState } from 'react';
import { reportsApi, generalExpensesApi } from '../utils/api.js';
import { fmt } from './Dashboard.jsx';
import { dmy, DEBT_LABELS } from '../utils/format.js';
import { exportExcel, exportPdf } from '../utils/export.js';
import { useFeedback } from '../components/Feedback.jsx';

export default function Reports() {
  const [tab, setTab] = useState('profits');
  const tabs = [
    { id: 'profits', label: '📊 الأرباح' },
    { id: 'containers', label: '📦 الحاويات والشحن' },
    { id: 'invoices', label: '🧾 الفواتير حسب النوع' },
    { id: 'payments', label: '💳 الدفعات' },
    { id: 'debts', label: '📒 الديون' },
  ];

  return (
    <div className="page">
      <h1 className="page-title">التقارير</h1>
      <p className="page-sub">تحليل الأرباح، الحاويات، الدفعات والديون مع تصدير PDF و Excel</p>

      <div className="toolbar" style={{ gap: 8 }}>
        <div className="tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'profits' && <ProfitsReport />}
      {tab === 'containers' && <ContainersReport />}
      {tab === 'invoices' && <InvoiceTypesReport />}
      {tab === 'payments' && <PaymentsReport />}
      {tab === 'debts' && <DebtsReport />}
    </div>
  );
}

function ProfitsReport() {
  const [rows, setRows] = useState([]);
  const [genExp, setGenExp] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const { toast } = useFeedback();

  useEffect(() => {
    reportsApi.profits({ from: dateFrom || undefined, to: dateTo || undefined }).then(setRows).catch(() => {});
    generalExpensesApi.summary({ from: dateFrom || undefined, to: dateTo || undefined }).then(setGenExp).catch(() => {});
  }, [dateFrom, dateTo]);

  const totalRevenue = rows.reduce((s, r) => s + Number(r.final_price || 0), 0);
  const totalCosts = rows.reduce((s, r) => s + Number(r.total_costs || 0), 0);
  const totalProfit = rows.reduce((s, r) => s + Number(r.profit || 0), 0);
  const genExpTotal = genExp?.total ?? 0;
  const netProfit = totalProfit - Number(genExpTotal);

  const doExport = (kind) => {
    const headers = [
      { key: 'bl_number', header: 'BL' },
      { key: 'container_number', header: 'الحاوية' },
      { key: 'customer_name', header: 'العميل' },
      { key: 'total_costs', header: 'التكاليف' },
      { key: 'final_price', header: 'السعر النهائي' },
      { key: 'profit', header: 'الربح' },
      { key: 'date', header: 'التاريخ' },
    ];
    const data = rows.map((r) => ({ ...r, date: dmy(r.updated_at), total_costs: fmt(r.total_costs), final_price: fmt(r.final_price), profit: fmt(r.profit) }));
    const sub = `الفترة من ${dmy(dateFrom)} إلى ${dmy(dateTo)} — صافي الربح بعد مصاريف المؤسسة: ${fmt(netProfit)} MRU`;
    if (kind === 'excel') exportExcel('تقرير_الأرباح', headers, data);
    else exportPdf('تقرير الأرباح', headers, data, sub);
    toast('تم تصدير تقرير الأرباح', 'info');
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 8, marginBottom: 14 }}>
        <button className="btn btn-primary btn-sm" onClick={() => doExport('excel')}>⬇ تصدير Excel</button>
        <button className="btn btn-outline btn-sm" onClick={() => doExport('pdf')}>📄 تصدير PDF</button>
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
  const { toast } = useFeedback();

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

  const doExport = (kind) => {
    const headers = [
      { key: 'bl_number', header: 'BL' },
      { key: 'container_number', header: 'الحاوية' },
      { key: 'customer_name', header: 'العميل' },
      { key: 'registration_date', header: 'التاريخ' },
      { key: 'status', header: 'الحالة' },
      { key: 'total_costs', header: 'التكاليف' },
      { key: 'final_price', header: 'السعر' },
    ];
    const data = rows.map((r) => ({
      ...r,
      registration_date: dmy(r.registration_date),
      status: statusLabels[r.status] || r.status,
      total_costs: fmt(r.total_costs), final_price: fmt(r.final_price),
    }));
    const sub = `الحالة: ${statusLabels[status] || 'الكل'} — من ${dmy(dateFrom)} إلى ${dmy(dateTo)}`;
    if (kind === 'excel') exportExcel('تقرير_الحاويات', headers, data);
    else exportPdf('تقرير الحاويات', headers, data, sub);
    toast('تم تصدير تقرير الحاويات', 'info');
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 8, marginBottom: 14 }}>
        <button className="btn btn-primary btn-sm" onClick={() => doExport('excel')}>⬇ تصدير Excel</button>
        <button className="btn btn-outline btn-sm" onClick={() => doExport('pdf')}>📄 تصدير PDF</button>
      </div>
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

function PaymentsReport() {
  const [data, setData] = useState({ records: [], count: 0, total: 0 });
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [q, setQ] = useState('');
  const { toast } = useFeedback();

  useEffect(() => {
    reportsApi.payments({ from: dateFrom || undefined, to: dateTo || undefined, q: q || undefined })
      .then(setData).catch(() => {});
  }, [dateFrom, dateTo, q]);

  const doExport = (kind) => {
    const headers = [
      { key: 'payment_date', header: 'التاريخ' },
      { key: 'customer_name', header: 'العميل' },
      { key: 'customer_phone', header: 'الهاتف' },
      { key: 'bl_number', header: 'BL' },
      { key: 'amount', header: 'المبلغ' },
      { key: 'notes', header: 'ملاحظات' },
      { key: 'created_by_name', header: 'سجّل بواسطة' },
    ];
    const rows = data.records.map((r) => ({ ...r, payment_date: dmy(r.payment_date), amount: fmt(r.amount) }));
    const sub = `الفترة من ${dmy(dateFrom)} إلى ${dmy(dateTo)} — إجمالي الدفعات: ${fmt(data.total)} MRU`;
    if (kind === 'excel') exportExcel('تقرير_الدفعات', headers, rows);
    else exportPdf('تقرير الدفعات', headers, rows, sub);
    toast('تم تصدير تقرير الدفعات', 'info');
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <div className="grid grid-3" style={{ gap: 10, flex: 1 }}>
          <input className="input" placeholder="بحث...🔍" value={q} onChange={(e) => setQ(e.target.value)} />
          <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={() => doExport('excel')}>⬇ Excel</button>
          <button className="btn btn-outline btn-sm" onClick={() => doExport('pdf')}>📄 PDF</button>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#16a34a' }}>{fmt(data.total)}</div>
          <div className="stat-label">إجمالي الدفعات</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{data.count}</div>
          <div className="stat-label">عدد الدفعات</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="table">
          <thead>
            <tr><th>التاريخ</th><th>العميل</th><th>الهاتف</th><th>BL</th><th>المبلغ</th><th>سجّل بواسطة</th></tr>
          </thead>
          <tbody>
            {data.records.length === 0 && <tr><td colSpan="6" className="muted" style={{ textAlign: 'center', padding: 20 }}>لا توجد دفعات في هذه الفترة</td></tr>}
            {data.records.map((r) => (
              <tr key={r.id}>
                <td className="nowrap">{dmy(r.payment_date)}</td>
                <td style={{ fontWeight: 700 }}>{r.customer_name}</td>
                <td className="nowrap" dir="ltr">{r.customer_phone || '—'}</td>
                <td className="nowrap">{r.bl_number || '—'}</td>
                <td className="nowrap" style={{ fontWeight: 800, color: '#16a34a' }}>{fmt(r.amount)}</td>
                <td>{r.created_by_name || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DebtsReport() {
  const [rows, setRows] = useState([]);
  const { toast } = useFeedback();

  useEffect(() => { reportsApi.balances().then(setRows).catch(() => {}); }, []);

  const totalDebt = rows.reduce((s, r) => s + Math.max(Number(r.balance), 0), 0);
  const overdue = rows.filter((r) => r.debt_status === 'overdue');
  const overdueAmt = overdue.reduce((s, r) => s + Math.max(Number(r.balance), 0), 0);

  const doExport = (kind) => {
    const headers = [
      { key: 'customer_name', header: 'العميل' },
      { key: 'phone', header: 'الهاتف' },
      { key: 'container_count', header: 'الحاويات' },
      { key: 'total_billed', header: 'المُحاسَب' },
      { key: 'total_paid', header: 'المدفوع' },
      { key: 'balance', header: 'المتبقي' },
      { key: 'last_payment_date', header: 'آخر دفعة' },
      { key: 'due_date', header: 'الاستحقاق' },
      { key: 'debt_status', header: 'الحالة' },
    ];
    const data = rows.map((r) => ({
      ...r,
      total_billed: fmt(r.total_billed), total_paid: fmt(r.total_paid), balance: fmt(r.balance),
      last_payment_date: dmy(r.last_payment_date), due_date: dmy(r.due_date),
      debt_status: DEBT_LABELS[r.debt_status] || r.debt_status,
    }));
    const sub = `إجمالي الديون: ${fmt(totalDebt)} MRU — متأخر: ${fmt(overdueAmt)} MRU عن ${overdue.length} عميل`;
    if (kind === 'excel') exportExcel('تقرير_الديون', headers, data);
    else exportPdf('تقرير ديون العملاء', headers, data, sub);
    toast('تم تصدير تقرير الديون', 'info');
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 8, marginBottom: 14 }}>
        <button className="btn btn-primary btn-sm" onClick={() => doExport('excel')}>⬇ تصدير Excel</button>
        <button className="btn btn-outline btn-sm" onClick={() => doExport('pdf')}>📄 تصدير PDF</button>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#d97706' }}>{fmt(totalDebt)}</div>
          <div className="stat-label">إجمالي الديون</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#dc2626' }}>{fmt(overdueAmt)}</div>
          <div className="stat-label">ديون متأخرة ({overdue.length})</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{rows.length}</div>
          <div className="stat-label">عدد العملاء</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="table">
          <thead>
            <tr><th>العميل</th><th>المُحاسَب</th><th>المدفوع</th><th>المتبقي</th><th>آخر دفعة</th><th>الاستحقاق</th><th>الحالة</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan="7" className="muted" style={{ textAlign: 'center', padding: 20 }}>لا توجد بيانات</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 700 }}>{r.customer_name}</td>
                <td className="nowrap">{fmt(r.total_billed)}</td>
                <td className="nowrap" style={{ color: '#16a34a' }}>{fmt(r.total_paid)}</td>
                <td className="nowrap" style={{ fontWeight: 800, color: Number(r.balance) > 0 ? '#d97706' : '#16a34a' }}>{fmt(r.balance)}</td>
                <td className="nowrap">{dmy(r.last_payment_date)}</td>
                <td className="nowrap">{dmy(r.due_date)}</td>
                <td><span className={`badge ${r.debt_status === 'paid' ? 'badge-paid' : r.debt_status === 'partial' ? 'badge-partial' : r.debt_status === 'overdue' ? 'badge-overdue' : 'badge-due'}`}>{DEBT_LABELS[r.debt_status] || r.debt_status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}