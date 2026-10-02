import { Router } from 'express';
import { query } from '../db.js';
import { authRequired, allowRoles } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

function serialize(row) {
  return { id: row.id, name: row.name, phone: row.phone, email: row.email, address: row.address, notes: row.notes, is_active: row.is_active, opening_balance: Number(row.opening_balance || 0), due_date: row.due_date || null, created_at: row.created_at };
}

// GET /api/customers - everyone can read (employees need the list to register containers)
router.get('/', async (req, res) => {
  const { rows } = await query('SELECT * FROM customers ORDER BY name');
  res.json(rows.map(serialize));
});

// POST /api/customers (manager only)
router.post('/', allowRoles('manager'), async (req, res) => {
  const { name, phone, email, address, notes, opening_balance } = req.body || {};
  if (!name) return res.status(400).json({ error: 'اسم الزبون مطلوب' });
  const ob = Number(opening_balance);
  if (opening_balance !== undefined && opening_balance !== '' && !isFinite(ob)) {
    return res.status(400).json({ error: 'الدين السابق يجب أن يكون رقماً' });
  }
  const { rows } = await query(
    `INSERT INTO customers (name, phone, email, address, notes, opening_balance)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [name.trim(), phone || null, email || null, address || null, notes || null, Number(ob) || 0]
  );
  res.status(201).json(serialize(rows[0]));
});

async function parseActive(is_active, current) {
  if (is_active === undefined) return current;
  return is_active === true || is_active === 'true' || is_active === 1;
}

// PUT /api/customers/:id (manager only)
router.put('/:id', allowRoles('manager'), async (req, res) => {
  const id = Number(req.params.id);
  const { name, phone, email, address, notes, is_active, opening_balance, due_date } = req.body || {};
  if (name !== undefined && !String(name).trim()) {
    return res.status(400).json({ error: 'اسم الزبون مطلوب' });
  }
  const cur = await query('SELECT * FROM customers WHERE id = $1', [id]);
  if (!cur.rows.length) return res.status(404).json({ error: 'الزبون غير موجود' });
  const ob = Number(opening_balance);
  if (opening_balance !== undefined && opening_balance !== '' && !isFinite(ob)) {
    return res.status(400).json({ error: 'الدين السابق يجب أن يكون رقماً' });
  }
  const nextName = name !== undefined ? String(name).trim() : cur.rows[0].name;
  const nextPhone = phone !== undefined ? (phone || null) : cur.rows[0].phone;
  const nextEmail = email !== undefined ? (email || null) : cur.rows[0].email;
  const nextAddress = address !== undefined ? (address || null) : cur.rows[0].address;
  const nextNotes = notes !== undefined ? (notes || null) : cur.rows[0].notes;
  const nextDueDate = due_date !== undefined && due_date !== '' ? String(due_date).trim() : null;
  const nextOb = isFinite(ob) ? (Number(ob) || 0) : cur.rows[0].opening_balance;
  const { rows } = await query(
    `UPDATE customers SET name = $1, phone = $2, email = $3, address = $4, notes = $5,
       is_active = $6, opening_balance = $7, due_date = $8, updated_at = now()
     WHERE id = $9 RETURNING *`,
    [nextName, nextPhone, nextEmail, nextAddress, nextNotes,
     await parseActive(is_active, cur.rows[0].is_active), nextOb, nextDueDate, id]
  );
  res.json(serialize(rows[0]));
});

// GET /api/customers/:id/old-debts - list old debts (رصيد سابق) for a customer
router.get('/:id/old-debts', allowRoles('manager'), async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await query(
    `SELECT od.id, od.kind, od.amount, to_char(od.debt_date, 'YYYY-MM-DD') AS debt_date, od.notes, od.created_at,
            u.full_name AS entered_by_name
     FROM customer_old_debts od
     LEFT JOIN users u ON u.id = od.entered_by
     WHERE od.customer_id = $1
     ORDER BY od.debt_date ASC, od.id ASC`, [id]);
  res.json(rows.map((r) => ({ ...r, amount: Number(r.amount) })));
});

// POST /api/customers/:id/old-debts - record old debt (رصيد سابق) inside a customer account.
// It raises the customer's balance/debt but is NOT a cash movement (no cash box / capital effect).
router.post('/:id/old-debts', allowRoles('manager'), async (req, res) => {
  const id = Number(req.params.id);
  const { amount, debt_date, notes } = req.body || {};
  const amt = Number(amount);
  if (!isFinite(amt) || amt <= 0) {
    return res.status(400).json({ error: 'المبلغ مطلوب ويجب أن يكون أكبر من صفر' });
  }
  if (!debt_date || !/^\d{4}-\d{2}-\d{2}$/.test(String(debt_date))) {
    return res.status(400).json({ error: 'تاريخ الدين الأصلي مطلوب' });
  }
  const today = new Date().toISOString().slice(0, 10);
  if (String(debt_date) > today) {
    return res.status(400).json({ error: 'تاريخ الدين القديم لا يمكن أن يكون في المستقبل' });
  }
  const cust = await query('SELECT id FROM customers WHERE id = $1', [id]);
  if (!cust.rows.length) return res.status(404).json({ error: 'الزبون غير موجود' });
  const { rows } = await query(
    `INSERT INTO customer_old_debts (customer_id, amount, debt_date, notes, entered_by)
     VALUES ($1, $2, $3::date, $4, $5) RETURNING *`,
    [id, amt, String(debt_date), notes || null, req.user.id]);
  res.status(201).json({ ...rows[0], amount: Number(rows[0].amount), debt_date: String(debt_date) });
});

// DELETE /api/customers/:id/old-debts/:oid - remove an old debt entry
router.delete('/:id/old-debts/:oid', allowRoles('manager'), async (req, res) => {
  const id = Number(req.params.id);
  const oid = Number(req.params.oid);
  const { rowCount } = await query('DELETE FROM customer_old_debts WHERE id = $1 AND customer_id = $2', [oid, id]);
  if (!rowCount) return res.status(404).json({ error: 'القيد غير موجود' });
  res.status(204).end();
});

// GET /api/customers/:id/statement?from=&to= - chronological account statement with running balance.
// Entries: old debts (رصيد سابق), priced container invoices (مَدين), payments/إيداع (دائن).
// When a period is requested, `period.opening` is the balance just before `from`.
router.get('/:id/statement', allowRoles('manager'), async (req, res) => {
  const id = Number(req.params.id);
  const f = req.query.from && req.query.from !== 'undefined' ? String(req.query.from) : null;
  const t = req.query.to && req.query.to !== 'undefined' ? String(req.query.to) : null;
  const cust = await query('SELECT * FROM customers WHERE id = $1', [id]);
  if (!cust.rows.length) return res.status(404).json({ error: 'الزبون غير موجود' });

  const [oldDebtRows, invRows, payRows] = await Promise.all([
    query('SELECT id, amount, debt_date, notes FROM customer_old_debts WHERE customer_id = $1 ORDER BY debt_date, id', [id]),
    query(`
      SELECT c.id AS cid, c.bl_number, c.container_number, p.final_price,
             COALESCE(p.updated_at::date, c.registration_date) AS sale_date
      FROM containers c
      JOIN pricing p ON p.container_id = c.id
      WHERE c.customer_id = $1
      ORDER BY sale_date, c.id`, [id]),
    query('SELECT id, amount, payment_date, notes FROM payments WHERE customer_id = $1 ORDER BY payment_date, id', [id]),
  ]);

  const openingBalance = Number(cust.rows[0].opening_balance || 0);
  const oldTotal = oldDebtRows.rows.reduce((s, r) => s + Number(r.amount), 0);
  const billed = invRows.rows.reduce((s, r) => s + Number(r.final_price), 0);
  const paid = payRows.rows.reduce((s, r) => s + Number(r.amount), 0);
  const balance = +(openingBalance + oldTotal + billed - paid).toFixed(2);

  // assemble every ledger row (chronological order)
  const entries = [];
  for (const r of oldDebtRows.rows) {
    entries.push({
      date: String(r.debt_date).slice(0, 10), seq: 1, kind: 'old_debt',
      description: 'Old Debt / دين قديم — رصيد سابق',
      reference: r.notes || null, debit: Number(r.amount), credit: null,
    });
  }
  for (const r of invRows.rows) {
    entries.push({
      date: String(r.sale_date).slice(0, 10), seq: 2, kind: 'invoice',
      description: `فاتورة حاوية — BL ${r.bl_number}${r.container_number ? ` (${r.container_number})` : ''}`,
      reference: null, debit: Number(r.final_price), credit: null,
    });
  }
  for (const r of payRows.rows) {
    entries.push({
      date: String(r.payment_date).slice(0, 10), seq: 3, kind: 'payment',
      description: 'دفعة / إيداع', reference: r.notes || null,
      debit: null, credit: Number(r.amount),
    });
  }
  entries.sort((a, b) => (a.date === b.date ? a.seq - b.seq : a.date < b.date ? -1 : 1));

  // running balance across the full ledger
  let run = openingBalance;
  for (const e of entries) {
    run += (e.debit || 0) - (e.credit || 0);
    e.balance = +run.toFixed(2);
  }

  let filtered = entries;
  let periodOpening = null;
  if (f || t) {
    let po = openingBalance;
    for (const e of entries) if (e.date < f) po += (e.debit || 0) - (e.credit || 0);
    periodOpening = +po.toFixed(2);
    filtered = entries.filter((e) => (!f || e.date >= f) && (!t || e.date <= t));
    if (f) {
      filtered = [{ date: f, seq: 0, kind: 'opening', description: 'رصيد أول المدة / Opening balance', reference: null, debit: null, credit: null, balance: periodOpening }, ...filtered];
    }
  }

  res.json({
    customer: serialize(cust.rows[0]),
    period: { from: f, to: t, opening: periodOpening },
    totals: { opening_balance: openingBalance, old_debts: oldTotal, total_billed: billed, total_paid: paid, balance },
    entries: filtered.map((e) => ({
      date: e.date, kind: e.kind, description: e.description, reference: e.reference,
      debit: e.debit == null ? null : Number(e.debit),
      credit: e.credit == null ? null : Number(e.credit),
      balance: Number(e.balance),
    })),
  });
});

// DELETE /api/customers/:id (manager only)
router.delete('/:id', allowRoles('manager'), async (req, res) => {
  const id = Number(req.params.id);
  const used = await query('SELECT 1 FROM containers WHERE customer_id = $1 LIMIT 1', [id]);
  if (used.rows.length) {
    return res.status(400).json({ error: 'لا يمكن حذف زبون له حاويات مسجلة — يمكنك تعطيله بدلاً من ذلك' });
  }
  const payments = await query('SELECT 1 FROM payments WHERE customer_id = $1 LIMIT 1', [id]);
  if (payments.rows.length) {
    return res.status(400).json({ error: 'لا يمكن حذف زبون عليه دفعات مسجلة — يمكنك تعطيله بدلاً من ذلك' });
  }
  const { rowCount } = await query('DELETE FROM customers WHERE id = $1', [id]);
  if (!rowCount) return res.status(404).json({ error: 'الزبون غير موجود' });
  res.status(204).end();
});

export default router;