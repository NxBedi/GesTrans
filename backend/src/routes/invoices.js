import { Router } from 'express';
import { query, pool } from '../db.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

// POST /api/containers/:containerId/invoices
router.post('/:containerId/invoices', async (req, res) => {
  const containerId = Number(req.params.containerId);
  const { invoice_type_id, invoice_number, amount, entry_date, notes } = req.body || {};
  if (!invoice_type_id || !entry_date) {
    return res.status(400).json({ error: 'نوع الفاتورة والتاريخ مطلوبان' });
  }

  // verify container exists
  const cRes = await query('SELECT id, status FROM containers WHERE id = $1', [containerId]);
  if (!cRes.rows.length) return res.status(404).json({ error: 'الحاوية غير موجودة' });

  // registered/in-progress containers can receive expenses; closed cannot (manager may still adjust).
  // Once priced, invoices are frozen so the pricing snapshot stays accurate.
  const status = cRes.rows[0].status;
  if (status === 'priced') {
    return res.status(400).json({ error: 'لا يمكن تعديل فواتير حاوية تم تسعيرها' });
  }
  if (req.user.role !== 'manager' && !['registered', 'processing'].includes(status)) {
    return res.status(400).json({ error: 'الحاوية مُغلقة ولا يمكن إضافة مصاريف عليها' });
  }

  // verify type exists and check role permission
  const tRes = await query('SELECT id, allowed_role, is_active FROM invoice_types WHERE id = $1', [invoice_type_id]);
  if (!tRes.rows.length) return res.status(404).json({ error: 'نوع الفاتورة غير موجود' });
  const invType = tRes.rows[0];

  if (!invType.is_active) {
    return res.status(400).json({ error: 'نوع الفاتورة غير نشط' });
  }

  // employee cannot create manager-only types
  if (invType.allowed_role === 'manager' && req.user.role !== 'manager') {
    return res.status(403).json({ error: 'هذه الفاتورة للمدير فقط' });
  }

  // LIQUIDATION (manager invoice) is special: number is required, only one per container.
  // The amount is entered manually by the user (no automatic calculation).
  const isLiquidation = invType.allowed_role === 'manager';

  if (isLiquidation && (!invoice_number || !String(invoice_number).trim())) {
    return res.status(400).json({ error: 'رقم LIQUIDATION مطلوب' });
  }
  if (isLiquidation) {
    const dupe = await query(
      'SELECT 1 FROM invoices WHERE container_id = $1 AND invoice_type_id = $2 LIMIT 1',
      [containerId, Number(invoice_type_id)]
    );
    if (dupe.rows.length) {
      return res.status(409).json({ error: 'LIQUIDATION مسجلة بالفعل لهذه الحاوية' });
    }
  }

  const amountNum = Number(amount);
  if (!amount || !isFinite(amountNum) || amountNum <= 0) {
    return res.status(400).json({ error: 'أدخل مبلغاً صحيحاً أكبر من صفر' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO invoices (container_id, invoice_type_id, invoice_number, amount, entry_date, entered_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [containerId, Number(invoice_type_id), invoice_number && String(invoice_number).trim(), amountNum, entry_date, req.user.id, notes || null]
    );

    // first invoice advances a newly registered container to "قيد تسجيل الفواتير" (in progress)
    if (cRes.rows[0].status === 'registered') {
      await client.query("UPDATE containers SET status = 'processing', updated_at = now() WHERE id = $1 AND status = 'registered'", [containerId]);
    }
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

// GET /api/containers/:containerId/invoices - return invoices (filtered by role)
router.get('/:containerId/invoices', async (req, res) => {
  const containerId = Number(req.params.containerId);
  const cRes = await query('SELECT id, status FROM containers WHERE id = $1', [containerId]);
  if (!cRes.rows.length) return res.status(404).json({ error: 'الحاوية غير موجودة' });
  if (req.user.role !== 'manager' && !['registered', 'processing'].includes(cRes.rows[0].status)) {
    return res.status(403).json({ error: 'الحاوية غير متاحة' });
  }
  const { rows } = await query(`
    SELECT i.*, t.name AS type_name, t.allowed_role, u.full_name AS entered_by_name
    FROM invoices i
    JOIN invoice_types t ON t.id = i.invoice_type_id
    LEFT JOIN users u ON u.id = i.entered_by
    WHERE i.container_id = $1
    ORDER BY i.entry_date, i.id
  `, [containerId]);
  let list = rows;
  if (req.user.role !== 'manager') {
    list = list.filter((i) => i.allowed_role !== 'manager');
  }
  res.json(list);
});

// PUT /api/containers/:containerId/invoices/:id - manager only: correct an existing invoice
router.put('/:containerId/invoices/:id', async (req, res) => {
  if (req.user.role !== 'manager') {
    return res.status(403).json({ error: 'هذا الإجراء للمدير فقط' });
  }
  const id = Number(req.params.id);
  const containerId = Number(req.params.containerId);
  const { invoice_number, amount, entry_date, notes } = req.body || {};

  const cRes = await query('SELECT status FROM containers WHERE id = $1', [containerId]);
  if (!cRes.rows.length) return res.status(404).json({ error: 'الحاوية غير موجودة' });
  if (cRes.rows[0].status === 'priced') {
    return res.status(400).json({ error: 'لا يمكن تعديل فواتير حاوية تم تسعيرها' });
  }

  const invRes = await query('SELECT * FROM invoices WHERE id = $1 AND container_id = $2', [id, containerId]);
  if (!invRes.rows.length) return res.status(404).json({ error: 'الفاتورة غير موجودة' });
  const inv = invRes.rows[0];

  if (!entry_date) return res.status(400).json({ error: 'التاريخ مطلوب' });
  const amountNum = Number(amount);
  if (amount === undefined || amount === '' || !isFinite(amountNum) || amountNum <= 0) {
    return res.status(400).json({ error: 'أدخل مبلغاً صحيحاً أكبر من صفر' });
  }

  const tRes = await query('SELECT allowed_role FROM invoice_types WHERE id = $1', [inv.invoice_type_id]);
  const type = tRes.rows[0];
  if (type.allowed_role === 'manager' && (!invoice_number || !String(invoice_number).trim())) {
    return res.status(400).json({ error: 'رقم LIQUIDATION مطلوب' });
  }

  const { rows } = await query(
    `UPDATE invoices SET invoice_number = $1, amount = $2, entry_date = $3, notes = $4
     WHERE id = $5 AND container_id = $6 RETURNING *`,
    [invoice_number && String(invoice_number).trim(), amountNum, entry_date, notes || null, id, containerId]
  );
  res.json(rows[0]);
});

// DELETE /api/containers/:containerId/invoices/:id - manager only
router.delete('/:containerId/invoices/:id', async (req, res) => {
  if (req.user.role !== 'manager') {
    return res.status(403).json({ error: 'هذا الإجراء للمدير فقط' });
  }
  const id = Number(req.params.id);
  const containerId = Number(req.params.containerId);
  const cRes = await query('SELECT status FROM containers WHERE id = $1', [containerId]);
  if (!cRes.rows.length) return res.status(404).json({ error: 'الحاوية غير موجودة' });
  if (cRes.rows[0].status === 'priced') {
    return res.status(400).json({ error: 'لا يمكن تعديل فواتير حاوية تم تسعيرها' });
  }
  const { rowCount } = await query('DELETE FROM invoices WHERE id = $1 AND container_id = $2', [id, containerId]);
  if (!rowCount) return res.status(404).json({ error: 'الفاتورة غير موجودة' });

  res.status(204).end();
});

export default router;