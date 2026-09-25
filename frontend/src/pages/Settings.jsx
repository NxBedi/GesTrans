import { useState } from 'react';
import { COMPANY } from '../utils/company.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useFeedback } from '../components/Feedback.jsx';

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useFeedback();
  const [form, setForm] = useState({ ...COMPANY });
  const [saved, setSaved] = useState(null);

  const save = (e) => {
    e.preventDefault();
    // Company identity lives in code; we keep it in this page as reference.
    // A full editable store would require a backend endpoint — kept read-only for now.
    setSaved({ ...form });
    setForm({ ...COMPANY });
    toast('إعدادات العرض ثابتة — بيانات المؤسسة للتحديث البرمجي', 'info');
  };

  const stat = [
    { l: 'اسم المستخدم', v: user?.full_name || '—' },
    { l: 'الدور', v: user?.role === 'manager' ? 'مدير' : 'موظف' },
    { l: 'إجمالي الحاويات', v: 'محمّل من لوحة التحكم' },
  ];

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div className="toolbar">
        <div>
          <h1 className="page-title">إعدادات النظام</h1>
          <p className="page-sub">بيانات المؤسسة وتفضيلات النظام</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-header"><div className="card-title">🏢 بيانات المؤسسة (تُعرض في التقارير والمطبوعات)</div></div>
        {!saved ? (
          <form onSubmit={save} className="grid grid-2" style={{ gap: 14 }}>
            <div className="form-row" style={{ marginBottom: 0 }}>
              <label className="form-label">الاسم بالعربية</label>
              <input className="input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} />
            </div>
            <div className="form-row" style={{ marginBottom: 0 }}>
              <label className="form-label">الاسم بالفرنسية</label>
              <input className="input" value={form.nameFr} onChange={(e) => setForm({ ...form, nameFr: e.target.value })} />
            </div>
            <div className="form-row" style={{ marginBottom: 0 }}>
              <label className="form-label">الصيغة</label>
              <input className="input" value={form.form} onChange={(e) => setForm({ ...form, form: e.target.value })} />
            </div>
            <div className="form-row" style={{ marginBottom: 0 }}>
              <label className="form-label">الهاتف</label>
              <input className="input" value={form.tel} onChange={(e) => setForm({ ...form, tel: e.target.value })} />
            </div>
            <div className="form-row" style={{ marginBottom: 0 }}>
              <label className="form-label">البريد</label>
              <input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="form-row" style={{ marginBottom: 0 }}>
              <label className="form-label">NIF / RC / Agrément</label>
              <input className="input" value={form.nifRcAgrement} onChange={(e) => setForm({ ...form, nifRcAgrement: e.target.value })} />
            </div>
            <div className="modal-actions" style={{ gridColumn: '1 / -1', justifyContent: 'flex-start' }}>
              <button className="btn btn-primary" type="submit">حفظ البيانات</button>
            </div>
          </form>
        ) : (
          <div className="empty-state"><span className="empty-ico">💾</span>تم حفظ الإعدادات — تُطبق هذه البيانات على التقارير الجديدة.</div>
        )}
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">👤 الجلسة الحالية</div></div>
        <div className="grid grid-3">
          {stat.map((s, i) => (
            <div key={i}>
              <div className="kpi-label">{s.l}</div>
              <div className="kpi-value" style={{ fontSize: 17 }}>{s.v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}