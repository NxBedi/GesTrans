import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import { reportsApi, containersApi } from '../utils/api.js';
import { refreshDashboard, onDashboardRefresh } from '../utils/refresh.js';
import { fmt } from '../utils/format.js';
import AccountantDashboard from '../components/AccountantDashboard.jsx';

export { fmt };

const pctOf = (cur, prev) => (cur === 0 && prev === 0 ? 0 : prev === 0 ? 100 : Math.round(((cur - prev) / Math.abs(prev)) * 100));

export default function Dashboard() {
  const { user } = useAuth();
  const { t, dmy, money: moneyFmt, statusLabel } = useI18n();
  const isManager = user?.role === 'manager';
  const isAccountant = user?.role === 'accountant';
  const [dash, setDash] = useState(null);
  const [recent, setRecent] = useState([]);
  const [recentPay, setRecentPay] = useState([]);

  useEffect(() => {
    const fetchAll = () => {
      if (isManager) reportsApi.dashboard().then(setDash).catch(() => {});
      containersApi.list({ all: 1 }).then((rows) => setRecent(rows.slice(0, 8))).catch(() => {});
      if (isManager) reportsApi.recentPayments().then((p) => setRecentPay(p.recent || [])).catch(() => {});
    };
    fetchAll();
    const onFocus = () => fetchAll();
    window.addEventListener('focus', onFocus);
    const offRefresh = onDashboardRefresh(fetchAll);
    return () => {
      window.removeEventListener('focus', onFocus);
      offRefresh();
    };
  }, [user]);

  // KPI: cash + flows with previous-period comparison
  const kpis = useMemo(() => {
    const d = dash;
    if (!d) return null;
    const incomeUp = (d.income_change_pct ?? 0) >= 0;
    const expUp = (d.expense_change_pct ?? 0) >= 0;
    const vsYesterday = (pct) => t('dashboard.vsYesterday', { pct: `${pct > 0 ? '+' : ''}${pct}%` });
    return [
      { ico: '💰', bg: '#f0fdf4', lbl: t('dashboard.cash'), val: moneyFmt(d.cash_in_hand), sub: t('dashboard.cashSub'), color: '#16a34a', link: '/financial', linkTitle: t('dashboard.openCashbox') },
      { ico: '📥', bg: '#eff6ff', lbl: t('dashboard.todayIncome'), val: moneyFmt(d.today?.income), sub: vsYesterday(d.income_change_pct), delta: `${d.income_change_pct > 0 ? '+' : ''}${d.income_change_pct}%`, deltaCls: incomeUp ? 'up' : 'down', link: '/financial', linkTitle: t('dashboard.openCashbox') },
      { ico: '📤', bg: '#fef2f2', lbl: t('dashboard.todayExpense'), val: moneyFmt(d.today?.expense), sub: vsYesterday(d.expense_change_pct), delta: `${d.expense_change_pct > 0 ? '+' : ''}${d.expense_change_pct}%`, deltaCls: expUp ? 'down' : 'up', link: '/financial', linkTitle: t('dashboard.openCashbox') },
      { ico: '⚖️', bg: '#f5f3ff', lbl: t('dashboard.todayNet'), val: moneyFmt(d.today?.net), sub: t('dashboard.netSub'), color: d.today?.net >= 0 ? '#16a34a' : '#dc2626', link: '/financial', linkTitle: t('dashboard.openCashbox') },
    ];
  }, [dash, t]);

  const debtKpis = useMemo(() => {
    const d = dash?.debts;
    if (!d) return null;
    const c = dash?.containers;
    const ex = dash?.expenses;
    return [
      { ico: '📒', bg: '#fef2f2', lbl: t('dashboard.totalDebts'), val: moneyFmt(d.total), sub: t('dashboard.debtorsCount', { count: d.debtors }), link: '/debts', linkTitle: t('dashboard.openDebts') },
      { ico: '⏰', bg: '#fff7ed', lbl: t('dashboard.overdueDebts'), val: moneyFmt(d.overdue_amount), sub: t('dashboard.overdueCount', { count: d.overdue_count }), color: '#d97706', link: '/debts', linkTitle: t('dashboard.openDebts') },
      { ico: '📉', bg: '#fef2f2', lbl: t('dashboard.totalExpenses'), val: moneyFmt(dash?.total_expenses ?? ex?.total), sub: t('dashboard.expensesSub'), linkTitle: t('dashboard.expensesBreakdown', { institution: moneyFmt(ex?.institution), salaries: moneyFmt(ex?.salaries) }) },
      { ico: '📦', bg: '#eff6ff', lbl: t('dashboard.runningContainers'), val: c?.present || 0, sub: t('dashboard.runningSub'), link: '/containers', linkTitle: t('dashboard.openContainers') },
      { ico: '🔒', bg: '#f0fdf4', lbl: t('dashboard.readyForPricing'), val: c?.in_transit || 0, sub: t('dashboard.readySub'), link: '/pricing-queue', linkTitle: t('dashboard.openPricing') },
      { ico: '✅', bg: '#f5f3ff', lbl: t('dashboard.pricedContainers'), val: c?.received || 0, sub: t('dashboard.pricedSub'), link: '/finished', linkTitle: t('dashboard.openFinished') },
      { ico: '🏁', bg: '#e0f2fe', lbl: t('dashboard.settledContainers'), val: c?.liquidated ?? ((c?.closed || 0) + (c?.priced || 0)), sub: t('dashboard.settledSub'), link: '/containers', linkTitle: t('dashboard.openContainers') },
      { ico: '🧾', bg: '#f0f9ff', lbl: t('dashboard.containerProfit'), val: moneyFmt(dash?.container_profit ?? dash?.container_profits ?? dash?.profit_total), sub: t('dashboard.billedSub', { amount: moneyFmt(dash?.billed_total) }), link: '/finished', linkTitle: t('dashboard.openFinished') },
    ];
  }, [dash, t]);

  if (isAccountant) {
    return <AccountantDashboard />;
  }

  if (!isManager) {
    return (
      <div className="page">
        <h1 className="page-title">{t('dashboard.welcome', { name: user?.full_name })}</h1>
        <p className="page-sub">{t('dashboard.latestContainers')}</p>
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <ContainerTable rows={recent} />
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">{t('dashboard.title')}</h1>
          <p className="page-sub">{t('dashboard.subtitle')}</p>
        </div>
        <div className="tabs" style={{ pointerEvents: 'none', opacity: 0.9 }}>
          <span className="tab active">{t('dashboard.dailySummary')}</span>
        </div>
      </div>

      {!dash && <div className="empty-state"><span className="spinner" /></div>}

      {kpis && (
        <div className="kpi-grid" style={{ marginBottom: 18 }}>
          {kpis.map((k, i) => <KpiCard key={i} k={k} />)}
        </div>
      )}

      {debtKpis && (
        <div className="kpi-grid" style={{ marginBottom: 18 }}>
          {debtKpis.map((k, i) => <KpiCard key={`d${i}`} k={k} />)}
        </div>
      )}

      <div className="grid grid-2" style={{ marginBottom: 18 }}>
        {/* Containers status breakdown */}
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <div className="card-header" style={{ padding: '16px 18px', marginBottom: 0 }}>
            <div className="card-title">{t('dashboard.containersByStatus')}</div>
            <Link to="/containers" className="btn btn-outline btn-sm">{t('common.viewAll')}</Link>
          </div>
          <div style={{ padding: 12 }}>
            <StatusBar data={dash?.containers} />
          </div>
        </div>
        {/* Recent payments */}
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <div className="card-header" style={{ padding: '16px 18px', marginBottom: 0 }}>
            <div className="card-title">{t('dashboard.recentPayments')}</div>
            <Link to="/reports" className="btn btn-outline btn-sm">{t('dashboard.paymentsReport')}</Link>
          </div>
          <div style={{ padding: 12 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('common.customer')}</th>
                  <th>{t('common.date')}</th>
                  <th>{t('common.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {recentPay.length === 0 && (
                  <tr>
                    <td colSpan="3" className="muted" style={{ textAlign: 'center', padding: 20 }}>
                      {t('dashboard.noPayments')}
                    </td>
                  </tr>
                )}
                {recentPay.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 700 }}>{p.customer_name}</td>
                    <td className="nowrap">{dmy(p.payment_date)}</td>
                    <td className="nowrap" style={{ color: '#16a34a', fontWeight: 800 }}>{fmt(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <div className="card-header" style={{ padding: '16px 18px', marginBottom: 0 }}>
          <div className="card-title">{t('dashboard.latestRegistered')}</div>
          <Link to="/containers" className="btn btn-outline btn-sm">{t('common.viewAll')}</Link>
        </div>
        <ContainerTable rows={recent} />
      </div>
    </div>
  );
}

function KpiCard({ k }) {
  const { t } = useI18n();
  const content = (
    <>
      <div className="kpi-icon" style={{ background: k.bg }}>{k.ico}</div>
      <div className="kpi-body">
        <div className="kpi-label">
          {k.lbl}
          {k.delta != null && <span className={`kpi-delta ${k.deltaCls}`}>{k.delta}</span>}
        </div>
        <div className="kpi-value" style={{ color: k.color || undefined }}>{k.val}</div>
        {k.sub && <div className="kpi-sub">{k.sub}</div>}
      </div>
    </>
  );
  return k.link ? (
    <Link to={k.link} className="kpi-card kpi-link" title={k.linkTitle || t('common.openList')}>
      {content}
    </Link>
  ) : (
    <div className="kpi-card" title={k.linkTitle || undefined}>{content}</div>
  );
}

function StatusBar({ data }) {
  const { t } = useI18n();
  if (!data) return <div className="empty-state"><span className="spinner" /></div>;
  const segs = [
    { v: data.by_status?.registered || 0, l: t('status.registeredShort'), c: '#94a3b8' },
    { v: data.by_status?.processing || 0, l: t('status.processingShort'), c: '#3b82f6' },
    { v: data.by_status?.closed || 0, l: t('status.closedShort'), c: '#0ea5e9' },
    { v: data.by_status?.priced || 0, l: t('status.pricedShort'), c: '#10b981' },
  ].filter((s) => s.v > 0);
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 120, padding: '0 4px' }}>
        {segs.length === 0 && <div className="muted" style={{ textAlign: 'center', width: '100%' }}>{t('dashboard.noContainersInStatus')}</div>}
        {segs.map((s, i) => (
          <div key={i} style={{ flex: s.v, minWidth: 30, maxWidth: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end' }}>
            <div style={{ width: '70%', background: s.c, borderRadius: 6, height: Math.max(8, (s.v / Math.max(...segs.map((x) => x.v))) * 90), transition: 'height .3s' }} />
            <div style={{ fontSize: 11, color: '#334155', fontWeight: 800, marginTop: 6 }}>{s.v}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{s.l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ContainerTable({ rows, onClose = null }) {
  const { t, dmy, statusLabel } = useI18n();
  if (!rows.length) return <p className="muted" style={{ textAlign: 'center', padding: 20 }}>{t('common.noData')}</p>;
  return (
    <table className="table">
      <thead>
        <tr>
          <th>BL</th>
          <th>{t('dashboard.colContainer')}</th>
          <th>{t('common.type')}</th>
          <th>{t('common.customer')}</th>
          <th>{t('common.date')}</th>
          <th>{t('common.status')}</th>
          {onClose && <th>{t('common.actions')}</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.id}>
            <td className="nowrap"><b>{c.bl_number}</b></td>
            <td>{c.container_number}</td>
            <td className="nowrap">{c.container_type ? `${c.container_type}′` : '—'}</td>
            <td>{c.customer_name}</td>
            <td className="nowrap">{dmy(c.registration_date)}</td>
            <td><span className={`badge badge-${c.status}`}>{statusLabel(c.status)}</span></td>
            {onClose && ['registered', 'processing'].includes(c.status) && (
              <td><button className="btn btn-danger btn-sm" onClick={() => onClose(c)}>{t('common.close')}</button></td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
