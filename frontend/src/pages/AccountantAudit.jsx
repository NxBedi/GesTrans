import { useEffect, useState } from 'react';
import { accountantApi } from '../utils/api.js';
import { downloadCsv } from '../utils/accountant.js';

const ACTION_LABELS = {
  create: 'إنشاء',
  update: 'تعديل',
  reverse: 'عكس',
  delete: 'حذف',
};

const ENTITY_LABELS = {
  general_expense: 'مصروف مؤسسة',
  salary_transaction: 'حركة راتب',
};

export default function AccountantAudit() {
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
      'سجل-التدقيق',
      [
        { key: 'created_at', label: 'التاريخ والوقت' },
        { key: 'actor_name', label: 'المستخدم' },
        { key: 'actor_role', label: 'الدور' },
        { key: 'action', label: 'العملية', get: (r) => ACTION_LABELS[r.action] || r.action },
        { key: 'entity_type', label: 'نوع السجل', get: (r) => ENTITY_LABELS[r.entity_type] || r.entity_type },
        { key: 'entity_id', label: 'رقم السجل' },
        { key: 'details', label: 'التفاصيل', get: (r) => (r.details ? JSON.stringify(r.details) : '') },
      ],
      rows
    );
  };

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">سجل التدقيق</h1>
          <p className="page-sub">تتبّع كامل لكل عملية مالية: من نفّذها، متى، وبمبلغ — لا يمكن تعديل سجل التدقيق</p>
        </div>
        <button className="btn btn-outline" onClick={exportCsv}>⬇️ تصدير CSV</button>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">العملية</label>
          <select className="select" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">الكل</option>
            <option value="create">إنشاء</option>
            <option value="update">تعديل</option>
            <option value="reverse">عكس</option>
          </select>
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">نوع السجل</label>
          <select className="select" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
            <option value="">الكل</option>
            <option value="general_expense">مصروف مؤسسة</option>
            <option value="salary_transaction">حركة راتب</option>
          </select>
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">من تاريخ</label>
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">إلى تاريخ</label>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <div className="card-header" style={{ padding: '16px 20px', marginBottom: 0 }}>
          <div className="card-title">🕒 العمليات المسجّلة ({rows.length})</div>
        </div>
        <table className="table">
          <thead>
            <tr><th>الوقت</th><th>المستخدم</th><th>الدور</th><th>العملية</th><th>السجل</th><th>التفاصيل</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr><td colSpan="6" className="muted" style={{ textAlign: 'center', padding: 20 }}>لا توجد عمليات مسجّلة</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="nowrap">{String(r.created_at).replace('T', ' ').slice(0, 19)}</td>
                <td><b>{r.actor_name || '—'}</b></td>
                <td>{r.actor_role === 'accountant' ? 'محاسب' : r.actor_role === 'manager' ? 'مدير' : r.actor_role}</td>
                <td>
                  <span className={r.action === 'reverse' ? 'badge badge-warning' : 'badge badge-paid'}>
                    {ACTION_LABELS[r.action] || r.action}
                  </span>
                </td>
                <td className="nowrap">{ENTITY_LABELS[r.entity_type] || r.entity_type} #{r.entity_id}</td>
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
