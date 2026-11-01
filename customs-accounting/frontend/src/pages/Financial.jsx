import { useEffect, useState } from 'react';
import { financialApi } from '../utils/api.js';
import { refreshDashboard } from '../utils/refresh.js';
import { KIND_COLORS } from '../utils/format.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import RegisterPanel from '../components/RegisterPanel.jsx';

const today = () => new Date().toISOString().slice(0, 10);

export default function Financial() {
  const { t, fmt, dmy, kindLabel } = useI18n();
  const { user } = useAuth();
  // The accountant gets read-only access: owner capital and cash adjustments
  // stay in the manager's hands, but the box balance and its ledger are visible.
  const isManager = user?.role === 'manager';
  const [overview, setOverview] = useState(null);
  const [movements, setMovements] = useState([]);
  const [allMovements, setAllMovements] = useState([]);
  const [capitalRows, setCapitalRows] = useState([]);
  const [adjRows, setAdjRows] = useState([]);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);

  const [showCapitalForm, setShowCapitalForm] = useState(false);
  const [showAdjForm, setShowAdjForm] = useState(false);
  const [capitalForm, setCapitalForm] = useState({ amount: '', kind: 'deposit', source: '', txn_date: today(), notes: '' });
  const [adjForm, setAdjForm] = useState({ amount: '', kind: 'in', adj_date: today(), notes: '' });
  const [msg, setMsg] = useState('');

  const load = () => {
    setLoading(true);
    financialApi.overview().then(setOverview).catch(() => {}).finally(() => setLoading(false));
    const params = { from: dateFrom || undefined, to: dateTo || undefined };
    financialApi.movements(params).then(setMovements).catch(() => {});
    financialApi.movements().then(setAllMovements).catch(() => {});
    financialApi.capitalList().then(setCapitalRows).catch(() => {});
    financialApi.adjustmentsList().then(setAdjRows).catch(() => {});
  };

  useEffect(load, [dateFrom, dateTo]);

  const saveCapital = async (e) => {
    e.preventDefault();
    setMsg('');
    const amount = capitalForm.kind === 'withdrawal' ? -Math.abs(Number(capitalForm.amount)) : Math.abs(Number(capitalForm.amount));
    if (!amount) { setMsg(t('financial.invalidAmount')); return; }
    try {
      await financialApi.addCapital({ amount, source: capitalForm.source, txn_date: capitalForm.txn_date, notes: capitalForm.notes });
      setShowCapitalForm(false);
      setCapitalForm({ amount: '', kind: 'deposit', source: '', txn_date: today(), notes: '' });
      load();
      refreshDashboard();
    } catch (err) { setMsg(err.message); }
  };

  const saveAdj = async (e) => {
    e.preventDefault();
    setMsg('');
    const amount = adjForm.kind === 'out' ? -Math.abs(Number(adjForm.amount)) : Math.abs(Number(adjForm.amount));
    if (!amount) { setMsg(t('financial.invalidAmount')); return; }
    try {
      await financialApi.addAdjustment({ amount, adj_date: adjForm.adj_date, notes: adjForm.notes });
      setShowAdjForm(false);
      setAdjForm({ amount: '', kind: 'in', adj_date: today(), notes: '' });
      load();
      refreshDashboard();
    } catch (err) { setMsg(err.message); }
  };

  const removeCapital = async (r) => {
    if (!confirm(t('financial.confirmDeleteCapital', { amount: fmt(r.amount) }))) return;
    try { await financialApi.removeCapital(r.id); load(); refreshDashboard(); } catch (err) { alert(err.message); }
  };

  const removeAdj = async (r) => {
    if (!confirm(t('financial.confirmDeleteAdj', { amount: fmt(r.amount) }))) return;
    try { await financialApi.removeAdjustment(r.id); load(); refreshDashboard(); } catch (err) { alert(err.message); }
  };

  // Monthly box report derived from ALL movements (unfiltered) so the running balance is correct
  const monthMap = {};
  [...allMovements].slice().reverse().forEach((m) => {
    const mm = String(m.d).slice(0, 7);
    if (!monthMap[mm]) monthMap[mm] = { in: 0, out: 0 };
    if (m.amount >= 0) monthMap[mm].in += m.amount;
    else monthMap[mm].out += -m.amount;
  });
  const months = Object.keys(monthMap).sort((a, b) => b.localeCompare(a));
  let running = 0;
  const monthRows = months.map((mm) => {
    running += monthMap[mm].in - monthMap[mm].out;
    return { month: mm, in: monthMap[mm].in, out: monthMap[mm].out, net: monthMap[mm].in - monthMap[mm].out, balance: running };
  });

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">{t('financial.title')}</h1>
          <p className="page-sub">{t('financial.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isManager && (
            <>
              <button className="btn btn-primary" onClick={() => { setMsg(''); setShowAdjForm((v) => !v); setShowCapitalForm(false); }}>{t('financial.adjustBtn')}</button>
              <button className="btn btn-success" onClick={() => { setMsg(''); setShowCapitalForm((v) => !v); setShowAdjForm(false); }}>{t('financial.capitalBtn')}</button>
            </>
          )}
        </div>
      </div>

      {!isManager && (
        <div className="card" style={{ marginBottom: 16, padding: '10px 16px' }}>
          <span className="muted" style={{ fontSize: 13 }}>🔒 {t('financial.readOnly')}</span>
        </div>
      )}

      {isManager && showCapitalForm && (
        <form className="card" onSubmit={saveCapital} style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 16 }}>{t('financial.capitalFormTitle')} <span className="muted" style={{ fontWeight: 400 }}>{t('financial.capitalFormHint')}</span></h3>
          <div className="grid grid-4">
            <div className="form-row">
              <label className="form-label">{t('common.type')} *</label>
              <select className="select" value={capitalForm.kind} onChange={(e) => setCapitalForm({ ...capitalForm, kind: e.target.value })}>
                <option value="deposit">{t('financial.deposit')}</option>
                <option value="withdrawal">{t('financial.withdrawal')}</option>
              </select>
            </div>
            <div className="form-row">
              <label className="form-label">{t('common.amount')} *</label>
              <input className="input" type="number" step="0.01" min="0" value={capitalForm.amount} onChange={(e) => setCapitalForm({ ...capitalForm, amount: e.target.value })} required />
            </div>
            <div className="form-row">
              <label className="form-label">{t('financial.colSource')} *</label>
              <input className="input" value={capitalForm.source} onChange={(e) => setCapitalForm({ ...capitalForm, source: e.target.value })} placeholder={t('financial.sourcePlaceholder')} required />
            </div>
            <div className="form-row">
              <label className="form-label">{t('common.date')} *</label>
              <input className="input" type="date" value={capitalForm.txn_date} onChange={(e) => setCapitalForm({ ...capitalForm, txn_date: e.target.value })} required />
            </div>
          </div>
          <div className="grid grid-4">
            <div className="form-row">
              <label className="form-label">{t('common.notes')}</label>
              <input className="input" value={capitalForm.notes} onChange={(e) => setCapitalForm({ ...capitalForm, notes: e.target.value })} />
            </div>
          </div>
          {msg && <div className="form-error" style={{ marginTop: 0 }}>{msg}</div>}
          <button className="btn btn-success btn-sm" type="submit">{t('common.save')}</button>{' '}
          <button className="btn btn-outline btn-sm" type="button" onClick={() => setShowCapitalForm(false)}>{t('common.cancel')}</button>
        </form>
      )}

      {isManager && showAdjForm && (
        <form className="card" onSubmit={saveAdj} style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 16 }}>{t('financial.adjFormTitle')} <span className="muted" style={{ fontWeight: 400 }}>{t('financial.adjFormHint')}</span></h3>
          <div className="grid grid-4">
            <div className="form-row">
              <label className="form-label">{t('common.type')} *</label>
              <select className="select" value={adjForm.kind} onChange={(e) => setAdjForm({ ...adjForm, kind: e.target.value })}>
                <option value="in">{t('financial.cashIn')}</option>
                <option value="out">{t('financial.cashOut')}</option>
              </select>
            </div>
            <div className="form-row">
              <label className="form-label">{t('common.amount')} *</label>
              <input className="input" type="number" step="0.01" min="0" value={adjForm.amount} onChange={(e) => setAdjForm({ ...adjForm, amount: e.target.value })} required />
            </div>
            <div className="form-row">
              <label className="form-label">{t('common.date')} *</label>
              <input className="input" type="date" value={adjForm.adj_date} onChange={(e) => setAdjForm({ ...adjForm, adj_date: e.target.value })} required />
            </div>
            <div className="form-row">
              <label className="form-label">{t('common.notes')}</label>
              <input className="input" value={adjForm.notes} onChange={(e) => setAdjForm({ ...adjForm, notes: e.target.value })} placeholder={t('financial.adjNotesPlaceholder')} />
            </div>
          </div>
          {msg && <div className="form-error" style={{ marginTop: 0 }}>{msg}</div>}
          <button className="btn btn-success btn-sm" type="submit">{t('common.save')}</button>{' '}
          <button className="btn btn-outline btn-sm" type="button" onClick={() => setShowAdjForm(false)}>{t('common.cancel')}</button>
        </form>
      )}

      {/* Cash register open/close */}
      {/* <RegisterPanel /> */}

      {/* Summary cards */}
      <div className="grid grid-4" style={{ marginBottom: 8 }}>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#8b5cf6' }}>{fmt(overview?.capital_invested)}</div>
          <div className="stat-label">{t('financial.capitalInvested')}</div>
          <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>{t('financial.capitalInvestedSub')}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: Number(overview?.cash_box) >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(overview?.cash_box)}</div>
          <div className="stat-label">{t('financial.cashBox')}</div>
          <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>{t('financial.cashBoxSub')}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#f59e0b' }}>{fmt((Number(overview?.old_debts)||0) + (Number(overview?.customer_debt)||0))}</div>
          <div className="stat-label">{t('financial.debtsTotal')}</div>
          <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>{t('financial.debtsTotalSub')}</div>
        </div>
      </div>
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: Number(overview?.customer_debt) > 0 ? '#dc2626' : Number(overview?.customer_debt) < 0 ? '#f59e0b' : '#16a34a' }}>{fmt(overview?.customer_debt)}</div>
          <div className="stat-label">{Number(overview?.customer_debt) > 0 ? t('financial.customerDebtPositive') : Number(overview?.customer_debt) < 0 ? t('financial.customerDebtNegative') : t('financial.customerDebtBalanced')}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#2563eb' }}>{fmt(overview?.total_container_costs)}</div>
          <div className="stat-label">{t('financial.containerCosts')}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#64748b' }}>{fmt(overview?.total_general_expenses)}</div>
          <div className="stat-label">{t('financial.generalExpenses')}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#d946ef' }}>{fmt(overview?.total_salary_paid)}</div>
          <div className="stat-label">{t('financial.salariesPaid')}</div>
        </div>
      </div>

      {/* Model explanation */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <b>{t('financial.howTitle')}</b>
        </div>
        <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>
          <b>{t('financial.howCapitalTerm')}</b>{t('financial.howCapitalText')}
          <br />
          <b>{t('financial.howCashTerm')}</b>{t('financial.howCashText')}
          <br />
          <b>{t('financial.howOperatingTerm')}</b>{t('financial.howOperatingText')}
          <br />
          {t('financial.howTrackersA')} <b>{t('financial.howTrackersBold')}</b>{t('financial.howTrackersB')}
        </p>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        {/* Movements ledger */}
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px 0', flexWrap: 'wrap', gap: 8 }}>
            <h3>{t('financial.movementsTitle')}</h3>
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="input" type="date" style={{ width: 120 }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              <input className="input" type="date" style={{ width: 120 }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
          <div className="table-scroll" style={{ padding: 12 }}>
            <table className="table tbl-movement">
              <thead>
                <tr><th>{t('common.date')}</th><th>{t('financial.colMovement')}</th><th>{t('common.description')}</th><th>{t('common.amount')}</th></tr>
              </thead>
              <tbody>
                {movements.length === 0 && !loading && (
                  <tr><td colSpan="4" className="muted" style={{ textAlign: 'center', padding: 20 }}>{t('financial.noMovements')}</td></tr>
                )}
                {movements.map((m, i) => {
                  const color = KIND_COLORS[m.kind] || '#64748b';
                  return (
                    <tr key={i}>
                      <td className="nowrap muted">{dmy(m.d)}</td>
                      <td><span style={{ background: color + '1a', color, fontWeight: 700, padding: '2px 8px', borderRadius: 6 }}>{kindLabel(m.kind)}</span></td>
                      <td>{m.descr}{m.ref ? <span className="muted"> — {m.ref}</span> : null}</td>
                      <td className="nowrap" style={{ fontWeight: 700, color: m.amount >= 0 ? '#16a34a' : '#dc2626' }}>
                        {m.amount >= 0 ? '+' : ''}{fmt(m.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Monthly box report */}
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <h3 style={{ padding: '16px 20px 0' }}>{t('financial.monthlyTitle')}</h3>
          <div className="table-scroll" style={{ padding: 12 }}>
            <table className="table tbl-monthly">
              <thead>
                <tr><th>{t('financial.colMonth')}</th><th>{t('financial.colIn')}</th><th>{t('financial.colOut')}</th><th>{t('financial.colNetMonth')}</th><th>{t('financial.colRunningBalance')}</th></tr>
              </thead>
              <tbody>
                {monthRows.length === 0 && (
                  <tr><td colSpan="5" className="muted" style={{ textAlign: 'center', padding: 20 }}>{t('financial.noMonthlyData')}</td></tr>
                )}
                {monthRows.map((m) => (
                  <tr key={m.month}>
                    <td><b>{m.month}</b></td>
                    <td style={{ color: '#16a34a', fontWeight: 700 }}>+{fmt(m.in)}</td>
                    <td style={{ color: '#dc2626', fontWeight: 700 }}>−{fmt(m.out)}</td>
                    <td style={{ color: m.net >= 0 ? '#16a34a' : '#dc2626', fontWeight: 700 }}>{fmt(m.net)}</td>
                    <td style={{ fontWeight: 800 }}>{fmt(m.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid-2">
        {/* Capital transactions */}
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <h3 style={{ padding: '16px 20px 0' }}>{t('financial.capitalTitle')}</h3>
          <div className="table-scroll" style={{ padding: 12 }}>
            <table className="table tbl-capital">
              <thead>
                <tr><th>{t('common.date')}</th><th>{t('common.type')}</th><th>{t('financial.colSource')}</th><th>{t('common.amount')}</th><th>{t('common.notes')}</th>{isManager && <th></th>}</tr>
              </thead>
              <tbody>
                {capitalRows.length === 0 && (
                  <tr><td colSpan={isManager ? 6 : 5} className="muted" style={{ textAlign: 'center', padding: 20 }}>{t('financial.noCapital')}</td></tr>
                )}
                {capitalRows.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap">{dmy(r.txn_date)}</td>
                    <td>{r.amount > 0 ? <span className="badge badge-paid">{t('financial.deposit')}</span> : <span className="badge badge-processing">{t('financial.withdrawal')}</span>}</td>
                    <td className="nowrap" style={{ fontWeight: 700 }}>{r.source || t('financial.ownerFunds')}</td>
                    <td className="nowrap" style={{ fontWeight: 700, color: r.amount >= 0 ? '#16a34a' : '#dc2626' }}>{r.amount >= 0 ? '+' : ''}{fmt(r.amount)}</td>
                    <td className="muted">{r.notes || '—'}</td>
                    {isManager && <td><button className="btn btn-danger btn-sm" onClick={() => removeCapital(r)}>{t('common.delete')}</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Cashbox adjustments */}
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <h3 style={{ padding: '16px 20px 0' }}>{t('financial.adjTitle')} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{t('financial.adjSubtitle')}</span></h3>
          <div className="table-scroll" style={{ padding: 12 }}>
            <table className="table tbl-adjustment">
              <thead>
                <tr><th>{t('common.date')}</th><th>{t('common.type')}</th><th>{t('common.amount')}</th><th>{t('common.notes')}</th>{isManager && <th></th>}</tr>
              </thead>
              <tbody>
                {adjRows.length === 0 && (
                  <tr><td colSpan={isManager ? 5 : 4} className="muted" style={{ textAlign: 'center', padding: 20 }}>{t('financial.noAdjustments')}</td></tr>
                )}
                {adjRows.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap">{dmy(r.adj_date)}</td>
                    <td>{r.amount > 0 ? <span className="badge badge-paid">{t('financial.addShort')}</span> : <span className="badge badge-processing">{t('financial.deductShort')}</span>}</td>
                    <td className="nowrap" style={{ fontWeight: 700, color: r.amount >= 0 ? '#16a34a' : '#dc2626' }}>{r.amount >= 0 ? '+' : ''}{fmt(r.amount)}</td>
                    <td className="muted">{r.notes || '—'}</td>
                    {isManager && <td><button className="btn btn-danger btn-sm" onClick={() => removeAdj(r)}>{t('common.delete')}</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
