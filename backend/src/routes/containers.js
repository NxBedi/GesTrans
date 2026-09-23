import { Router } from 'express';
import { query, pool } from '../db.js';
import { authRequired, allowRoles } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

export const CONTAINER_SELECT = `
  SELECT c.*, cu.name AS customer_name,
         u.full_name AS registered_by_name,
         COALESCE(c.free_storage_days, 15) AS free_storage_days,
         CASE WHEN CURRENT_DATE < c.registration_date
              THEN (c.registration_date - CURRENT_DATE)::int
              ELSE 0 END AS days_until_arrival,
         CASE WHEN CURRENT_DATE < c.registration_date THEN NULL
              ELSE GREATEST(0, COALESCE(c.free_storage_days, 15) - (CURRENT_DATE - c.registration_date)) END::int AS free_days_left,
         EXISTS (
           SELECT 1 FROM invoices liq_i
           JOIN invoice_types liq_t ON liq_t.id = liq_i.invoice_type_id AND LOWER(liq_t.name) = 'liquidation'
           WHERE liq_i.container_id = c.id
         ) AS has_liquidation,
         (SELECT COALESCE(SUM(i.amount),0)::numeric
          FROM invoices i
          JOIN invoice_types t ON t.id = i.invoice_type_id
          WHERE i.container_id = c.id AND t.allowed_role <> 'manager') AS costs_amount
  FROM containers c
  JOIN customers cu ON cu.id = c.customer_id
  LEFT JOIN users u ON u.id = c.registered_by
`;

export function getContainerTotals(invoices) {
  const employee = invoices
    .filter((i) => i.allowed_role !== 'manager')
    .reduce((s, i) => s + Number(i.amount), 0);
  const liquidation = invoices
    .filter((i) => i.allowed_role === 'manager')
    .reduce((s, i) => s + Number(i.amount), 0);
  return {
    employee_total: employee,
    liquidation_total: liquidation,
    total_costs: employee + liquidation,
  };
}

// GET /api/containers - work queue: registered & in-progress containers (قائمة Liste BL / الحاويات الجارية)
router.get('/', async (req, res) => {
  const { q, customer_id } = req.query;
  const where = [];
  const params = [];
  params.push('registered', 'processing');
  where.push(`c.status IN ($${params.length - 1}, $${params.length})`);
  if (q) {
    params.push(`%${q}%`);
    where.push(`(c.bl_number ILIKE $${params.length} OR c.container_number ILIKE $${params.length} OR cu.name ILIKE $${params.length} OR c.contents ILIKE $${params.length})`);
  }
  if (customer_id) {
    params.push(Number(customer_id));
    where.push(`c.customer_id = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await query(`
    ${CONTAINER_SELECT}
    ${whereSql}
    ORDER BY c.registration_date DESC, c.id DESC
  `, params);
  res.json(rows);
});

// GET /api/containers/finished - priced containers = الحسابات (posted to client account)
router.get('/finished', allowRoles('manager'), async (req, res) => {
  const { rows } = await query(`
    SELECT c.id, c.bl_number, c.container_number, c.registration_date, c.status,
           cu.name AS customer_name,
           (SELECT COALESCE(SUM(i.amount),0)::numeric FROM invoices i WHERE i.container_id = c.id) AS total_costs,
           p.final_price, p.profit, p.updated_at AS priced_at
    FROM containers c
    JOIN customers cu ON cu.id = c.customer_id
    LEFT JOIN pricing p ON p.container_id = c.id
    WHERE c.status = 'priced'
    ORDER BY c.updated_at DESC, c.id DESC
  `);
  res.json(rows);
});

// GET /api/containers/ready-for-pricing - closed (Liquidated) containers awaiting final price (manager)
router.get('/ready-for-pricing', allowRoles('manager'), async (req, res) => {
  const { rows } = await query(`
    SELECT c.id, c.bl_number, c.container_number, c.registration_date, c.customer_id, c.status,
           cu.name AS customer_name,
           (SELECT COUNT(*)::int FROM invoices i WHERE i.container_id = c.id) AS invoice_count,
           (SELECT COALESCE(SUM(i.amount),0)::numeric FROM invoices i WHERE i.container_id = c.id) AS total_costs
    FROM containers c
    JOIN customers cu ON cu.id = c.customer_id
    WHERE c.status = 'closed'
    ORDER BY c.registration_date DESC, c.id DESC
  `);
  res.json(rows);
});

// GET /api/containers/liquidations - global tracking list of every LIQUIDATION recorded (manager)
// Supports ?from=&to= (entry_date) and ?q= search over BL/container/customer/number
router.get('/liquidations', allowRoles('manager'), async (req, res) => {
  const { from, to, q } = req.query;
  const conds = [];
  const params = [];
  const push = (v) => { params.push(v); return `$${params.length}`; };
  if (from && from !== 'undefined') conds.push(`i.entry_date >= ${push(from)}::date`);
  if (to && to !== 'undefined') conds.push(`i.entry_date < (${push(to)}::date + interval '1 day')`);
  if (q && String(q).trim()) {
    params.push(`%${String(q).trim()}%`);
    conds.push(`(c.bl_number ILIKE $${params.length} OR c.container_number ILIKE $${params.length} OR cu.name ILIKE $${params.length} OR i.invoice_number ILIKE $${params.length})`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const { rows } = await query(`
    SELECT i.id, i.invoice_number, i.amount, i.entry_date, u.full_name AS entered_by_name,
           c.id AS container_id, c.bl_number, c.container_number, c.status AS container_status,
           cu.name AS customer_name
    FROM invoices i
    JOIN invoice_types t ON t.id = i.invoice_type_id AND LOWER(t.name) = 'liquidation'
    JOIN containers c ON c.id = i.container_id
    JOIN customers cu ON cu.id = c.customer_id
    LEFT JOIN users u ON u.id = i.entered_by
    ${where}
    ORDER BY i.entry_date DESC, i.id DESC
  `, params);
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  res.json({
    records: rows.map((r) => ({ ...r, amount: Number(r.amount) })),
    count: rows.length,
    total,
  });
});

// GET /api/containers/:id - detail with invoices, totals, pricing
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await query(`${CONTAINER_SELECT} WHERE c.id = $1`, [id]);

  if (!rows.length || (req.user.role !== 'manager' && !['registered', 'processing'].includes(rows[0].status))) {
    return res.status(404).json({ error: 'الحاوية غير موجودة' });
  }

  const container = rows[0];
  const invResult = await query(`
    SELECT i.*, t.name AS type_name, t.allowed_role, u.full_name AS entered_by_name
    FROM invoices i
    JOIN invoice_types t ON t.id = i.invoice_type_id
    LEFT JOIN users u ON u.id = i.entered_by
    WHERE i.container_id = $1
    ORDER BY i.entry_date, i.id
  `, [id]);

  let invoices = invResult.rows;
  if (req.user.role !== 'manager') {
    invoices = invoices.filter((i) => i.allowed_role !== 'manager');
  }

  const pricingRes = await query('SELECT * FROM pricing WHERE container_id = $1', [id]);
  const pricing = pricingRes.rows[0] || null;

  res.json({ container, invoices, totals: getContainerTotals(invResult.rows), pricing });
});

// POST /api/containers - employee & manager can register
router.post('/', async (req, res) => {
  const { bl_number, registration_date, customer_id, container_number, container_type, contents, quantity, free_storage_days } = req.body || {};
  if (!bl_number || !registration_date || !customer_id || !container_number || !contents) {
    return res.status(400).json({ error: 'جميع الحقول مطلوبة (BL، التاريخ، الزبون، رقم الحاوية، المحتوى)' });
  }
  const type = String(container_type || '40').trim();
  if (!['20', '40'].includes(type)) {
    return res.status(400).json({ error: 'نوع الحاوية يجب أن يكون 20 أو 40' });
  }
  const qty = quantity !== undefined && quantity !== '' ? Number(quantity) : null;
  if (qty !== null && (!Number.isInteger(qty) || qty < 0)) {
    return res.status(400).json({ error: 'الكمية يجب أن تكون عدداً صحيحاً غير سالب' });
  }
  const freeDays = free_storage_days !== undefined && free_storage_days !== '' ? Number(free_storage_days) : 15;
  if (!Number.isInteger(freeDays) || freeDays < 0 || freeDays > 365) {
    return res.status(400).json({ error: 'أيام التخزين المجاني يجب أن تكون عدداً بين 0 و 365' });
  }
  try {
    const { rows } = await query(
      `INSERT INTO containers (bl_number, registration_date, customer_id, container_number, container_type, contents, quantity, free_storage_days, status, registered_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'registered', $9) RETURNING *`,
      [bl_number.trim(), registration_date, Number(customer_id), container_number.trim(), type, contents.trim(), qty, freeDays, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'رقم BL مسجل مسبقاً' });
    if (e.code === '23503') return res.status(400).json({ error: 'الزبون غير موجود' });
    throw e;
  }
});

// PUT /api/containers/:id - manager edits; employee edits only while processing
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await query('SELECT * FROM containers WHERE id = $1', [id]);
  if (!rows.length) return res.status(404).json({ error: 'الحاوية غير موجودة' });
  const cur = rows[0];

  if (req.user.role !== 'manager' && cur.status !== 'processing') {
    return res.status(403).json({ error: 'لا يمكن تعديل حاوية اكتملت معالجتها' });
  }

const { bl_number, registration_date, customer_id, container_number, container_type, contents, quantity, free_storage_days, status } = req.body || {};
  // partial updates keep the current value for any field not sent
  const nextBl = bl_number !== undefined ? String(bl_number).trim() : cur.bl_number;
  const nextDate = registration_date !== undefined ? String(registration_date).trim() : cur.registration_date;
  const nextCtn = container_number !== undefined ? String(container_number).trim() : cur.container_number;
  const nextContents = contents !== undefined ? String(contents).trim() : cur.contents;
  const type = container_type !== undefined ? String(container_type).trim() : cur.container_type;
  if (!['20', '40'].includes(type)) {
    return res.status(400).json({ error: 'نوع الحاوية يجب أن يكون 20 أو 40' });
  }
  const qty = quantity !== undefined && quantity !== '' ? Number(quantity) : cur.quantity;
  if (qty !== null && (!Number.isInteger(qty) || qty < 0)) {
    return res.status(400).json({ error: 'الكمية يجب أن تكون عدداً صحيحاً غير سالب' });
  }
  // required fields cannot be cleared via PUT
  if (!nextBl || !nextDate || !nextCtn || !nextContents) {
    return res.status(400).json({ error: 'جميع الحقول المطلوبة يجب أن تكون غير فارغة' });
  }
// reassigning a container to another customer after it was priced/paid would
  // retroactively move billed amounts between customer accounts
  if ((customer_id !== undefined && Number(customer_id) !== cur.customer_id)
    && ['closed', 'priced'].includes(cur.status)) {
    return res.status(400).json({ error: 'لا يمكن تغيير الزبون بعد إغلاق الحاوية وتسعيرها' });
  }
  // keep the current customer when not sent (Number(undefined) would be NaN)
  const nextCustomerId = customer_id !== undefined ? Number(customer_id) : cur.customer_id;
  if (!Number.isInteger(nextCustomerId)) {
    return res.status(400).json({ error: 'الزبون غير صالح' });
  }
  // employees cannot change the status (that would bypass the pricing flow);
  // managers change status only through the dedicated endpoints (close/pricing/payments/reopen)
  const nextStatus = cur.status;
  const freeDays = free_storage_days !== undefined && free_storage_days !== '' ? Number(free_storage_days) : cur.free_storage_days ?? 15;
  if (!Number.isInteger(freeDays) || freeDays < 0 || freeDays > 365) {
    return res.status(400).json({ error: 'أيام التخزين المجاني يجب أن تكون عدداً بين 0 و 365' });
  }
  try {
    const result = await query(
      `UPDATE containers SET bl_number = $1, registration_date = $2, customer_id = $3,
         container_number = $4, container_type = $5, contents = $6, quantity = $7, free_storage_days = $8, status = $9, updated_at = now()
       WHERE id = $10 RETURNING *`,
      [nextBl, nextDate, nextCustomerId, nextCtn, type, nextContents, qty, freeDays, nextStatus, id]
    );
    res.json(result.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'رقم BL مسجل مسبقاً' });
    throw e;
  }
});

// POST /api/containers/:id/close - manager: Liquidation (إغلاق) → moves to ready-for-pricing list
router.post('/:id/close', allowRoles('manager'), async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await query('SELECT * FROM containers WHERE id = $1', [id]);
  if (!rows.length) return res.status(404).json({ error: 'الحاوية غير موجودة' });
  if (!['registered', 'processing'].includes(rows[0].status)) {
    return res.status(400).json({ error: 'يمكن إغلاق الحاوية وهي مسجلة أو قيد تسجيل الفواتير فقط' });
  }
  const updated = await query(
    "UPDATE containers SET status = 'closed', updated_at = now() WHERE id = $1 RETURNING *",
    [id]
  );
  res.json(updated.rows[0]);
});

// POST /api/containers/:id/reopen - manager: revert a priced container back to
// the open-containers list (الحاويات المفتوحة / Liste BL, status 'processing') atomically.
// Deletes its pricing snapshot and any payments linked to it, so invoices can be
// corrected there and the container re-priced + re-collected.
router.post('/:id/reopen', allowRoles('manager'), async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await query('SELECT id, status FROM containers WHERE id = $1', [id]);
  if (!rows.length) return res.status(404).json({ error: 'الحاوية غير موجودة' });
  if (rows[0].status !== 'priced') {
    return res.status(400).json({ error: 'يمكن إعادة فتح الحاويات المُسعّرة فقط' });
  }

  const summary = {
    had_pricing: false,
    deleted_payments: 0,
    deleted_payment_amount: 0,
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const pricingRes = await client.query('SELECT 1 FROM pricing WHERE container_id = $1', [id]);
    summary.had_pricing = pricingRes.rows.length > 0;
    await client.query('DELETE FROM pricing WHERE container_id = $1', [id]);

    const payRes = await client.query('SELECT COALESCE(SUM(amount),0)::numeric AS total, COUNT(*)::int AS cnt FROM payments WHERE container_id = $1', [id]);
    summary.deleted_payments = Number(payRes.rows[0].cnt);
    summary.deleted_payment_amount = Number(payRes.rows[0].total);
    await client.query('DELETE FROM payments WHERE container_id = $1', [id]);

    await client.query("UPDATE containers SET status = 'processing', updated_at = now() WHERE id = $1", [id]);

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  res.json(summary);
});

// DELETE /api/containers/:id - manager only
router.delete('/:id', allowRoles('manager'), async (req, res) => {
  const id = Number(req.params.id);
  const used = await query('SELECT 1 FROM payments WHERE container_id = $1 LIMIT 1', [id]);
  if (used.rows.length) {
    return res.status(400).json({ error: 'لا يمكن حذف حاوية عليها مدفوعات مسجلة' });
  }
  // invoices & pricing are CASCADE-deleted and feed the cash box / profit figures:
  // silently removing them would alter past financial reports retroactively
  const inv = await query('SELECT 1 FROM invoices WHERE container_id = $1 LIMIT 1', [id]);
  if (inv.rows.length) {
    return res.status(400).json({ error: 'لا يمكن حذف حاوية عليها فواتير مسجلة' });
  }
  const prc = await query('SELECT 1 FROM pricing WHERE container_id = $1 LIMIT 1', [id]);
  if (prc.rows.length) {
    return res.status(400).json({ error: 'لا يمكن حذف حاوية مُسعّرة' });
  }
  const { rowCount } = await query('DELETE FROM containers WHERE id = $1', [id]);
  if (!rowCount) return res.status(404).json({ error: 'الحاوية غير موجودة' });
  res.status(204).end();
});

export default router;
