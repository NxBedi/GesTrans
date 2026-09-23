import { Router } from 'express';
import { query, pool } from '../db.js';
import { authRequired, allowRoles } from '../middleware/auth.js';
import { getContainerTotals } from './containers.js';

const router = Router();
router.use(authRequired);

// POST /api/containers/:containerId/pricing - manager sets final price manually
router.post('/:containerId/pricing', allowRoles('manager'), async (req, res) => {
  const containerId = Number(req.params.containerId);
  const { final_price, notes } = req.body || {};
  const priceNum = Number(final_price);
  if (final_price === undefined || final_price === '' || !isFinite(priceNum) || priceNum <= 0) {
    return res.status(400).json({ error: 'أدخل سعراً نهائياً صحيحاً أكبر من صفر' });
  }

  // verify container exists and is ready for pricing (closed/liquidated)
  const cRes = await query('SELECT id, status FROM containers WHERE id = $1', [containerId]);
  if (!cRes.rows.length) return res.status(404).json({ error: 'الحاوية غير موجودة' });
  if (cRes.rows[0].status !== 'closed') {
    return res.status(400).json({ error: 'الحاوية يجب أن تكون مُغلقة (جاهزة للتسعير) أولاً' });
  }

  // compute total costs from invoices
  const invRes = await query(
    `SELECT i.amount, t.allowed_role
     FROM invoices i
     JOIN invoice_types t ON t.id = i.invoice_type_id
     WHERE i.container_id = $1`,
    [containerId]
  );
  const totals = getContainerTotals(invRes.rows);

  // compute total costs from invoices and commit the upsert + status change atomically
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO pricing (container_id, total_costs, final_price, notes, set_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (container_id)
       DO UPDATE SET final_price = EXCLUDED.final_price, total_costs = EXCLUDED.total_costs,
         notes = EXCLUDED.notes, set_by = EXCLUDED.set_by, updated_at = now()
       RETURNING *`,
      [containerId, totals.total_costs, priceNum, notes || null, req.user.id]
    );

    // update container status: closed (ready for pricing) → priced → posted to client account (الحسابات)
    await client.query(
      "UPDATE containers SET status = 'priced', updated_at = now() WHERE id = $1 AND status = 'closed'",
      [containerId]
    );
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

// DELETE /api/containers/:containerId/pricing - manager only: revert to ready-for-pricing (closed)
router.delete('/:containerId/pricing', allowRoles('manager'), async (req, res) => {
  const containerId = Number(req.params.containerId);
  const cRes = await query('SELECT id, status FROM containers WHERE id = $1', [containerId]);
  if (!cRes.rows.length) return res.status(404).json({ error: 'الحاوية غير موجودة' });
  const { rowCount } = await query('DELETE FROM pricing WHERE container_id = $1', [containerId]);
  if (!rowCount) return res.status(404).json({ error: 'لا يوجد تسعير' });
  await query("UPDATE containers SET status = 'closed', updated_at = now() WHERE id = $1 AND status = 'priced'", [containerId]);
  res.status(204).end();
});

export default router;