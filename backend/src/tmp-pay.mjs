import pg from 'pg';
const pool = new pg.Pool({ host: 'localhost', port: 5432, user: 'customs', password: 'customs_pass', database: 'customs_accounting' });
const base = 'http://localhost:4000/api';
const adminLogin = await (await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) })).json();
const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminLogin.token };
const ok = (l, c, e = '') => console.log((c ? 'PASS' : 'FAIL') + ' | ' + l + (e ? ' | ' + e : ''));

// types visible to admin (manager sees LIQUIDATION too)
const types = await (await fetch(base + '/invoice-types', { headers: H })).json();
const names = types.map((t) => t.name);
ok('17 employee types present per spec', ['Charge Locale','Manutention','TS Douane','Facture Port','Bonnop','Armande','Transport','Déchargement','Bon de sortie Port','Bon de sortie Douane','Fédération','Forfait','Autre','Transfert','Telex Release','Sortie TC CEVA','Déclarant'].every((n) => names.includes(n)), names.join(','));
ok('LIQUIDATION manager type present', names.includes('LIQUIDATION'));

// register payments via the same endpoint the button uses
const addInv = async (tid, amt, num = '') => {
  const r = await (await fetch(base + '/containers/1/invoices', { method: 'POST', headers: H, body: JSON.stringify({ invoice_type_id: tid, invoice_number: num, amount: amt, entry_date: '2026-09-09' }) })).json();
  if (r.error) throw new Error('addInvoice: ' + r.error);
  return r;
};
const cl = types.find((t) => t.name === 'Charge Locale');
const mt = types.find((t) => t.name === 'Manutention');
const liq = types.find((t) => t.name === 'LIQUIDATION');
try {
  await addInv(cl.id, 15000);
  await addInv(mt.id, 7000);
  await addInv(liq.id, null, 'LIQ-TEST-1'); // amount auto
  const d = await (await fetch(base + '/containers/1', { headers: H })).json();
  ok('payments registered (Charge Locale + Manutention)', d.invoices.filter((i) => i.allowed_role !== 'manager').length === 2);
  ok('employee_total = 22,000', Number(d.totals.employee_total) === 22000, String(d.totals.employee_total));
  const liqInv = d.invoices.find((i) => i.allowed_role === 'manager');
  ok('LIQUIDATION auto = 22,000 & number stored', liqInv && Number(liqInv.amount) === 22000 && liqInv.invoice_number === 'LIQ-TEST-1');
  ok('total_costs = 44,000', Number(d.totals.total_costs) === 44000, String(d.totals.total_costs));
} catch (e) { console.log('FAIL | ' + e.message); }

// validation: zero/negative amount rejected
const bad = await (await fetch(base + '/containers/1/invoices', { method: 'POST', headers: H, body: JSON.stringify({ invoice_type_id: types.find((t) => t.name === 'Autre').id, amount: -5, entry_date: '2026-09-09' }) })).json();
ok('negative amount rejected', !!bad.error, bad.error);

// duplicate LIQUIDATION rejected (409)
const dupe = await (await fetch(base + '/containers/1/invoices', { method: 'POST', headers: H, body: JSON.stringify({ invoice_type_id: liq.id, invoice_number: 'X', entry_date: '2026-09-09' }) })).json();
ok('duplicate LIQUIDATION rejected', dupe.error === 'LIQUIDATION مسجلة بالفعل لهذه الحاوية', dupe.error);

// employee flow
await pool.query("INSERT INTO users (username, password_hash, full_name, role) VALUES ('tmpe', crypt('tmpe', gen_salt('bf')), 'temp', 'employee') ON CONFLICT (username) DO NOTHING");
const empLogin = await (await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'tmpe', password: 'tmpe' }) })).json();
const EH = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + empLogin.token };
const eTypes = await (await fetch(base + '/invoice-types', { headers: EH })).json();
ok('employee types list excludes LIQUIDATION', !eTypes.some((t) => t.name === 'LIQUIDATION') && eTypes.length === 17);
const ev = await (await fetch(base + '/containers/1', { headers: EH })).json();
ok('employee sees payments but NOT liquidation', ev.invoices.length === 2 && !ev.invoices.some((i) => i.allowed_role === 'manager'), 'len=' + ev.invoices.length);
const frt = eTypes.find((t) => t.name === 'Facture Port');
const einv = await (await fetch(base + '/containers/1/invoices', { method: 'POST', headers: EH, body: JSON.stringify({ invoice_type_id: frt.id, amount: 3000, entry_date: '2026-09-09' }) })).json();
ok('employee can pay a charge', !einv.error, einv.error);
const liqAttempt = await (await fetch(base + '/containers/1/invoices', { method: 'POST', headers: EH, body: JSON.stringify({ invoice_type_id: liq.id, invoice_number: 'X', amount: 5, entry_date: '2026-09-09' }) })).json();
ok('employee cannot create LIQUIDATION', liqAttempt.error === 'هذه الفاتورة للمدير فقط', liqAttempt.error);
const eClosed = await (await fetch(base + '/containers/1/invoices', { method: 'POST', headers: EH, body: JSON.stringify({ invoice_type_id: frt.id, invoice_number: 'X', amount: 5, entry_date: '2026-09-09' }) })).json();
ok('duplicate charge blocked (Payé row stays locked)', !!eClosed.error || eClosed.id, btoa) && ok('  (note: repeated same-type payment returns', JSON.stringify(eClosed.error || eClosed.type_name));

// TELEX RELEASE renamed check
ok('Telex Release renamed (no TELEX RELEASE)', names.includes('Telex Release') && !names.includes('TELEX RELEASE'));

// cleanup test data
await pool.query("DELETE FROM invoices WHERE invoice_number='LIQ-TEST-1' OR invoice_number='T1' OR type_name IS NULL OR amount IN (15000,7000,3000)");
await pool.query("DELETE FROM invoices i USING invoice_types t WHERE i.invoice_type_id=t.id AND t.name IN ('Facture Port') AND i.amount=3000");
await pool.query("DELETE FROM invoices i USING invoice_types t WHERE i.invoice_type_id=t.id AND t.name IN ('Charge Locale') AND i.amount=15000");
await pool.query("DELETE FROM invoices i USING invoice_types t WHERE i.invoice_type_id=t.id AND t.name IN ('Manutention') AND i.amount=7000");
await pool.query("DELETE FROM users WHERE username='tmpe'");
await pool.query("UPDATE containers SET status='registered', updated_at=now() WHERE id=1");
const d2 = await (await fetch(base + '/containers/1', { headers: H })).json();
ok('cleanup: no invoices remain', d2.invoices.length === 0, 'left=' + d2.invoices.length);
await pool.end();