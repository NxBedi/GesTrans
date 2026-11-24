import { useState } from 'react';
import { containersApi } from '../utils/api.js';
import { getCompany } from '../utils/company.js';
import { useI18n } from '../i18n/I18nContext.jsx';
import { t as tr, fmt as fmtValue, dmy as fmtDate, companyName as localizedCompanyName } from '../i18n/runtime.js';

export default function ChargesAPayer({ container, types, invoices, onSaved }) {
  const { t, fmt, dmy } = useI18n();
  const [amounts, setAmounts] = useState({});
  const [err, setErr] = useState('');

  const employeeTypes = types.filter((type) => type.allowed_role !== 'manager');

  const paidMap = {};
  invoices.forEach((inv) => { if (!paidMap[inv.invoice_type_id]) paidMap[inv.invoice_type_id] = inv; });

  const totalPaye = invoices
    .filter((i) => i.allowed_role !== 'manager')
    .reduce((s, i) => s + Number(i.amount || 0), 0);

  const pay = async (type) => {
    const amt = Number(amounts[type.id]);
    if (amounts[type.id] === undefined || amounts[type.id] === '' || !isFinite(amt) || amt <= 0) {
      setErr(t('containers.invalidAmount', { name: type.name }));
      return;
    }
    setErr('');
    try {
      await containersApi.addInvoice(container.id, { invoice_type_id: type.id, invoice_number: '', amount: amt, entry_date: today(), notes: '' });
      onSaved();
    } catch (e) { setErr(e.message); }
  };

  return (
    <div>
      <div style={{ background: '#dc2626', color: '#fff', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <b style={{ fontSize: 17 }}>{t('containers.chargesHeader')}</b>
        <span style={{ fontWeight: 700 }}>{t('containers.totalPaid', { amount: fmt(totalPaye) })}</span>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {employeeTypes.map((type) => {
          const paidInv = paidMap[type.id];
          return (
            <li key={type.id} className="charges-row">
              <b className="charges-name">{type.name}</b>
              {paidInv ? (
                <span className="charges-paid" title={`${type.name} — ${dmy(paidInv.entry_date)} • ${paidInv.entered_by_name || ''}`}>{t('containers.paid', { amount: fmt(paidInv.amount) })}</span>
              ) : (
                <div className="charges-controls">
                  <input
                    className="input charges-input"
                    type="number" min="0" step="0.01" dir="ltr"
                    placeholder={t('containers.amountPlaceholder')}
                    value={amounts[type.id] ?? ''}
                    onChange={(e) => setAmounts({ ...amounts, [type.id]: e.target.value })}
                  />
                  <button className="btn charges-pay" onClick={() => pay(type)}>{t('containers.payButton')}</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {err && <div className="form-error" style={{ margin: '10px 18px 12px' }}>{err}</div>}
    </div>
  );
}

export function exportCsv(invoices = []) {
  const c = getCompany();
  const header = [
    [localizedCompanyName(c)],
    [`${c.nameFr} — ${c.form}`],
    [`${tr('common.phone')} : ${c.tel}`],
    [c.nifRcAgrement],
    [`${tr('common.email')} : ${c.email}`],
    [''],
  ];
  const rows = [
    ...header,
    [tr('common.type'), tr('containers.invoiceNumber'), tr('common.amount'), tr('common.date'), tr('containers.enteredBy')],
    ...invoices.map((i) => [i.type_name, i.invoice_number || '', fmtValue(i.amount), fmtDate(i.entry_date), i.entered_by_name || '']),
  ];
  const csv = '\uFEFF' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${tr('containers.paymentsFile', { date: new Date().toISOString().slice(0, 10) })}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
