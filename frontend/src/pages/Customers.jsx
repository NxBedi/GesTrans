import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { customersApi, reportsApi } from '../utils/api.js';
import { fmt, balanceClass } from '../utils/format.js';
import { useCompany } from '../contexts/CompanyContext.jsx';
import CompanyLogo from '../components/CompanyLogo.jsx';
import { useFeedback } from '../components/Feedback.jsx';
import { refreshDashboard } from '../utils/refresh.js';

const BALANCE_FILTERS = [
  { v: 'all', l: 'Tous' },
  { v: 'debit', l: 'Débiteurs' },
  { v: 'credit', l: 'Créditeurs' },
  { v: 'zero', l: 'Solde nul' },
];

export default function Customers() {
  const { user } = useAuth();
  const { company } = useCompany();
  const { toast, confirm } = useFeedback();
  const isManager = user?.role === 'manager';
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [customers, setCustomers] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [qInput, setQInput] = useState(searchParams.get('q') || '');
  const [balanceInput, setBalanceInput] = useState(searchParams.get('balance') || 'all');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', address: '', notes: '', opening_balance: '' });
  const [msg, setMsg] = useState('');

  const q = searchParams.get('q') || '';
  const balanceFilter = searchParams.get('balance') || 'all';

  const load = () => {
    setLoading(true);
    Promise.all([
      customersApi.list().catch(() => []),
      reportsApi.balances().catch(() => []),
    ]).then(([cs, bs]) => {
      setCustomers(cs);
      const byId = new Map(cs.map((c) => [c.id, c]));
      setRows(bs.map((b) => ({ ...b, ...(byId.get(b.id) || {}), customer_name: b.customer_name || byId.get(b.id)?.name || '' })));
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditId(null);
    setForm({ name: '', phone: '', address: '', notes: '', opening_balance: '' });
    setShowForm(true);
    setMsg('');
  };

  const openEdit = (c) => {
    setEditId(c.id);
    setForm({
      name: c.name || c.customer_name || '',
      phone: c.phone || '',
      address: c.address || '',
      notes: c.notes || '',
      opening_balance: c.opening_balance != null ? String(c.opening_balance) : '',
    });
    setShowForm(true);
    setMsg('');
  };

  const save = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      if (editId) await customersApi.update(editId, { ...form, is_active: true });
      else await customersApi.create(form);
      setShowForm(false);
      toast('Client enregistré');
      load();
      refreshDashboard();
    } catch (err) { setMsg(err.message); }
  };

  const remove = async (c) => {
    if (!(await confirm(`Supprimer le client ${c.name || c.customer_name} ? Ses données liées seront également supprimées.`, { danger: true, okLabel: 'Supprimer' }))) return;
    try {
      await customersApi.remove(c.id);
      toast('Client supprimé');
      load();
      refreshDashboard();
    } catch (err) { toast(err.message, 'error'); }
  };

  const applyFilters = () => {
    const next = {};
    if (qInput.trim()) next.q = qInput.trim();
    if (balanceInput !== 'all') next.balance = balanceInput;
    setSearchParams(next);
  };

  const resetFilters = () => {
    setQInput('');
    setBalanceInput('all');
    setSearchParams({});
  };

  const openAccount = (row) => {
    // the account page reads the client from the URL; pass the current list
    // search/filters so "Retour" can restore the exact same view.
    navigate(`/clients/${row.id}/compte`, {
      state: { back: `/customers${location.search}` },
    });
  };

  const filtered = useMemo(() => {
    let list = rows;
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      list = list.filter((r) => [r.customer_name, r.name, r.phone, r.address, r.id]
        .some((v) => String(v ?? '').toLowerCase().includes(s)));
    }
    if (balanceFilter === 'debit') list = list.filter((r) => Number(r.balance) > 0);
    else if (balanceFilter === 'credit') list = list.filter((r) => Number(r.balance) < 0);
    else if (balanceFilter === 'zero') list = list.filter((r) => Number(r.balance) === 0);
    return [...list].sort((a, b) => Number(a.id) - Number(b.id));
  }, [rows, q, balanceFilter]);

  const summary = useMemo(() => ({
    count: filtered.length,
    debit: filtered.reduce((s, r) => s + Math.max(Number(r.balance), 0), 0),
    credit: filtered.reduce((s, r) => s + Math.max(-Number(r.balance), 0), 0),
    global: filtered.reduce((s, r) => s + Number(r.balance), 0),
  }), [filtered]);

  const printList = () => {
    document.body.classList.add('printing-export');
    window.print();
    setTimeout(() => document.body.classList.remove('printing-export'), 300);
  };

  // les employés voient une simple liste de clients (pour l'enregistrement des BL)
  if (!isManager) {
    return (
      <div className="page">
        <h1 className="page-title">الزبائن</h1>
        <p className="page-sub">قائمة الزبائن لاختيارها عند تسجيل الحاويات</p>
        {customers.filter((c) => c.is_active).map((c) => (
          <div className="card" key={c.id} style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between' }}>
            <span><b>{c.name}</b></span>
            <span className="muted">{c.phone}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="page clients-page">
      <div className="clients-card clients-header no-print">
        <div>
          <h1 className="clients-title">Liste des clients</h1>
          <p className="clients-subtitle">Gestion complète des clients</p>
        </div>
        <div className="clients-header-actions">
          <button className="clients-pill pill-blue" onClick={openNew}>+ Nouveau client</button>
          <button className="clients-pill pill-green" onClick={printList}>🖨 Imprimer liste</button>
        </div>
      </div>

      <div className="clients-card clients-filters no-print">
        <div className="clients-filter-title">🔍 Recherche et filtre</div>
        <div className="clients-filter-row">
          <input
            className="input"
            placeholder="Nom, téléphone ou N° client…"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') applyFilters(); }}
          />
          <select className="select" value={balanceInput} onChange={(e) => setBalanceInput(e.target.value)}>
            {BALANCE_FILTERS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
          <button className="clients-pill pill-blue" onClick={applyFilters}>🔍 Filtrer</button>
          <button className="clients-pill pill-gray" onClick={resetFilters}>Réinitialiser</button>
        </div>
      </div>

      <div className="clients-summary">
        <div className="clients-card stat-card">
          <div className="stat-label">Nombre de clients</div>
          <div className="stat-value">{summary.count}</div>
        </div>
        <div className="clients-card stat-card">
          <div className="stat-label">Total des soldes débiteurs</div>
          <div className={`stat-value ${balanceClass(1)}`}>{fmt(summary.debit)} MRU</div>
        </div>
        <div className="clients-card stat-card">
          <div className="stat-label">Total des soldes créditeurs</div>
          <div className={`stat-value ${balanceClass(-1)}`}>{fmt(summary.credit)} MRU</div>
        </div>
        <div className="clients-card stat-card">
          <div className="stat-label">Solde global</div>
          <div className={`stat-value ${balanceClass(summary.global)}`}>{fmt(summary.global)} MRU</div>
        </div>
      </div>

      <div className="clients-card clients-print-area print-area" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="clients-print-head">
          <CompanyLogo className="print-logo" alt={`Logo ${company.nameFr || company.nameAr}`} />
          <div>
            <b>{company.nameFr || company.nameAr}</b>
            <div className="muted">{company.form} — {company.email} — {company.tel}</div>
          </div>
        </div>
        <div className="clients-table-head no-print">Liste des clients</div>
        <div className="clients-table-scroll">
          <table className="table clients-table">
            <thead>
              <tr>
                <th>N° Client</th><th>Nom</th><th>Prénom</th><th>Téléphone</th><th>Adresse</th><th>Solde</th><th className="no-print">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan="7" className="muted" style={{ textAlign: 'center', padding: 20 }}>Chargement…</td></tr>}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan="7" className="muted" style={{ textAlign: 'center', padding: 20 }}>Aucun client</td></tr>
              )}
              {filtered.map((c) => {
                const fullName = String(c.name || c.customer_name || '');
                const parts = fullName.trim().split(/\s+/);
                const prenom = parts.length > 1 ? parts[0] : '';
                const nom = parts.length > 1 ? parts.slice(1).join(' ') : fullName;
                return (
                  <tr key={c.id}>
                    <td className="nowrap">#{c.id}</td>
                    <td><b>{nom || '—'}</b></td>
                    <td>{prenom || '—'}</td>
                    <td className="nowrap" dir="ltr">{c.phone || '—'}</td>
                    <td className="clients-address" dir="auto">{c.address || '—'}</td>
                    <td className={`nowrap ${balanceClass(c.balance)}`} style={{ fontWeight: 800 }}>{fmt(c.balance)} MRU</td>
                    <td className="nowrap no-print">
                      <button className="icon-btn icon-account" title="Ouvrir le compte" onClick={() => openAccount(c)}>🧾</button>
                      <button className="icon-btn icon-edit" title="Modifier" onClick={() => openEdit(c)}>✏️</button>
                      <button className="icon-btn icon-delete" title="Supprimer" onClick={() => remove(c)}>🗑</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="modal-overlay no-print" onClick={() => setShowForm(false)}>
          <form className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()} onSubmit={save}>
            <div className="modal-title">{editId ? 'Modifier le client' : 'Nouveau client'}</div>
            <div className="modal-sub">Informations du client</div>
            <div className="grid grid-2">
              <div className="form-row">
                <label className="form-label">Nom du client *</label>
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="form-row">
                <label className="form-label">Téléphone</label>
                <input className="input" dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="form-row" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Adresse</label>
                <input className="input" dir="auto" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div className="form-row">
                <label className="form-label">Solde initial (ancienne dette)</label>
                <input className="input" type="number" step="0.01" min="0" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} />
              </div>
              <div className="form-row" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Notes</label>
                <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            {msg && <div className="form-error">{msg}</div>}
            <div className="modal-actions">
              <button className="btn btn-outline btn-sm" type="button" onClick={() => setShowForm(false)}>Fermer</button>
              <button className="btn btn-success btn-sm" type="submit">Enregistrer</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
