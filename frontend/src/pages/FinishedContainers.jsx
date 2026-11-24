import { useEffect, useState } from 'react';
import { containersApi } from '../utils/api.js';
import { refreshDashboard } from '../utils/refresh.js';
import { useI18n } from '../i18n/I18nContext.jsx';

export default function FinishedContainers() {
  const { t, fmt, dmy, statusLabel } = useI18n();
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
    if (!confirm(t('finished.reopenConfirm', { bl: c.bl_number }))) return;
    setBusyId(c.id);
    try {
      await containersApi.reopen(c.id);
      load();
      refreshDashboard();
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
          <h1 className="page-title">{t('finished.title')}</h1>
          <p className="page-sub">{t('finished.subtitle')}</p>
        </div>
        <div className="muted">{loading ? t('common.loading') : t('finished.containerCount', { count: rows.length })}</div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#dc2626' }}>{fmt(totalCosts)}</div>
          <div className="stat-label">{t('finished.totalCosts')}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{fmt(totalRevenue)}</div>
          <div className="stat-label">{t('finished.totalRevenue')}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#16a34a' }}>{fmt(totalProfit)}</div>
          <div className="stat-label">{t('finished.totalProfit')}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>BL</th><th>{t('finished.colContainer')}</th><th>{t('common.customer')}</th><th>{t('common.date')}</th>
              <th>{t('finished.colCosts')}</th><th>{t('finished.colFinalPrice')}</th><th>{t('finished.colProfit')}</th><th>{t('common.status')}</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr><td colSpan="8" className="muted" style={{ textAlign: 'center', padding: 20 }}>{t('finished.empty')}</td></tr>
            )}
            {rows.map((c) => {
              const priced = c.final_price != null;
              return (
                <tr key={c.id}>
                  <td className="nowrap"><b>{c.bl_number}</b></td>
                  <td>{c.container_number}</td>
                  <td>{c.customer_name}</td>
                  <td className="nowrap">{dmy(c.registration_date)}</td>
                  <td className="nowrap">{fmt(c.total_costs)}</td>
                  <td className="nowrap">{priced ? <b>{fmt(c.final_price)}</b> : <span className="muted">{t('finished.notPriced')}</span>}</td>
                  <td className="nowrap">{priced ? <b style={{ color: c.profit >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(c.profit)}</b> : <span className="muted">—</span>}</td>
                  <td>
                    <span className={`badge badge-${c.status}`}>
                      {statusLabel(c.status)}{priced ? '' : t('finished.notPricedSuffix')}
                    </span>
                  </td>
                  <td className="nowrap">
                    <button className="btn btn-outline btn-sm" disabled={busyId === c.id} onClick={() => reopen(c)} title={t('finished.reopenTitle')}>
                      {busyId === c.id ? t('finished.busy') : `🔧 ${t('finished.reopen')}`}
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
