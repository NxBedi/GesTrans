import { useEffect, useState } from 'react';
import { invoiceTypesApi } from '../utils/api.js';
import { useI18n } from '../i18n/I18nContext.jsx';

export default function InvoiceTypes() {
  const { t } = useI18n();
  const [rows, setRows] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: '', allowed_role: 'employee', sort_order: 0 });
  const [msg, setMsg] = useState('');

  const load = () => invoiceTypesApi.list().then(setRows).catch(() => {});
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditId(null); setForm({ name: '', allowed_role: 'employee', sort_order: 0 }); setShowForm(true); setMsg(''); };
  const openEdit = (item) => { setEditId(item.id); setForm({ name: item.name, allowed_role: item.allowed_role, sort_order: item.sort_order }); setShowForm(true); setMsg(''); };

  const save = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      if (editId) await invoiceTypesApi.update(editId, form);
      else await invoiceTypesApi.create(form);
      setShowForm(false);
      load();
    } catch (err) { setMsg(err.message); }
  };

  const toggleActive = async (item) => {
    try { await invoiceTypesApi.update(item.id, { ...item, is_active: !item.is_active }); load(); } catch (err) { alert(err.message); }
  };

  const remove = async (item) => {
    if (!confirm(t('invoiceTypes.confirmDelete', { name: item.name }))) return;
    try { await invoiceTypesApi.remove(item.id); load(); } catch (err) { alert(err.message); }
  };

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">{t('invoiceTypes.title')}</h1>
          <p className="page-sub">{t('invoiceTypes.subtitle')}</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>➕ {t('invoiceTypes.newType')}</button>
      </div>

      {showForm && (
        <form className="card" onSubmit={save} style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 16 }}>{editId ? t('invoiceTypes.editType') : t('invoiceTypes.newTypeTitle')}</h3>
          <div className="grid grid-3">
            <div className="form-row">
              <label className="form-label">{t('invoiceTypes.nameLabel')}</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="form-row">
              <label className="form-label">{t('invoiceTypes.allowedRoleLabel')}</label>
              <select className="select" value={form.allowed_role} onChange={(e) => setForm({ ...form, allowed_role: e.target.value })}>
                <option value="employee">{t('invoiceTypes.roleEmployee')}</option>
                <option value="manager">{t('invoiceTypes.roleManagerOnly')}</option>
              </select>
            </div>
            <div className="form-row">
              <label className="form-label">{t('invoiceTypes.sortOrder')}</label>
              <input className="input" type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
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
              <th>{t('invoiceTypes.colSort')}</th><th>{t('invoiceTypes.colName')}</th><th>{t('invoiceTypes.colAllowedRole')}</th><th>{t('common.status')}</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id}>
                <td className="nowrap">{item.sort_order}</td>
                <td><b>{item.name}</b></td>
                <td>{item.allowed_role === 'manager' ? t('invoiceTypes.roleManagerOnly') : t('invoiceTypes.roleEmployee')}</td>
                <td>{item.is_active ? <span className="badge badge-paid">{t('invoiceTypes.active')}</span> : <span className="badge badge-processing">{t('invoiceTypes.inactive')}</span>}</td>
                <td className="nowrap">
                  <button className="btn btn-outline btn-sm" onClick={() => openEdit(item)}>{t('common.edit')}</button>{' '}
                  <button className="btn btn-outline btn-sm" onClick={() => toggleActive(item)}>{item.is_active ? t('invoiceTypes.deactivate') : t('invoiceTypes.activate')}</button>{' '}
                  <button className="btn btn-danger btn-sm" onClick={() => remove(item)}>{t('common.delete')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
