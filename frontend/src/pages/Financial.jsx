import { useEffect, useState } from 'react';
import { financialApi } from '../utils/api.js';
import { fmt } from './Dashboard.jsx';

const kindMeta = {
  adjust: { label: 'تسوية الصندوق', color: '#64748b' },
  capital: { label: 'رأس المال', color: '#8b5cf6' },
  collection: { label: 'تحصيل من زبون', color: '#16a34a' },
  old_debt: { label: 'تحصيل دين قديم', color: '#f59e0b' },
  cost: { label: 'تكاليف حاوية', color: '#2563eb' },
  expense: { label: 'مصروف مؤسسة', color: '#dc2626' },
  salary: { label: 'رواتب الموظفين', color: '#d946ef' },
};

const today = () => new Date().toISOString().slice(0, 10);

export default function Financial() {
  const [overview, setOverview] = useState(null);
  const [movements, setMovements] = useState([]);
  const [allMovements, setAllMovements] = useState([]);
  const [capitalRows, setCapitalRows] = useState([]);
  const [adjRows, setAdjRows] = useState([]);
  const [oldDebts, setOldDebts] = useState([]);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);

  const [showCapitalForm, setShowCapitalForm] = useState(false);
  const [showAdjForm, setShowAdjForm] = useState(false);
  const [showOldDebtForm, setShowOldDebtForm] = useState(false);
  const [capitalForm, setCapitalForm] = useState({ amount: '', kind: 'deposit', txn_date: today(), notes: '' });
  const [adjForm, setAdjForm] = useState({ amount: '', kind: 'in', adj_date: today(), notes: '' });
  const [oldDebtForm, setOldDebtForm] = useState({ amount: '', description: '' });
  const [msg, setMsg] = useState('');

  const load = () => {
    setLoading(true);
    financialApi.overview().then(setOverview).catch(() => {}).finally(() => setLoading(false));
    const params = { from: dateFrom || undefined, to: dateTo || undefined };
    financialApi.movements(params).then(setMovements).catch(() => {});
    financialApi.movements().then(setAllMovements).catch(() => {});
    financialApi.capitalList().then(setCapitalRows).catch(() => {});
    financialApi.adjustmentsList().then(setAdjRows).catch(() => {});
    financialApi.oldDebts().then(setOldDebts).catch(() => {});
  };

  useEffect(load, [dateFrom, dateTo]);

  const saveCapital = async (e) => {
    e.preventDefault();
    setMsg('');
    const amount = capitalForm.kind === 'withdrawal' ? -Math.abs(Number(capitalForm.amount)) : Math.abs(Number(capitalForm.amount));
    if (!amount) { setMsg('أدخل مبلغاً صحيحاً'); return; }
    try {
      await financialApi.addCapital({ amount, txn_date: capitalForm.txn_date, notes: capitalForm.notes });
      setShowCapitalForm(false);
      setCapitalForm({ amount: '', kind: 'deposit', txn_date: today(), notes: '' });
      load();
    } catch (err) { setMsg(err.message); }
  };

  const saveAdj = async (e) => {
    e.preventDefault();
    setMsg('');
    const amount = adjForm.kind === 'out' ? -Math.abs(Number(adjForm.amount)) : Math.abs(Number(adjForm.amount));
    if (!amount) { setMsg('أدخل مبلغاً صحيحاً'); return; }
    try {
      await financialApi.addAdjustment({ amount, adj_date: adjForm.adj_date, notes: adjForm.notes });
      setShowAdjForm(false);
      setAdjForm({ amount: '', kind: 'in', adj_date: today(), notes: '' });
      load();
    } catch (err) { setMsg(err.message); }
  };

  const saveOldDebt = async (e) => {
    e.preventDefault();
    setMsg('');
    const amount = Math.abs(Number(oldDebtForm.amount));
    if (!amount) { setMsg('أدخل مبلغاً صحيحاً'); return; }
    if (!oldDebtForm.description.trim()) { setMsg('وصف الدين/المصدر مطلوب'); return; }
    try {
      await financialApi.addOldDebt({ amount, description: oldDebtForm.description });
      setShowOldDebtForm(false);
      setOldDebtForm({ amount: '', description: '' });
      load();
    } catch (err) { setMsg(err.message); }
  };

  const collectOldDebt = async (row) => {
    const remaining = row.remaining;
    const amountStr = prompt(`تحصيل من الدين القديم «${row.description}»\nالمتبقي: ${fmt(remaining)} — أدخل المبلغ المحصّل:`, String(remaining));
    if (amountStr === null || amountStr === '') return;
    const amount = Number(amountStr);
    if (!amount || amount <= 0) { alert('أدخل مبلغاً صحيحاً'); return; }
    if (amount > remaining) { alert(`المبلغ يتجاوز المتبقي (${fmt(remaining)})`); return; }
    try { await financialApi.collectOldDebt(row.id, { amount, collection_date: today() }); load(); }
    catch (err) { alert(err.message); }
  };

  const removeOldDebt = async (r) => {
    if (!confirm(`حذف الدين القديم «${r.description}» بمبلغ ${fmt(r.amount)}؟`)) return;
    try { await financialApi.removeOldDebt(r.id); load(); } catch (err) { alert(err.message); }
  };

  const removeCapital = async (r) => {
    if (!confirm(`حذف عملية رأس المال بمبلغ ${fmt(r.amount)}؟`)) return;
    try { await financialApi.removeCapital(r.id); load(); } catch (err) { alert(err.message); }
  };

  const removeAdj = async (r) => {
    if (!confirm(`حذف تسوية الصندوق بمبلغ ${fmt(r.amount)}؟`)) return;
    try { await financialApi.removeAdjustment(r.id); load(); } catch (err) { alert(err.message); }
  };

  // Monthly box report derived from ALL movements (unfiltered) so the running balance is correct
  const monthMap = {};
  [...allMovements].slice().reverse().forEach((m) => {
    const mm = String(m.d).slice(0, 7);
    if (!monthMap[mm]) monthMap[mm] = { in: 0, out: 0 };
    if (m.amount >= 0) monthMap[mm].in += m.amount;
    else monthMap[mm].out += -m.amount;
  });
  const months = Object.keys(monthMap).sort((a, b) => b.localeCompare(a));
  let running = 0;
  const monthRows = months.map((mm) => {
    running += monthMap[mm].in - monthMap[mm].out;
    return { month: mm, in: monthMap[mm].in, out: monthMap[mm].out, net: monthMap[mm].in - monthMap[mm].out, balance: running };
  });

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">الصندوق ورأس المال</h1>
          <p className="page-sub">رأس المال = النقدية الفعلية في الصندوق. الديون القديمة مستحقات منفصلة تُضاف عند تحصيلها</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-warning" onClick={() => { setMsg(''); setShowOldDebtForm((v) => !v); setShowCapitalForm(false); setShowAdjForm(false); }}>📒 دين قديم</button>
          <button className="btn btn-primary" onClick={() => { setMsg(''); setShowAdjForm((v) => !v); setShowCapitalForm(false); setShowOldDebtForm(false); }}>🏦 تسوية نقدية</button>
          <button className="btn btn-success" onClick={() => { setMsg(''); setShowCapitalForm((v) => !v); setShowAdjForm(false); setShowOldDebtForm(false); }}>💰 عملية رأس مال</button>
        </div>
      </div>

      {showCapitalForm && (
        <form className="card" onSubmit={saveCapital} style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 16 }}>تسجيل عملية رأس مال <span className="muted" style={{ fontWeight: 400 }}>(يُودع نقداً في الصندوق / يُسحب منه)</span></h3>
          <div className="grid grid-4">
            <div className="form-row">
              <label className="form-label">النوع *</label>
              <select className="select" value={capitalForm.kind} onChange={(e) => setCapitalForm({ ...capitalForm, kind: e.target.value })}>
                <option value="deposit">إيداع رأس مال</option>
                <option value="withdrawal">سحب مالك</option>
              </select>
            </div>
            <div className="form-row">
              <label className="form-label">المبلغ *</label>
              <input className="input" type="number" step="0.01" min="0" value={capitalForm.amount} onChange={(e) => setCapitalForm({ ...capitalForm, amount: e.target.value })} required />
            </div>
            <div className="form-row">
              <label className="form-label">التاريخ *</label>
              <input className="input" type="date" value={capitalForm.txn_date} onChange={(e) => setCapitalForm({ ...capitalForm, txn_date: e.target.value })} required />
            </div>
            <div className="form-row">
              <label className="form-label">ملاحظات</label>
              <input className="input" value={capitalForm.notes} onChange={(e) => setCapitalForm({ ...capitalForm, notes: e.target.value })} placeholder="مثال: رأس المال الافتتاحي" />
            </div>
          </div>
          {msg && <div className="form-error" style={{ marginTop: 0 }}>{msg}</div>}
          <button className="btn btn-success btn-sm" type="submit">حفظ</button>{' '}
          <button className="btn btn-outline btn-sm" type="button" onClick={() => setShowCapitalForm(false)}>إلغاء</button>
        </form>
      )}

      {showAdjForm && (
        <form className="card" onSubmit={saveAdj} style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 16 }}>تسوية نقدية في الصندوق <span className="muted" style={{ fontWeight: 400 }}>(رصيد بداية نقدي، أضافات/مسحوبات يدوية)</span></h3>
          <div className="grid grid-4">
            <div className="form-row">
              <label className="form-label">النوع *</label>
              <select className="select" value={adjForm.kind} onChange={(e) => setAdjForm({ ...adjForm, kind: e.target.value })}>
                <option value="in">إضافة نقدية للصندوق</option>
                <option value="out">خصم نقدي من الصندوق</option>
              </select>
            </div>
            <div className="form-row">
              <label className="form-label">المبلغ *</label>
              <input className="input" type="number" step="0.01" min="0" value={adjForm.amount} onChange={(e) => setAdjForm({ ...adjForm, amount: e.target.value })} required />
            </div>
            <div className="form-row">
              <label className="form-label">التاريخ *</label>
              <input className="input" type="date" value={adjForm.adj_date} onChange={(e) => setAdjForm({ ...adjForm, adj_date: e.target.value })} required />
            </div>
            <div className="form-row">
              <label className="form-label">ملاحظات</label>
              <input className="input" value={adjForm.notes} onChange={(e) => setAdjForm({ ...adjForm, notes: e.target.value })} placeholder="مثال: رصيد نقدي في بداية النظام" />
            </div>
          </div>
          {msg && <div className="form-error" style={{ marginTop: 0 }}>{msg}</div>}
          <button className="btn btn-success btn-sm" type="submit">حفظ</button>{' '}
          <button className="btn btn-outline btn-sm" type="button" onClick={() => setShowAdjForm(false)}>إلغاء</button>
        </form>
      )}

      {showOldDebtForm && (
        <form className="card" onSubmit={saveOldDebt} style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 16 }}>تسجيل دين قديم <span className="muted" style={{ fontWeight: 400 }}>(مستحقات من النظام السابق — تُحسب في رأس المال عند تحصيلها نقداً)</span></h3>
          <div className="grid grid-2">
            <div className="form-row">
              <label className="form-label">الوصف / المصدر *</label>
              <input className="input" value={oldDebtForm.description} onChange={(e) => setOldDebtForm({ ...oldDebtForm, description: e.target.value })} placeholder="مثال: ديون زبائن من النظام القديم" />
            </div>
            <div className="form-row">
              <label className="form-label">المبلغ *</label>
              <input className="input" type="number" step="0.01" min="0" value={oldDebtForm.amount} onChange={(e) => setOldDebtForm({ ...oldDebtForm, amount: e.target.value })} required />
            </div>
          </div>
          {msg && <div className="form-error" style={{ marginTop: 0 }}>{msg}</div>}
          <button className="btn btn-success btn-sm" type="submit">حفظ</button>{' '}
          <button className="btn btn-outline btn-sm" type="button" onClick={() => setShowOldDebtForm(false)}>إلغاء</button>
        </form>
      )}

      {/* Summary cards */}
      <div className="grid grid-4" style={{ marginBottom: 8 }}>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: Number(overview?.cash_box) >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(overview?.cash_box)}</div>
          <div className="stat-label">رأس المال (النقدية الفعلية في الصندوق)</div>
          <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>كل ما هو نقد فعلاً في الصندوق</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#f59e0b' }}>{fmt(overview?.old_debts)}</div>
          <div className="stat-label">الديون القديمة (مستحقات لم تُحصَّل بعد)</div>
          <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>تُضاف لرأس المال فقط عند تحصيلها نقداً</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#2563eb' }}>{fmt(overview?.total_collections)}</div>
          <div className="stat-label">إجمالي التحصيلات من الزبائن</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: overview?.profit >= 0 ? '#8b5cf6' : '#dc2626' }}>{fmt(overview?.profit)}</div>
          <div className="stat-label">الربح (هامش الحاويات)</div>
        </div>
      </div>
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: Number(overview?.customer_debt) > 0 ? '#dc2626' : Number(overview?.customer_debt) < 0 ? '#f59e0b' : '#16a34a' }}>{fmt(overview?.customer_debt)}</div>
          <div className="stat-label">{Number(overview?.customer_debt) > 0 ? 'ديون الزبناء (تحصيل قادم)' : Number(overview?.customer_debt) < 0 ? 'فائض الزبناء (دفعات مقدمة)' : 'متوازن (لا ديون ولا سلف)'}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#2563eb' }}>{fmt(overview?.total_container_costs)}</div>
          <div className="stat-label">تكاليف الحاويات المدفوعة</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#64748b' }}>{fmt(overview?.total_general_expenses)}</div>
          <div className="stat-label">مصاريف المؤسسة</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: '#d946ef' }}>{fmt(overview?.total_salary_paid)}</div>
          <div className="stat-label">رواتب الموظفين المدفوعة</div>
        </div>
      </div>

      {/* Model explanation */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <b>كيف يُحسب رأس المال؟</b>
        </div>
        <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>
          <b>رأس المال = النقدية الفعلية في الصندوق فقط.</b> لا يُضاف دين قديم لرأس المال إلا عندما
          يُحصَّل نقداً — وعندها يدخل المبلغ الصندوق ويرفع رأس المال، ولا يُحسب مرتين.
          <br />
          النقدية في الصندوق = إيداعات رأس المال + تسويات + التحصيلات من الزبائن + تحصيل الديون القديمة
          − تكاليف الحاويات المدفوعة − مصاريف المؤسسة − الرواتب المدفوعة (المصاريف والتكاليف تُخصم من الصندوق فقط).
          <br />
          دفعات الرواتب تُسجَّل من صفحة «رواتب الموظفين» وتُخصم تلقائياً من نقدية الصندوق هنا.
          <br />
          <b className="muted">الديون القديمة المتبقية</b> تُعرض كرقم مستقل «مستحقات لم تُحصَّل» للتعرف على ما ينتظر
          في السوق، لكنها لا تكبّر رأس المال المخزَّن نقداً.
        </p>
      </div>

      {/* Old debts management */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px 0', flexWrap: 'wrap', gap: 8 }}>
          <h3>📒 الديون القديمة <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>(مستحقات سابقة — تُضاف لرأس المال عند تحصيلها نقداً)</span></h3>
          <span className="muted">المتبقي: <b style={{ color: '#f59e0b' }}>{fmt(overview?.old_debts)}</b></span>
        </div>
        <div style={{ padding: 12 }}>
          <table className="table">
            <thead>
              <tr><th>الوصف / المصدر</th><th>المبلغ</th><th>المحصَّل</th><th>المتبقي</th><th></th></tr>
            </thead>
            <tbody>
              {oldDebts.length === 0 && (
                <tr><td colSpan="5" className="muted" style={{ textAlign: 'center', padding: 20 }}>لا ديون قديمة مسجلة — أضف مستحقات النظام السابق ليتم تحصيلها لاحقاً</td></tr>
              )}
              {oldDebts.map((r) => (
                <tr key={r.id}>
                  <td>{r.description}</td>
                  <td className="nowrap" style={{ fontWeight: 700 }}>{fmt(r.amount)}</td>
                  <td className="nowrap" style={{ color: '#16a34a' }}>{fmt(r.collected)}</td>
                  <td className="nowrap" style={{ fontWeight: 800, color: r.remaining > 0 ? '#f59e0b' : '#16a34a' }}>{fmt(r.remaining)}</td>
                  <td className="nowrap">
                    <button className="btn btn-success btn-sm" disabled={r.remaining <= 0} onClick={() => collectOldDebt(r)}>تحصيل</button>{' '}
                    <button className="btn btn-danger btn-sm" disabled={r.collected > 0} onClick={() => removeOldDebt(r)}>حذف</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        {/* Movements ledger */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px 0', flexWrap: 'wrap', gap: 8 }}>
            <h3>🧾 حركة الصندوق</h3>
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="input" type="date" style={{ width: 120 }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              <input className="input" type="date" style={{ width: 120 }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
          <div style={{ padding: 12 }}>
            <table className="table">
              <thead>
                <tr><th>التاريخ</th><th>الحركة</th><th>الوصف</th><th>المبلغ</th></tr>
              </thead>
              <tbody>
                {movements.length === 0 && !loading && (
                  <tr><td colSpan="4" className="muted" style={{ textAlign: 'center', padding: 20 }}>لا توجد حركات في هذه الفترة</td></tr>
                )}
                {movements.map((m, i) => {
                  const meta = kindMeta[m.kind] || { label: m.kind, color: '#64748b' };
                  return (
                    <tr key={i}>
                      <td className="nowrap muted">{m.d}</td>
                      <td><span style={{ background: meta.color + '1a', color: meta.color, fontWeight: 700, padding: '2px 8px', borderRadius: 6 }}>{meta.label}</span></td>
                      <td>{m.descr}{m.ref ? <span className="muted"> — {m.ref}</span> : null}</td>
                      <td className="nowrap" style={{ fontWeight: 700, color: m.amount >= 0 ? '#16a34a' : '#dc2626' }}>
                        {m.amount >= 0 ? '+' : ''}{fmt(m.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Monthly box report */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <h3 style={{ padding: '16px 20px 0' }}>📅 تقرير الصندوق الشهري</h3>
          <div style={{ padding: 12 }}>
            <table className="table">
              <thead>
                <tr><th>الشهر</th><th>دخول (تحصيل)</th><th>خروج</th><th>صافي الشهر</th><th>الرصيد التراكمي</th></tr>
              </thead>
              <tbody>
                {monthRows.length === 0 && (
                  <tr><td colSpan="5" className="muted" style={{ textAlign: 'center', padding: 20 }}>لا توجد بيانات بعد</td></tr>
                )}
                {monthRows.map((m) => (
                  <tr key={m.month}>
                    <td><b>{m.month}</b></td>
                    <td style={{ color: '#16a34a', fontWeight: 700 }}>+{fmt(m.in)}</td>
                    <td style={{ color: '#dc2626', fontWeight: 700 }}>−{fmt(m.out)}</td>
                    <td style={{ color: m.net >= 0 ? '#16a34a' : '#dc2626', fontWeight: 700 }}>{fmt(m.net)}</td>
                    <td style={{ fontWeight: 800 }}>{fmt(m.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid-2">
        {/* Capital transactions */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <h3 style={{ padding: '16px 20px 0' }}>💼 عمليات رأس المال</h3>
          <div style={{ padding: 12 }}>
            <table className="table">
              <thead>
                <tr><th>التاريخ</th><th>النوع</th><th>المبلغ</th><th>ملاحظات</th><th></th></tr>
              </thead>
              <tbody>
                {capitalRows.length === 0 && (
                  <tr><td colSpan="5" className="muted" style={{ textAlign: 'center', padding: 20 }}>سجّل رأس المال الافتتاحي أولاً</td></tr>
                )}
                {capitalRows.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap">{r.txn_date}</td>
                    <td>{r.amount > 0 ? <span className="badge badge-paid">إيداع</span> : <span className="badge badge-processing">سحب</span>}</td>
                    <td className="nowrap" style={{ fontWeight: 700, color: r.amount >= 0 ? '#16a34a' : '#dc2626' }}>{r.amount >= 0 ? '+' : ''}{fmt(r.amount)}</td>
                    <td className="muted">{r.notes || '—'}</td>
                    <td><button className="btn btn-danger btn-sm" onClick={() => removeCapital(r)}>حذف</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Cashbox adjustments */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <h3 style={{ padding: '16px 20px 0' }}>🏦 تسويات الصندوق <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>(رصيد بداية / تعديل يدوي)</span></h3>
          <div style={{ padding: 12 }}>
            <table className="table">
              <thead>
                <tr><th>التاريخ</th><th>النوع</th><th>المبلغ</th><th>ملاحظات</th><th></th></tr>
              </thead>
              <tbody>
                {adjRows.length === 0 && (
                  <tr><td colSpan="5" className="muted" style={{ textAlign: 'center', padding: 20 }}>سجّل رصيد الصندوق النقدي الفعلي عند البدء هنا</td></tr>
                )}
                {adjRows.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap">{r.adj_date}</td>
                    <td>{r.amount > 0 ? <span className="badge badge-paid">إضافة</span> : <span className="badge badge-processing">خصم</span>}</td>
                    <td className="nowrap" style={{ fontWeight: 700, color: r.amount >= 0 ? '#16a34a' : '#dc2626' }}>{r.amount >= 0 ? '+' : ''}{fmt(r.amount)}</td>
                    <td className="muted">{r.notes || '—'}</td>
                    <td><button className="btn btn-danger btn-sm" onClick={() => removeAdj(r)}>حذف</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}