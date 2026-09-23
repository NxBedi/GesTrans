import { Router } from 'express';
import { query } from '../db.js';
import { authRequired, allowRoles } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

// GET /api/invoice-types - everyone sees active types appropriate to their role
router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM invoice_types ORDER BY sort_order, id`
  );
  let list = rows;
  if (req.user.role !== 'manager') {
    list = rows.filter((t) => t.allowed_role !== 'manager');
  }
  res.json(list.map((t) => ({ id: t.id, name: t.name, allowed_role: t.allowed_role, is_active: t.is_active, sort_order: t.sort_order })));
});

// POST /api/invoice-types (manager only)
router.post('/', allowRoles('manager'), async (req, res) => {
  const { name, allowed_role, sort_order } = req.body || {};
  if (!name) return res.status(400).json({ error: 'اسم نوع الفاتورة مطلوب' });
  const { rows } = await query(
    `INSERT INTO invoice_types (name, allowed_role, sort_order)
     VALUES ($1, $2, $3) RETURNING *`,
    [name.trim(), allowed_role === 'manager' ? 'manager' : 'employee', Number(sort_order) || 0]
  );
  res.status(201).json(rows[0]);
});

// PUT /api/invoice-types/:id (manager only)
router.put('/:id', allowRoles('manager'), async (req, res) => {
  const id = Number(req.params.id);
  const { name, allowed_role, is_active, sort_order } = req.body || {};
  const { rows } = await query(
    `UPDATE invoice_types SET name = $1, allowed_role = $2, is_active = $3, sort_order = $4
     WHERE id = $5 RETURNING *`,
    [name, allowed_role === 'manager' ? 'manager' : 'employee',
     is_active !== undefined ? Boolean(is_active) : true, Number(sort_order) || 0, id]
  );
  if (!rows.length) return res.status(404).json({ error: 'النوع غير موجود' });
  res.json(rows[0]);
});

// DELETE /api/invoice-types/:id (manager only)
router.delete('/:id', allowRoles('manager'), async (req, res) => {
  const id = Number(req.params.id);
  const used = await query('SELECT 1 FROM invoices WHERE invoice_type_id = $1 LIMIT 1', [id]);
  if (used.rows.length) {
    return res.status(400).json({ error: 'لا يمكن حذف نوع فاتورة مُستخدَم في سجلات — يمكنك تعطيله بدلاً من ذلك' });
  }
  const { rowCount } = await query('DELETE FROM invoice_types WHERE id = $1', [id]);
  if (!rowCount) return res.status(404).json({ error: 'النوع غير موجود' });
  res.status(204).end();
});

export default router;