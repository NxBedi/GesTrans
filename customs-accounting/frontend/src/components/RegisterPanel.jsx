import { useEffect, useState } from 'react';
import { financialApi } from '../utils/api.js';
import { useFeedback } from '../components/Feedback.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function RegisterPanel() {
  const { toast, confirm } = useFeedback();
  const { t, fmt, money, dmy } = useI18n();
  const [session, setSession] = useState(null);
  const [history, setHistory] = useState([]);
  const [openForm, setOpenForm] = useState({ opening_balance: '', notes: '' });
  const [closeForm, setCloseForm] = useState({ actual_closing: '', notes: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    financialApi.registerCurrent().then(setSession).catch(() => {});
    financialApi.registerHistory().then(setHistory).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const openRegister = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const s = await financialApi.registerOpen({ ...openForm, notes: openForm.notes || null });
      toast(t('containers.registerOpened'));
      setOpenForm({ opening_balance: '', notes: '' });
      load();
    } catch (err2) { setErr(err2.message); }
    finally { setBusy(false); }
  };

  const closeRegister = async (e) => {
    e.preventDefault();
    setErr('');
    if (!(await confirm(
      t('containers.confirmClose', {
        expected: money(session?.expected_closing),
        actual: money(closeForm.actual_closing),
      }),
      { okLabel: t('containers.closeSession') }
    ))) return;
    setBusy(true);
    try {
      const s = await financialApi.registerClose({ ...closeForm, notes: closeForm.notes || null });
      const diff = Number(s.difference);
      toast(diff === 0
        ? t('containers.closeSuccess')
        : t('containers.closeDifference', {
            amount: money(Math.abs(diff)),
            extra: diff > 0 ? t('containers.closeSurplus') : t('containers.closeShortage'),
          }), 'info');
      setCloseForm({ actual_closing: '', notes: '' });
      load();
    } catch (err2) { setErr(err2.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="card" style={{ marginBottom: 16, border: session ? '1px solid #bbf7d0' : '1px solid var(--border)' }}>
      <div className="card-header">
        <div className="card-title">
          {t('containers.registerTitle')}
          {session ? (
            <span className="badge badge-paid" style={{ marginInlineStart: 8 }}>{t('containers.openedSince', { date: dmy(session.opened_at) })}</span>
          ) : (
            <span className="badge badge-processing" style={{ marginInlineStart: 8 }}>{t('containers.closedOpenToday')}</span>
          )}
        </div>
        <span className="kpi-sub" style={{ fontSize: 12 }}>{t('containers.registerSubtitle')}</span>
      </div>

      {session ? (
        <div>
          <div className="kpi-grid" style={{ marginBottom: 14 }}>
            <div className="kpi-card"><div className="kpi-icon" style={{ background: 'var(--green-50)' }}>🪙</div>
              <div className="kpi-body"><div className="kpi-label">{t('containers.openingBalance')}</div><div className="kpi-value">{fmt(session.opening_balance)}</div></div></div>
            <div className="kpi-card"><div className="kpi-icon" style={{ background: 'var(--primary-50)' }}>⚖️</div>
              <div className="kpi-body"><div className="kpi-label">{t('containers.netSinceOpen')}</div><div className="kpi-value">{fmt(session.current_net)}</div></div></div>
            <div className="kpi-card"><div className="kpi-icon" style={{ background: '#f5f3ff' }}>🧾</div>
              <div className="kpi-body"><div className="kpi-label">{t('containers.expectedClosing')}</div>
                <div className="kpi-value" style={{ color: 'var(--primary)' }}>{fmt(session.expected_closing)}</div>
                <div className="kpi-sub">{t('containers.openingPlusMovements')}</div></div></div>
            <div className="kpi-card"><div className="kpi-icon" style={{ background: 'var(--amber-50)' }}>🙋</div>
              <div className="kpi-body"><div className="kpi-label">{t('containers.openedBy')}</div><div className="kpi-value" style={{ fontSize: 16 }}>{session.opened_by_name || '—'}</div></div></div>
          </div>

          <form onSubmit={closeRegister} className="grid grid-3" style={{ gap: 12, alignItems: 'end' }}>
            <div className="form-row" style={{ marginBottom: 0 }}>
              <label className="form-label">{t('containers.actualAfterCount')}</label>
              <input className="input" type="number" step="0.01" min="0" dir="ltr" placeholder={String(session.expected_closing)} value={closeForm.actual_closing} onChange={(e) => setCloseForm({ ...closeForm, actual_closing: e.target.value })} required />
            </div>
            <div className="form-row" style={{ marginBottom: 0 }}>
              <label className="form-label">{t('containers.closeNotes')}</label>
              <input className="input" value={closeForm.notes} onChange={(e) => setCloseForm({ ...closeForm, notes: e.target.value })} placeholder={t('containers.closeNotesPlaceholder')} />
            </div>
            <div className="form-row" style={{ marginBottom: 0 }}>
              <button className="btn btn-danger" style={{ width: '100%' }} disabled={busy}>{busy ? '...' : t('containers.closeToday')}</button>
            </div>
            {err && <div className="form-error" style={{ gridColumn: '1 / -1' }}>{err}</div>}
          </form>
        </div>
      ) : (
        <form onSubmit={openRegister} className="grid grid-3" style={{ gap: 12, alignItems: 'end' }}>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label className="form-label">{t('containers.openingBalanceCash')}</label>
            <input className="input" type="number" step="0.01" min="0" dir="ltr" value={openForm.opening_balance} onChange={(e) => setOpenForm({ ...openForm, opening_balance: e.target.value })} required />
          </div>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label className="form-label">{t('common.notes')}</label>
            <input className="input" value={openForm.notes} onChange={(e) => setOpenForm({ ...openForm, notes: e.target.value })} placeholder={t('containers.openNotesPlaceholder')} />
          </div>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>{busy ? '...' : t('containers.openToday')}</button>
          </div>
          {err && <div className="form-error" style={{ gridColumn: '1 / -1' }}>{err}</div>}
        </form>
      )}

      {history.length > 0 && (
        <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div className="card-title" style={{ fontSize: 14, marginBottom: 8 }}>{t('containers.sessionsHistory')}</div>
          <div className="table-scroll">
            <table className="table tbl-register">
              <thead><tr><th>{t('containers.colOpened')}</th><th>{t('containers.colClosed')}</th><th>{t('containers.colOpening')}</th><th>{t('containers.colExpected')}</th><th>{t('containers.colActual')}</th><th>{t('containers.colDifference')}</th><th>{t('containers.colBy')}</th></tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="nowrap">{dmy(h.opened_at)}</td>
                    <td className="nowrap">{dmy(h.closed_at)}</td>
                    <td className="nowrap">{fmt(h.opening_balance)}</td>
                    <td className="nowrap">{fmt(h.expected_closing)}</td>
                    <td className="nowrap">{fmt(h.actual_closing)}</td>
                    <td className="nowrap" style={{ fontWeight: 800, color: h.difference >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {h.difference >= 0 ? '+' : ''}{fmt(h.difference)}
                    </td>
                    <td>{h.opened_by_name || h.closed_by_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
