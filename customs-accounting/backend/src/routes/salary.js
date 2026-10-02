import { Router } from 'express';
import { query } from '../db.js';
import { authRequired, allowRoles } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

// GET /api/salary/employees - employees with their fixed salary + current-month balance
router.get('/employees', allowRoles('manager'), async (req, res) => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  const { rows } = await query(`
    SELECT u.id, u.full_name, u.is_active, u.salary,
           COALESCE(SUM(CASE WHEN s.kind = 'advance' THEN -s.amount ELSE 0 END), 0)::numeric AS advance_paid,
           COALESCE(SUM(CASE WHEN s.kind = 'remainder' THEN -s.amount ELSE 0 END), 0)::numeric AS remainder_paid,
           COALESCE(SUM(-s.amount), 0)::numeric AS paid,
           (u.salary - COALESCE(SUM(-s.amount), 0))::numeric AS remaining
    FROM users u
    LEFT JOIN salary_transactions s
           ON s.user_id = u.id AND to_char(s.txn_date, 'YYYY-MM') = $1
    WHERE u.role = 'employee'
    GROUP BY u.id, u.full_name, u.is_active, u.salary
    ORDER BY u.full_name ASC
  `, [month]);
  res.json(rows.map((r) => ({
    ...r,
    salary: Number(r.salary),
    advance_paid: Number(r.advance_paid),
    remainder_paid: Number(r.remainder_paid),
    paid: Number(r.paid),
    remaining: Number(r.remaining),
  })));
});

// GET /api/salary/statement/:userId?from=&to= - كشف حساب موظف (شهري + حركات ضمن الفترة)
// if from/to omitted -> تغطي كل الفترات
router.get('/statement/:userId', allowRoles('manager'), async (req, res) => {
  const userId = Number(req.params.userId);
  const { from, to } = req.query;
  const staff = await query('SELECT id, full_name, salary FROM users WHERE id = $1', [userId]);
  if (!staff.rows.length) return res.status(404).json({ error: 'الموظف غير موجود' });

  const conds = ['s.user_id = $1'];
  const params = [userId];
  const push = (v) => { params.push(v); return `$${params.length}`; };
  if (from && from !== 'undefined' && from !== '') {
    conds.push(`s.txn_date >= ${push(from)}::date`);
  }
  if (to && to !== 'undefined' && to !== '') {
    conds.push(`s.txn_date <= ${push(to)}::date`);
  }
  const where = conds.join(' AND ');

  const monthsRes = await query(`
    SELECT to_char(s.txn_date, 'YYYY-MM') AS month,
           COALESCE(SUM(CASE WHEN s.kind = 'advance' THEN -s.amount ELSE 0 END), 0)::numeric AS advance,
           COALESCE(SUM(CASE WHEN s.kind = 'remainder' THEN -s.amount ELSE 0 END), 0)::numeric AS remainder,
           COALESCE(SUM(-s.amount), 0)::numeric AS paid
    FROM salary_transactions s
    WHERE ${where}
    GROUP BY to_char(s.txn_date, 'YYYY-MM')
    ORDER BY month DESC
  `, params);

  const txsRes = await query(`
    SELECT s.id, s.amount, s.kind, to_char(s.txn_date, 'YYYY-MM-DD') AS txn_date, s.notes,
           cb.full_name AS created_by_name
    FROM salary_transactions s
    LEFT JOIN users cb ON cb.id = s.created_by
    WHERE ${where}
    ORDER BY s.txn_date DESC, s.id DESC
  `, params);

  const salary = Number(staff.rows[0].salary);
  const period = txsRes.rows.reduce(
    (a, t) => {
      const amt = Math.abs(Number(t.amount));
      if (t.kind === 'advance') a.advance += amt;
      else a.remainder += amt;
      a.paid += amt;
      return a;
    },
    { advance: 0, remainder: 0, paid: 0 }
  );
  period.salary = salary;
  period.remaining = salary - period.paid;

  res.json({
    employee: { ...staff.rows[0], salary },
    from: from || null,
    to: to || null,
    period,
    months: monthsRes.rows.map((r) => {
      const paid = Number(r.paid);
      return {
        month: r.month,
        salary,
        advance: Number(r.advance),
        remainder: Number(r.remainder),
        paid,
        remaining: salary - paid,
      };
    }),
    transactions: txsRes.rows.map((t) => ({ ...t, amount: Number(t.amount) })),
  });
});

// GET /api/salary/transactions?employee_id=&from=&to=
router.get('/transactions', allowRoles('manager'), async (req, res) => {
  const { employee_id, from, to } = req.query;
  const conds = [];
  const params = [];
  const push = (v) => { params.push(v); return `$${params.length}`; };
  if (employee_id && employee_id !== 'undefined') {
    params.push(Number(employee_id));
    conds.push(`s.user_id = $${params.length}`);
  }
  if (from && from !== 'undefined') conds.push(`s.txn_date >= ${push(from)}::date`);
  if (to && to !== 'undefined') conds.push(`s.txn_date <= ${push(to)}::date`);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const { rows } = await query(`
    SELECT s.id, s.amount, s.kind, to_char(s.txn_date, 'YYYY-MM-DD') AS txn_date, s.notes,
           s.user_id, u.full_name AS employee_name,
           cb.full_name AS created_by_name
    FROM salary_transactions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN users cb ON cb.id = s.created_by
    ${where}
    ORDER BY s.txn_date DESC, s.id DESC
  `, params);
  res.json(rows.map((r) => ({ ...r, amount: Number(r.amount) })));
});

// POST /api/salary/advance - دفع مقدم من الراتب { user_id, amount, txn_date, notes }
// المبلغ لا يتجاوز المتبقي من راتب الشهر (الراتب − المقدمات السابقة في نفس الشهر).
// يُخزَّن amount سالباً ويُخصم تلقائياً من نقدية الصندوق.
router.post('/advance', allowRoles('manager'), async (req, res) => {
  const { user_id, amount, txn_date, notes } = req.body || {};
  const user = Number(user_id);
  const amt = Number(amount);
  if (!Number.isInteger(user)) return res.status(400).json({ error: 'الموظف غير صالح' });
  if (amount === undefined || amount === '' || !isFinite(amt) || amt <= 0) {
    return res.status(400).json({ error: 'المبلغ مطلوب ويجب أن يكون أكبر من صفر' });
  }
  if (!txn_date) return res.status(400).json({ error: 'التاريخ مطلوب' });
  const staff = await query('SELECT id, salary FROM users WHERE id = $1 AND role = $2 AND is_active = true', [user, 'employee']);
  if (!staff.rows.length) return res.status(400).json({ error: 'الموظف غير موجود أو غير نشط' });

  const month = String(txn_date).slice(0, 7);
  const paidRes = await query(
    `SELECT COALESCE(SUM(-amount), 0)::numeric AS paid
       FROM salary_transactions WHERE user_id = $1 AND to_char(txn_date, 'YYYY-MM') = $2`,
    [user, month]
  );
  const salary = Number(staff.rows[0].salary);
  const paid = Number(paidRes.rows[0].paid);
  const remaining = salary - paid;
  if (amt > remaining) {
    return res.status(400).json({ error: `المقدم يتجاوز المتبقي من راتب الشهر (${remaining})` });
  }

  const { rows } = await query(
    `INSERT INTO salary_transactions (user_id, amount, kind, txn_date, notes, created_by)
     VALUES ($1, $2, 'advance', $3, $4, $5) RETURNING *`,
    [user, -amt, txn_date, notes || null, req.user.id]
  );
  res.status(201).json({ ...rows[0], amount: Number(rows[0].amount) });
});

// POST /api/salary/remainder - دفع بقية الراتب { user_id, txn_date, notes }
// البقية تُحسب تلقائياً = راتب الشهر − المقدمات المسجلة في نفس الشهر.
router.post('/remainder', allowRoles('manager'), async (req, res) => {
  const { user_id, txn_date, notes } = req.body || {};
  const user = Number(user_id);
  if (!Number.isInteger(user)) return res.status(400).json({ error: 'الموظف غير صالح' });
  if (!txn_date) return res.status(400).json({ error: 'التاريخ مطلوب' });
  const staff = await query('SELECT id, salary FROM users WHERE id = $1 AND role = $2 AND is_active = true', [user, 'employee']);
  if (!staff.rows.length) return res.status(400).json({ error: 'الموظف غير موجود أو غير نشط' });

  const month = String(txn_date).slice(0, 7);
  const paidRes = await query(
    `SELECT COALESCE(SUM(-amount), 0)::numeric AS paid
       FROM salary_transactions WHERE user_id = $1 AND to_char(txn_date, 'YYYY-MM') = $2`,
    [user, month]
  );
  const salary = Number(staff.rows[0].salary);
  const paid = Number(paidRes.rows[0].paid);
  const remainder = salary - paid;
  if (remainder <= 0) {
    return res.status(400).json({ error: 'لا بقية تُدفع — راتب الشهر مستوفى بالكامل' });
  }

  const { rows } = await query(
    `INSERT INTO salary_transactions (user_id, amount, kind, txn_date, notes, created_by)
     VALUES ($1, $2, 'remainder', $3, $4, $5) RETURNING *`,
    [user, -remainder, txn_date, notes || null, req.user.id]
  );
  res.status(201).json({ ...rows[0], amount: Number(rows[0].amount), remainder });
});

// DELETE /api/salary/transactions/:id
router.delete('/transactions/:id', allowRoles('manager'), async (req, res) => {
  const id = Number(req.params.id);
  const { rowCount } = await query('DELETE FROM salary_transactions WHERE id = $1', [id]);
  if (!rowCount) return res.status(404).json({ error: 'الحركة غير موجودة' });
  res.status(204).end();
});

export default router;