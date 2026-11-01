import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { customersApi } from '../utils/api.js';
import AccountStatement from '../components/AccountStatement.jsx';
import { useFeedback } from '../components/Feedback.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import { refreshDashboard } from '../utils/refresh.js';

export default function Customers() {
  const { user } = useAuth();
  const { t, fmt } = useI18n();
  const { toast, confirm } = useFeedback();
  const isManager = user?.role === 'manager';
  const [rows, setRows] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', address: '', notes: '', opening_balance: '' });
  const [msg, setMsg] = useState('');
  const [stmtCustomer, setStmtCustomer] = useState(null);

  const load = () => customersApi.list().then(setRows).catch(() => {});
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditId(null); setForm({ name: '', phone: '', address: '', notes: '', opening_balance: '' }); setShowForm(true); setMsg(''); };
  const openEdit = (c) => { setEditId(c.id); setForm({ name: c.name, phone: c.phone || '', address: c.address || '', notes: c.notes || '', opening_balance: c.opening_balance != null ? String(c.opening_balance) : '' }); setShowForm(true); setMsg(''); };

  const save = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      if (editId) await customersApi.update(editId, { ...form, is_active: true });
      else await customersApi.create(form);
      setShowForm(false);
      toast(t('common.saved'));
      load();
      refreshDashboard();
    } catch (err) { setMsg(err.message); }
  };

  const remove = async (c) => {
    if (!(await confirm(t('customers.confirmDelete', { name: c.name }), { danger: true, okLabel: t('common.delete') }))) return;
    try {
      await customersApi.remove(c.id);
      toast(t('common.deleted'));
      load();
      refreshDashboard();
    } catch (err) { toast(err.message, 'error'); }
  };

  if (!isManager) {
    return (
      <div className="page">
        <h1 className="page-title">{t('customers.title')}</h1>
        <p className="page-sub">{t('customers.subtitlePicker')}</p>
        {rows.filter((c) => c.is_active).map((c) => (
          <div className="card" key={c.id} style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between' }}>
            <span><b>{c.name}</b></span>
            <span className="muted">{c.phone}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">{t('customers.title')}</h1>
          <p className="page-sub">{t('customers.subtitle')}</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>➕ {t('customers.newCustomer')}</button>
      </div>

      {showForm && (
        <form className="card" onSubmit={save} style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 16 }}>{editId ? t('customers.editCustomer') : t('customers.newCustomer')}</h3>
          <div className="grid grid-2">
            <div className="form-row">
              <label className="form-label">{t('customers.fieldName')}</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="form-row">
              <label className="form-label">{t('common.phone')}</label>
              <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="form-row">
              <label className="form-label">{t('common.address')}</label>
              <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="form-row">
              <label className="form-label">{t('customers.fieldOldDebt')}</label>
              <input className="input" type="number" step="0.01" min="0" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} placeholder={t('customers.amountPlaceholder')} />
            </div>
            <div className="form-row" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">{t('common.notes')}</label>
              <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          {msg && <div className="form-error" style={{ marginTop: 0 }}>{msg}</div>}
          <button className="btn btn-success btn-sm" type="submit">{t('common.save')}</button>{' '}
          <button className="btn btn-outline btn-sm" type="button" onClick={() => setShowForm(false)}>{t('common.cancel')}</button>
        </form>
      )}

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>{t('common.name')}</th><th>{t('common.phone')}</th><th>{t('common.address')}</th><th>{t('customers.colOldDebt')}</th><th>{t('common.status')}</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan="5" className="muted" style={{ textAlign: 'center', padding: 20 }}>{t('customers.empty')}</td></tr>}
            {rows.map((c) => (
              <tr key={c.id}>
                <td><b>{c.name}</b></td>
                <td>{c.phone || '—'}</td>
                <td>{c.address || '—'}</td>
                <td className="nowrap" style={{ fontWeight: 700 }}>{Number(c.opening_balance) > 0 ? fmt(c.opening_balance) : '—'}</td>
                <td>{c.is_active ? <span className="badge badge-paid">{t('customers.active')}</span> : <span className="badge badge-processing">{t('customers.inactive')}</span>}</td>
                <td className="nowrap">
                  <button className="btn btn-outline btn-sm" onClick={() => setStmtCustomer(c)}>{t('customers.statement')}</button>{' '}
                  <button className="btn btn-outline btn-sm" onClick={() => openEdit(c)}>{t('common.edit')}</button>{' '}
                  <button className="btn btn-danger btn-sm" onClick={() => remove(c)}>{t('common.delete')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {stmtCustomer && (
        <AccountStatement
          customerId={stmtCustomer.id}
          customerName={stmtCustomer.name}
          onClose={() => setStmtCustomer(null)}
        />
      )}
    </div>
  );
}
