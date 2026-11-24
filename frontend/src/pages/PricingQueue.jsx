import { useEffect, useState } from 'react';
import { containersApi } from '../utils/api.js';
import { refreshDashboard } from '../utils/refresh.js';
import { useI18n } from '../i18n/I18nContext.jsx';

export default function PricingQueue() {
  const { t, fmt, dmy } = useI18n();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [msg, setMsg] = useState({});

  const load = () => {
    setLoading(true);
    containersApi.readyForPricing().then(setRows).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openForm = (c) => {
    setOpenId(c.id);
    setPrice('');
    setNotes('');
    setMsg({});
  };

  const submit = async (c, e) => {
    e.preventDefault();
    setSavingId(c.id);
    setMsg({});
    try {
      await containersApi.setPricing(c.id, { final_price: price, notes });
      setOpenId(null);
      load();
      refreshDashboard();
    } catch (err) {
      setMsg({ [c.id]: err.message });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">{t('pricing.title')}</h1>
          <p className="page-sub">{t('pricing.subtitle')}</p>
        </div>
        <div className="muted">{loading ? t('common.loading') : t('pricing.containerCount', { count: rows.length })}</div>
      </div>

      {rows.length === 0 && !loading && (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ fontSize: 16 }}>✅ {t('pricing.emptyTitle')}</p>
          <p className="muted">{t('pricing.emptySub')}</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows.map((c) => (
          <div className="card" key={c.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <b style={{ fontSize: 16 }}>{c.bl_number}</b>{' '}
                <span className="badge badge-paid">{c.container_number}</span>
                <div className="muted" style={{ marginTop: 4 }}>
                  {c.customer_name} • {dmy(c.registration_date)} • {t('pricing.invoiceCount', { count: c.invoice_count })}
                </div>
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 15 }}>{t('pricing.costs')}: <b>{fmt(c.total_costs)}</b></div>
              </div>
            </div>

            {openId !== c.id ? (
              <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => openForm(c)}>
                💰 {t('pricing.setFinalPrice')}
              </button>
            ) : (
              <form onSubmit={(e) => submit(c, e)} style={{ marginTop: 14, borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
                <div className="grid grid-3">
                  <div className="form-row" style={{ marginBottom: 0 }}>
                    <label className="form-label">{t('pricing.finalPriceLabel')}</label>
                    <input className="input" type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} required autoFocus />
                  </div>
                  <div className="form-row" style={{ marginBottom: 0 }}>
                    <label className="form-label">{t('common.notes')}</label>
                    <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </div>
                  <div className="form-row" style={{ marginBottom: 0, display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                    <button className="btn btn-success btn-sm" disabled={savingId === c.id} type="submit">
                      {savingId === c.id ? t('pricing.saving') : t('pricing.savePricing')}
                    </button>
                    <button className="btn btn-outline btn-sm" type="button" onClick={() => setOpenId(null)}>{t('common.cancel')}</button>
                  </div>
                </div>
                {price !== '' && (
                  <div className="muted" style={{ marginTop: 8 }}>
                    {t('pricing.expectedProfit')}: <b style={{ color: Number(price) - Number(c.total_costs) >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(Number(price) - Number(c.total_costs))}</b>
                  </div>
                )}
                {msg[c.id] && <div className="form-error" style={{ marginTop: 8 }}>{msg[c.id]}</div>}
              </form>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
