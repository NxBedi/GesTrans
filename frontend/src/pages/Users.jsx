import { useEffect, useState } from 'react';
import { usersApi } from '../utils/api.js';
import { useI18n } from '../i18n/I18nContext.jsx';

export default function Users() {
  const { t, fmt, roleLabel } = useI18n();
  const [rows, setRows] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ username: '', full_name: '', role: 'employee', salary: '', password: '' });
  const [msg, setMsg] = useState('');
  const [editId, setEditId] = useState(null);
  const [rowMsg, setRowMsg] = useState({});

  const load = () => usersApi.list().then(setRows).catch(() => {});
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditId(null); setForm({ username: '', full_name: '', role: 'employee', salary: '', password: '' }); setShowForm(true); setMsg(''); };
  const openEdit = (u) => { setEditId(u.id); setForm({ username: u.username, full_name: u.full_name, role: u.role, salary: u.salary ?? '', password: '' }); setShowForm(true); setMsg(''); };

  const save = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      if (editId) {
        const body = { full_name: form.full_name, role: form.role, salary: form.salary === '' ? 0 : Number(form.salary) };
        if (form.password) body.password = form.password;
        await usersApi.update(editId, body);
      } else {
        await usersApi.create({ ...form, salary: form.salary === '' ? 0 : Number(form.salary) });
      }
      setShowForm(false);
      load();
    } catch (err) { setMsg(err.message); }
  };

  const toggleActive = async (u) => {
    try {
      await usersApi.update(u.id, { is_active: !u.is_active });
      load();
    } catch (err) {
      setRowMsg((m) => ({ ...m, [u.id]: err.message }));
      setTimeout(() => setRowMsg((m) => ({ ...m, [u.id]: '' })), 3000);
    }
  };

  const remove = async (u) => {
    if (!confirm(t('users.confirmDelete', { name: u.full_name }))) return;
    try { await usersApi.remove(u.id); load(); } catch (err) { alert(err.message); }
  };

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">{t('users.title')}</h1>
          <p className="page-sub">{t('users.subtitle')}</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>➕ {t('users.newUser')}</button>
      </div>

      {showForm && (
        <form className="card" onSubmit={save} style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 16 }}>{editId ? t('users.editUser') : t('users.newUser')}</h3>
          <div className="grid grid-2">
            <div className="form-row">
              <label className="form-label">{t('users.username')} *</label>
              <input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} disabled={!!editId} required />
            </div>
            <div className="form-row">
              <label className="form-label">{t('users.fullName')} *</label>
              <input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
            </div>
            <div className="form-row">
              <label className="form-label">{t('users.role')} *</label>
              <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="employee">{roleLabel('employee')}</option>
                <option value="manager">{roleLabel('manager')}</option>
                <option value="accountant">{roleLabel('accountant')}</option>
              </select>
            </div>
            <div className="form-row">
              <label className="form-label">{t('users.salaryLabel', { currency: t('common.currency') })}</label>
              <input className="input" type="number" step="0.01" min="0" dir="ltr" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} required={form.role === 'employee'} />
            </div>
            <div className="form-row">
              <label className="form-label">{editId ? t('users.newPassword') : t('users.password')}</label>
              <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!editId} />
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
              <th>{t('users.fullName')}</th><th>{t('users.username')}</th><th>{t('users.role')}</th><th>{t('users.salary')}</th><th>{t('common.status')}</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td><b>{u.full_name}</b></td>
                <td>{u.username}</td>
                <td><span className={u.role === 'manager' ? 'badge badge-priced' : u.role === 'accountant' ? 'badge badge-processing' : 'badge badge-processing'}>{roleLabel(u.role)}</span></td>
                <td className="nowrap">{u.role === 'employee' ? fmt(u.salary) : <span className="muted">—</span>}</td>
                <td>{u.is_active ? <span className="badge badge-paid">{t('users.active')}</span> : <span className="badge badge-processing">{t('users.inactive')}</span>}</td>
                <td className="nowrap">
                  {rowMsg[u.id] && <span className="form-error" style={{ marginLeft: 10 }}>{rowMsg[u.id]}</span>}
                  <button className="btn btn-outline btn-sm" onClick={() => openEdit(u)}>{t('common.edit')}</button>{' '}
                  <button className="btn btn-outline btn-sm" onClick={() => toggleActive(u)}>{u.is_active ? t('users.deactivate') : t('users.activate')}</button>{' '}
                  <button className="btn btn-danger btn-sm" onClick={() => remove(u)}>{t('common.delete')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
