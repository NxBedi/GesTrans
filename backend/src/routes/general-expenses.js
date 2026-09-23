import { Router } from 'express';
import { query } from '../db.js';
import { authRequired, allowRoles } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

function serialize(row) {
  return { id: row.id, category: row.category, description: row.description, amount: Number(row.amount), expense_date: row.expense_date, entered_by: row.entered_by, entered_by_name: row.entered_by_name, created_at: row.created_at };
}

const SELECT = `
  SELECT g.*, u.full_name AS entered_by_name
  FROM general_expenses g
  LEFT JOIN users u ON u.id = g.entered_by
`;

// GET /api/general-expenses - list with filters (manager only: institution finances are private)
router.get('/', allowRoles('manager'), async (req, res) => {
  const { from, to, category } = req.query;
  const conds = [];
  const params = [];
  const push = (v) => { params.push(v); return `$${params.length}`; };
  if (from && from !== 'undefined') conds.push(`g.expense_date >= ${push(from)}::date`);
  if (to && to !== 'undefined') conds.push(`g.expense_date <= ${push(to)}::date`);
  if (category && category !== 'undefined') conds.push(`g.category = ${push(category)}`);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const { rows } = await query(`${SELECT} ${where} ORDER BY g.expense_date DESC, g.id DESC`, params);
  res.json(rows.map(serialize));
});

// GET /api/general-expenses/categories - distinct categories (for filter/select)
router.get('/categories', allowRoles('manager'), async (req, res) => {
  const { rows } = await query('SELECT DISTINCT category FROM general_expenses ORDER BY category');
  res.json(rows.map((r) => r.category));
});

// GET /api/general-expenses/summary - totals grouped by category + month
router.get('/summary', allowRoles('manager'), async (req, res) => {
  const { from, to, category } = req.query;
  const conds = [];
  const params = [];
  const push = (v) => { params.push(v); return `$${params.length}`; };
  if (from && from !== 'undefined') conds.push(`g.expense_date >= ${push(from)}::date`);
  if (to && to !== 'undefined') conds.push(`g.expense_date <= ${push(to)}::date`);
  if (category && category !== 'undefined') conds.push(`g.category = ${push(category)}`);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

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

  const total = byCategory.rows.reduce((s, r) => s + Number(r.total), 0);

  res.json({ by_category: byCategory.rows, by_month: byMonth.rows, total, count: byCategory.rows.reduce((s, r) => s + r.count, 0) });
});

// POST /api/general-expenses - manager only
router.post('/', allowRoles('manager'), async (req, res) => {
  const { category, description, amount, expense_date } = req.body || {};
  if (!category || typeof category !== 'string' || !category.trim()) return res.status(400).json({ error: 'البند مطلوب' });
  const amountNum = Number(amount);
  if (amount === undefined || amount === '' || !isFinite(amountNum) || amountNum <= 0) {
    return res.status(400).json({ error: 'أدخل مبلغاً صحيحاً أكبر من صفر' });
  }
  if (!expense_date) return res.status(400).json({ error: 'التاريخ مطلوب' });
  const { rows } = await query(
    `INSERT INTO general_expenses (category, description, amount, expense_date, entered_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [category.trim(), description || null, amountNum, expense_date, req.user.id]
  );
  res.status(201).json(serialize(rows[0]));
});

// PUT /api/general-expenses/:id - manager only
router.put('/:id', allowRoles('manager'), async (req, res) => {
  const id = Number(req.params.id);
  const { category, description, amount, expense_date } = req.body || {};
  if (!category || String(category).trim() === '') return res.status(400).json({ error: 'البند مطلوب' });
  const amountNum = Number(amount);
  if (amount === undefined || amount === '' || !isFinite(amountNum) || amountNum <= 0) {
    return res.status(400).json({ error: 'أدخل مبلغاً صحيحاً أكبر من صفر' });
  }
  if (!expense_date) return res.status(400).json({ error: 'التاريخ مطلوب' });
  const { rows } = await query(
    `UPDATE general_expenses SET category = $1, description = $2, amount = $3, expense_date = $4
     WHERE id = $5 RETURNING *`,
    [String(category).trim(), description || null, amountNum, expense_date, id]
  );
  if (!rows.length) return res.status(404).json({ error: 'المصروف غير موجود' });
  res.json(serialize(rows[0]));
});

// DELETE /api/general-expenses/:id - manager only
router.delete('/:id', allowRoles('manager'), async (req, res) => {
  const id = Number(req.params.id);
  const { rowCount } = await query('DELETE FROM general_expenses WHERE id = $1', [id]);
  if (!rowCount) return res.status(404).json({ error: 'المصروف غير موجود' });
  res.status(204).end();
});

export default router;