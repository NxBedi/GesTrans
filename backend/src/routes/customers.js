import { Router } from 'express';
import { query } from '../db.js';
import { authRequired, allowRoles } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

function serialize(row) {
  return { id: row.id, name: row.name, phone: row.phone, email: row.email, address: row.address, notes: row.notes, is_active: row.is_active, opening_balance: Number(row.opening_balance || 0), created_at: row.created_at };
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
  const { name, phone, email, address, notes, is_active, opening_balance } = req.body || {};
  if (name !== undefined && !String(name).trim()) {
    return res.status(400).json({ error: 'اسم الزبون مطلوب' });
  }
  const cur = await query('SELECT is_active, opening_balance_migrated FROM customers WHERE id = $1', [id]);
  if (!cur.rows.length) return res.status(404).json({ error: 'الزبون غير موجود' });
  const ob = Number(opening_balance);
  if (opening_balance !== undefined && opening_balance !== '' && !isFinite(ob)) {
    return res.status(400).json({ error: 'الدين السابق يجب أن يكون رقماً' });
  }
  if (ob !== 0 && cur.rows[0].opening_balance_migrated) {
    return res.status(400).json({ error: 'رصيد هذا الزبون السابق رُحّل بالفعل إلى الديون القديمة؛ سجّل ديناً جديداً من صفحة الحسابات' });
  }
  const { rows } = await query(
    `UPDATE customers SET name = $1, phone = $2, email = $3, address = $4, notes = $5,
       is_active = $6, opening_balance = $7, updated_at = now()
     WHERE id = $8 RETURNING *`,
    [String(name || '').trim(), phone || null, email || null, address || null, notes || null,
     await parseActive(is_active, cur.rows[0].is_active), Number(ob) || 0, id]
  );
  res.json(serialize(rows[0]));
});

// PUT /api/customers/:id/opening-balance - manager: set carried-over previous debt.
// This is a one-shot seed: the amount is migrated into old_debts on the next server boot,
// so it NEVER touches the cashbox and cannot be edited again afterwards.
// Collected old debts enter the cashbox (رأس المال = النقد فقط).
router.put('/:id/opening-balance', allowRoles('manager'), async (req, res) => {
  const id = Number(req.params.id);
  const { opening_balance } = req.body || {};
  const ob = Number(opening_balance);
  if (opening_balance === undefined || opening_balance === '' || !isFinite(ob) || ob < 0) {
    return res.status(400).json({ error: 'أدخل ديناً سابقاً صحيحاً غير سالب' });
  }
  const cur = await query('SELECT opening_balance_migrated FROM customers WHERE id = $1', [id]);
  if (!cur.rows.length) return res.status(404).json({ error: 'الزبون غير موجود' });
  if (cur.rows[0].opening_balance_migrated) {
    return res.status(400).json({ error: 'رصيد هذا الزبون السابق رُحّل بالفعل؛ سجّل ديناً جديداً من صفحة الحسابات' });
  }
  const { rows } = await query(
    'UPDATE customers SET opening_balance = $1, opening_balance_migrated = FALSE, updated_at = now() WHERE id = $2 RETURNING *',
    [ob, id]
  );
  res.json(serialize(rows[0]));
});

// GET /api/customers/:id/statement - manager: full account statement for a customer (كشف حساب)
router.get('/:id/statement', allowRoles('manager'), async (req, res) => {
  const id = Number(req.params.id);
  const cust = await query('SELECT * FROM customers WHERE id = $1', [id]);
  if (!cust.rows.length) return res.status(404).json({ error: 'الزبون غير موجود' });

  const containers = await query(`
    SELECT c.id, c.bl_number, c.container_number, c.container_type, c.registration_date, c.status,
           (SELECT COALESCE(SUM(i.amount),0)::numeric FROM invoices i WHERE i.container_id = c.id) AS total_costs,
           p.final_price, p.profit, p.updated_at AS priced_at
    FROM containers c
    LEFT JOIN pricing p ON p.container_id = c.id
    WHERE c.customer_id = $1
    ORDER BY c.registration_date DESC, c.id DESC
  `, [id]);

  const payments = await query(`
    SELECT p.id, p.amount, p.payment_date, p.notes, p.created_by, c.bl_number, u.full_name AS created_by_name
    FROM payments p
    LEFT JOIN containers c ON c.id = p.container_id
    LEFT JOIN users u ON u.id = p.created_by
    WHERE p.customer_id = $1
    ORDER BY p.payment_date DESC, p.id DESC
  `, [id]);

  const openingBalance = Number(cust.rows[0].opening_balance || 0);
  const billed = containers.rows.reduce((s, r) => s + Number(r.final_price || 0), 0);
  const paid = payments.rows.reduce((s, r) => s + Number(r.amount || 0), 0);

  res.json({
    customer: serialize(cust.rows[0]),
    containers: containers.rows.map((r) => ({
      ...r,
      total_costs: Number(r.total_costs),
      final_price: r.final_price == null ? null : Number(r.final_price),
      profit: r.profit == null ? null : Number(r.profit),
    })),
    payments: payments.rows.map((r) => ({ ...r, amount: Number(r.amount) })),
    opening_balance: openingBalance,
    total_billed: billed,
    total_paid: paid,
    balance: billed - paid,
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