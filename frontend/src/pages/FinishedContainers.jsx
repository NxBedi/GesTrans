import { useEffect, useState } from 'react';
import { containersApi } from '../utils/api.js';
import { fmt } from './Dashboard.jsx';

const statusLabels = { registered: 'مسجلة', processing: 'قيد تسجيل الفواتير', closed: 'جاهزة للتسعير', priced: 'تم التسعير' };

export default function FinishedContainers() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    setLoading(true);
    containersApi.finished().then(setRows).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const totalCosts = rows.reduce((s, r) => s + Number(r.total_costs || 0), 0);
  const totalRevenue = rows.reduce((s, r) => s + Number(r.final_price || 0), 0);
  const totalProfit = rows.reduce((s, r) => s + Number(r.profit || 0), 0);

  const reopen = async (c) => {
    if (!confirm(`تصحيح فواتير الحاوية ${c.bl_number}؟\nسيُلغى التسعير والربح وأي دفعات مسجّلة على هذه الحاوية، وتعود إلى «الحاويات المفتوحة» لتصحيح الفواتير ثم تُسعّر وتُحصَّل من جديد.`)) return;
    setBusyId(c.id);
    try {
      await containersApi.reopen(c.id);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">الحسابات</h1>
          <p className="page-sub">الحاويات المُسعّرة المُرحَّلة على الزبون (الحسابات) — التكاليف والسعر النهائي والربح</p>
        </div>
        <div className="muted">{loading ? 'جارٍ التحميل...' : `${rows.length} حاوية`}</div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#dc2626' }}>{fmt(totalCosts)}</div>
          <div className="stat-label">إجمالي التكاليف</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{fmt(totalRevenue)}</div>
          <div className="stat-label">إجمالي الأسعار النهائية</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#16a34a' }}>{fmt(totalProfit)}</div>
          <div className="stat-label">إجمالي الأرباح</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="table">
          <thead>
            <tr>
              <th>BL</th><th>الحاوية</th><th>الزبون</th><th>التاريخ</th>
              <th>التكاليف</th><th>السعر النهائي</th><th>الربح</th><th>الحالة</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr><td colSpan="8" className="muted" style={{ textAlign: 'center', padding: 20 }}>لا توجد حاويات في الحسابات بعد</td></tr>
            )}
            {rows.map((c) => {
              const priced = c.final_price != null;
              return (
                <tr key={c.id}>
                  <td className="nowrap"><b>{c.bl_number}</b></td>
                  <td>{c.container_number}</td>
                  <td>{c.customer_name}</td>
                  <td className="nowrap">{c.registration_date}</td>
                  <td className="nowrap">{fmt(c.total_costs)}</td>
                  <td className="nowrap">{priced ? <b>{fmt(c.final_price)}</b> : <span className="muted">لم يُسعّر</span>}</td>
                  <td className="nowrap">{priced ? <b style={{ color: c.profit >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(c.profit)}</b> : <span className="muted">—</span>}</td>
                  <td>
                    <span className={`badge badge-${c.status}`}>
                      {statusLabels[c.status] || c.status}{priced ? '' : ' — لم يُسعّر'}
                    </span>
                  </td>
                  <td className="nowrap">
                    <button className="btn btn-outline btn-sm" disabled={busyId === c.id} onClick={() => reopen(c)} title="تصحيح: إعادة الفتح للحاويات المفتوحة لتعديل الفواتير ثم إعادة التسعير">
                      {busyId === c.id ? 'جارٍ...' : '🔧 تصحيح'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}