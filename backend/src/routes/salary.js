import { Router } from 'express';
import { query, pool } from '../db.js';
import { authRequired, allowRoles } from '../middleware/auth.js';
import { requirePermission, PERM } from '../middleware/permissions.js';
import { recordAudit } from '../lib/audit.js';
import { normalizePaymentMethod, normalizeIdempotencyKey, isIsoDate } from '../lib/finance.js';

const router = Router();
router.use(authRequired);

// GET /api/salary/employees - employees with their fixed salary + current-month balance
router.get('/employees', requirePermission(PERM.FIN_WAGES_VIEW), async (req, res) => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  const { rows } = await query(`
    SELECT u.id, u.full_name, u.is_active, u.salary,
           COALESCE(SUM(CASE WHEN s.kind = 'advance' THEN -s.amount ELSE 0 END), 0)::numeric AS advance_paid,
           COALESCE(SUM(CASE WHEN s.kind = 'remainder' THEN -s.amount ELSE 0 END), 0)::numeric AS remainder_paid,
           COALESCE(SUM(-s.amount), 0)::numeric AS paid,
           (u.salary - COALESCE(SUM(-s.amount), 0))::numeric AS remaining
    FROM users u
    LEFT JOIN salary_transactions s
           ON s.user_id = u.id AND to_char(s.txn_date, 'YYYY-MM') = $1 AND s.reversed_at IS NULL
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
router.get('/statement/:userId', requirePermission(PERM.FIN_WAGES_VIEW), async (req, res) => {
  const userId = Number(req.params.userId);
  const { from, to } = req.query;
  const staff = await query('SELECT id, full_name, salary FROM users WHERE id = $1', [userId]);
  if (!staff.rows.length) return res.status(404).json({ error: 'الموظف غير موجود' });

  const conds = ['s.user_id = $1', 's.reversed_at IS NULL'];
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
    SELECT s.id, s.amount, s.kind, s.payment_method, s.reversed_at,
           to_char(s.txn_date, 'YYYY-MM-DD') AS txn_date, s.notes,
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
router.get('/transactions', requirePermission(PERM.FIN_WAGES_VIEW), async (req, res) => {
  const { employee_id, from, to, include_reversed } = req.query;
  const conds = [];
  const params = [];
  const push = (v) => { params.push(v); return `$${params.length}`; };
  if (employee_id && employee_id !== 'undefined') {
    params.push(Number(employee_id));
    conds.push(`s.user_id = $${params.length}`);
  }
  if (from && from !== 'undefined') conds.push(`s.txn_date >= ${push(from)}::date`);
  if (to && to !== 'undefined') conds.push(`s.txn_date <= ${push(to)}::date`);
  if (include_reversed !== '1' && include_reversed !== 'true') conds.push(`s.reversed_at IS NULL`);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const { rows } = await query(`
    SELECT s.id, s.amount, s.kind, s.payment_method, s.reversed_at, s.reversal_note,
           to_char(s.txn_date, 'YYYY-MM-DD') AS txn_date, s.notes,
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

/**
 * POST /api/salary/advance - دفع مقدم من الراتب { user_id, amount, txn_date, notes, payment_method }
 * المبلغ لا يتجاوز المتبقي من راتب الشهر (الراتب − المقدمات السابقة في نفس الشهر).
 * يُخزَّن amount سالباً؛ حركة 'cash' فقط هي ما يخصم من نقدية الصندوق.
 */
async function createSalaryTransaction(req, res, kind) {
  const { user_id, amount, txn_date, notes, payment_method, idempotency_key } = req.body || {};
  const user = Number(user_id);
  const amt = Number(amount);
  if (!Number.isInteger(user)) return res.status(400).json({ error: 'الموظف غير صالح' });
  if (!txn_date || !isIsoDate(String(txn_date))) return res.status(400).json({ error: 'التاريخ مطلوب' });
  const method = normalizePaymentMethod(payment_method);
  if (!method) return res.status(400).json({ error: 'طريقة الدفع غير صالحة' });
  const idem = normalizeIdempotencyKey(idempotency_key);
  if (idempotency_key && !idem) return res.status(400).json({ error: 'مفتاح التفرّد غير صالح' });

  const staff = await query('SELECT id, full_name, salary FROM users WHERE id = $1 AND role = $2 AND is_active = true', [user, 'employee']);
  if (!staff.rows.length) return res.status(400).json({ error: 'الموظف غير موجود أو غير نشط' });

  const month = String(txn_date).slice(0, 7);
  const salary = Number(staff.rows[0].salary);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (idem) {
      const dupe = await client.query('SELECT id FROM salary_transactions WHERE idempotency_key = $1', [idem]);
      if (dupe.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'تم تسجيل هذه الحركة مسبقاً — لن تُحتسب مرتين' });
      }
    }

    // قفل حركات الشهر لمنع التزامن بين عمليتي دفع لنفس الموظف
    await client.query(
      `SELECT id FROM salary_transactions
        WHERE user_id = $1 AND to_char(txn_date, 'YYYY-MM') = $2
        FOR UPDATE`,
      [user, month]
    );
    const paidRes = await client.query(
      `SELECT COALESCE(SUM(-amount), 0)::numeric AS paid
         FROM salary_transactions
        WHERE user_id = $1 AND to_char(txn_date, 'YYYY-MM') = $2 AND reversed_at IS NULL`,
      [user, month]
    );
    const paid = Number(paidRes.rows[0].paid);
    const remaining = salary - paid;

    let value = amt;
    if (kind === 'advance') {
      if (amount === undefined || amount === '' || !isFinite(amt) || amt <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'المبلغ مطلوب ويجب أن يكون أكبر من صفر' });
      }
      if (amt > remaining) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `المقدم يتجاوز المتبقي من راتب الشهر (${remaining})` });
      }
      // منع تسجيل نفس المقدم مرتين (نفس الموظف ونفس النوع ونفس التاريخ ونفس المبلغ)
      const natural = await client.query(
        `SELECT id FROM salary_transactions
          WHERE user_id = $1 AND kind = 'advance' AND txn_date = $2::date AND amount = $3
            AND reversed_at IS NULL
          LIMIT 1`,
        [user, txn_date, -amt]
      );
      if (natural.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'دفعة مقدم مطابقة مسجّلة مسبقاً — لن تُحتسب مرتين' });
      }
    } else {
      if (remaining <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'لا بقية تُدفع — راتب الشهر مستوفى بالكامل' });
      }
      value = remaining;
    }

    const { rows } = await client.query(
      `INSERT INTO salary_transactions (user_id, amount, kind, txn_date, notes, payment_method, idempotency_key, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [user, -value, kind, txn_date, notes || null, method, idem, req.user.id]
    );
    const created = rows[0];

    await recordAudit(client, {
      actor: req.user,
      action: 'create',
      entityType: 'salary_transaction',
      entityId: created.id,
      details: {
        employee_id: user,
        employee_name: staff.rows[0].full_name,
        kind,
        amount: Number(value),
        txn_date,
        payment_method: method,
        affects_cash: method === 'cash',
      },
    });

    await client.query('COMMIT');
    res.status(201).json({ ...created, amount: Number(created.amount), remainder: kind === 'remainder' ? value : undefined });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

router.post('/advance', requirePermission(PERM.FIN_WAGES_RECORD), (req, res) => createSalaryTransaction(req, res, 'advance'));
router.post('/remainder', requirePermission(PERM.FIN_WAGES_RECORD), (req, res) => createSalaryTransaction(req, res, 'remainder'));

// POST /api/salary/transactions/:id/reverse - reverse a wage payment (never delete it)
router.post('/transactions/:id/reverse', requirePermission(PERM.FIN_WAGES_REVERSE), async (req, res) => {
  const id = Number(req.params.id);
  const { note } = req.body || {};

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT s.*, u.full_name AS employee_name FROM salary_transactions s
        JOIN users u ON u.id = s.user_id WHERE s.id = $1 FOR UPDATE`,
      [id]
    );
    if (!existing.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'الحركة غير موجودة' });
    }
    if (existing.rows[0].reversed_at) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'الحركة معكوسة مسبقاً' });
    }
    const { rows } = await client.query(
      `UPDATE salary_transactions SET reversed_at = now(), reversed_by = $1, reversal_note = $2
       WHERE id = $3 RETURNING *`,
      [req.user.id, note || null, id]
    );
    await recordAudit(client, {
      actor: req.user,
      action: 'reverse',
      entityType: 'salary_transaction',
      entityId: id,
      details: {
        employee_name: existing.rows[0].employee_name,
        kind: existing.rows[0].kind,
        amount: Number(existing.rows[0].amount),
        payment_method: existing.rows[0].payment_method || 'cash',
        note: note || null,
      },
    });
    await client.query('COMMIT');
    res.json({ ...rows[0], amount: Number(rows[0].amount) });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

// DELETE /api/salary/transactions/:id - manager only (legacy hard delete; prefer /reverse)
router.delete('/transactions/:id', allowRoles('manager'), async (req, res) => {
  const id = Number(req.params.id);
  const { rowCount } = await query('DELETE FROM salary_transactions WHERE id = $1', [id]);
  if (!rowCount) return res.status(404).json({ error: 'الحركة غير موجودة' });
  res.status(204).end();
});

export default router;
