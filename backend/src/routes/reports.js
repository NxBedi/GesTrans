import { Router } from 'express';
import { query } from '../db.js';
import { authRequired, allowRoles } from '../middleware/auth.js';

const router = Router();
router.use(authRequired, allowRoles('manager'));

// GET /api/reports/profits?from=&to=  - profit per priced container
router.get('/profits', async (req, res) => {
  const { from, to } = req.query;
  const params = [];
  let where = '';
  if (from || to) {
    const conds = [];
    const validFrom = from && from !== 'undefined' ? from : null;
    const validTo = to && to !== 'undefined' ? to : null;
    if (validFrom) { params.push(validFrom); conds.push(`p.updated_at >= $${params.length}::date`); }
    if (validTo) { params.push(validTo); conds.push(`p.updated_at < ($${params.length}::date + interval '1 day')`); }
    where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  }
  const { rows } = await query(`
    SELECT p.id, c.bl_number, c.container_number, cu.name AS customer_name,
           p.total_costs, p.final_price, p.profit, p.notes, p.set_by, p.updated_at
    FROM pricing p
    JOIN containers c ON c.id = p.container_id
    JOIN customers cu ON cu.id = c.customer_id
    ${where}
    ORDER BY p.updated_at DESC
  `, params);
  res.json(rows);
});

// GET /api/reports/summary  - dashboard numbers
router.get('/summary', async (req, res) => {
  const containers = await query(`
    SELECT status, COUNT(*)::int AS count FROM containers GROUP BY status
  `);
  const pricing = await query(`
    SELECT COALESCE(SUM(final_price),0)::numeric AS revenue,
           COALESCE(SUM(total_costs),0)::numeric AS costs,
           COALESCE(SUM(profit),0)::numeric AS profit,
           COUNT(*)::int AS priced_count
    FROM pricing
  `);
  const customers = await query('SELECT COUNT(*)::int AS count FROM customers');
  const pendingPricing = await query(
    `SELECT COUNT(*)::int AS count FROM containers c
     WHERE c.status = 'closed' AND NOT EXISTS (SELECT 1 FROM pricing p WHERE p.container_id = c.id)`
  );
  const openingDebts = await query(`
    SELECT (COALESCE((SELECT SUM(amount) FROM old_debts),0)
          - COALESCE((SELECT SUM(amount) FROM old_debt_collections),0))::numeric AS total
  `);
  const generalExpenses = await query('SELECT COALESCE(SUM(amount),0)::numeric AS total FROM general_expenses');
  // إجمالي القيمة المفوترة للزبائن وما دفعوه (صافي مستحقات الزبائن = billed − paid)
  const billedCollected = await query(`
    SELECT (SELECT COALESCE(SUM(final_price),0)::numeric FROM pricing) AS billed,
           (SELECT COALESCE(SUM(amount),0)::numeric FROM payments) AS paid
  `);
  // النقدية الفعلية في الصندوق (نفس معادلة لوحة الحسابات)
  const cashBox = await query(`
    SELECT (COALESCE((SELECT SUM(amount) FROM capital_transactions),0)
          + COALESCE((SELECT SUM(amount) FROM cashbox_adjustments),0)
          + COALESCE((SELECT SUM(amount) FROM payments),0)
          + COALESCE((SELECT SUM(amount) FROM old_debt_collections),0)
          - COALESCE((SELECT SUM(amount) FROM invoices),0)
          - COALESCE((SELECT SUM(amount) FROM general_expenses),0)
          + COALESCE((SELECT SUM(amount) FROM salary_transactions WHERE amount < 0),0))::numeric AS total
  `);
  res.json({
    containers: Object.fromEntries(containers.rows.map((r) => [r.status, r.count])),
    totals: pricing.rows[0],
    customers: customers.rows[0].count,
    pending_pricing: pendingPricing.rows[0].count,
    opening_debts: Number(openingDebts.rows[0].total),
    general_expenses: Number(generalExpenses.rows[0].total),
    cash_box: Number(cashBox.rows[0].total),
    total_billed: Number(billedCollected.rows[0].billed),
    total_paid: Number(billedCollected.rows[0].paid),
    customer_debt: Number(billedCollected.rows[0].billed) - Number(billedCollected.rows[0].paid),
  });
});

// GET /api/reports/recent-payments - payments summary for the dashboard (today total + last 10)
router.get('/recent-payments', async (req, res) => {
  const [todayRow, recentRows] = await Promise.all([
    query(`SELECT COALESCE(SUM(amount),0)::numeric AS total FROM payments WHERE payment_date = CURRENT_DATE`),
    query(`
      SELECT p.id, p.customer_id, cu.name AS customer_name, p.amount,
             to_char(p.payment_date, 'YYYY-MM-DD') AS payment_date
      FROM payments p
      JOIN customers cu ON cu.id = p.customer_id
      ORDER BY p.payment_date DESC, p.id DESC
      LIMIT 10
    `),
  ]);
  res.json({
    today_total: Number(todayRow.rows[0].total),
    recent: recentRows.rows.map((r) => ({ ...r, amount: Number(r.amount) })),
  });
});

// GET /api/reports/customer-balances - what each customer owes (current containers only)
router.get('/customer-balances', async (req, res) => {
  const { rows } = await query(`
    SELECT cu.id, cu.name AS customer_name,
           COUNT(c.id)::int AS container_count,
           COALESCE(SUM(p.final_price), 0)::numeric AS total_billed,
           COALESCE((SELECT SUM(pay.amount) FROM payments pay WHERE pay.customer_id = cu.id), 0)::numeric AS total_paid,
           (COALESCE(SUM(p.final_price), 0)
            - COALESCE((SELECT SUM(pay.amount) FROM payments pay WHERE pay.customer_id = cu.id), 0))::numeric AS balance
    FROM customers cu
    LEFT JOIN containers c ON c.customer_id = cu.id
    LEFT JOIN pricing p ON p.container_id = c.id
    GROUP BY cu.id, cu.name
    ORDER BY balance DESC
  `);
  res.json(rows);
});

// GET /api/reports/containers?status=&from=&to=
router.get('/containers', async (req, res) => {
  const { status, from, to } = req.query;
  const params = [];
  const conds = [];
  if (status) { params.push(status); conds.push(`c.status = $${params.length}`); }
  if (from) { params.push(from); conds.push(`c.registration_date >= $${params.length}::date`); }
  if (to) { params.push(to); conds.push(`c.registration_date <= $${params.length}::date`); }
  const whereSql = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const { rows } = await query(`
    SELECT c.id, c.bl_number, c.container_number, c.registration_date, c.status,
           cu.name AS customer_name,
           COALESCE(p.final_price, 0)::numeric AS final_price,
           COALESCE(p.total_costs, 0)::numeric AS total_costs
    FROM containers c
    JOIN customers cu ON cu.id = c.customer_id
    LEFT JOIN pricing p ON p.container_id = c.id
    ${whereSql}
    ORDER BY c.registration_date DESC
  `, params);
  res.json(rows);
});

// shared filter builder for expense reports
function expenseFilter(req) {
  const { from, to, employee_id, type_id, include_manager } = req.query;
  const params = [];
  const conds = [];
  const push = (v) => { params.push(v); return `$${params.length}`; };
  if (from && from !== 'undefined') conds.push(`i.entry_date >= ${push(from)}::date`);
  if (to && to !== 'undefined') conds.push(`i.entry_date <= ${push(to)}::date`);
  if (employee_id && employee_id !== 'undefined') conds.push(`i.entered_by = ${push(Number(employee_id))}`);
  if (type_id && type_id !== 'undefined') conds.push(`i.invoice_type_id = ${push(Number(type_id))}`);
  if (include_manager !== 'true' && include_manager !== '1') conds.push(`t.allowed_role != 'manager'`);
  return { where: conds.length ? `WHERE ${conds.join(' AND ')}` : '', params };
}

// GET /api/reports/expenses - every expense invoice, trackable, filterable (manager)
router.get('/expenses', async (req, res) => {
  const { where, params } = expenseFilter(req);
  const { rows } = await query(`
    SELECT i.id, i.invoice_number, i.amount, i.entry_date, i.notes,
           t.name AS type_name, t.allowed_role,
           u.id AS employee_id, u.full_name AS employee_name,
           c.bl_number, c.container_number, cu.name AS customer_name
    FROM invoices i
    JOIN invoice_types t ON t.id = i.invoice_type_id
    LEFT JOIN users u ON u.id = i.entered_by
    JOIN containers c ON c.id = i.container_id
    JOIN customers cu ON cu.id = c.customer_id
    ${where}
    ORDER BY i.entry_date DESC, i.id DESC
  `, params);
  res.json(rows);
});

// GET /api/reports/expenses-summary - daily + per-employee aggregation (manager)
router.get('/expenses-summary', async (req, res) => {
  const { where, params } = expenseFilter(req);

  const daily = await query(`
    SELECT i.entry_date, COUNT(*)::int AS invoice_count, COALESCE(SUM(i.amount),0)::numeric AS total
    FROM invoices i
    JOIN invoice_types t ON t.id = i.invoice_type_id
    ${where}
    GROUP BY i.entry_date
    ORDER BY i.entry_date DESC
  `, params);

  const byEmployee = await query(`
    SELECT COALESCE(u.id, 0) AS employee_id,
           COALESCE(u.full_name, '—') AS employee_name,
           COUNT(*)::int AS invoice_count,
           COALESCE(SUM(i.amount),0)::numeric AS total
    FROM invoices i
    JOIN invoice_types t ON t.id = i.invoice_type_id
    LEFT JOIN users u ON u.id = i.entered_by
    ${where}
    GROUP BY u.id, u.full_name
    ORDER BY total DESC
  `, params);

  const grandTotal = daily.rows.reduce((s, r) => s + Number(r.total), 0);
  const grandCount = daily.rows.reduce((s, r) => s + r.invoice_count, 0);

  res.json({
    daily: daily.rows,
    by_employee: byEmployee.rows,
    total: grandTotal,
    invoice_count: grandCount,
  });
});

// GET /api/reports/invoice-types-summary - invoices grouped by type (manager)
router.get('/invoice-types-summary', async (req, res) => {
  const { where, params } = expenseFilter(req);
  const { rows } = await query(`
    SELECT t.id AS type_id, t.name AS type_name, t.allowed_role,
           COUNT(*)::int AS invoice_count,
           COALESCE(SUM(i.amount),0)::numeric AS total,
           COUNT(DISTINCT i.container_id)::int AS container_count
    FROM invoices i
    JOIN invoice_types t ON t.id = i.invoice_type_id
    ${where}
    GROUP BY t.id, t.name, t.allowed_role
    ORDER BY total DESC
  `, params);
  res.json(rows);
});

export default router;