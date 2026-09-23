import { useEffect, useState } from 'react';
import { usersApi } from '../utils/api.js';
import { fmt } from './Dashboard.jsx';

const roleLabels = { manager: 'مدير', employee: 'موظف' };

export default function Users() {
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
    if (!confirm(`حذف المستخدم ${u.full_name}؟`)) return;
    try { await usersApi.remove(u.id); load(); } catch (err) { alert(err.message); }
  };

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">المستخدمون</h1>
          <p className="page-sub">إدارة حسابات المديرين والموظفين</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>➕ مستخدم جديد</button>
      </div>

      {showForm && (
        <form className="card" onSubmit={save} style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 16 }}>{editId ? 'تعديل مستخدم' : 'مستخدم جديد'}</h3>
          <div className="grid grid-2">
            <div className="form-row">
              <label className="form-label">اسم المستخدم *</label>
              <input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} disabled={!!editId} required />
            </div>
            <div className="form-row">
              <label className="form-label">الاسم الكامل *</label>
              <input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
            </div>
            <div className="form-row">
              <label className="form-label">الدور *</label>
              <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="employee">موظف</option>
                <option value="manager">مدير</option>
              </select>
            </div>
            <div className="form-row">
              <label className="form-label">الراتب الشهري (MRU) — للموظفين *</label>
              <input className="input" type="number" step="0.01" min="0" dir="ltr" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} required />
            </div>
            <div className="form-row">
              <label className="form-label">{editId ? 'كلمة مرور جديدة (اختياري)' : 'كلمة المرور *'}</label>
              <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!editId} />
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
              <th>الاسم الكامل</th><th>اسم المستخدم</th><th>الدور</th><th>الراتب الشهري</th><th>الحالة</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td><b>{u.full_name}</b></td>
                <td>{u.username}</td>
                <td><span className={u.role === 'manager' ? 'badge badge-priced' : 'badge badge-processing'}>{roleLabels[u.role]}</span></td>
                <td className="nowrap">{u.role === 'employee' ? fmt(u.salary) : <span className="muted">—</span>}</td>
                <td>{u.is_active ? <span className="badge badge-paid">نشط</span> : <span className="badge badge-processing">معطل</span>}</td>
                <td className="nowrap">
                  {rowMsg[u.id] && <span className="form-error" style={{ marginLeft: 10 }}>{rowMsg[u.id]}</span>}
                  <button className="btn btn-outline btn-sm" onClick={() => openEdit(u)}>تعديل</button>{' '}
                  <button className="btn btn-outline btn-sm" onClick={() => toggleActive(u)}>{u.is_active ? 'تعطيل' : 'تفعيل'}</button>{' '}
                  <button className="btn btn-danger btn-sm" onClick={() => remove(u)}>حذف</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}