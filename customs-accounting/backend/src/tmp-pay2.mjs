import pg from 'pg';
const pool = new pg.Pool({ host: 'localhost', port: 5432, user: 'customs', password: 'customs_pass', database: 'customs_accounting' });
const base = 'http://localhost:4000/api';
const adminLogin = await (await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) })).json();
const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminLogin.token };
const ok = (l, c, e = '') => console.log((c ? 'PASS' : 'FAIL') + ' | ' + l + (e ? ' | ' + e : ''));

const types = await (await fetch(base + '/invoice-types', { headers: H })).json();
const liq = types.find((t) => t.name === 'LIQUIDATION');

const wouldBe = await (await fetch(base + '/containers/1', { headers: H })).json();
console.log('current invoices on container 1:', wouldBe.invoices.map((i) => i.type_name + '=' + i.amount).join(', ') || 'none');

// create temp employee and test
await pool.query("INSERT INTO users (username, password_hash, full_name, role) VALUES ('tmpe', crypt('tmpe', gen_salt('bf')), 'temp', 'employee') ON CONFLICT (username) DO NOTHING");
const empLogin = await (await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'tmpe', password: 'tmpe' }) })).json();
const EH = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + empLogin.token };
const eTypes = await (await fetch(base + '/invoice-types', { headers: EH })).json();
ok('employee sees 17 charge types, no LIQUIDATION', eTypes.length === 17 && !eTypes.some((t) => t.name === 'LIQUIDATION'), String(eTypes.length));
const ev = await (await fetch(base + '/containers/1', { headers: EH })).json();
ok('employee does NOT see manager (LIQUIDATION) invoice', ev.invoices.length === 2 && !ev.invoices.some((i) => i.allowed_role === 'manager'), 'len=' + ev.invoices.length);
const frt = eTypes.find((t) => t.name === 'Facture Port');
const einv = await (await fetch(base + '/containers/1/invoices', { method: 'POST', headers: EH, body: JSON.stringify({ invoice_type_id: frt.id, amount: 10, entry_date: '2026-09-09' }) })).json();
ok('employee can pay a charge', !einv.error, einv.error);
const liqAttempt = await (await fetch(base + '/containers/1/invoices', { method: 'POST', headers: EH, body: JSON.stringify({ invoice_type_id: liq.id, invoice_number: 'X', amount: 5, entry_date: '2026-09-09' }) })).json();
ok('employee cannot create LIQUIDATION (403)', liqAttempt.error === 'هذه الفاتورة للمدير فقط', liqAttempt.error);

// cleanup everything from tests
await pool.query("DELETE FROM users WHERE username='tmpe'");
await pool.query("DELETE FROM invoices WHERE invoice_number='LIQ-TEST-1' OR invoice_number='T1'");
await pool.query("DELETE FROM invoices i USING invoice_types t WHERE i.invoice_type_id=t.id AND i.amount IN (15000,7000,3000,10)");
await pool.query("UPDATE containers SET status='registered', updated_at=now() WHERE id=1");
const d2 = await (await fetch(base + '/containers/1', { headers: H })).json();
ok('cleanup: no invoices remain, status registered', d2.invoices.length === 0 && d2.container.status === 'registered', 'left=' + d2.invoices.length + ' status=' + d2.container.status);
await pool.end();