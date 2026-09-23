import { useState } from 'react';
import { containersApi } from '../utils/api.js';
import { fmt } from '../pages/Dashboard.jsx';
import { COMPANY } from '../utils/company.js';

export default function ChargesAPayer({ container, types, invoices, onSaved }) {
  const [amounts, setAmounts] = useState({});
  const [err, setErr] = useState('');

  const employeeTypes = types.filter((t) => t.allowed_role !== 'manager');

  const paidMap = {};
  invoices.forEach((inv) => { if (!paidMap[inv.invoice_type_id]) paidMap[inv.invoice_type_id] = inv; });

  const totalPaye = invoices
    .filter((i) => i.allowed_role !== 'manager')
    .reduce((s, i) => s + Number(i.amount || 0), 0);

  const pay = async (t) => {
    const amt = Number(amounts[t.id]);
    if (amounts[t.id] === undefined || amounts[t.id] === '' || !isFinite(amt) || amt <= 0) {
      setErr(`⚠️ أدخل مبلغاً موجباً للبند: ${t.name}`);
      return;
    }
    setErr('');
    try {
      await containersApi.addInvoice(container.id, { invoice_type_id: t.id, invoice_number: '', amount: amt, entry_date: today(), notes: '' });
      onSaved();
    } catch (e) { setErr(e.message); }
  };

  return (
    <div>
      <div style={{ background: '#dc2626', color: '#fff', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <b style={{ fontSize: 17 }}>💶 Charges à payer</b>
        <span style={{ fontWeight: 700 }}>Total payé : {fmt(totalPaye)}</span>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {employeeTypes.map((t) => {
          const paidInv = paidMap[t.id];
          return (
            <li key={t.id} className="charges-row">
              <b className="charges-name">{t.name}</b>
              {paidInv ? (
                <span className="charges-paid" title={`${t.name} — ${paidInv.entry_date} • ${paidInv.entered_by_name || ''}`}>✓ Payé — {fmt(paidInv.amount)}</span>
              ) : (
                <div className="charges-controls">
                  <input
                    className="input charges-input"
                    type="number" min="0" step="0.01" dir="ltr"
                    placeholder="Saisir montant"
                    value={amounts[t.id] ?? ''}
                    onChange={(e) => setAmounts({ ...amounts, [t.id]: e.target.value })}
                  />
                  <button className="btn charges-pay" onClick={() => pay(t)}>💶 Payer</button>
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
  const header = [
    ['الوكالة الموريتانية للخدمات'],
    ['AGENCE MAURITANIENNE DE SERVICES — A.M.S - Sarl'],
    [`Tel : ${COMPANY.tel}`],
    [COMPANY.nifRcAgrement],
    [`E-MAIL : ${COMPANY.email}`],
    [''],
  ];
  const rows = [
    ...header,
    ['Type', 'Numéro', 'Montant', 'Date', 'Saisi par'],
    ...invoices.map((i) => [i.type_name, i.invoice_number || '', i.amount, i.entry_date, i.entered_by_name || '']),
  ];
  const csv = '\uFEFF' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `paiements-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}