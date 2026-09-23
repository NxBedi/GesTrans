import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { customersApi } from '../utils/api.js';
import { fmt } from './Dashboard.jsx';
import logo from '../assets/logo.png';
import { COMPANY } from '../utils/company.js';

const statusLabels = { registered: 'مسجلة', processing: 'قيد تسجيل الفواتير', closed: 'جاهزة للتسعير', priced: 'تم التسعير' };

export default function CustomerStatement() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    customersApi.statement(id).then(setData).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="page"><p className="form-error">{error}</p><Link to="/balances">رجوع</Link></div>;
  if (!data) return <div className="page">جارٍ التحميل...</div>;

  const today = new Date().toLocaleDateString('ar');

  return (
    <div className="page">
      <div className="no-print toolbar" style={{ marginBottom: 16 }}>
        <Link to="/balances" className="muted">← رجوع إلى ديون الزبناء</Link>
        <button className="btn btn-primary" onClick={() => window.print()}>🖨️ طباعة كشف الحساب</button>
      </div>

      <div className="print-area card">
        <div className="print-header">
          <img src={logo} alt={`شعار ${COMPANY.nameAr}`} className="print-logo" />
          <div style={{ textAlign: 'center' }}>
            <div className="print-company-name">{COMPANY.nameAr}</div>
            <div className="muted">{COMPANY.nameFr} — {COMPANY.form}</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.7 }}>
              E-MAIL : {COMPANY.email}<br />
              Tel : {COMPANY.tel}<br />
              {COMPANY.nifRcAgrement}
            </div>
            <div className="page-title" style={{ marginTop: 12, marginBottom: 0 }}>كشف حساب زبون</div>
          </div>
          <div className="print-header-info">
            <div>تاريخ الإصدار: {today}</div>
          </div>
        </div>

        <table className="table" style={{ marginTop: 16 }}>
          <tbody>
            <tr><th style={{ width: 140 }}>اسم الزبون</th><td><b>{data.customer.name}</b></td></tr>
            {data.customer.phone && <tr><th>الهاتف</th><td>{data.customer.phone}</td></tr>}
            {data.customer.address && <tr><th>العنوان</th><td>{data.customer.address}</td></tr>}
          </tbody>
        </table>

        <div className="grid grid-3" style={{ marginTop: 16 }}>
          <div className="card stat-card">
            <div className="stat-value">{fmt(data.total_billed)}</div>
            <div className="stat-label">قيمة الحاويات (البيع)</div>
          </div>
          <div className="card stat-card">
            <div className="stat-value" style={{ color: '#16a34a' }}>{fmt(data.total_paid)}</div>
            <div className="stat-label">إجمالي المحصل</div>
          </div>
          <div className="card stat-card">
            <div className="stat-value" style={{ color: data.balance > 0 ? '#dc2626' : data.balance < 0 ? '#f59e0b' : '#16a34a' }}>{fmt(data.balance)}</div>
            <div className="stat-label">المتبقي على الزبون</div>
          </div>
        </div>

        <h3 className="print-section">حاويات الزبون</h3>
        <table className="table">
          <thead>
            <tr><th>BL</th><th>رقم الحاوية</th><th>التاريخ</th><th>قيمة الفاتورة</th><th>الحالة</th></tr>
          </thead>
          <tbody>
            {data.containers.length === 0 && (
              <tr><td colSpan="5" className="muted" style={{ textAlign: 'center', padding: 16 }}>لا توجد حاويات</td></tr>
            )}
            {data.containers.map((c) => (
              <tr key={c.id}>
                <td className="nowrap"><b>{c.bl_number}</b></td>
                <td>{c.container_number} {c.container_type ? `(${c.container_type}′)` : ''}</td>
                <td className="nowrap">{c.registration_date}</td>
                <td className="nowrap">{c.final_price != null ? <b>{fmt(c.final_price)}</b> : <span className="muted">لم يُسعّر</span>}</td>
                <td><span className={`badge badge-${c.status}`}>{statusLabels[c.status] || c.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="print-section">حركة المدفوعات والمحصل</h3>
        <table className="table">
          <thead>
            <tr><th>التاريخ</th><th>المبلغ</th><th>BL مرتبط</th><th>ملاحظات</th><th>بواسطة</th></tr>
          </thead>
          <tbody>
            {data.payments.length === 0 && (
              <tr><td colSpan="5" className="muted" style={{ textAlign: 'center', padding: 16 }}>لا توجد مدفوعات</td></tr>
            )}
            {data.payments.map((p) => (
              <tr key={p.id}>
                <td className="nowrap">{p.payment_date}</td>
                <td className="nowrap" style={{ color: '#16a34a', fontWeight: 700 }}>{fmt(p.amount)}</td>
                <td>{p.bl_number || '—'}</td>
                <td>{p.notes || '—'}</td>
                <td>{p.created_by_name || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="print-footer muted">تم إصدار هذا الكشف من نظام الوكالة الموريتانية للخدمات — {today}</div>
      </div>
    </div>
  );
}