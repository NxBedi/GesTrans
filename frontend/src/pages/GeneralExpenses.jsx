import { useEffect, useState } from 'react';
import { generalExpensesApi } from '../utils/api.js';
import { refreshDashboard } from '../utils/refresh.js';
import { useI18n } from '../i18n/I18nContext.jsx';

const emptyForm = () => ({ category: '', description: '', amount: '', expense_date: new Date().toISOString().slice(0, 10) });

export default function GeneralExpenses() {
  const { t, fmt, dmy } = useI18n();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  const [categories, setCategories] = useState([]);
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [editId, setEditId] = useState(null);
  const [msg, setMsg] = useState('');
  const [rowMsg, setRowMsg] = useState({});

  const suggested = [
    t('generalExpenses.suggestedRent'),
    t('generalExpenses.suggestedSalaries'),
    t('generalExpenses.suggestedElectricity'),
    t('generalExpenses.suggestedPhone'),
    t('generalExpenses.suggestedStationery'),
    t('generalExpenses.suggestedMaintenance'),
    t('generalExpenses.suggestedGifts'),
    t('generalExpenses.suggestedOther'),
  ];

  const loadData = () => {
    const params = {
      from: dateFrom || undefined,
      to: dateTo || undefined,
      category: filterCategory || undefined,
    };
    setLoading(true);
    generalExpensesApi.summary(params).then(setSummary).catch(() => {}).finally(() => setLoading(false));
    generalExpensesApi.list(params).then(setRows).catch(() => {});
  };

  useEffect(() => {
    generalExpensesApi.categories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    loadData();
  }, [dateFrom, dateTo, filterCategory]);

  const openNew = () => { setEditId(null); setForm(emptyForm()); setMsg(''); setShowForm(true); };
  const openEdit = (r) => {
    setEditId(r.id);
    setForm({ category: r.category, description: r.description || '', amount: String(r.amount), expense_date: r.expense_date });
    setMsg('');
    setShowForm(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      const body = { category: form.category, description: form.description, amount: Number(form.amount), expense_date: form.expense_date };
      if (editId) await generalExpensesApi.update(editId, body);
      else await generalExpensesApi.create(body);
      setShowForm(false);
      generalExpensesApi.categories().then(setCategories).catch(() => {});
      loadData();
      refreshDashboard();
    } catch (err) { setMsg(err.message); }
  };

  const remove = async (r) => {
    if (!confirm(t('generalExpenses.confirmDelete', { category: r.category, amount: fmt(r.amount) }))) return;
    try {
      await generalExpensesApi.remove(r.id);
      generalExpensesApi.categories().then(setCategories).catch(() => {});
      loadData();
      refreshDashboard();
    } catch (err) { alert(err.message); }
  };

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">{t('generalExpenses.title')}</h1>
          <p className="page-sub">{t('generalExpenses.subtitle')}</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>➕ {t('generalExpenses.newExpense')}</button>
      </div>

      {showForm && (
        <form className="card" onSubmit={save} style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 16 }}>{editId ? t('generalExpenses.editExpense') : t('generalExpenses.newExpense')}</h3>
          <div className="grid grid-4">
            <div className="form-row">
              <label className="form-label">{t('generalExpenses.fieldCategory')}</label>
              <input className="input" list="genexp-cats" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder={t('generalExpenses.categoryPlaceholder')} required />
              <datalist id="genexp-cats">
                {categories.map((c) => <option key={c} value={c} />)}
                {suggested.filter((s) => !categories.includes(s)).map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div className="form-row">
              <label className="form-label">{t('generalExpenses.fieldAmount')}</label>
              <input className="input" type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
            </div>
            <div className="form-row">
              <label className="form-label">{t('generalExpenses.fieldDate')}</label>
              <input className="input" type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} required />
            </div>
            <div className="form-row">
              <label className="form-label">{t('generalExpenses.fieldDetails')}</label>
              <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t('generalExpenses.detailsPlaceholder')} />
            </div>
          </div>
          {msg && <div className="form-error" style={{ marginTop: 0 }}>{msg}</div>}
          <button className="btn btn-success btn-sm" type="submit">{t('common.save')}</button>{' '}
          <button className="btn btn-outline btn-sm" type="button" onClick={() => setShowForm(false)}>{t('common.cancel')}</button>
        </form>
      )}

      {/* Filters */}
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">{t('generalExpenses.fieldFrom')}</label>
          <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">{t('generalExpenses.fieldTo')}</label>
          <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="form-label">{t('generalExpenses.fieldCategoryFilter')}</label>
          <select className="select" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="">{t('common.all')}</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="card stat-card">
          <div className="stat-value">{fmt(summary?.total)}</div>
          <div className="stat-label">{t('generalExpenses.totalExpenses')}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{summary?.count ?? 0}</div>
          <div className="stat-label">{t('generalExpenses.operationsCount')}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{summary?.by_category?.length ?? 0}</div>
          <div className="stat-label">{t('generalExpenses.categoriesCount')}</div>
        </div>
      </div>

      <div className="grid grid-2">
        {/* By category */}
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <h3 style={{ padding: '16px 20px 0' }}>{t('generalExpenses.byCategoryTitle')}</h3>
          <div style={{ padding: 12 }}>
            <table className="table">
              <thead>
                <tr><th>{t('generalExpenses.colCategory')}</th><th>{t('generalExpenses.colOperations')}</th><th>{t('common.total')}</th></tr>
              </thead>
              <tbody>
                {(!summary?.by_category || summary.by_category.length === 0) && !loading && (
                  <tr><td colSpan="3" className="muted" style={{ textAlign: 'center', padding: 20 }}>{t('generalExpenses.noExpenses')}</td></tr>
                )}
                {summary?.by_category.map((c) => (
                  <tr key={c.category}>
                    <td><b>{c.category}</b></td>
                    <td>{c.count}</td>
                    <td className="nowrap"><b>{fmt(c.total)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* By month */}
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <h3 style={{ padding: '16px 20px 0' }}>{t('generalExpenses.byMonthTitle')}</h3>
          <div style={{ padding: 12 }}>
            <table className="table">
              <thead>
                <tr><th>{t('generalExpenses.colMonth')}</th><th>{t('generalExpenses.colOperations')}</th><th>{t('common.total')}</th></tr>
              </thead>
              <tbody>
                {(!summary?.by_month || summary.by_month.length === 0) && !loading && (
                  <tr><td colSpan="3" className="muted" style={{ textAlign: 'center', padding: 20 }}>{t('common.noData')}</td></tr>
                )}
                {summary?.by_month.map((m) => (
                  <tr key={m.month}>
                    <td><b>{m.month}</b></td>
                    <td>{m.count}</td>
                    <td className="nowrap"><b>{fmt(m.total)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Detailed list */}
      <div className="card" style={{ padding: 0, overflow: 'auto', marginTop: 16 }}>
        <h3 style={{ padding: '16px 20px 0' }}>{t('generalExpenses.logTitle')}</h3>
        <div style={{ padding: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th>{t('common.date')}</th><th>{t('generalExpenses.colCategory')}</th><th>{t('common.amount')}</th><th>{t('generalExpenses.colDetails')}</th><th>{t('generalExpenses.colEnteredBy')}</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr><td colSpan="6" className="muted" style={{ textAlign: 'center', padding: 20 }}>{t('generalExpenses.noMatch')}</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="nowrap">{dmy(r.expense_date)}</td>
                  <td><span className="badge badge-priced">{r.category}</span></td>
                  <td className="nowrap"><b>{fmt(r.amount)}</b></td>
                  <td className="muted">{r.description || '—'}</td>
                  <td>{r.entered_by_name || '—'}</td>
                  <td className="nowrap">
                    {rowMsg[r.id] && <span className="form-error" style={{ marginLeft: 10 }}>{rowMsg[r.id]}</span>}
                    <button className="btn btn-outline btn-sm" onClick={() => openEdit(r)}>{t('common.edit')}</button>{' '}
                    <button className="btn btn-danger btn-sm" onClick={() => remove(r)}>{t('common.delete')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
            {(summary?.count > 0) && (
              <tfoot>
                <tr style={{ borderTop: '2px solid #e2e8f0', fontWeight: 800 }}>
                  <td colSpan="2">{t('common.total')}</td>
                  <td>{fmt(summary.total)}</td>
                  <td colSpan="3"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
