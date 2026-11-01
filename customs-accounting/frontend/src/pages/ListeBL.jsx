import { Fragment, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { containersApi, customersApi, invoiceTypesApi, usersApi } from '../utils/api.js';
import { refreshDashboard } from '../utils/refresh.js';
import { useCompany } from '../contexts/CompanyContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import CompanyLogo from '../components/CompanyLogo.jsx';
import ChargesAPayer, { exportCsv } from '../components/ChargesAPayer.jsx';
import ContainerAccessPanel, { AccessSummary, EmployeePicker } from '../components/ContainerAccess.jsx';

const COLUMNS = [
  { key: 'bl_number', labelKey: 'containers.colBl', align: 'start' },
  { key: 'container_number', labelKey: 'containers.colContainer', align: 'start' },
  { key: 'customer_name', labelKey: 'common.customer', align: 'end' },
  { key: 'registration_date', labelKey: 'containers.colArrival', align: 'start', type: 'date' },
  { key: 'quantity', labelKey: 'containers.colQuantity', align: 'start', type: 'num' },
  { key: 'contents', labelKey: 'containers.colContents', align: 'end' },
  { key: 'container_type', labelKey: 'containers.colContainerType', align: 'start' },
  { key: 'free_days_left', labelKey: 'containers.colFreeDays', align: 'center' },
];

function empty() {
  return { bl_number: '', container_number: '', customer_id: '', registration_date: '', quantity: '', contents: '', container_type: '40', free_storage_days: 15, employee_ids: [] };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function FreeStorageBadge({ row }) {
  const { t } = useI18n();
  const until = Number(row.days_until_arrival) || 0;
  const total = Number(row.free_storage_days) || 15;
  if (until > 0) {
    return <span className="franchise-countdown">{t('containers.badgeArrival', { days: until })}</span>;
  }
  const left = Number(row.free_days_left);
  if (left > 0) {
    return <span className="franchise-ok">{t('containers.badgeLeft', { left, total })}</span>;
  }
  if (left === 0) {
    return <span className="franchise-expired">{t('containers.badgeExpiredToday')}</span>;
  }
  return (
    <span className="franchise-expired" title={t('containers.badgeExpiredTitle')}>
      {t('containers.badgeExpiredAfter', { days: Math.abs(left) })}
    </span>
  );
}

export default function ListeBL() {
  const { user } = useAuth();
  const { company } = useCompany();
  const { t, fmt, dmy, companyName } = useI18n();
  const isManager = user?.role === 'manager';
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [sortKey, setSortKey] = useState('registration_date');
  const [sortDir, setSortDir] = useState('desc');

  // manager-only visibility tooling
  const [employees, setEmployees] = useState([]);
  const [accessFilter, setAccessFilter] = useState('all');
  const [selected, setSelected] = useState([]);
  const [accessRow, setAccessRow] = useState(null);
  const [bulk, setBulk] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkErr, setBulkErr] = useState('');

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
  const [invDoc, setInvDoc] = useState(null);

  const load = () => {
    setLoading(true);
    containersApi.list().then(setRows).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    customersApi.list().then(setCustomers).catch(() => {});
    invoiceTypesApi.list().then(setTypes).catch(() => {});
  }, []);

  // only managers can list users / manage visibility
  useEffect(() => {
    if (!isManager) return;
    usersApi.list()
      .then((list) => setEmployees(list.filter((u) => u.role === 'employee' && u.is_active)))
      .catch(() => {});
  }, [isManager]);

  const filtered = useMemo(() => {
    let list = rows;
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      list = list.filter((r) =>
        [r.bl_number, r.container_number, r.customer_name].some((v) => String(v || '').toLowerCase().includes(s))
      );
    }
    // manager visibility filter (employees never see this control)
    if (isManager && accessFilter === 'hidden') {
      list = list.filter((r) => !(r.access_list || []).length);
    } else if (isManager && accessFilter.startsWith('emp:')) {
      const eid = Number(accessFilter.slice(4));
      list = list.filter((r) => (r.access_list || []).some((a) => a.id === eid));
    }
    const col = COLUMNS.find((c) => c.key === sortKey);
    const type = col?.type || 'text';
    const sorted = [...list].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      let r;
      if (type === 'num') r = (av == null ? -Infinity : Number(av)) - (bv == null ? -Infinity : Number(bv));
      else r = String(av || '').localeCompare(String(bv || ''));
      return sortDir === 'asc' ? r : -r;
    });
    return sorted;
  }, [rows, q, sortKey, sortDir, isManager, accessFilter]);

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
      employee_ids: (row.access_list || []).map((a) => a.id),
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
      refreshDashboard();
    } catch (err) { setMsg(err.message); }
  };

  // ---- bulk selection / visibility (manager only) ----
  const toggleSelect = (id) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const selectableIds = filtered.map((r) => r.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.includes(id));

  const toggleSelectAll = () => {
    setSelected(allSelected ? [] : selectableIds);
  };

  const openBulk = (action) => {
    setBulkErr('');
    setBulk({
      action,
      ids: [...selected],
      // revoking defaults to every employee, so "remove from everyone" is one click
      employeeIds: action === 'revoke' ? employees.map((e) => e.id) : [],
    });
  };

  const submitBulk = async () => {
    if (!bulk?.employeeIds.length) { setBulkErr(t('containers.bulkPickEmployee')); return; }
    setBulkBusy(true);
    setBulkErr('');
    try {
      await containersApi.bulkAccess(bulk.ids, bulk.employeeIds, bulk.action);
      setBulk(null);
      setSelected([]);
      load();
      refreshDashboard();
    } catch (e) { setBulkErr(e.message); }
    finally { setBulkBusy(false); }
  };

  const applyAccessUpdate = (updated) => {
    setRows((rs) => rs.map((r) => (r.id === updated.id
      ? { ...r, access_list: updated.access_list, access_count: updated.access_count }
      : r)));
    setChgDetail((d) => (d && d.container.id === updated.id ? { ...d, container: updated } : d));
    setAccessRow((r) => (r && r.id === updated.id ? updated : r));
  };

  const remove = async (row) => {
    if (!confirm(t('containers.confirmDeleteBl', { bl: row.bl_number }))) return;
    try { await containersApi.remove(row.id); load(); refreshDashboard(); } catch (e) { alert(e.message); }
  };

  const closeContainer = async (row) => {
    if (!confirm(t('containers.confirmCloseBl', { bl: row.bl_number }))) return;
    try { await containersApi.close(row.id); load(); refreshDashboard(); } catch (e) { alert(e.message); }
  };

  const reloadChg = async () => {
    setChgDetail(await containersApi.get(chgRow.id));
    refreshDashboard();
  };

  const registerLiqInvoice = async () => {
    const liqType = types.find((type) => String(type.name).trim().toLowerCase() === 'liquidation');
    if (!liqType) { setLiqInvErr(t('containers.errorNoLiquidationType')); return; }
    const amt = Number(liqInvForm.amount);
    if (!String(liqInvForm.invoice_number).trim() || !liqInvForm.entry_date) {
      setLiqInvErr(t('containers.errorLiqFieldsRequired'));
      return;
    }
    if (liqInvForm.amount === '' || !isFinite(amt) || amt <= 0) {
      setLiqInvErr(t('containers.errorPositiveAmount'));
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
    if (!invEditForm.entry_date) { setInvEditErr(t('containers.errorDateRequired')); return; }
    if (!String(invEditForm.amount).trim() || !isFinite(amt) || amt <= 0) { setInvEditErr(t('containers.errorPositiveAmount')); return; }
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
    if (!confirm(t('containers.confirmDeleteInvoice', { name: inv.type_name, amount: fmt(inv.amount) }))) return;
    try {
      await containersApi.removeInvoice(chgDetail.container.id, inv.id);
      if (chgRow) setEditInv(null);
      await reloadChg();
      setLiqAll(await containersApi.liquidations());
      load();
    } catch (e) { alert(e.message); }
  };

  const openInvoice = async (row) => {
    try { setInvDoc(await containersApi.get(row.id)); } catch (e) { alert(e.message); }
  };

  const printInvoice = () => {
    document.body.classList.add('printing-export');
    window.print();
    setTimeout(() => document.body.classList.remove('printing-export'), 300);
  };

  return (
    <div className="page" style={{ textAlign: 'start', maxWidth: 1400 }}>
      <div className="toolbar">
        <div>
          <h1 className="page-title">{t('containers.title')}</h1>
          <p className="page-sub">{t('containers.subtitle')}</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>{t('containers.newBl')}</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, borderBottom: '2px solid #e2e8f0', marginBottom: 16 }}>
        <div style={{ padding: '10px 16px', fontWeight: 800, fontSize: 15, background: '#fff', border: '2px solid #e2e8f0', borderBottom: '2px solid #fff', borderTopLeftRadius: 10, borderTopRightRadius: 10, marginBottom: -2 }}>
          {t('containers.inProgress')}{' '}
          <span style={{ background: '#facc15', color: '#000', borderRadius: 999, padding: '1px 9px', fontSize: 13, fontWeight: 800 }}>{rows.length}</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="input" style={{ flex: '1 1 260px' }} placeholder={t('containers.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} />
        {isManager && (
          <select
            className="select"
            style={{ maxWidth: 280 }}
            title={t('containers.accessFilterLabel')}
            value={accessFilter}
            onChange={(e) => setAccessFilter(e.target.value)}
          >
            <option value="all">{t('containers.accessFilterAll')}</option>
            <option value="hidden">{t('containers.accessFilterHidden')}</option>
            {employees.map((emp) => (
              <option key={emp.id} value={`emp:${emp.id}`}>{t('containers.accessFilterEmployee', { name: emp.full_name })}</option>
            ))}
          </select>
        )}
        <div className="muted" style={{ display: 'flex', alignItems: 'center' }}>{loading ? t('common.loading') : t('containers.blCount', { count: filtered.length })}</div>
      </div>

      {isManager && selected.length > 0 && (
        <div className="bulk-bar">
          <b>{t('containers.bulkSelected', { count: selected.length })}</b>
          <div className="bulk-bar-actions">
            <button className="btn btn-primary btn-sm" onClick={() => openBulk('grant')}>👥 {t('containers.bulkAssign')}</button>
            <button className="btn btn-danger btn-sm" onClick={() => openBulk('revoke')}>🚫 {t('containers.bulkRevoke')}</button>
            <button className="btn btn-outline btn-sm" onClick={() => setSelected([])}>{t('common.cancel')}</button>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <table className="table" style={{ minWidth: 1200 }}>
          <thead>
            <tr>
              {isManager && (
                <th style={{ width: 36, textAlign: 'center' }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} title={t('containers.selectAll')} />
                </th>
              )}
              {COLUMNS.map((c) => (
                <Fragment key={c.key}>
                  <th className="sortable" style={{ textAlign: c.align }} onClick={() => toggleSort(c.key)}>
                    {t(c.labelKey)} {sortKey === c.key ? <span style={{ color: '#2563eb' }}>{sortDir === 'asc' ? '▲' : '▼'}</span> : ''}
                  </th>
                  {isManager && c.key === 'customer_name' && (
                    <th style={{ textAlign: 'center' }}>{t('containers.accessColumn')}</th>
                  )}
                </Fragment>
              ))}
              {isManager && <th style={{ textAlign: 'center' }}>{t('containers.liquidation')}</th>}
              <th style={{ textAlign: 'center' }}>{t('containers.chargesToPay')}</th>
              <th style={{ textAlign: 'center' }}>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && !loading && (
              <tr><td colSpan={COLUMNS.length + (isManager ? 3 : 0) + 2} className="muted" style={{ textAlign: 'center', padding: 20 }}>{t('containers.empty')}</td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className={selected.includes(r.id) ? 'row-selected' : undefined}>
                {isManager && (
                  <td style={{ textAlign: 'center' }}>
                    <input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggleSelect(r.id)} />
                  </td>
                )}
                <td className="nowrap" dir="ltr"><b style={{ fontWeight: 800 }}>{r.bl_number}</b></td>
                <td dir="ltr">{r.container_number}</td>
                <td style={{ textAlign: 'end' }}><b>{r.customer_name}</b></td>
                {isManager && (
                  <td style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      className="access-cell"
                      onClick={() => setAccessRow(r)}
                      title={t('containers.accessEditTitle')}
                    >
                      <AccessSummary accessList={r.access_list} />
                    </button>
                  </td>
                )}
                <td className="nowrap">{dmy(r.registration_date)}</td>
                <td>{r.quantity == null ? '—' : fmt(r.quantity)}</td>
                <td style={{ textAlign: 'end' }}>{r.contents || '—'}</td>
                <td className="nowrap">{r.container_type ? `${r.container_type}′` : '—'}</td>
                <td className="nowrap" style={{ textAlign: 'center' }}><FreeStorageBadge row={r} /></td>
                {isManager && (
                  <td style={{ textAlign: 'center' }}>
                    {r.has_liquidation ? (
                      <button
                        className="liq-pay-badge"
                        onClick={() => openCharges(r)}
                        title={t('containers.liqPaidTitle', { amount: fmt(r.costs_amount || 0) })}
                      >
                        {t('containers.liqPaid', { amount: fmt(r.costs_amount || 0) })}
                      </button>
                    ) : (
                      <button className="btn btn-success btn-sm" onClick={() => openCharges(r)}>{t('containers.pay')}</button>
                    )}
                  </td>
                )}
                <td style={{ textAlign: 'center' }}>
                  <button className="btn btn-success btn-sm" onClick={() => openCharges(r)}>{t('containers.charges')}</button>
                </td>
                <td className="nowrap" style={{ textAlign: 'center' }}>
                  {isManager && (
                    <button className="btn btn-outline btn-sm" title={t('containers.accessEditTitle')} onClick={() => setAccessRow(r)}>👥</button>
                  )}{' '}
                  <button className="btn btn-outline btn-sm" title={t('common.edit')} onClick={() => openEdit(r)}>✏️</button>{' '}
                  {isManager && ['registered', 'processing'].includes(r.status) && (
                    <button className="btn btn-danger btn-sm" title={t('containers.closeTitle')} onClick={() => closeContainer(r)}>🔒</button>
                  )}
                  {isManager && (
                    <button className="btn btn-danger btn-sm" title={t('common.delete')} onClick={() => remove(r)}>🗑</button>
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
            <div className="modal-title">{editRow ? t('containers.editTitle', { bl: editRow.bl_number }) : t('containers.newBl')}</div>
            <div className="modal-sub">{t('containers.modalSub')}</div>
            <form onSubmit={save} className="grid grid-2" style={{ gap: 12 }}>
              <div className="form-row" style={{ marginBottom: 0 }}>
                <label className="form-label">{t('containers.blNumber')}</label>
                <input className="input" dir="ltr" value={form.bl_number} onChange={setF('bl_number')} required />
              </div>
              <div className="form-row" style={{ marginBottom: 0 }}>
                <label className="form-label">{t('containers.containerNumber')}</label>
                <input className="input" dir="ltr" value={form.container_number} onChange={setF('container_number')} required />
              </div>
              <div className="form-row" style={{ marginBottom: 0 }}>
                <label className="form-label">{t('containers.customerField')}</label>
                <select className="select" value={form.customer_id} onChange={setF('customer_id')} required>
                  <option value="">{t('containers.choose')}</option>
                  {customers.filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-row" style={{ marginBottom: 0 }}>
                <label className="form-label">{t('containers.arrivalField')}</label>
                <input className="input" type="date" value={form.registration_date} onChange={setF('registration_date')} required />
              </div>
              <div className="form-row" style={{ marginBottom: 0 }}>
                <label className="form-label">{t('containers.quantityField')}</label>
                <input className="input" type="number" min="0" value={form.quantity} onChange={setF('quantity')} />
              </div>
              <div className="form-row" style={{ marginBottom: 0 }}>
                <label className="form-label">{t('containers.containerTypeField')}</label>
                <select className="select" value={form.container_type} onChange={setF('container_type')}>
                  <option value="40">40′</option>
                  <option value="20">20′</option>
                </select>
              </div>
              <div className="form-row" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                <label className="form-label">{t('containers.contentsField')}</label>
                <input className="input" value={form.contents} onChange={setF('contents')} required />
              </div>
              <div className="form-row" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                <label className="form-label">{t('containers.freeDays')} <span className="muted" style={{ fontWeight: 400 }}>— {t('containers.freeDaysHint')}</span></label>
                <input className="input" type="number" min="0" max="365" value={form.free_storage_days} onChange={setF('free_storage_days')} />
              </div>
              {isManager && (
                <div className="form-row" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                  <label className="form-label">{t('containers.accessTitle')}</label>
                  <EmployeePicker
                    employees={employees}
                    value={form.employee_ids || []}
                    onChange={(ids) => setForm((f) => ({ ...f, employee_ids: ids }))}
                  />
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{t('containers.accessHint')}</div>
                </div>
              )}
              {msg && <div className="form-error" style={{ gridColumn: '1 / -1' }}>{msg}</div>}
              <div className="modal-actions" style={{ gridColumn: '1 / -1', justifyContent: 'space-between' }}>
                <button className="btn btn-outline btn-sm" type="button" onClick={() => setShowAdd(false)}>{t('common.close')}</button>
                <button className="btn btn-success btn-sm" type="submit">{editRow ? t('common.save') : t('common.add')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {chgRow && chgDetail && (
        <div className="modal-overlay" onClick={() => { setChgRow(null); setChgDetail(null); }}>
          <div className="modal" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{t('containers.chargesTitle', { bl: chgRow.bl_number })}</div>
            <div className="modal-sub">{t('containers.customerCharges', { name: chgDetail.container.customer_name })}</div>

            <ChargesAPayer
              container={chgDetail.container}
              types={types}
              invoices={chgDetail.invoices}
              onSaved={reloadChg}
            />

            {isManager && (
              <ContainerAccessPanel
                container={chgDetail.container}
                employees={employees}
                onSaved={applyAccessUpdate}
              />
            )}

            {isManager && (() => {
              const liqInv = chgDetail.invoices.find((i) => String(i.type_name).trim().toLowerCase() === 'liquidation');
              return (
                <div style={{ margin: '14px 0', padding: 14, border: '1px solid #d97706', background: liqInv ? '#f0fdf4' : '#fffbeb', borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <b style={{ color: '#92400e', fontSize: 15 }}>{t('containers.liquidationSettlement')}</b>
                    {liqInv ? (
                      <span style={{ background: '#16a34a', color: '#fff', padding: '3px 12px', borderRadius: 20, fontWeight: 700 }}>{t('containers.liqPaidStatus')}</span>
                    ) : (
                      <span style={{ background: '#eab308', color: '#fff', padding: '3px 12px', borderRadius: 20, fontWeight: 700 }}>{t('containers.liqNotRecorded')}</span>
                    )}
                  </div>

                  {liqInv ? (
                    <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                      <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontWeight: 700 }}>
                        <li>{t('containers.liqInvoiceLine', { number: liqInv.invoice_number || '—' })}</li>
                        <li>{t('containers.liqAmountLine', { amount: fmt(liqInv.amount) })}</li>
                        <li>{t('containers.liqDateLine', { date: dmy(liqInv.entry_date) })}</li>
                        <li>{t('containers.liqEnteredByLine', { name: liqInv.entered_by_name || '—' })}</li>
                      </ul>
                      <button className="btn btn-outline btn-sm" onClick={() => { if (confirm(t('containers.confirmDeleteLiq', { number: liqInv.invoice_number || '' }))) deleteLiqInvoice(liqInv); }}>🗑 {t('common.delete')}</button>
                    </div>
                  ) : (
                    <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
                      <div>
                        <label className="label">{t('containers.liqNumber')} <span style={{ color: '#dc2626' }}>*</span></label>
                        <input className="input" dir="ltr" value={liqInvForm.invoice_number}
                          onChange={(e) => setLiqInvForm({ ...liqInvForm, invoice_number: e.target.value })} />
                      </div>
                      <div>
                        <label className="label">{t('common.date')} <span style={{ color: '#dc2626' }}>*</span></label>
                        <input className="input" type="date" value={liqInvForm.entry_date}
                          onChange={(e) => setLiqInvForm({ ...liqInvForm, entry_date: e.target.value })} />
                      </div>
                      <div>
                        <label className="label">{t('containers.amountMru', { currency: t('common.currency') })} <span style={{ color: '#dc2626' }}>*</span></label>
                        <input className="input" type="number" step="0.01" min="0" dir="ltr" value={liqInvForm.amount}
                          onChange={(e) => setLiqInvForm({ ...liqInvForm, amount: e.target.value })} />
                      </div>
                      <button className="btn" disabled={liqInvBusy} onClick={registerLiqInvoice}>{liqInvBusy ? '...' : t('containers.saveLiquidation')}</button>
                    </div>
                  )}
                  {liqInvErr && <div className="form-error" style={{ marginTop: 10 }}>{liqInvErr}</div>}
                </div>
              );
            })()}

            {isManager && liqAll.records.length > 0 && (
              <p className="muted" style={{ margin: '12px 0 4px', fontSize: 13 }}>
                {t('containers.liqAuditHint')}
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0 8px', flexWrap: 'wrap', gap: 8 }}>
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>{t('containers.history')}</h4>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-primary btn-sm" onClick={() => openInvoice(chgRow)}>{t('containers.costInvoice')}</button>
                <button className="btn btn-outline btn-sm" onClick={() => exportCsv(chgDetail.invoices)}>⬇ {t('common.exportExcel')}</button>
              </div>
            </div>

            <table className="table">
              <thead>
                <tr><th>{t('common.type')}</th><th>{t('containers.invoiceNumber')}</th><th>{t('common.amount')}</th><th>{t('common.date')}</th><th>{t('containers.enteredBy')}</th>{isManager && <th> </th>}</tr>
              </thead>
              <tbody>
                {chgDetail.invoices.length === 0 && (
                  <tr><td colSpan={isManager ? 6 : 5} className="muted" style={{ textAlign: 'center', padding: 12 }}>{t('containers.noCharges')}</td></tr>
                )}
                {chgDetail.invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>{inv.type_name}</td>
                    <td dir="ltr">{inv.invoice_number || '—'}</td>
                    <td className="nowrap">{fmt(inv.amount)}</td>
                    <td className="nowrap">{dmy(inv.entry_date)}</td>
                    <td>{inv.entered_by_name || '—'}</td>
                    {isManager && (
                      <td className="nowrap" style={{ textAlign: 'center' }}>
                        <button className="btn btn-outline btn-sm" title={t('containers.editInvoiceTitle')} onClick={() => openEditInv(inv)}>✏️</button>
                        <button className="btn btn-danger btn-sm" title={t('containers.deleteInvoiceTitle')} style={{ marginInlineEnd: 4 }} onClick={() => deleteInvoice(inv)}>🗑</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 800 }}>
                  <td colSpan="4">{t('containers.totalCharges')}</td>
                  <td className="nowrap">{fmt(chgDetail.totals.total_costs)}</td>
                </tr>
              </tfoot>
            </table>

            {editInv && (
              <div style={{ background: '#f0fdf4', border: '1px solid #16a34a', borderRadius: 8, padding: 14, margin: '10px 0' }}>
                <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>{t('containers.editInvoice', { name: editInv.type_name })}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
                  <div>
                    <label className="label">{t('containers.invoiceNoShort')}</label>
                    <input className="input" dir="ltr" value={invEditForm.invoice_number}
                      onChange={(e) => setInvEditForm({ ...invEditForm, invoice_number: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">{t('common.date')}</label>
                    <input className="input" type="date" value={invEditForm.entry_date}
                      onChange={(e) => setInvEditForm({ ...invEditForm, entry_date: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">{t('containers.amountMru', { currency: t('common.currency') })}</label>
                    <input className="input" type="number" step="0.01" min="0" dir="ltr" value={invEditForm.amount}
                      onChange={(e) => setInvEditForm({ ...invEditForm, amount: e.target.value })} />
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-success btn-sm" disabled={invEditBusy} onClick={saveEditInv}>{invEditBusy ? '...' : `💾 ${t('common.save')}`}</button>
                    <button className="btn btn-outline btn-sm" onClick={() => setEditInv(null)}>{t('common.cancel')}</button>
                  </div>
                </div>
                {invEditErr && <div className="form-error" style={{ marginTop: 8 }}>{invEditErr}</div>}
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-outline btn-sm" onClick={() => { setChgRow(null); setChgDetail(null); }}>{t('common.close')}</button>
            </div>
          </div>
        </div>
      )}

      {invDoc && (
        <div className="print-only-all" style={{ position: 'fixed', inset: 0, background: '#f1f5f9', zIndex: 200, overflow: 'auto', padding: 20 }}>
          <div className="no-print card" style={{ maxWidth: 860, margin: '0 auto 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div className="modal-title">{t('containers.costInvoiceTitle', { bl: invDoc.container.bl_number })}</div>
                <div className="muted" style={{ fontSize: 13 }}>{t('containers.costInvoiceSub')}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-outline btn-sm" onClick={() => setInvDoc(null)}>{t('common.close')}</button>
                <button className="btn btn-primary btn-sm" onClick={printInvoice}>{t('containers.printPdf')}</button>
              </div>
            </div>
          </div>

          <div className="print-area card" style={{ maxWidth: 860, margin: '0 auto', padding: 32 }}>
            <div className="print-header">
              <CompanyLogo className="print-logo" alt={t('containers.logoAlt', { name: companyName(company) })} />
              <div style={{ textAlign: 'center' }}>
                <div className="print-company-name">{companyName(company)}</div>
                <div className="muted" dir="ltr">{company.form}</div>
                <div className="muted" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.7, textAlign: 'center' }}>
                  {t('common.email')} : {company.email}<br />
                  {t('common.phone')} : {company.tel}<br />
                  {company.nifRcAgrement}
                </div>
                <div className="page-title" style={{ marginTop: 12, marginBottom: 0 }}>{t('containers.containerCostInvoice')}</div>
              </div>
              <div className="print-header-info" style={{ textAlign: 'end' }}>
                <div>{t('pdf.issuedOn', { date: dmy(new Date()) })}</div>
                <div style={{ marginTop: 6 }}>{t('containers.invoiceRef', { ref: `FCT-${invDoc.container.bl_number}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}` })}</div>
              </div>
            </div>

            <table className="table" style={{ marginTop: 16 }}>
              <tbody>
                <tr><th style={{ width: 200 }}>{t('containers.customerNameField')}</th><td><b>{invDoc.container.customer_name}</b></td></tr>
                <tr><th>{t('containers.carrierBl')}</th><td dir="ltr">{invDoc.container.bl_number}</td></tr>
                <tr><th>{t('containers.containerNoField')}</th><td dir="ltr">{invDoc.container.container_number} {invDoc.container.container_type ? `(${invDoc.container.container_type}′)` : ''}</td></tr>
                <tr><th>{t('containers.arrivalDate')}</th><td>{dmy(invDoc.container.registration_date)}</td></tr>
                <tr><th>{t('containers.goods')}</th><td>{invDoc.container.contents || '—'}</td></tr>
              </tbody>
            </table>

            <h3 className="print-section">{t('containers.details')}</h3>
            {invDoc.invoices.length === 0 ? (
              <p className="muted">{t('containers.noCosts')}</p>
            ) : (
              <table className="table">
                <thead>
                  <tr><th>{t('common.type')}</th><th>{t('containers.invoiceNumber')}</th><th>{t('common.date')}</th><th>{t('containers.amountMru', { currency: t('common.currency') })}</th></tr>
                </thead>
                <tbody>
                  {invDoc.invoices.map((invRow) => (
                    <tr key={invRow.id}>
                      <td>{invRow.type_name}</td>
                      <td dir="ltr">{invRow.invoice_number || '—'}</td>
                      <td className="nowrap">{dmy(invRow.entry_date)}</td>
                      <td className="nowrap"><b>{fmt(invRow.amount)}</b></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 800 }}>
                    <td colSpan="2">{t('containers.totalCosts')}</td>
                    <td />
                    <td className="nowrap">{fmt(invDoc.totals.total_costs)}</td>
                  </tr>
                </tfoot>
              </table>
            )}

            <div className="print-sign" style={{ display: 'flex', alignItems: 'flex-end', marginTop: 48, minHeight: 140 }}>
              <div>
                <div className="muted" style={{ marginBottom: 6 }}>{t('containers.managerSignature')}</div>
                <div style={{ width: 220, borderBottom: '1px solid #64748b', height: 40 }} />
              </div>
            </div>

            <div className="print-footer muted">
              {t('containers.costInvoiceFooter', { company: companyName(company) })}
            </div>
          </div>
        </div>
      )}

      {accessRow && (
        <div className="modal-overlay" onClick={() => setAccessRow(null)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{t('containers.accessModalTitle', { bl: accessRow.bl_number })}</div>
            <div className="modal-sub">{t('containers.accessModalSub')}</div>
            <ContainerAccessPanel
              container={accessRow}
              employees={employees}
              onSaved={applyAccessUpdate}
            />
            <div className="modal-actions">
              <button className="btn btn-outline btn-sm" onClick={() => setAccessRow(null)}>{t('common.close')}</button>
            </div>
          </div>
        </div>
      )}

      {bulk && (
        <div className="modal-overlay" onClick={() => setBulk(null)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              {bulk.action === 'grant'
                ? t('containers.bulkAssignTitle', { count: bulk.ids.length })
                : t('containers.bulkRevokeTitle', { count: bulk.ids.length })}
            </div>
            <div className="modal-sub">
              {bulk.action === 'grant' ? t('containers.bulkAssignSub') : t('containers.bulkRevokeSub')}
            </div>
            <EmployeePicker
              employees={employees}
              value={bulk.employeeIds}
              onChange={(ids) => setBulk((b) => ({ ...b, employeeIds: ids }))}
            />
            {bulkErr && <div className="form-error">{bulkErr}</div>}
            <div className="modal-actions">
              <button className="btn btn-outline btn-sm" onClick={() => setBulk(null)}>{t('common.cancel')}</button>
              <button
                className={`btn btn-sm ${bulk.action === 'revoke' ? 'btn-danger' : 'btn-success'}`}
                disabled={bulkBusy}
                onClick={submitBulk}
              >
                {bulkBusy ? '...' : t('containers.bulkApply')}
              </button>
            </div>
          </div>
        </div>
      )}

      </div>
  );
}
