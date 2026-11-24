import { useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { customersApi } from '../utils/api.js';
import { fmt, dmy, balanceClass } from '../utils/format.js';
import { useCustomerStatement } from '../hooks/useCustomerStatement.js';
import { useCompany } from '../contexts/CompanyContext.jsx';
import CompanyLogo from '../components/CompanyLogo.jsx';
import { useFeedback } from '../components/Feedback.jsx';
import { exportStatementPdf } from '../utils/export.js';
import { refreshDashboard } from '../utils/refresh.js';

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function ClientAccount() {
  const { id } = useParams();
  const customerId = Number(id);
  const navigate = useNavigate();
  const location = useLocation();
  const { company } = useCompany();
  const { toast, confirm } = useFeedback();

  // draft values live in the filter card; `applied*` drive the statement query
  const [fromInput, setFromInput] = useState('');
  const [toInput, setToInput] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [showStatement, setShowStatement] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState('');

  const [entryModal, setEntryModal] = useState(null); // { kind: 'payment'|'old_debt', mode: 'create'|'edit', entry? }
  const [entryForm, setEntryForm] = useState({ amount: '', date: today(), notes: '' });
  const [entryErr, setEntryErr] = useState('');
  const [saving, setSaving] = useState(false);

  const { data, loading, error, refresh } = useCustomerStatement(customerId, { from, to });

  const customerName = data?.customer?.name || `Client #${customerId}`;
  const backTo = location.state?.back || '/customers';

  const periodEntries = useMemo(
    () => (data?.entries || []).filter((e) => e.kind !== 'opening'),
    [data]
  );
  const periodTotals = useMemo(() => ({
    debit: periodEntries.reduce((s, e) => s + Number(e.debit || 0), 0),
    credit: periodEntries.reduce((s, e) => s + Number(e.credit || 0), 0),
  }), [periodEntries]);
  const closingBalance = useMemo(() => {
    const entries = data?.entries || [];
    if (entries.length) return Number(entries[entries.length - 1].balance);
    return Number(data?.period?.opening ?? data?.totals?.balance ?? 0);
  }, [data]);
  const periodLabel = data?.period?.from
    ? `Du ${dmy(data.period.from)} au ${dmy(data.period.to) || 'aujourd’hui'}`
    : 'Historique complet';

  const applyPeriod = () => {
    setFrom(fromInput);
    setTo(toInput);
  };

  const resetPeriod = () => {
    setFromInput('');
    setToInput('');
    setFrom('');
    setTo('');
  };

  const openCreate = (kind) => {
    setEntryModal({ kind, mode: 'create' });
    setEntryForm({ amount: '', date: today(), notes: '' });
    setEntryErr('');
  };

  const openEdit = (entry) => {
    if (entry.kind !== 'payment' && entry.kind !== 'old_debt') return;
    setEntryModal({ kind: entry.kind, mode: 'edit', entry });
    setEntryForm({
      amount: String(entry.debit ?? entry.credit ?? ''),
      date: entry.date,
      notes: entry.reference || '',
    });
    setEntryErr('');
  };

  const submitEntry = async (e) => {
    e.preventDefault();
    setEntryErr('');
    const amount = Number(entryForm.amount);
    if (!entryForm.amount || !isFinite(amount) || amount <= 0) {
      setEntryErr('Saisissez un montant valide supérieur à zéro');
      return;
    }
    if (entryModal.kind === 'old_debt' && entryForm.date > today()) {
      setEntryErr('La date du débit ne peut pas être dans le futur');
      return;
    }
    setSaving(true);
    try {
      if (entryModal.kind === 'payment') {
        // No PUT endpoint exists: save the corrected entry, then remove the old one.
        await customersApi.addPayment(customerId, {
          amount,
          payment_date: entryForm.date,
          notes: entryForm.notes || '',
        });
        if (entryModal.mode === 'edit') {
          await customersApi.removePayment(customerId, entryModal.entry.id);
        }
      } else {
        await customersApi.addOldDebt(customerId, {
          amount,
          debt_date: entryForm.date,
          notes: entryForm.notes || '',
        });
        if (entryModal.mode === 'edit') {
          await customersApi.removeOldDebt(customerId, entryModal.entry.id);
        }
      }
      toast(entryModal.mode === 'edit' ? 'Écriture modifiée' : 'Écriture enregistrée');
      setEntryModal(null);
      await refresh();
      refreshDashboard();
    } catch (err) {
      setEntryErr(err.message || 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (entry) => {
    if (entry.kind !== 'payment' && entry.kind !== 'old_debt') return;
    const ok = await confirm(
      `Supprimer l’écriture du ${dmy(entry.date)} d’un montant de ${fmt(entry.debit ?? entry.credit)} MRU ?`,
      { title: 'Confirmer la suppression', danger: true, okLabel: 'Supprimer' }
    );
    if (!ok) return;
    try {
      if (entry.kind === 'payment') await customersApi.removePayment(customerId, entry.id);
      else await customersApi.removeOldDebt(customerId, entry.id);
      toast('Écriture supprimée');
      await refresh();
      refreshDashboard();
    } catch (err) {
      toast(err.message || 'Suppression impossible', 'error');
    }
  };

  const downloadPdf = async () => {
    if (!data) return;
    setPdfBusy(true);
    setPdfError('');
    try {
      await exportStatementPdf(data.customer, data.entries, data.period, data.totals);
    } catch (err) {
      setPdfError(err.message || 'Impossible de générer le PDF');
    } finally {
      setPdfBusy(false);
    }
  };

  const printStatement = () => {
    document.body.classList.add('printing-export');
    window.print();
    setTimeout(() => document.body.classList.remove('printing-export'), 300);
  };

  const entryTitle = !entryModal ? ''
    : entryModal.kind === 'payment'
      ? (entryModal.mode === 'edit' ? 'Modifier le versement' : 'Nouveau versement')
      : (entryModal.mode === 'edit' ? 'Modifier le débit' : 'Nouveau débit');

  return (
    <div className="page clients-page account-page">
      <div className="clients-card clients-header no-print">
        <div>
          <h1 className="clients-title">Compte client</h1>
          <p className="clients-subtitle" dir="auto">{customerName}</p>
        </div>
        <div className="clients-header-actions">
          <button className="clients-pill pill-green" onClick={() => openCreate('payment')}>+ Versement</button>
          <button className="clients-pill pill-red" onClick={() => openCreate('old_debt')}>+ Débit</button>
          <button className="clients-pill pill-blue" onClick={() => setShowStatement(true)} disabled={!data || loading}>
            Relevé complet
          </button>
          <button className="clients-pill pill-gray" onClick={() => navigate(backTo)}>← Retour</button>
        </div>
      </div>

      <div className="clients-card clients-filters no-print">
        <div className="clients-filter-title">📅 Filtrer par période</div>
        <div className="clients-filter-row">
          <label className="date-field">
            <span>Du</span>
            <input className="input" type="date" value={fromInput} max={toInput || undefined} onChange={(e) => setFromInput(e.target.value)} />
          </label>
          <label className="date-field">
            <span>Au</span>
            <input className="input" type="date" value={toInput} min={fromInput || undefined} onChange={(e) => setToInput(e.target.value)} />
          </label>
          <button className="clients-pill pill-blue" onClick={applyPeriod} disabled={loading}>🔍 Filtrer</button>
          <button className="clients-pill pill-gray" onClick={resetPeriod}>Réinitialiser</button>
        </div>
      </div>

      {error && <div className="clients-card form-error no-print" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="clients-summary">
        <div className="clients-card stat-card">
          <div className="stat-label">Client</div>
          <div className="account-client-name" dir="auto">{customerName}</div>
          <div className="stat-note" dir="ltr">{data?.customer?.phone || '—'}</div>
        </div>
        <div className="clients-card stat-card">
          <div className="stat-label">Total débit</div>
          <div className={`stat-value ${balanceClass(1)}`}>{fmt(periodTotals.debit)} MRU</div>
          <div className="stat-note">{periodLabel}</div>
        </div>
        <div className="clients-card stat-card">
          <div className="stat-label">Total crédit</div>
          <div className={`stat-value ${balanceClass(-1)}`}>{fmt(periodTotals.credit)} MRU</div>
          <div className="stat-note">{periodLabel}</div>
        </div>
        <div className="clients-card stat-card">
          <div className="stat-label">Solde</div>
          <div className={`stat-value ${balanceClass(data?.totals?.balance)}`}>{fmt(data?.totals?.balance)} MRU</div>
          <div className="stat-note">Solde actuel — identique à la liste des clients</div>
        </div>
      </div>

      <div className="clients-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="clients-table-head no-print">Historique du compte</div>
        <div className="clients-table-scroll">
          <table className="table clients-table account-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Désignation</th>
                <th>Débit</th>
                <th>Crédit</th>
                <th>Solde</th>
                <th className="no-print">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan="6" className="muted" style={{ textAlign: 'center', padding: 20 }}>Chargement…</td></tr>}
              {!loading && data?.entries?.length === 0 && (
                <tr><td colSpan="6" className="muted" style={{ textAlign: 'center', padding: 20 }}>Aucune écriture</td></tr>
              )}
              {(data?.entries || []).map((entry, idx) => (
                <tr key={`${entry.kind}-${entry.id ?? 'opening'}-${idx}`} className={entry.kind === 'opening' ? 'account-opening-row' : ''}>
                  <td className="nowrap">{dmy(entry.date)}</td>
                  <td>
                    <span dir="auto">{entry.description}</span>
                    {entry.reference && <div className="muted" dir="auto" style={{ fontSize: 12 }}>{entry.reference}</div>}
                  </td>
                  <td className={`nowrap ${entry.debit != null ? balanceClass(1) : ''}`}>
                    {entry.debit != null ? <b>{fmt(entry.debit)}</b> : '—'}
                  </td>
                  <td className={`nowrap ${entry.credit != null ? balanceClass(-1) : ''}`}>
                    {entry.credit != null ? <b>{fmt(entry.credit)}</b> : '—'}
                  </td>
                  <td className={`nowrap ${balanceClass(entry.balance)}`}><b>{fmt(entry.balance)} MRU</b></td>
                  <td className="nowrap no-print">
                    {(entry.kind === 'payment' || entry.kind === 'old_debt') ? (
                      <>
                        <button className="icon-btn icon-edit" title="Modifier" onClick={() => openEdit(entry)}>✏️</button>
                        <button className="icon-btn icon-delete" title="Supprimer" onClick={() => deleteEntry(entry)}>🗑</button>
                      </>
                    ) : entry.kind === 'invoice' ? (
                      <>
                        <button className="icon-btn icon-edit" title="Facture : modifier depuis le conteneur" disabled>✏️</button>
                        <button className="icon-btn icon-delete" title="Facture : supprimer depuis le conteneur" disabled>🗑</button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data?.entries?.length > 0 && (
          <div className="account-table-footer">
            <span>Solde à la fin de la période</span>
            <b className={balanceClass(closingBalance)}>{fmt(closingBalance)} MRU</b>
            <span className="muted">{periodLabel}</span>
          </div>
        )}
      </div>

      {entryModal && (
        <div className="modal-overlay no-print" onClick={() => setEntryModal(null)}>
          <form className="modal" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()} onSubmit={submitEntry}>
            <div className="modal-title">{entryTitle}</div>
            <div className="modal-sub">{customerName}</div>
            <div className="form-row">
              <label className="form-label">Montant (MRU) *</label>
              <input className="input" type="number" step="0.01" min="0.01" dir="ltr" value={entryForm.amount} onChange={(e) => setEntryForm({ ...entryForm, amount: e.target.value })} required />
            </div>
            <div className="form-row">
              <label className="form-label">Date *</label>
              <input className="input" type="date" value={entryForm.date} onChange={(e) => setEntryForm({ ...entryForm, date: e.target.value })} required />
            </div>
            <div className="form-row">
              <label className="form-label">Désignation / note</label>
              <input className="input" dir="auto" value={entryForm.notes} onChange={(e) => setEntryForm({ ...entryForm, notes: e.target.value })} />
            </div>
            {entryErr && <div className="form-error">{entryErr}</div>}
            {entryModal.mode === 'edit' && (
              <div className="clients-card" style={{ padding: 10, marginTop: 8, fontSize: 12.5 }}>
                L’ancienne écriture sera remplacée par la nouvelle après enregistrement.
              </div>
            )}
            <div className="modal-actions">
              <button className="clients-pill pill-gray" type="button" onClick={() => setEntryModal(null)}>Annuler</button>
              <button className={`clients-pill ${entryModal.kind === 'payment' ? 'pill-green' : 'pill-red'}`} type="submit" disabled={saving}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showStatement && data && (
        <div className="modal-overlay print-only-all" onClick={() => setShowStatement(false)}>
          <div className="modal statement-modal" style={{ maxWidth: 900 }} onClick={(e) => e.stopPropagation()}>
            <div className="no-print statement-toolbar">
              <div>
                <div className="modal-title">Relevé complet</div>
                <div className="modal-sub">{customerName} — {periodLabel}</div>
              </div>
              <div className="clients-header-actions">
                <button className="clients-pill pill-blue" onClick={printStatement}>🖨 Imprimer</button>
                <button className="clients-pill pill-blue" onClick={downloadPdf} disabled={pdfBusy}>
                  {pdfBusy ? 'Génération…' : '📄 PDF'}
                </button>
                <button className="clients-pill pill-gray" onClick={() => setShowStatement(false)}>Fermer</button>
              </div>
            </div>
            {pdfError && <p className="form-error no-print">{pdfError}</p>}

            <div className="print-area card statement-sheet">
              <div className="print-header statement-header">
                <CompanyLogo className="print-logo" alt={`Logo ${company.nameFr || company.nameAr}`} />
                <div className="statement-company">
                  <div className="print-company-name" dir="auto">{company.nameFr || company.nameAr}</div>
                  <div className="muted" dir="auto">{company.nameAr}</div>
                  <div className="muted" dir="ltr">{company.form}</div>
                  <div className="statement-company-contact" dir="ltr">
                    {company.tel}<br />
                    {company.email}<br />
                    {company.nifRcAgrement}
                  </div>
                </div>
                <div className="print-header-info" dir="ltr">
                  <div>Édité le {new Date().toLocaleDateString('fr-FR')}</div>
                  <div>N° client : {data.customer.id}</div>
                </div>
              </div>

              <div className="statement-title">RELEVÉ DE COMPTE CLIENT</div>

              <table className="table statement-meta">
                <tbody>
                  <tr><th>Client</th><td><b dir="auto">{data.customer.name}</b></td><th>Téléphone</th><td dir="ltr">{data.customer.phone || '—'}</td></tr>
                  <tr><th>Adresse</th><td colSpan="3" dir="auto">{data.customer.address || '—'}</td></tr>
                  <tr><th>Période</th><td colSpan="3">{periodLabel}</td></tr>
                </tbody>
              </table>

              <div className="statement-totals">
                <div className="clients-card stat-card">
                  <div className="stat-label">Total débit</div>
                  <div className={`stat-value ${balanceClass(1)}`}>{fmt(periodTotals.debit)} MRU</div>
                </div>
                <div className="clients-card stat-card">
                  <div className="stat-label">Total crédit</div>
                  <div className={`stat-value ${balanceClass(-1)}`}>{fmt(periodTotals.credit)} MRU</div>
                </div>
                <div className="clients-card stat-card">
                  <div className="stat-label">Solde fin de période</div>
                  <div className={`stat-value ${balanceClass(closingBalance)}`}>{fmt(closingBalance)} MRU</div>
                </div>
                <div className="clients-card stat-card">
                  <div className="stat-label">Solde actuel</div>
                  <div className={`stat-value ${balanceClass(data.totals.balance)}`}>{fmt(data.totals.balance)} MRU</div>
                </div>
              </div>

              <table className="table statement-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Désignation</th>
                    <th>Débit</th>
                    <th>Crédit</th>
                    <th>Solde</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.length === 0 && (
                    <tr><td colSpan="5" className="muted" style={{ textAlign: 'center', padding: 16 }}>Aucune écriture sur cette période</td></tr>
                  )}
                  {data.entries.map((entry, idx) => (
                    <tr key={`${entry.kind}-${entry.id ?? 'opening'}-${idx}`} className={entry.kind === 'opening' ? 'account-opening-row' : ''}>
                      <td className="nowrap">{dmy(entry.date)}</td>
                      <td dir="auto">{entry.description}{entry.reference ? ` — ${entry.reference}` : ''}</td>
                      <td className="nowrap">{entry.debit != null ? fmt(entry.debit) : '—'}</td>
                      <td className="nowrap">{entry.credit != null ? fmt(entry.credit) : '—'}</td>
                      <td className={`nowrap ${balanceClass(entry.balance)}`}>{fmt(entry.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="statement-grand-total">
                <span>Solde final de la période</span>
                <b className={balanceClass(closingBalance)}>{fmt(closingBalance)} MRU</b>
              </div>

              <div className="statement-sign">
                <span>Cachet de l’agence</span>
                <span>Signature</span>
              </div>
              <div className="statement-footer">
                {company.nameFr || company.nameAr} — Relevé généré par le système de comptabilité douanière
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
