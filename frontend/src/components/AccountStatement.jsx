import { useState } from 'react';
import { exportStatementPdf } from '../utils/export.js';
import { useCustomerStatement } from '../hooks/useCustomerStatement.js';
import { useCompany } from '../contexts/CompanyContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import CompanyLogo from '../components/CompanyLogo.jsx';

// Reusable account statement (كشف حساب) shown as a modal.
// Used by both the Customers page and the Debts page.
// Props: { customerId, customerName, onClose }
export default function AccountStatement({ customerId, customerName, onClose }) {
  const { t, fmt, money, dmy, companyName } = useI18n();
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
      setPdfError(e?.message || t('statement.pdfError'));
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
            <div className="modal-title">{t('statement.titleWithName', { name: customerName || data?.customer?.name || '' })}</div>
            <div className="modal-sub">{t('statement.subtitle')}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              title={t('statement.dateFrom')}
            />
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              title={t('statement.dateTo')}
            />
            <button className="btn" onClick={refresh} disabled={loading}>⟳ {t('statement.refresh')}</button>
            <button className="btn btn-primary" onClick={printStatement}>🖨️ {t('common.print')}</button>
            <button className="btn" onClick={downloadPdf} disabled={pdfBusy || loading || !data}>
              {pdfBusy ? `⏳ ${t('statement.downloading')}` : '📄 PDF'}
            </button>
          </div>
        </div>

        {error && <p className="form-error no-print">{error}</p>}
        {pdfError && <p className="form-error no-print">{pdfError}</p>}

        {loading && !data && <p>{t('statement.loading')}</p>}

        {data && (
          <div className="print-area card">
            <div className="print-header">
              <CompanyLogo className="print-logo" alt={t('statement.logoAlt', { company: companyName(company) })} />
              <div style={{ textAlign: 'center' }}>
                <div className="print-company-name">{companyName(company)}</div>
                <div className="muted" dir="ltr">{company.form}</div>
                <div className="muted" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.7, direction: 'ltr', textAlign: 'center' }}>
                  {t('common.email')} : {company.email}<br />
                  {t('common.phone')} : {company.tel}<br />
                  {company.nifRcAgrement}
                </div>
                <div className="page-title" style={{ marginTop: 12, marginBottom: 0 }}>{t('statement.docTitle')}</div>
              </div>
              <div className="print-header-info" style={{ textAlign: 'right' }}>
                <div>{t('pdf.issuedOn', { date: dmy(new Date()) })}</div>
              </div>
            </div>

            <table className="table" style={{ marginTop: 16 }}>
              <tbody>
                <tr><th style={{ width: 200 }}>{t('common.customerName')}</th><td><b>{data.customer.name}</b></td></tr>
                <tr><th>{t('common.phone')}</th><td>{data.customer.phone || '—'}</td></tr>
                <tr><th>{t('common.address')}</th><td>{data.customer.address || '—'}</td></tr>
                <tr><th>{t('common.period')}</th><td>
                  {data.period?.from
                    ? t('statement.periodFrom', { from: dmy(data.period.from), to: data.period.to ? dmy(data.period.to) : t('common.now') })
                    : t('common.periodAll')}
                </td></tr>
              </tbody>
            </table>

            <div className="grid grid-4" style={{ marginTop: 16 }}>
              <div className="card stat-card" style={{ padding: 10 }}>
                <div className="stat-value" style={{ color: '#f59e0b', fontSize: 18 }}>{fmt(data.totals.old_debts)}</div>
                <div className="stat-label">{t('statement.oldDebt')}</div>
              </div>
              <div className="card stat-card" style={{ padding: 10 }}>
                <div className="stat-value" style={{ fontSize: 18 }}>{fmt(data.totals.total_billed)}</div>
                <div className="stat-label">{t('statement.billedValue')}</div>
              </div>
              <div className="card stat-card" style={{ padding: 10 }}>
                <div className="stat-value" style={{ color: '#16a34a', fontSize: 18 }}>{fmt(data.totals.total_paid)}</div>
                <div className="stat-label">{t('statement.totalCollected')}</div>
              </div>
              <div className="card stat-card" style={{ padding: 10 }}>
                <div className="stat-value" style={{ color: Number(data.totals.balance) > 0 ? '#dc2626' : Number(data.totals.balance) < 0 ? '#f59e0b' : '#16a34a', fontSize: 18 }}>
                  {fmt(data.totals.balance)}
                </div>
                <div className="stat-label">{t('statement.remaining')}</div>
              </div>
            </div>

            <table className="table" style={{ marginTop: 14 }}>
              <thead>
                <tr>
                  <th style={{ width: 110 }}>{t('common.date')}</th>
                  <th>{t('common.description')}</th>
                  <th style={{ width: 110 }}>{t('common.debit')}</th>
                  <th style={{ width: 110 }}>{t('common.credit')}</th>
                  <th style={{ width: 120 }}>{t('common.balance')}</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.length === 0 && (
                  <tr><td colSpan="5" className="muted" style={{ textAlign: 'center', padding: 16 }}>{t('statement.noEntries')}</td></tr>
                )}
                {data.entries.map((e, i) => (
                  <tr key={i} style={e.kind === 'opening' ? { background: 'var(--surface-2, #f1f5f9)', fontWeight: 600 } : e.kind === 'old_debt' ? { background: '#fffbeb' } : {}}>
                    <td className="nowrap">{dmy(e.date)}</td>
                    <td>
                      {e.description}
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
                  {t('pdf.finalBalance', { amount: money(data.entries[data.entries.length - 1].balance) })}
                </span>
                <span className="muted">{t('common.page')} 1</span>
              </div>
            )}
          </div>
        )}

        <div className="modal-actions no-print">
          <button className="btn" onClick={onClose}>{t('common.close')}</button>
        </div>
      </div>
    </div>
  );
}
