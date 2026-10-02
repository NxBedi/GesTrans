import pg from 'pg';
const pool = new pg.Pool({ host: 'localhost', port: 5432, user: 'customs', password: 'customs_pass', database: 'customs_accounting' });
const base = 'http://localhost:4000/api';
const login = await (await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) })).json();
const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + login.token };
const ok = (l, c, e = '') => console.log((c ? 'PASS' : 'FAIL') + ' | ' + l + (e ? ' | ' + e : ''));

const types = await (await fetch(base + '/invoice-types', { headers: H })).json();
const liq = types.find((t) => t.name === 'LIQUIDATION');
const cust = await (await fetch(base + '/customers', { headers: H })).json();
const created = await (await fetch(base + '/containers', { method: 'POST', headers: H, body: JSON.stringify({ bl_number: 'TMP-LIQ-TEST', registration_date: '2026-09-09', customer_id: cust[0].id, container_number: 'TEST123', contents: 'test' }) })).json();
const cid = created.id;
const addInv = async (tid, amt) => {
  const r = await (await fetch(base + `/containers/${cid}/invoices`, { method: 'POST', headers: H, body: JSON.stringify({ invoice_type_id: tid, amount: amt, entry_date: '2026-09-09' }) })).json();
  if (r.error) throw new Error(r.error);
  return r;
};
try {
  const t1 = types.find((t) => t.name === 'TS Douane');
  await addInv(t1.id, 1000);
  await addInv(liq.id, 999);
  await addInv(liq.id, 1); // second LIQUIDATION allowed? verify same-as-other-rows (no 409 now)
  const d = await (await fetch(base + `/containers/${cid}`, { headers: H })).json();
  const sum = d.invoices.reduce((s, i) => s + Number(i.amount), 0);
  const liqRows = d.invoices.filter((i) => i.type_name === 'LIQUIDATION');
  ok('LIQUIDATION appears as a line item (page payload)', liqRows.length >= 1, 'rows=' + liqRows.length);
  ok('LIQUIDATION behaves like other rows (multiple allowed)', liqRows.length === 2);
  ok('total charges = 1,000 + 999 + 1 = 2,000', Number(d.totals.total_costs) === 2000, String(d.totals.total_costs));
  ok('employee_total includes all LIQUIDATION amounts', Number(d.totals.employee_total) === 2000, String(d.totals.employee_total));
  ok('no manager-type special handling triggered (no auto override)', liqRows.every((i) => Number(i.amount) === (i.amount === '999.00' ? 999 : 1)), '');
} catch (e) { console.log('FAIL | ' + e.message); }

const del = await (await fetch(base + `/containers/${cid}`, { method: 'DELETE', headers: H })).json();
ok('temp container deleted', del === null || !del.error, JSON.stringify(del));
await pool.end();