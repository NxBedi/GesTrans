import { Router } from 'express';
import { query } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission, PERM } from '../middleware/permissions.js';

const router = Router();
router.use(authRequired);

/**
 * لوحة المحاسب — أرقام مالية فقط (لا ديون الزبائن ولا بيانات تشغيلية).
 * كل الأرقام مشتقة من نفس جداول النظام، ولا تُنسخ أي بيانات.
 */

// GET /api/accountant/dashboard
router.get('/dashboard', requirePermission(PERM.FIN_DASHBOARD_VIEW), async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;

  const [cashBox, dayFlows, monthFlows, expenseTotals, wageTotals, workerExpenses, unpaid, reversed] = await Promise.all([
    // نقدية الصندوق = الحركات النقدية غير المعكوسة فقط
    query(`
      SELECT (COALESCE((SELECT SUM(amount) FROM capital_transactions),0)
            + COALESCE((SELECT SUM(amount) FROM cashbox_adjustments),0)
            + COALESCE((SELECT SUM(amount) FROM payments),0)
            - COALESCE((SELECT SUM(amount) FROM invoices),0)
            - COALESCE((SELECT SUM(amount) FROM cash_general_expenses),0)
            + COALESCE((SELECT SUM(amount) FROM cash_salary_transactions),0))::numeric AS total
    `),
    // حركات اليوم
    query(`
      SELECT
        (COALESCE((SELECT SUM(pay.amount) FROM payments pay WHERE pay.payment_date = $1::date),0)
         + COALESCE((SELECT SUM(cap.amount) FROM capital_transactions cap WHERE cap.txn_date = $1::date AND cap.amount > 0),0)
         + COALESCE((SELECT SUM(adj.amount) FROM cashbox_adjustments adj WHERE adj.adj_date = $1::date AND adj.amount > 0),0))::numeric AS income,
        (COALESCE((SELECT SUM(i.amount) FROM invoices i WHERE i.entry_date = $1::date),0)
         + COALESCE((SELECT SUM(g.amount) FROM general_expenses g WHERE g.expense_date = $1::date AND g.reversed_at IS NULL),0)
         + COALESCE((SELECT SUM(-s.amount) FROM salary_transactions s WHERE s.txn_date = $1::date AND s.reversed_at IS NULL),0)
         + COALESCE((SELECT SUM(-cap.amount) FROM capital_transactions cap WHERE cap.txn_date = $1::date AND cap.amount < 0),0)
         + COALESCE((SELECT SUM(-adj.amount) FROM cashbox_adjustments adj WHERE adj.adj_date = $1::date AND adj.amount < 0),0))::numeric AS expense
    `, [today]),
    // حركات الشهر
    query(`
      SELECT
        (COALESCE((SELECT SUM(pay.amount) FROM payments pay WHERE pay.payment_date >= $1::date),0)
         + COALESCE((SELECT SUM(cap.amount) FROM capital_transactions cap WHERE cap.txn_date >= $1::date AND cap.amount > 0),0)
         + COALESCE((SELECT SUM(adj.amount) FROM cashbox_adjustments adj WHERE adj.adj_date >= $1::date AND adj.amount > 0),0))::numeric AS income,
        (COALESCE((SELECT SUM(i.amount) FROM invoices i WHERE i.entry_date >= $1::date),0)
         + COALESCE((SELECT SUM(g.amount) FROM general_expenses g WHERE g.expense_date >= $1::date AND g.reversed_at IS NULL),0)
         + COALESCE((SELECT SUM(-s.amount) FROM salary_transactions s WHERE s.txn_date >= $1::date AND s.reversed_at IS NULL),0)
         + COALESCE((SELECT SUM(-cap.amount) FROM capital_transactions cap WHERE cap.txn_date >= $1::date AND cap.amount < 0),0)
         + COALESCE((SELECT SUM(-adj.amount) FROM cashbox_adjustments adj WHERE adj.adj_date >= $1::date AND adj.amount < 0),0))::numeric AS expense
    `, [monthStart]),
    // المصاريف: مؤثرة في الصندوق مقابل غير مؤثرة + آجلة
    query(`
      SELECT
        COALESCE((SELECT SUM(g.amount) FROM general_expenses g WHERE g.reversed_at IS NULL),0)::numeric AS institution,
        COALESCE((SELECT SUM(g.amount) FROM cash_general_expenses g),0)::numeric AS institution_cash,
        COALESCE((SELECT SUM(-s.amount) FROM salary_transactions s WHERE s.reversed_at IS NULL),0)::numeric AS salaries,
        COALESCE((SELECT SUM(-s.amount) FROM cash_salary_transactions s),0)::numeric AS salaries_cash
    `),
    // الرواتب: إجمالي مدفوع هذا الشهر + المتبقي على العمال
    query(`
      SELECT
        COALESCE((SELECT SUM(-s.amount) FROM salary_transactions s
                   WHERE s.reversed_at IS NULL AND to_char(s.txn_date, 'YYYY-MM') = $1),0)::numeric AS paid_month,
        COALESCE((SELECT SUM(u.salary) FROM users u WHERE u.role = 'employee' AND u.is_active),0)::numeric AS payroll,
        (SELECT COUNT(*)::int FROM users u WHERE u.role = 'employee' AND u.is_active) AS employees_count
    `, [today.slice(0, 7)]),
    // مصاريف العمال (فواتير الحاويات) للشهر
    query(`
      SELECT COUNT(*)::int AS count, COALESCE(SUM(i.amount),0)::numeric AS total
        FROM invoices i WHERE i.entry_date >= $1::date
    `, [monthStart]),
    // الالتزامات غير المدفوعة (آجل) — لا تؤثر على الصندوق
    query(`
      SELECT
        COALESCE((SELECT SUM(g.amount) FROM general_expenses g WHERE g.payment_method = 'credit' AND g.reversed_at IS NULL),0)::numeric AS institution_unpaid,
        COALESCE((SELECT SUM(-s.amount) FROM salary_transactions s WHERE s.payment_method = 'credit' AND s.reversed_at IS NULL),0)::numeric AS salaries_unpaid
    `),
    // عمليات معكوسة (للتنبيه فقط)
    query(`
      SELECT
        (SELECT COUNT(*)::int FROM general_expenses g WHERE g.reversed_at IS NOT NULL) AS expenses_reversed,
        (SELECT COUNT(*)::int FROM salary_transactions s WHERE s.reversed_at IS NOT NULL) AS salaries_reversed
    `),
  ]);

  const cash = Number(cashBox.rows[0].total);
  const todayIncome = Number(dayFlows.rows[0].income);
  const todayExpense = Number(dayFlows.rows[0].expense);
  const monthIncome = Number(monthFlows.rows[0].income);
  const monthExpense = Number(monthFlows.rows[0].expense);
  const institution = Number(expenseTotals.rows[0].institution);
  const institutionCash = Number(expenseTotals.rows[0].institution_cash);
  const salaries = Number(expenseTotals.rows[0].salaries);
  const salariesCash = Number(expenseTotals.rows[0].salaries_cash);
  const paidMonth = Number(wageTotals.rows[0].paid_month);
  const payroll = Number(wageTotals.rows[0].payroll);

  res.json({
    cash_in_hand: cash,
    today: { income: todayIncome, expense: todayExpense, net: todayIncome - todayExpense },
    month: { income: monthIncome, expense: monthExpense, net: monthIncome - monthExpense },
    expenses: {
      total: institution + salaries,
      institution,
      institution_cash: institutionCash,
      institution_non_cash: institution - institutionCash,
      salaries,
      salaries_cash: salariesCash,
      salaries_non_cash: salaries - salariesCash,
    },
    wages: {
      paid_month: paidMonth,
      payroll_month: payroll,
      remaining: payroll - paidMonth,
      employees_count: Number(wageTotals.rows[0].employees_count),
    },
    worker_expenses: {
      total: Number(workerExpenses.rows[0].total),
      count: Number(workerExpenses.rows[0].count),
    },
    unpaid: {
      institution: Number(unpaid.rows[0].institution_unpaid),
      salaries: Number(unpaid.rows[0].salaries_unpaid),
      total: Number(unpaid.rows[0].institution_unpaid) + Number(unpaid.rows[0].salaries_unpaid),
    },
    reversed: {
      expenses: Number(reversed.rows[0].expenses_reversed),
      salaries: Number(reversed.rows[0].salaries_reversed),
    },
  });
});

// GET /api/accountant/audit - سجل تدقيق العمليات المالية
router.get('/audit', requirePermission(PERM.FIN_AUDIT_VIEW), async (req, res) => {
  const { action, entity_type, from, to, limit } = req.query;
  const conds = [];
  const params = [];
  const push = (v) => { params.push(v); return `$${params.length}`; };
  if (action && action !== 'undefined') conds.push(`a.action = ${push(action)}`);
  if (entity_type && entity_type !== 'undefined') conds.push(`a.entity_type = ${push(entity_type)}`);
  if (from && from !== 'undefined') conds.push(`a.created_at >= ${push(from)}::date`);
  if (to && to !== 'undefined') conds.push(`a.created_at < (${push(to)}::date + interval '1 day')`);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const lim = Math.min(Number(limit) || 200, 500);
  const { rows } = await query(`
    SELECT a.id, a.actor_id, a.actor_name, a.actor_role, a.action, a.entity_type, a.entity_id,
           a.details, a.created_at
    FROM audit_logs a
    ${where}
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT ${lim}
  `, params);
  res.json(rows.map((r) => ({
    ...r,
    actor_id: r.actor_id ?? null,
    entity_id: r.entity_id ?? null,
    details: r.details ?? null,
  })));
});

// GET /api/accountant/employees - قائمة المستخدمين للفلاتر (بدون كلمات مرور)
router.get('/employees', requirePermission(PERM.FIN_WAGES_VIEW), async (req, res) => {
  const { rows } = await query(
    `SELECT id, full_name, role, is_active FROM users
      WHERE role IN ('employee', 'manager') ORDER BY full_name ASC`
  );
  res.json(rows);
});

export default router;
