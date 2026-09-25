import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { containersApi, customersApi, invoiceTypesApi } from '../utils/api.js';
import { fmt } from './Dashboard.jsx';
import ChargesAPayer, { exportCsv } from '../components/ChargesAPayer.jsx';

const COLUMNS = [
  { key: 'bl_number', label: 'Numero BL', align: 'left' },
  { key: 'container_number', label: 'N conteneur', align: 'left' },
  { key: 'customer_name', label: 'Client', align: 'right' },
  { key: 'registration_date', label: 'Arrivée', align: 'left', type: 'date' },
  { key: 'quantity', label: 'Qte', align: 'left', type: 'num' },
  { key: 'contents', label: 'Article', align: 'right' },
  { key: 'container_type', label: 'TC', align: 'left' },
  { key: 'free_days_left', label: 'Free Franchise', align: 'center' },
];

function empty() {
  return { bl_number: '', container_number: '', customer_id: '', registration_date: '', quantity: '', contents: '', container_type: '40', free_storage_days: 15 };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(d) {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  const [y, m, dd] = s.split('-');
  return dd && m && y ? `${dd}/${m}/${y}` : s;
}

function FreeStorageBadge({ row }) {
  const until = Number(row.days_until_arrival) || 0;
  const total = Number(row.free_storage_days) || 15;
  if (until > 0) {
    return <span className="franchise-countdown">⏳ {until}j avant arrivée</span>;
  }
  const left = Number(row.free_days_left);
  if (left > 0) {
    return <span className="franchise-ok">✓ {left}j / {total}j</span>;
  }
  if (left === 0) {
    return <span className="franchise-expired">Expiré aujourd'hui</span>;
  }
  return (
    <span className="franchise-expired" title="أيام التخزين المحسوبة بعد انتهاء المهلة">
      Expiré (+{Math.abs(left)}j)
    </span>
  );
}

export default function ListeBL() {
  const { user } = useAuth();
  const isManager = user?.role === 'manager';
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [sortKey, setSortKey] = useState('registration_date');
  const [sortDir, setSortDir] = useState('desc');

  const [showAdd, setShowAdd] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [form, setForm] = useState(empty());
  const [msg, setMsg] = useState('');

  const [chgRow, setChgRow] = useState(null);
  const [chgDetail, setChgDetail] = useState(null);
  const [liqInvForm, setLiqInvForm] = useState({ invoice_number: '', entry_date: today(), amount: '' });
  const [liqAll, setLiqAll] = useState({ records: [], count: 0, total: 0 });
  const [liqInvErr, setLiqInvErr] = useState('');
  const [liqInvBusy, setLiqInvBusy] = useState(false);
  const [editInv, setEditInv] = useState(null);
  const [invEditForm, setInvEditForm] = useState({ invoice_number: '', entry_date: '', amount: '' });
  const [invEditErr, setInvEditErr] = useState('');
  const [invEditBusy, setInvEditBusy] = useState(false);

  const load = () => {
    setLoading(true);
    containersApi.list().then(setRows).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    customersApi.list().then(setCustomers).catch(() => {});
    invoiceTypesApi.list().then(setTypes).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    let list = rows;
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      list = list.filter((r) =>
        [r.bl_number, r.container_number, r.customer_name].some((v) => String(v || '').toLowerCase().includes(s))
      );
    }
    const col = COLUMNS.find((c) => c.key === sortKey);
    const type = col?.type || 'text';
    const sorted = [...list].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      let r;
      if (type === 'num') r = (av == null ? -Infinity : Number(av)) - (bv == null ? -Infinity : Number(bv));
      else r = String(av || '').localeCompare(String(bv || ''), 'fr');
      return sortDir === 'asc' ? r : -r;
    });
    return sorted;
  }, [rows, q, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const openCharges = async (row) => {
    try {
      setChgDetail(await containersApi.get(row.id));
      if (isManager) {
        setLiqAll(await containersApi.liquidations());
        setLiqInvForm({ invoice_number: '', entry_date: today(), amount: '' });
        setLiqInvErr('');
      }
      setChgRow(row);
    } catch (e) { alert(e.message); }
  };

  const loadCustomers = () => customersApi.list().then(setCustomers).catch(() => {});

  const openAdd = () => {
    setEditRow(null);
    setForm(empty());
    setMsg('');
    loadCustomers();
    setShowAdd(true);
  };

  const openEdit = (row) => {
    setEditRow(row);
    setForm({
      ...empty(),
      bl_number: row.bl_number,
      container_number: row.container_number,
      customer_id: row.customer_id,
      registration_date: row.registration_date,
      quantity: row.quantity ?? '',
      contents: row.contents,
      container_type: row.container_type || '40',
      free_storage_days: row.free_storage_days ?? 15,
    });
    setMsg('');
    loadCustomers();
    setShowAdd(true);
  };

  const setF = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      if (editRow) await containersApi.update(editRow.id, form);
      else await containersApi.create(form);
      setShowAdd(false);
      load();
    } catch (err) { setMsg(err.message); }
  };

  const remove = async (row) => {
    if (!confirm(`Supprimer le BL ${row.bl_number} ?`)) return;
    try { await containersApi.remove(row.id); load(); } catch (e) { alert(e.message); }
  };

  const closeContainer = async (row) => {
    if (!confirm(`Fermer le BL ${row.bl_number} ? (Liquidation) — il passera à la liste "Tubea prêts à être tarifés" (جاهزة للتسعير).`)) return;
    try { await containersApi.close(row.id); load(); } catch (e) { alert(e.message); }
  };

  const reloadChg = async () => {
    setChgDetail(await containersApi.get(chgRow.id));
  };

  const registerLiqInvoice = async () => {
    const liqType = types.find((t) => String(t.name).trim().toLowerCase() === 'liquidation');
    if (!liqType) { setLiqInvErr('نوع LIQUIDATION غير متاح'); return; }
    const amt = Number(liqInvForm.amount);
    if (!String(liqInvForm.invoice_number).trim() || !liqInvForm.entry_date) {
      setLiqInvErr('رقم LIQUIDATION والتاريخ مطلوبان');
      return;
    }
    if (liqInvForm.amount === '' || !isFinite(amt) || amt <= 0) {
      setLiqInvErr('أدخل مبلغاً صحيحاً أكبر من صفر');
      return;
    }
    setLiqInvBusy(true);
    setLiqInvErr('');
    try {
      await containersApi.addInvoice(chgDetail.container.id, {
        invoice_type_id: liqType.id,
        invoice_number: String(liqInvForm.invoice_number).trim(),
        entry_date: liqInvForm.entry_date,
        amount: amt,
        notes: '',
      });
      await reloadChg();
      setLiqAll(await containersApi.liquidations());
      load();
    } catch (e) { setLiqInvErr(e.message); }
    finally { setLiqInvBusy(false); }
  };

  const deleteLiqInvoice = async (inv) => {
    try {
      await containersApi.removeInvoice(chgDetail.container.id, inv.id);
      await reloadChg();
      setLiqAll(await containersApi.liquidations());
      load();
    } catch (e) { alert(e.message); }
  };

  const openEditInv = (inv) => {
    setEditInv(inv);
    setInvEditForm({ invoice_number: inv.invoice_number || '', entry_date: (inv.entry_date || '').slice(0, 10), amount: String(inv.amount ?? '') });
    setInvEditErr('');
  };

  const saveEditInv = async () => {
    const amt = Number(invEditForm.amount);
    if (!invEditForm.entry_date) { setInvEditErr('التاريخ مطلوب'); return; }
    if (!String(invEditForm.amount).trim() || !isFinite(amt) || amt <= 0) { setInvEditErr('أدخل مبلغاً صحيحاً أكبر من صفر'); return; }
    setInvEditBusy(true);
    setInvEditErr('');
    try {
      await containersApi.updateInvoice(chgDetail.container.id, editInv.id, {
        invoice_number: String(invEditForm.invoice_number).trim(),
        entry_date: invEditForm.entry_date,
        amount: amt,
        notes: '',
      });
      setEditInv(null);
      await reloadChg();
      setLiqAll(await containersApi.liquidations());
      load();
    } catch (e) { setInvEditErr(e.message); }
    finally { setInvEditBusy(false); }
  };

  const deleteInvoice = async (inv) => {
    if (!confirm(`حذف الفاتورة «${inv.type_name}» (${fmt(inv.amount)})؟`)) return;
    try {
      await containersApi.removeInvoice(chgDetail.container.id, inv.id);
      if (chgRow) setEditInv(null);
      await reloadChg();
      setLiqAll(await containersApi.liquidations());
      load();
    } catch (e) { alert(e.message); }
  };

  return (
    <div className="page" style={{ direction: 'ltr', textAlign: 'left', maxWidth: 1400 }}>
      <div className="toolbar">
        <div>
          <h1 className="page-title">Liste BL</h1>
          <p className="page-sub">Gestion des BL</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>➕ Nouveau BL</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, borderBottom: '2px solid #e2e8f0', marginBottom: 16 }}>
        <div style={{ padding: '10px 16px', fontWeight: 800, fontSize: 15, background: '#fff', border: '2px solid #e2e8f0', borderBottom: '2px solid #fff', borderTopLeftRadius: 10, borderTopRightRadius: 10, marginBottom: -2 }}>
          En cours{' '}
          <span style={{ background: '#facc15', color: '#000', borderRadius: 999, padding: '1px 9px', fontSize: 13, fontWeight: 800 }}>{rows.length}</span>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <input className="input" placeholder="Recherche (BL, conteneur, client)…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="muted" style={{ display: 'flex', alignItems: 'center' }}>{loading ? 'Chargement…' : `${filtered.length} BL`}</div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <table className="table" style={{ minWidth: 1150 }}>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} className="sortable" style={{ textAlign: c.align }} onClick={() => toggleSort(c.key)}>
                  {c.label} {sortKey === c.key ? <span style={{ color: '#2563eb' }}>{sortDir === 'asc' ? '▲' : '▼'}</span> : ''}
                </th>
              ))}
              {isManager && <th style={{ textAlign: 'center' }}>Liquidation</th>}
              <th style={{ textAlign: 'center' }}>Charges a payer</th>
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && !loading && (
              <tr><td colSpan={COLUMNS.length + (isManager ? 1 : 0) + 2} className="muted" style={{ textAlign: 'center', padding: 20 }}>Aucun BL en cours</td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id}>
                <td className="nowrap"><b style={{ fontWeight: 800 }}>{r.bl_number}</b></td>
                <td>{r.container_number}</td>
                <td style={{ direction: 'rtl', textAlign: 'right' }}><b>{r.customer_name}</b></td>
                <td className="nowrap">{fmtDate(r.registration_date)}</td>
                <td>{r.quantity ?? '—'}</td>
                <td style={{ direction: 'rtl', textAlign: 'right' }}>{r.contents || '—'}</td>
                <td className="nowrap">{r.container_type ? `${r.container_type}′` : '—'}</td>
                <td className="nowrap" style={{ textAlign: 'center' }}><FreeStorageBadge row={r} /></td>
                {isManager && (
                  <td style={{ textAlign: 'center' }}>
                    {r.has_liquidation ? (
                      <button
                        className="liq-pay-badge"
                        onClick={() => openCharges(r)}
                        title={`LIQUIDATION — ${fmt(r.costs_amount || 0)} (total des frais)`}
                      >
                        ✓ Payé — {fmt(r.costs_amount || 0)}
                      </button>
                    ) : (
                      <button className="btn btn-success btn-sm" onClick={() => openCharges(r)}>Payer</button>
                    )}
                  </td>
                )}
                <td style={{ textAlign: 'center' }}>
                  <button className="btn btn-success btn-sm" onClick={() => openCharges(r)}>Charges</button>
                </td>
                <td className="nowrap" style={{ textAlign: 'center' }}>
                  <button className="btn btn-outline btn-sm" title="Modifier" onClick={() => openEdit(r)}>✏️</button>{' '}
                  {isManager && ['registered', 'processing'].includes(r.status) && (
                    <button className="btn btn-danger btn-sm" title="Fermer (جاهزة للتسعير)" onClick={() => closeContainer(r)}>🔒</button>
                  )}
                  {isManager && (
                    <button className="btn btn-danger btn-sm" title="Supprimer" onClick={() => remove(r)}>🗑</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{editRow ? `Modifier — ${editRow.bl_number}` : 'Nouveau BL'}</div>
            <div className="modal-sub">Saisir les informations du bordereau</div>
            <form onSubmit={save} className="grid grid-2" style={{ gap: 12 }}>
              <div className="form-row" style={{ marginBottom: 0 }}>
                <label className="form-label">Numero BL *</label>
                <input className="input" value={form.bl_number} onChange={setF('bl_number')} required />
              </div>
              <div className="form-row" style={{ marginBottom: 0 }}>
                <label className="form-label">N conteneur *</label>
                <input className="input" value={form.container_number} onChange={setF('container_number')} required />
              </div>
              <div className="form-row" style={{ marginBottom: 0 }}>
                <label className="form-label">Client *</label>
                <select className="select" value={form.customer_id} onChange={setF('customer_id')} required>
                  <option value="">— choisir —</option>
                  {customers.filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-row" style={{ marginBottom: 0 }}>
                <label className="form-label">Arrivée *</label>
                <input className="input" type="date" value={form.registration_date} onChange={setF('registration_date')} required />
              </div>
              <div className="form-row" style={{ marginBottom: 0 }}>
                <label className="form-label">Qte</label>
                <input className="input" type="number" min="0" value={form.quantity} onChange={setF('quantity')} />
              </div>
              <div className="form-row" style={{ marginBottom: 0 }}>
                <label className="form-label">TC</label>
                <select className="select" value={form.container_type} onChange={setF('container_type')}>
                  <option value="40">40′</option>
                  <option value="20">20′</option>
                </select>
              </div>
              <div className="form-row" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                <label className="form-label">Article (description) *</label>
                <input className="input" value={form.contents} onChange={setF('contents')} required />
              </div>
              <div className="form-row" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                <label className="form-label">Free franchise (jours) <span className="muted" style={{ fontWeight: 400 }}>— أيام التخزين المجاني</span></label>
                <input className="input" type="number" min="0" max="365" value={form.free_storage_days} onChange={setF('free_storage_days')} />
              </div>
              {msg && <div className="form-error" style={{ gridColumn: '1 / -1' }}>{msg}</div>}
              <div className="modal-actions" style={{ gridColumn: '1 / -1', justifyContent: 'space-between' }}>
                <button className="btn btn-outline btn-sm" type="button" onClick={() => setShowAdd(false)}>Fermer</button>
                <button className="btn btn-success btn-sm" type="submit">{editRow ? 'Enregistrer' : 'Ajouter'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {chgRow && chgDetail && (
        <div className="modal-overlay" onClick={() => { setChgRow(null); setChgDetail(null); }}>
          <div className="modal" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Charges — {chgRow.bl_number}</div>
            <div className="modal-sub" style={{ direction: 'rtl', textAlign: 'right' }}>Frais du client : {chgDetail.container.customer_name}</div>

            <ChargesAPayer
              container={chgDetail.container}
              types={types}
              invoices={chgDetail.invoices}
              onSaved={reloadChg}
            />

            {isManager && (() => {
              const liqInv = chgDetail.invoices.find((i) => String(i.type_name).trim().toLowerCase() === 'liquidation');
              return (
                <div style={{ margin: '14px 0', padding: 14, border: '1px solid #d97706', background: liqInv ? '#f0fdf4' : '#fffbeb', borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <b style={{ color: '#92400e', fontSize: 15 }}>🧾 LIQUIDATION (التسوية الجمركية)</b>
                    {liqInv ? (
                      <span style={{ background: '#16a34a', color: '#fff', padding: '3px 12px', borderRadius: 20, fontWeight: 700 }}>✓ تم الدفع</span>
                    ) : (
                      <span style={{ background: '#eab308', color: '#fff', padding: '3px 12px', borderRadius: 20, fontWeight: 700 }}>لم تُسجَّل بعد</span>
                    )}
                  </div>

                  {liqInv ? (
                    <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                      <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontWeight: 700 }}>
                        <li>N° : {liqInv.invoice_number || '—'} </li>
                        <li>Montant : {fmt(liqInv.amount)}</li>
                        <li>Date : {fmtDate(liqInv.entry_date)}</li>
                        <li>Saisi par : {liqInv.entered_by_name || '—'}</li>
                      </ul>
                      <button className="btn btn-outline btn-sm" onClick={() => { if (confirm(`Supprimer la LIQUIDATION N° ${liqInv.invoice_number || ''} ?`)) deleteLiqInvoice(liqInv); }}>🗑 Supprimer</button>
                    </div>
                  ) : (
                    <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
                      <div>
                        <label className="label">N° LIQUIDATION <span style={{ color: '#dc2626' }}>*</span></label>
                        <input className="input" dir="ltr" value={liqInvForm.invoice_number}
                          onChange={(e) => setLiqInvForm({ ...liqInvForm, invoice_number: e.target.value })} />
                      </div>
                      <div>
                        <label className="label">Date <span style={{ color: '#dc2626' }}>*</span></label>
                        <input className="input" type="date" value={liqInvForm.entry_date}
                          onChange={(e) => setLiqInvForm({ ...liqInvForm, entry_date: e.target.value })} />
                      </div>
                      <div>
                        <label className="label">Montant (MRU) <span style={{ color: '#dc2626' }}>*</span></label>
                        <input className="input" type="number" step="0.01" min="0" dir="ltr" value={liqInvForm.amount}
                          onChange={(e) => setLiqInvForm({ ...liqInvForm, amount: e.target.value })} />
                      </div>
                      <button className="btn" disabled={liqInvBusy} onClick={registerLiqInvoice}>{liqInvBusy ? '...' : '📝 Enregistrer LIQUIDATION'}</button>
                    </div>
                  )}
                  {liqInvErr && <div className="form-error" style={{ marginTop: 10 }}>{liqInvErr}</div>}
                </div>
              );
            })()}

            {isManager && liqAll.records.length > 0 && (
              <p className="muted" style={{ margin: '12px 0 4px', fontSize: 13 }}>
                💡 عرض تدقيق شامل لكل LIQUIDATION المدفوعة من الصفحة المستقلة: «✅ LIQUIDATION المدفوعة» في القائمة الجانبية.
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0 8px', flexWrap: 'wrap', gap: 8 }}>
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>Historique</h4>
              <button className="btn btn-outline btn-sm" onClick={() => exportCsv(chgDetail.invoices)}>⬇ Export Excel</button>
            </div>

            <table className="table">
              <thead>
                <tr><th>Type</th><th>N°</th><th>Montant</th><th>Date</th><th>Saisi par</th>{isManager && <th> </th>}</tr>
              </thead>
              <tbody>
                {chgDetail.invoices.length === 0 && (
                  <tr><td colSpan={isManager ? 6 : 5} className="muted" style={{ textAlign: 'center', padding: 12 }}>Aucun frais enregistré</td></tr>
                )}
                {chgDetail.invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>{inv.type_name}</td>
                    <td>{inv.invoice_number || '—'}</td>
                    <td className="nowrap">{fmt(inv.amount)}</td>
                    <td className="nowrap">{fmtDate(inv.entry_date)}</td>
                    <td>{inv.entered_by_name || '—'}</td>
                    {isManager && (
                      <td className="nowrap" style={{ textAlign: 'center' }}>
                        <button className="btn btn-outline btn-sm" title="تعديل الفاتورة" onClick={() => openEditInv(inv)}>✏️</button>
                        <button className="btn btn-danger btn-sm" title="حذف الفاتورة" style={{ marginRight: 4 }} onClick={() => deleteInvoice(inv)}>🗑</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 800 }}>
                  <td colSpan="4">Total charges</td>
                  <td className="nowrap">{fmt(chgDetail.totals.total_costs)}</td>
                </tr>
              </tfoot>
            </table>

            {editInv && (
              <div style={{ background: '#f0fdf4', border: '1px solid #16a34a', borderRadius: 8, padding: 14, margin: '10px 0' }}>
                <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>✏️ تعديل فاتورة «{editInv.type_name}»</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
                  <div>
                    <label className="label">N°</label>
                    <input className="input" dir="ltr" value={invEditForm.invoice_number}
                      onChange={(e) => setInvEditForm({ ...invEditForm, invoice_number: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Date</label>
                    <input className="input" type="date" value={invEditForm.entry_date}
                      onChange={(e) => setInvEditForm({ ...invEditForm, entry_date: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Montant (MRU)</label>
                    <input className="input" type="number" step="0.01" min="0" dir="ltr" value={invEditForm.amount}
                      onChange={(e) => setInvEditForm({ ...invEditForm, amount: e.target.value })} />
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-success btn-sm" disabled={invEditBusy} onClick={saveEditInv}>{invEditBusy ? '...' : '💾 Enregistrer'}</button>
                    <button className="btn btn-outline btn-sm" onClick={() => setEditInv(null)}>Annuler</button>
                  </div>
                </div>
                {invEditErr && <div className="form-error" style={{ marginTop: 8 }}>{invEditErr}</div>}
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-outline btn-sm" onClick={() => { setChgRow(null); setChgDetail(null); }}>Fermer</button>
            </div>
          </div>
        </div>
      )}

      </div>
  );
}