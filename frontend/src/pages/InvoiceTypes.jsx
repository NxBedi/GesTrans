import { useEffect, useState } from 'react';
import { invoiceTypesApi } from '../utils/api.js';

const roleLabels = { employee: 'موظف', manager: 'مدير فقط' };

export default function InvoiceTypes() {
  const [rows, setRows] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: '', allowed_role: 'employee', sort_order: 0 });
  const [msg, setMsg] = useState('');

  const load = () => invoiceTypesApi.list().then(setRows).catch(() => {});
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditId(null); setForm({ name: '', allowed_role: 'employee', sort_order: 0 }); setShowForm(true); setMsg(''); };
  const openEdit = (t) => { setEditId(t.id); setForm({ name: t.name, allowed_role: t.allowed_role, sort_order: t.sort_order }); setShowForm(true); setMsg(''); };

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

  const toggleActive = async (t) => {
    try { await invoiceTypesApi.update(t.id, { ...t, is_active: !t.is_active }); load(); } catch (err) { alert(err.message); }
  };

  const remove = async (t) => {
    if (!confirm(`حذف نوع الفاتورة "${t.name}"؟`)) return;
    try { await invoiceTypesApi.remove(t.id); load(); } catch (err) { alert(err.message); }
  };

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">أنواع الفواتير</h1>
          <p className="page-sub">الفواتير التي يسجلها الموظفون (17 نوع + LIQUIDATION للمدير) — يمكن إضافة أو تعديل الأنواع من هنا</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>➕ نوع جديد</button>
      </div>

      {showForm && (
        <form className="card" onSubmit={save} style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 16 }}>{editId ? 'تعديل نوع الفاتورة' : 'نوع فاتورة جديد'}</h3>
          <div className="grid grid-3">
            <div className="form-row">
              <label className="form-label">اسم النوع *</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="form-row">
              <label className="form-label">من يدخلها *</label>
              <select className="select" value={form.allowed_role} onChange={(e) => setForm({ ...form, allowed_role: e.target.value })}>
                <option value="employee">موظف</option>
                <option value="manager">مدير فقط</option>
              </select>
            </div>
            <div className="form-row">
              <label className="form-label">ترتيب العرض</label>
              <input className="input" type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
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
              <th>ترتيب</th><th>اسم النوع</th><th>من يدخلها</th><th>الحالة</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td className="nowrap">{t.sort_order}</td>
                <td><b>{t.name}</b></td>
                <td>{roleLabels[t.allowed_role]}</td>
                <td>{t.is_active ? <span className="badge badge-paid">نشط</span> : <span className="badge badge-processing">معطل</span>}</td>
                <td className="nowrap">
                  <button className="btn btn-outline btn-sm" onClick={() => openEdit(t)}>تعديل</button>{' '}
                  <button className="btn btn-outline btn-sm" onClick={() => toggleActive(t)}>{t.is_active ? 'تعطيل' : 'تفعيل'}</button>{' '}
                  <button className="btn btn-danger btn-sm" onClick={() => remove(t)}>حذف</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}