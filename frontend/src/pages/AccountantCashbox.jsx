import { useEffect, useState } from 'react';
import { financialApi } from '../utils/api.js';
import { useI18n } from '../i18n/I18nContext.jsx';
import { downloadCsv } from '../utils/accountant.js';

export default function AccountantCashbox() {
  const { t, fmt, dmy, kindLabel } = useI18n();
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
      t('accountant.openCashbox'),
      [
        { key: 'd', label: t('common.date') },
        { key: 'kind', label: t('common.type'), get: (r) => kindLabel(r.kind) },
        { key: 'descr', label: t('common.description') },
        { key: 'ref', label: t('accountant.reference') },
        { key: 'amount', label: t('common.amount') },
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
          <h1 className="page-title">{t('nav.accountantCashbox')}</h1>
          <p className="page-sub">{t('financial.cashBox')} — {t('financial.readOnly')}</p>
        </div>
        <button className="btn btn-outline" onClick={exportCsv}>⬇️ {t('common.export')} CSV</button>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#16a34a' }}>{fmt(overview?.cash_box)}</div>
          <div className="stat-label">{t('accountant.cashBox')}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{fmt(overview?.capital_invested)}</div>
          <div className="stat-label">{t('accountant.capitalInvested')}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#16a34a' }}>{fmt(inflow)}</div>
          <div className="stat-label">{t('financial.colIn')}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#dc2626' }}>{fmt(outflow)}</div>
          <div className="stat-label">{t('financial.colOut')}</div>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">{t('reports.dateFrom')}</label>
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">{t('reports.dateTo')}</label>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <div className="card-header" style={{ padding: '16px 20px', marginBottom: 0 }}>
          <div className="card-title">{t('financial.movementsTitle')}</div>
        </div>
        <table className="table">
          <thead>
            <tr><th>{t('common.date')}</th><th>{t('common.type')}</th><th>{t('common.description')}</th><th>{t('accountant.reference')}</th><th>{t('common.amount')}</th></tr>
          </thead>
          <tbody>
            {movements.length === 0 && !loading && (
              <tr><td colSpan="5" className="muted" style={{ textAlign: 'center', padding: 20 }}>{t('financial.noMovements')}</td></tr>
            )}
            {movements.map((m, i) => (
              <tr key={i}>
                <td className="nowrap">{dmy(m.d)}</td>
                <td><span className="badge badge-processing">{kindLabel(m.kind)}</span></td>
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
