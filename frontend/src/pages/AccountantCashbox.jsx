import { useEffect, useState } from 'react';
import { financialApi } from '../utils/api.js';
import { fmt } from './Dashboard.jsx';
import { downloadCsv, movementKindLabel } from '../utils/accountant.js';

export default function AccountantCashbox() {
  const [overview, setOverview] = useState(null);
  const [movements, setMovements] = useState([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    financialApi.overview().then(setOverview).catch(() => {});
    financialApi.movements({ from: from || undefined, to: to || undefined }).then(setMovements).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [from, to]);

  const exportCsv = () => {
    downloadCsv(
      'حركات-الصندوق',
      [
        { key: 'd', label: 'التاريخ' },
        { key: 'kind', label: 'النوع', get: (r) => movementKindLabel(r.kind) },
        { key: 'descr', label: 'البيان' },
        { key: 'ref', label: 'المرجع' },
        { key: 'amount', label: 'المبلغ' },
      ],
      movements
    );
  };

  const inflow = movements.filter((m) => Number(m.amount) > 0).reduce((s, m) => s + Number(m.amount), 0);
  const outflow = movements.filter((m) => Number(m.amount) < 0).reduce((s, m) => s + Math.abs(Number(m.amount)), 0);

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">الصندوق</h1>
          <p className="page-sub">نقدية الصندوق وحركاته — قراءة فقط (إدارة الصندوق ورأس المال والتسويات للمدير)</p>
        </div>
        <button className="btn btn-outline" onClick={exportCsv}>⬇️ تصدير CSV</button>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#16a34a' }}>{fmt(overview?.cash_box)}</div>
          <div className="stat-label">نقدية الصندوق</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{fmt(overview?.capital_invested)}</div>
          <div className="stat-label">رأس المال المستثمر</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#16a34a' }}>{fmt(inflow)}</div>
          <div className="stat-label">وارد (حسب الفلتر)</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#dc2626' }}>{fmt(outflow)}</div>
          <div className="stat-label">منصرف (حسب الفلتر)</div>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">من تاريخ</label>
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">إلى تاريخ</label>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <div className="card-header" style={{ padding: '16px 20px', marginBottom: 0 }}>
          <div className="card-title">🏦 حركات الصندوق</div>
        </div>
        <table className="table">
          <thead>
            <tr><th>التاريخ</th><th>النوع</th><th>البيان</th><th>المرجع</th><th>المبلغ</th></tr>
          </thead>
          <tbody>
            {movements.length === 0 && !loading && (
              <tr><td colSpan="5" className="muted" style={{ textAlign: 'center', padding: 20 }}>لا توجد حركات</td></tr>
            )}
            {movements.map((m, i) => (
              <tr key={i}>
                <td className="nowrap">{m.d}</td>
                <td><span className="badge badge-processing">{movementKindLabel(m.kind)}</span></td>
                <td>{m.descr}</td>
                <td className="muted">{m.ref || '—'}</td>
                <td className="nowrap" style={{ fontWeight: 800, color: Number(m.amount) >= 0 ? '#16a34a' : '#dc2626' }}>
                  {fmt(m.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
