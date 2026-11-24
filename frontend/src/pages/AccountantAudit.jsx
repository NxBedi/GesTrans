import { useEffect, useState } from 'react';
import { accountantApi } from '../utils/api.js';
import { useI18n } from '../i18n/I18nContext.jsx';
import { downloadCsv } from '../utils/accountant.js';

const ACTION_KEYS = {
  create: 'common.add',
  update: 'common.edit',
  reverse: 'accountant.reverse',
  delete: 'common.delete',
};

const ENTITY_KEYS = {
  general_expense: 'kinds.expense',
  salary_transaction: 'kinds.salary',
};

export default function AccountantAudit() {
  const { t, dtm, roleLabel } = useI18n();
  const actionLabels = Object.fromEntries(Object.entries(ACTION_KEYS).map(([k, key]) => [k, t(key)]));
  const entityLabels = Object.fromEntries(Object.entries(ENTITY_KEYS).map(([k, key]) => [k, t(key)]));
  const [rows, setRows] = useState([]);
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    accountantApi.audit({
      action: action || undefined,
      entity_type: entityType || undefined,
      from: from || undefined,
      to: to || undefined,
      limit: 300,
    }).then(setRows).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [action, entityType, from, to]);

  const exportCsv = () => {
    downloadCsv(
      t('nav.accountantAudit'),
      [
        { key: 'created_at', label: t('accountant.dateTime') },
        { key: 'actor_name', label: t('auth.username') },
        { key: 'actor_role', label: t('users.role') },
        { key: 'action', label: t('common.actions'), get: (r) => actionLabels[r.action] || r.action },
        { key: 'entity_type', label: t('common.type'), get: (r) => entityLabels[r.entity_type] || r.entity_type },
        { key: 'entity_id', label: t('accountant.recordNumber') },
        { key: 'details', label: t('common.details'), get: (r) => (r.details ? JSON.stringify(r.details) : '') },
      ],
      rows
    );
  };

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">{t('nav.accountantAudit')}</h1>
          <p className="page-sub">{t('accountant.auditSubtitle')}</p>
        </div>
        <button className="btn btn-outline" onClick={exportCsv}>⬇️ {t('common.export')} CSV</button>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">{t('common.actions')}</label>
          <select className="select" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">{t('common.all')}</option>
            <option value="create">{t('common.add')}</option>
            <option value="update">{t('common.edit')}</option>
            <option value="reverse">{t('accountant.reverse')}</option>
          </select>
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">{t('common.type')}</label>
          <select className="select" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
            <option value="">{t('common.all')}</option>
            <option value="general_expense">{t('kinds.expense')}</option>
            <option value="salary_transaction">{t('kinds.salary')}</option>
          </select>
        </div>
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
          <div className="card-title">{t('generalExpenses.operationsCount')} ({rows.length})</div>
        </div>
        <table className="table">
          <thead>
            <tr><th>{t('accountant.dateTime')}</th><th>{t('auth.username')}</th><th>{t('users.role')}</th><th>{t('common.actions')}</th><th>{t('accountant.recordNumber')}</th><th>{t('common.details')}</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr><td colSpan="6" className="muted" style={{ textAlign: 'center', padding: 20 }}>{t('salary.export.noMovesRecorded')}</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="nowrap">{dtm(r.created_at)}</td>
                <td><b>{r.actor_name || '—'}</b></td>
                <td>{roleLabel(r.actor_role)}</td>
                <td>
                  <span className={r.action === 'reverse' ? 'badge badge-warning' : 'badge badge-paid'}>
                    {actionLabels[r.action] || r.action}
                  </span>
                </td>
                <td className="nowrap">{entityLabels[r.entity_type] || r.entity_type} #{r.entity_id}</td>
                <td className="muted" style={{ fontSize: 12, maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.details ? JSON.stringify(r.details) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
