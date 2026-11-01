import { Router } from 'express';
import { query, pool } from '../db.js';
import { authRequired, allowRoles } from '../middleware/auth.js';
import { requirePermission, PERM } from '../middleware/permissions.js';
import { recordAudit } from '../lib/audit.js';
import { normalizePaymentMethod, normalizeIdempotencyKey, isIsoDate } from '../lib/finance.js';

const router = Router();
router.use(authRequired);

function serialize(row) {
  return {
    id: row.id,
    category: row.category,
    description: row.description,
    amount: Number(row.amount),
    expense_date: row.expense_date,
    payment_method: row.payment_method || 'cash',
    entered_by: row.entered_by,
    entered_by_name: row.entered_by_name,
    created_at: row.created_at,
    reversed_at: row.reversed_at || null,
    reversed_by: row.reversed_by || null,
    reversal_note: row.reversal_note || null,
  };
}

const SELECT = `
  SELECT g.*, u.full_name AS entered_by_name
  FROM general_expenses g
  LEFT JOIN users u ON u.id = g.entered_by
`;

// GET /api/general-expenses - list with filters (manager + accountant)
router.get('/', requirePermission(PERM.FIN_EXPENSES_VIEW), async (req, res) => {
  const { from, to, category, include_reversed } = req.query;
  const conds = [];
  const params = [];
  const push = (v) => { params.push(v); return `$${params.length}`; };
  if (from && from !== 'undefined') conds.push(`g.expense_date >= ${push(from)}::date`);
  if (to && to !== 'undefined') conds.push(`g.expense_date <= ${push(to)}::date`);
  if (category && category !== 'undefined') conds.push(`g.category = ${push(category)}`);
  // المعكوسة تُخفى افتراضياً من السجل الجاري وتظهر في السجل التاريخي فقط
  if (include_reversed !== '1' && include_reversed !== 'true') conds.push(`g.reversed_at IS NULL`);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const { rows } = await query(`${SELECT} ${where} ORDER BY g.expense_date DESC, g.id DESC`, params);
  res.json(rows.map(serialize));
});

// GET /api/general-expenses/categories - distinct categories (for filter/select)
router.get('/categories', requirePermission(PERM.FIN_EXPENSES_VIEW), async (req, res) => {
  const { rows } = await query('SELECT DISTINCT category FROM general_expenses WHERE reversed_at IS NULL ORDER BY category');
  res.json(rows.map((r) => r.category));
});

// GET /api/general-expenses/summary - totals grouped by category + month
router.get('/summary', requirePermission(PERM.FIN_EXPENSES_VIEW), async (req, res) => {
  const { from, to, category } = req.query;
  const conds = [`g.reversed_at IS NULL`];
  const params = [];
  const push = (v) => { params.push(v); return `$${params.length}`; };
  if (from && from !== 'undefined') conds.push(`g.expense_date >= ${push(from)}::date`);
  if (to && to !== 'undefined') conds.push(`g.expense_date <= ${push(to)}::date`);
  if (category && category !== 'undefined') conds.push(`g.category = ${push(category)}`);
  const where = `WHERE ${conds.join(' AND ')}`;

  const byCategory = await query(`
    SELECT g.category, COUNT(*)::int AS count, COALESCE(SUM(g.amount),0)::numeric AS total
    FROM general_expenses g
    ${where}
    GROUP BY g.category ORDER BY total DESC
  `, params);

  const byMonth = await query(`
    SELECT to_char(g.expense_date, 'YYYY-MM') AS month,
           COUNT(*)::int AS count, COALESCE(SUM(g.amount),0)::numeric AS total
    FROM general_expenses g
    ${where}
    GROUP BY month ORDER BY month DESC
  `, params);

  const byMethod = await query(`
    SELECT g.payment_method, COUNT(*)::int AS count, COALESCE(SUM(g.amount),0)::numeric AS total
    FROM general_expenses g
    ${where}
    GROUP BY g.payment_method
  `, params);

  const total = byCategory.rows.reduce((s, r) => s + Number(r.total), 0);

  res.json({
    by_category: byCategory.rows,
    by_month: byMonth.rows,
    by_method: byMethod.rows,
    total,
    count: byCategory.rows.reduce((s, r) => s + r.count, 0),
  });
});

// POST /api/general-expenses - record a company expense (manager + accountant)
router.post('/', requirePermission(PERM.FIN_EXPENSES_RECORD), async (req, res) => {
  const { category, description, amount, expense_date, payment_method, idempotency_key } = req.body || {};
  if (!category || typeof category !== 'string' || !category.trim()) return res.status(400).json({ error: 'البند مطلوب' });
  const amountNum = Number(amount);
  if (amount === undefined || amount === '' || !isFinite(amountNum) || amountNum <= 0) {
    return res.status(400).json({ error: 'أدخل مبلغاً صحيحاً أكبر من صفر' });
  }
  if (!expense_date || !isIsoDate(String(expense_date))) return res.status(400).json({ error: 'التاريخ مطلوب' });
  const method = normalizePaymentMethod(payment_method);
  if (!method) return res.status(400).json({ error: 'طريقة الدفع غير صالحة' });
  const idem = normalizeIdempotencyKey(idempotency_key);
  if (idempotency_key && !idem) return res.status(400).json({ error: 'مفتاح التفرّد غير صالح' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (idem) {
      const dupe = await client.query('SELECT * FROM general_expenses WHERE idempotency_key = $1', [idem]);
      if (dupe.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'تم تسجيل هذه العملية مسبقاً — لن تُحتسب مرتين' });
      }
    }

    // منع تسجيل نفس المصروف مرتين (نفس البند والمبلغ والتاريخ والمسجِّل)
    const natural = await client.query(
      `SELECT id FROM general_expenses
        WHERE category = $1 AND amount = $2 AND expense_date = $3::date
          AND entered_by = $4 AND reversed_at IS NULL
        LIMIT 1`,
      [category.trim(), amountNum, expense_date, req.user.id]
    );
    if (natural.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'مصروف مطابق مسجّل مسبقاً — لن يُحتسب مرتين' });
    }

    const { rows } = await client.query(
      `INSERT INTO general_expenses (category, description, amount, expense_date, payment_method, idempotency_key, entered_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [category.trim(), description || null, amountNum, expense_date, method, idem, req.user.id]
    );
    const created = rows[0];

    await recordAudit(client, {
      actor: req.user,
      action: 'create',
      entityType: 'general_expense',
      entityId: created.id,
      details: {
        category: created.category,
        amount: Number(created.amount),
        expense_date: created.expense_date,
        payment_method: method,
        affects_cash: method === 'cash',
      },
    });

    await client.query('COMMIT');
    res.status(201).json(serialize(created));
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

// PUT /api/general-expenses/:id - edit an existing expense (manager only)
router.put('/:id', requirePermission(PERM.FIN_EXPENSES_EDIT), async (req, res) => {
  const id = Number(req.params.id);
  const { category, description, amount, expense_date } = req.body || {};
  if (!category || String(category).trim() === '') return res.status(400).json({ error: 'البند مطلوب' });
  const amountNum = Number(amount);
  if (amount === undefined || amount === '' || !isFinite(amountNum) || amountNum <= 0) {
    return res.status(400).json({ error: 'أدخل مبلغاً صحيحاً أكبر من صفر' });
  }
  if (!expense_date) return res.status(400).json({ error: 'التاريخ مطلوب' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT * FROM general_expenses WHERE id = $1 FOR UPDATE', [id]);
    if (!existing.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'المصروف غير موجود' });
    }
    if (existing.rows[0].reversed_at) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'لا يمكن تعديل مصروف معكوس' });
    }
    const { rows } = await client.query(
      `UPDATE general_expenses SET category = $1, description = $2, amount = $3, expense_date = $4
       WHERE id = $5 RETURNING *`,
      [String(category).trim(), description || null, amountNum, expense_date, id]
    );
    await recordAudit(client, {
      actor: req.user,
      action: 'update',
      entityType: 'general_expense',
      entityId: id,
      details: {
        before: {
          category: existing.rows[0].category,
          amount: Number(existing.rows[0].amount),
          expense_date: existing.rows[0].expense_date,
        },
        after: { category: rows[0].category, amount: Number(rows[0].amount), expense_date: rows[0].expense_date },
      },
    });
    await client.query('COMMIT');
    res.json(serialize(rows[0]));
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

// POST /api/general-expenses/:id/reverse - reverse an expense instead of deleting it
router.post('/:id/reverse', requirePermission(PERM.FIN_EXPENSES_REVERSE), async (req, res) => {
  const id = Number(req.params.id);
  const { note } = req.body || {};

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT * FROM general_expenses WHERE id = $1 FOR UPDATE', [id]);
    if (!existing.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'المصروف غير موجود' });
    }
    if (existing.rows[0].reversed_at) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'المصروف معكوس مسبقاً' });
    }
    const { rows } = await client.query(
      `UPDATE general_expenses SET reversed_at = now(), reversed_by = $1, reversal_note = $2
       WHERE id = $3 RETURNING *`,
      [req.user.id, note || null, id]
    );
    await recordAudit(client, {
      actor: req.user,
      action: 'reverse',
      entityType: 'general_expense',
      entityId: id,
      details: {
        category: existing.rows[0].category,
        amount: Number(existing.rows[0].amount),
        payment_method: existing.rows[0].payment_method || 'cash',
        note: note || null,
      },
    });
    await client.query('COMMIT');
    res.json(serialize(rows[0]));
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

// DELETE /api/general-expenses/:id - manager only (legacy hard delete; prefer /reverse)
router.delete('/:id', allowRoles('manager'), async (req, res) => {
  const id = Number(req.params.id);
  const { rowCount } = await query('DELETE FROM general_expenses WHERE id = $1', [id]);
  if (!rowCount) return res.status(404).json({ error: 'المصروف غير موجود' });
  res.status(204).end();
});

export default router;
