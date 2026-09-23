import { useEffect, useMemo, useState } from 'react';
import { containersApi } from '../utils/api.js';
import { fmt } from './Dashboard.jsx';

function today() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function fmtDate(d) {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  const [y, m, dd] = s.split('-');
  return dd && m && y ? `${dd}/${m}/${y}` : s;
}

const statusLabels = { registered: 'مسجلة', processing: 'قيد التسجيل', closed: 'جاهزة للتسعير', priced: 'تم التسعير' };

export default function Liquidations() {
  const [data, setData] = useState({ records: [], count: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [f, setF] = useState('');

  const load = () => {
    setLoading(true);
    containersApi.liquidations({ from, to, q: f })
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(load, [from, to, f]);

  const monthTotal = useMemo(
    () => data.records
      .filter((r) => String(r.entry_date).slice(0, 7) === today().slice(0, 7))
      .reduce((s, r) => s + Number(r.amount), 0),
    [data.records],
  );

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">LIQUIDATION المدفوعة</h1>
          <p className="page-sub">تتبع وتدقيق كل تراخيص LIQUIDATION المسجّلة — مرفق تُراجعه يومياً</p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={load}>⟳ تحديث</button>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#0d9488' }}>{fmt(data.total)}</div>
          <div className="stat-label">إجمالي المبلغ ({data.count} عملية)</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#7c3aed' }}>{fmt(monthTotal)}</div>
          <div className="stat-label">المدفوع هذا الشهر</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{data.count}</div>
          <div className="stat-label">عدد LIQUIDATION المسجّلة في الفترة</div>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 14 }}>
        <div>
          <label className="label">من تاريخ</label>
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">إلى تاريخ</label>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label className="label">بحث (BL / حاوية / زبون / رقم)</label>
          <input className="input" placeholder="بحث…" value={f} onChange={(e) => setF(e.target.value)} />
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <table className="table" style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th>رقم LIQUIDATION</th>
              <th>البلاندي</th>
              <th>رقم الحاوية</th>
              <th>الزبون</th>
              <th>المبلغ</th>
              <th>التاريخ</th>
              <th>المسجّلة بواسطة</th>
              <th>حالة الحاوية</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan="8" className="muted" style={{ textAlign: 'center', padding: 20 }}>جارٍ التحميل...</td></tr>
            )}
            {!loading && data.records.length === 0 && (
              <tr><td colSpan="8" className="muted" style={{ textAlign: 'center', padding: 20 }}>لا توجد عمليات LIQUIDATION في هذه الفترة</td></tr>
            )}
            {data.records.map((r) => (
              <tr key={r.id}>
                <td className="nowrap"><b>{r.invoice_number || '—'}</b></td>
                <td className="nowrap">{r.bl_number}</td>
                <td className="nowrap">{r.container_number}</td>
                <td style={{ direction: 'rtl', textAlign: 'right' }}>{r.customer_name}</td>
                <td className="nowrap" style={{ color: '#0d9488', fontWeight: 800 }}>{fmt(r.amount)}</td>
                <td className="nowrap">{fmtDate(r.entry_date)}</td>
                <td>{r.entered_by_name || '—'}</td>
                <td><span className={`badge badge-${r.container_status}`}>{statusLabels[r.container_status] || r.container_status}</span></td>
              </tr>
            ))}
          </tbody>
          {data.records.length > 0 && (
            <tfoot>
              <tr style={{ fontWeight: 800 }}>
                <td colSpan="4">الإجمالي</td>
                <td className="nowrap">{fmt(data.total)}</td>
                <td colSpan="3"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}