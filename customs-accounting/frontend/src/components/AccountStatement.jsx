import { useState } from 'react';
import { fmt } from '../utils/format.js';
import { exportStatementPdf } from '../utils/export.js';
import { useCustomerStatement } from '../hooks/useCustomerStatement.js';
import { useCompany } from '../contexts/CompanyContext.jsx';
import CompanyLogo from '../components/CompanyLogo.jsx';

// Reusable account statement (كشف حساب) shown as a modal.
// Used by both the Customers page and the Debts page.
// Props: { customerId, customerName, onClose }
export default function AccountStatement({ customerId, customerName, onClose }) {
  const { company } = useCompany();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState('');

  const { data, loading, error, refresh } = useCustomerStatement(customerId, { from, to });

  const downloadPdf = async () => {
    if (!data) return;
    setPdfBusy(true);
    setPdfError('');
    try {
      await exportStatementPdf(data.customer, data.entries, data.period, data.totals);
    } catch (e) {
      setPdfError(e?.message || 'تعذّر تنزيل ملف PDF');
    } finally {
      setPdfBusy(false);
    }
  };

  const printStatement = () => {
    document.body.classList.add('printing-export');
    window.print();
    setTimeout(() => document.body.classList.remove('printing-export'), 300);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal statement-modal" style={{ maxWidth: 840 }} onClick={(e) => e.stopPropagation()}>
        <div className="no-print toolbar" style={{ marginBottom: 14 }}>
          <div>
            <div className="modal-title">كشف حساب — {customerName || data?.customer?.name || ''}</div>
            <div className="modal-sub">حركة الحساب بالترتيب الزمني مع رصيد جارٍ</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              title="من تاريخ"
            />
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              title="إلى تاريخ"
            />
            <button className="btn" onClick={refresh} disabled={loading}>⟳ تحديث</button>
            <button className="btn btn-primary" onClick={printStatement}>🖨️ طباعة</button>
            <button className="btn" onClick={downloadPdf} disabled={pdfBusy || loading || !data}>
              {pdfBusy ? '⏳ جارٍ التحميل...' : '📄 PDF'}
            </button>
          </div>
        </div>

        {error && <p className="form-error no-print">{error}</p>}
        {pdfError && <p className="form-error no-print">{pdfError}</p>}

        {loading && !data && <p>جارٍ تحميل كشف الحساب...</p>}

        {data && (
          <div className="print-area card">
            <div className="print-header">
              <CompanyLogo className="print-logo" alt={`شعار ${company.nameAr}`} />
              <div style={{ textAlign: 'center' }}>
                <div className="print-company-name">{company.nameAr}</div>
                <div className="muted" dir="ltr">{company.nameFr} — {company.form}</div>
                <div className="muted" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.7, direction: 'ltr', textAlign: 'center' }}>
                  E-MAIL : {company.email}<br />
                  Tel : {company.tel}<br />
                  {company.nifRcAgrement}
                </div>
                <div className="page-title" style={{ marginTop: 12, marginBottom: 0 }}>كشف حساب زبون</div>
              </div>
              <div className="print-header-info" style={{ textAlign: 'right' }}>
                <div>تاريخ الإصدار: {new Date().toLocaleDateString('ar-MA')}</div>
              </div>
            </div>

            <table className="table" style={{ marginTop: 16 }}>
              <tbody>
                <tr><th style={{ width: 200 }}>الزبون</th><td><b>{data.customer.name}</b></td></tr>
                <tr><th>الهاتف</th><td>{data.customer.phone || '—'}</td></tr>
                <tr><th>العنوان</th><td>{data.customer.address || '—'}</td></tr>
                <tr><th>الفترة</th><td>
                  {data.period?.from ? `من ${data.period.from} إلى ${data.period.to || 'الآن'}` : 'كامل الفترة'}
                </td></tr>
              </tbody>
            </table>

            <div className="grid grid-4" style={{ marginTop: 16 }}>
              <div className="card stat-card" style={{ padding: 10 }}>
                <div className="stat-value" style={{ color: '#f59e0b', fontSize: 18 }}>{fmt(data.totals.old_debts)}</div>
                <div className="stat-label">دين قديم (رصيد سابق)</div>
              </div>
              <div className="card stat-card" style={{ padding: 10 }}>
                <div className="stat-value" style={{ fontSize: 18 }}>{fmt(data.totals.total_billed)}</div>
                <div className="stat-label">قيمة الحاويات (البيع)</div>
              </div>
              <div className="card stat-card" style={{ padding: 10 }}>
                <div className="stat-value" style={{ color: '#16a34a', fontSize: 18 }}>{fmt(data.totals.total_paid)}</div>
                <div className="stat-label">إجمالي المحصل</div>
              </div>
              <div className="card stat-card" style={{ padding: 10 }}>
                <div className="stat-value" style={{ color: Number(data.totals.balance) > 0 ? '#dc2626' : Number(data.totals.balance) < 0 ? '#f59e0b' : '#16a34a', fontSize: 18 }}>
                  {fmt(data.totals.balance)}
                </div>
                <div className="stat-label">المتبقي على الزبون</div>
              </div>
            </div>

            <table className="table" style={{ marginTop: 14 }}>
              <thead>
                <tr>
                  <th style={{ width: 110 }}>التاريخ</th>
                  <th>البيان</th>
                  <th style={{ width: 110 }}>مَدين</th>
                  <th style={{ width: 110 }}>دائن</th>
                  <th style={{ width: 120 }}>الرصيد</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.length === 0 && (
                  <tr><td colSpan="5" className="muted" style={{ textAlign: 'center', padding: 16 }}>لا توجد حركات في هذه الفترة</td></tr>
                )}
                {data.entries.map((e, i) => (
                  <tr key={i} style={e.kind === 'opening' ? { background: 'var(--surface-2, #f1f5f9)', fontWeight: 600 } : e.kind === 'old_debt' ? { background: '#fffbeb' } : {}}>
                    <td className="nowrap">{e.date}</td>
                    <td>
                      {e.description}
                      {e.kind === 'old_debt' && <span className="badge badge-due" style={{ marginInlineStart: 8 }}>Old Debt</span>}
                      {e.reference && <div className="muted" style={{ fontSize: 12 }}>{e.reference}</div>}
                    </td>
                    <td className="nowrap">{e.debit != null ? <b>{fmt(e.debit)}</b> : '—'}</td>
                    <td className="nowrap">{e.credit != null ? <b style={{ color: '#16a34a' }}>{fmt(e.credit)}</b> : '—'}</td>
                    <td className="nowrap"><b>{fmt(e.balance)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>

            {data.entries.length > 0 && (
              <div className="print-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="muted">
                  الرصيد النهائي للفترة: <b style={{ color: '#0f172a', fontSize: 15, marginInlineStart: 6 }}>
                    {fmt(data.entries[data.entries.length - 1].balance)} MRU
                  </b>
                </span>
                <span className="muted">صفحة 1</span>
              </div>
            )}
          </div>
        )}

        <div className="modal-actions no-print">
          <button className="btn" onClick={onClose}>إغلاق</button>
        </div>
      </div>
    </div>
  );
}