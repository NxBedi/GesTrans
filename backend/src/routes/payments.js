import { Router } from 'express';
import { query, pool } from '../db.js';
import { authRequired, allowRoles } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

function serialize(row) {
  return {
    id: row.id,
    customer_id: row.customer_id,
    container_id: row.container_id,
    amount: Number(row.amount),
    payment_date: row.payment_date,
    notes: row.notes,
    created_by: row.created_by,
    created_by_name: row.created_by_name,
    bl_number: row.bl_number,
  };
}

// POST /api/customers/:customerId/payments - record money received (manager only: touches the cash box)
router.post('/:customerId/payments', allowRoles('manager'), async (req, res) => {
  const customerId = Number(req.params.customerId);
  const { container_id, amount, payment_date, notes } = req.body || {};

  const amountNum = Number(amount);
  if (!amount || !isFinite(amountNum) || amountNum <= 0) {
    return res.status(400).json({ error: 'أدخل مبلغاً صحيحاً أكبر من صفر' });
  }

  const cRes = await query('SELECT id FROM customers WHERE id = $1', [customerId]);
  if (!cRes.rows.length) return res.status(404).json({ error: 'الزبون غير موجود' });

  if (container_id) {
    const ctnId = Number(container_id);
    const ctn = await query('SELECT id, customer_id, status FROM containers WHERE id = $1', [ctnId]);
    if (!ctn.rows.length) return res.status(404).json({ error: 'الحاوية غير موجودة' });
    if (ctn.rows[0].customer_id !== customerId) {
      return res.status(400).json({ error: 'الحاوية لا تتبع هذا الزبون' });
    }
    if (ctn.rows[0].status !== 'priced') {
      return res.status(400).json({ error: 'الحاوية يجب أن تُسعّر وتُرحَّل للحسابات قبل تسجيل التحصيل' });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `INSERT INTO payments (customer_id, container_id, amount, payment_date, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [customerId, container_id ? Number(container_id) : null, amountNum, payment_date || new Date().toISOString().slice(0, 10), notes || null, req.user.id]
    );

    // The payment is never marked as a separate 'paid' status: it is booked directly
    // as money received, which deducts it from the customer's total debt balance
    // (debt = billed − paid). The container stays 'priced' regardless of amount.
    await client.query('COMMIT');
    const rows0 = r.rows[0];
    res.status(201).json(serialize({ ...rows0, bl_number: null, created_by_name: req.user.full_name }));
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

// GET /api/customers/:customerId/payments - manager only (payments are financial data)
router.get('/:customerId/payments', allowRoles('manager'), async (req, res) => {
  const customerId = Number(req.params.customerId);
  const { rows } = await query(`
    SELECT p.*, c.bl_number, u.full_name AS created_by_name
    FROM payments p
    LEFT JOIN containers c ON c.id = p.container_id
    LEFT JOIN users u ON u.id = p.created_by
    WHERE p.customer_id = $1
    ORDER BY p.payment_date DESC, p.id DESC
  `, [customerId]);
  res.json(rows.map(serialize));
});

// DELETE /api/customers/:customerId/payments/:paymentId - undo a payment (manager only)
router.delete('/:customerId/payments/:paymentId', allowRoles('manager'), async (req, res) => {
  const customerId = Number(req.params.customerId);
  const paymentId = Number(req.params.paymentId);

  const found = await query('SELECT id FROM payments WHERE id = $1 AND customer_id = $2', [paymentId, customerId]);
  if (!found.rows.length) return res.status(404).json({ error: 'الدفعة غير موجودة' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM payments WHERE id = $1', [paymentId]);
    // Undoing the payment simply adds that amount back to the customer's debt
    // balance — no container status recompute is needed.
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  res.status(204).end();
});

export default router;