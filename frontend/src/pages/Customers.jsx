import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { customersApi } from '../utils/api.js';
import { fmt } from './Dashboard.jsx';

export default function Customers() {
  const { user } = useAuth();
  const isManager = user?.role === 'manager';
  const [rows, setRows] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', address: '', notes: '' });
  const [msg, setMsg] = useState('');

  const load = () => customersApi.list().then(setRows).catch(() => {});
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditId(null); setForm({ name: '', phone: '', address: '', notes: '' }); setShowForm(true); setMsg(''); };
  const openEdit = (c) => { setEditId(c.id); setForm({ name: c.name, phone: c.phone || '', address: c.address || '', notes: c.notes || '' }); setShowForm(true); setMsg(''); };

  const save = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      if (editId) await customersApi.update(editId, { ...form, is_active: true });
      else await customersApi.create(form);
      setShowForm(false);
      load();
    } catch (err) { setMsg(err.message); }
  };

  const remove = async (c) => {
    if (!confirm(`حذف الزبون ${c.name}؟ سيتم حذف بياناته المرتبطة.`)) return;
    try { await customersApi.remove(c.id); load(); } catch (err) { alert(err.message); }
  };

  if (!isManager) {
    return (
      <div className="page">
        <h1 className="page-title">الزبائن</h1>
        <p className="page-sub">قائمة الزبائن لاختيارها عند تسجيل الحاويات</p>
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
          <h1 className="page-title">الزبائن</h1>
          <p className="page-sub">إدارة زبائن التخليص الجمركي</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>➕ زبون جديد</button>
      </div>

      {showForm && (
        <form className="card" onSubmit={save} style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 16 }}>{editId ? 'تعديل زبون' : 'زبون جديد'}</h3>
          <div className="grid grid-2">
            <div className="form-row">
              <label className="form-label">اسم الزبون *</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="form-row">
              <label className="form-label">الهاتف</label>
              <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="form-row">
              <label className="form-label">العنوان</label>
              <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="form-row" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">ملاحظات</label>
              <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          {msg && <div className="form-error" style={{ marginTop: 0 }}>{msg}</div>}
          <button className="btn btn-success btn-sm" type="submit">حفظ</button>{' '}
          <button className="btn btn-outline btn-sm" type="button" onClick={() => setShowForm(false)}>إلغاء</button>
        </form>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="table">
          <thead>
            <tr>
              <th>الاسم</th><th>الهاتف</th><th>العنوان</th><th>الحالة</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan="5" className="muted" style={{ textAlign: 'center', padding: 20 }}>لا يوجد زبائن</td></tr>}
            {rows.map((c) => (
              <tr key={c.id}>
                <td><b>{c.name}</b></td>
                <td>{c.phone || '—'}</td>
                <td>{c.address || '—'}</td>
                <td>{c.is_active ? <span className="badge badge-paid">نشط</span> : <span className="badge badge-processing">معطل</span>}</td>
                <td className="nowrap">
                  <button className="btn btn-outline btn-sm" onClick={() => openEdit(c)}>تعديل</button>{' '}
                  <button className="btn btn-danger btn-sm" onClick={() => remove(c)}>حذف</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}