import { Router } from 'express';
import { query, pool } from '../db.js';
import { authRequired, allowRoles } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

/**
 * النموذج المحاسبي:
 *   رأس المال المستثمر = مجموع مساهمات المالك فقط (إيداعات − سحوبات) — غير محدود، متعدد المصادر.
 *   النقدية في الصندوق = كل ما دخل فعلاً − كل ما خرج فعلاً (محاسبة حركة، لا رأس مال محدد سلفاً):
 *                     إيداعات وسحوبات رأس المال + تسويات يدوية + التحصيلات من الزبائن + تحصيل الديون القديمة
 *                     − تكاليف الحاويات المدفوعة − مصاريف المؤسسة − الرواتب المدفوعة.
 *   النتيجة التشغيلية المحققة نقداً = نقدية الصندوق − رأس المال المستثمر.
 * المصاريف والديون والأرباح تُتتبَّع كلٌّ منها مستقلة عن رأس المال.
 * الديون القديمة المضمونة: مستحقات مُرحَّلة من النظام السابق، منفصلة عن رأس المال؛
 *   عند تحصيلها تدخل نقداً إلى الصندوق فترفع النقدية (لا تتضاعف، لا تُحتسب مرتين).
 */

// GET /api/financial/overview - summary of capital, cash box, old debts, customer debts
router.get('/overview', allowRoles('manager'), async (req, res) => {
  const [cash, capital, oldDebts, billed, paid, collected, costs, general, adjustments, pricingProfit, salary] = await Promise.all([
    // النقدية الفعلية في الصندوق (محصلة كل الحركات)
    query(`
      SELECT (COALESCE((SELECT SUM(amount) FROM capital_transactions),0)
            + COALESCE((SELECT SUM(amount) FROM cashbox_adjustments),0)
            + COALESCE((SELECT SUM(amount) FROM payments),0)
            + COALESCE((SELECT SUM(amount) FROM old_debt_collections),0)
            - COALESCE((SELECT SUM(amount) FROM invoices),0)
            - COALESCE((SELECT SUM(amount) FROM general_expenses),0)
            + COALESCE((SELECT SUM(amount) FROM salary_transactions WHERE amount < 0),0))::numeric AS total
    `),
    // رأس المال المستثمر = مساهمات المالك فقط (مستقل عن نشاط الصندوق)
    query('SELECT COALESCE(SUM(amount),0)::numeric AS total FROM capital_transactions'),
    // الديون القديمة المتبقية (غير المحصّلة)
    query(`
      SELECT (COALESCE((SELECT SUM(amount) FROM old_debts),0)
            - COALESCE((SELECT SUM(amount) FROM old_debt_collections),0))::numeric AS total
    `),
    // إجمالي فواتير الحاويات (قيمة البيع)
    query('SELECT COALESCE(SUM(final_price),0)::numeric AS total FROM pricing'),
    // إجمالي ما دفعه الزبائن
    query('SELECT COALESCE(SUM(amount),0)::numeric AS total FROM payments'),
    // التحصيلات (المدفوعات)
    query('SELECT COALESCE(SUM(amount),0)::numeric AS total FROM payments'),
    // تكاليف الحاويات المدفوعة
    query('SELECT COALESCE(SUM(amount),0)::numeric AS total FROM invoices'),
    // مصاريف المؤسسة
    query('SELECT COALESCE(SUM(amount),0)::numeric AS total FROM general_expenses'),
    // تسويات الصندوق
    query('SELECT COALESCE(SUM(amount),0)::numeric AS total FROM cashbox_adjustments'),
    // أرباح الحاويات = final_price − total_costs
    query('SELECT COALESCE(SUM(profit),0)::numeric AS total FROM pricing'),
    // إجمالي الرواتب المدفوعة نقداً (تُخصم من الصندوق)
    query('SELECT COALESCE(SUM(-amount),0)::numeric AS total FROM salary_transactions WHERE amount < 0'),
  ]);

  const cashTotal = Number(cash.rows[0].total);
  const capitalInvested = Number(capital.rows[0].total);
  const oldDebtTotal = Number(oldDebts.rows[0].total);
  const billedTotal = Number(billed.rows[0].total);
  const paidTotal = Number(paid.rows[0].total);
  const collectedTotal = Number(collected.rows[0].total);
  const costsTotal = Number(costs.rows[0].total);
  const containerProfit = Number(pricingProfit.rows[0].total);

  // صافي مستحقات الزبائن: موجب = يدين لنا، سالب = سلف من الزبائن
  const customerDebt = billedTotal - paidTotal;

  // النتيجة التشغيلية محققة نقداً = نقدية الصندوق − رأس المال المستثمر
  const operationalResult = cashTotal - capitalInvested;

  res.json({
    // رأس المال المستثمر = مساهمات المالك فقط (مستقل عن نشاط الصندوق)
    capital_invested: capitalInvested,
    // النقدية الفعلية في الصندوق (محصلة كل الحركات)
    cash_box: cashTotal,
    // النتيجة التشغيلية المحققة نقداً (أرباح/خسائر تشغيلية + فروقات توقيت التحصيل)
    operational_cash_result: operationalResult,
    // حقول متوافقة للخلف (مؤقتة)
    capital: capitalInvested,
    cash_capital: cashTotal,
    old_debts: oldDebtTotal,
    customer_debt: customerDebt,
    total_collections: collectedTotal,
    total_container_costs: costsTotal,
    total_general_expenses: Number(general.rows[0].total),
    total_salary_paid: Number(salary.rows[0].total),
    total_adjustments: Number(adjustments.rows[0].total),
    total_billed: billedTotal,
    profit: containerProfit,
  });
});

// GET /api/financial/movements - unified cash ledger (with optional date filter)
router.get('/movements', allowRoles('manager'), async (req, res) => {
  const { from, to } = req.query;
  const conds = [];
  const params = [];
  const push = (v) => { params.push(v); return `$${params.length}`; };
  // NOTE: `d` is rendered as TEXT (to_char 'YYYY-MM-DD') in the CTE below, so we must
  // compare it against text (ISO dates sort lexicographically = chronologically).
  if (from && from !== 'undefined') conds.push(`d >= ${push(from)}`);
  if (to && to !== 'undefined') conds.push(`d <= ${push(to)}`);
  const scope = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const { rows } = await query(`
    WITH parts AS (
      SELECT to_char(a.adj_date, 'YYYY-MM-DD') AS d, a.amount, 'adjust' AS kind, 'تسوية الصندوق' AS descr, a.notes AS ref
        FROM cashbox_adjustments a
      UNION ALL
      SELECT to_char(c.txn_date, 'YYYY-MM-DD'), c.amount, 'capital'::text AS kind,
             CASE WHEN c.amount > 0 THEN 'إيداع رأس مال' ELSE 'سحب رأس مال' END AS descr,
             COALESCE(c.source, 'أموال المالك') AS ref
        FROM capital_transactions c
      UNION ALL
      SELECT to_char(p.payment_date, 'YYYY-MM-DD'), p.amount, 'collection' AS kind,
             'تحصيل من ' || c.name AS descr, p.notes AS ref
        FROM payments p JOIN customers c ON c.id = p.customer_id
      UNION ALL
      SELECT to_char(od.collection_date, 'YYYY-MM-DD'), od.amount, 'old_debt'::text AS kind,
             'تحصيل دين قديم: ' || d.description AS descr, od.notes AS ref
        FROM old_debt_collections od JOIN old_debts d ON d.id = od.old_debt_id
      UNION ALL
      SELECT to_char(i.entry_date, 'YYYY-MM-DD'), -i.amount, 'cost'::text AS kind,
             'تكاليف حاوية ' || ct.bl_number || ' — ' || COALESCE(u.full_name, 'بدون سجل') AS descr, it.name AS ref
        FROM invoices i
        JOIN containers ct ON ct.id = i.container_id
        JOIN invoice_types it ON it.id = i.invoice_type_id
        LEFT JOIN users u ON u.id = i.entered_by
      UNION ALL
      SELECT to_char(g.expense_date, 'YYYY-MM-DD'), -g.amount, 'expense'::text AS kind,
             'مصروف مؤسسة: ' || g.category AS descr, g.description AS ref
        FROM general_expenses g
      UNION ALL
      SELECT to_char(s.txn_date, 'YYYY-MM-DD'), s.amount, 'salary'::text AS kind,
             CASE s.kind WHEN 'advance' THEN 'دفع مقدم من الراتب: ' ELSE 'دفع بقية الراتب: ' END || u.full_name AS descr,
             s.notes AS ref
        FROM salary_transactions s
        JOIN users u ON u.id = s.user_id
       WHERE s.amount < 0
    )
    SELECT d, amount, kind, descr, ref FROM parts ${scope}
    ORDER BY d DESC
  `, params);

  res.json(rows.map((r) => ({ ...r, amount: Number(r.amount) })));
});

// GET /api/financial/capital - list of capital transactions (deposits/withdrawals per source)
router.get('/capital/list', allowRoles('manager'), async (req, res) => {
  const { from, to } = req.query;
  const conds = [];
  const params = [];
  const push = (v) => { params.push(v); return `$${params.length}`; };
  if (from && from !== 'undefined') conds.push(`txn_date >= ${push(from)}::date`);
  if (to && to !== 'undefined') conds.push(`txn_date <= ${push(to)}::date`);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const { rows } = await query(`
    SELECT to_char(c.txn_date, 'YYYY-MM-DD') AS txn_date, c.amount, c.source, c.notes, c.id, u.full_name AS entered_by_name
    FROM capital_transactions c LEFT JOIN users u ON u.id = c.entered_by
    ${where} ORDER BY txn_date DESC, c.id DESC`, params);
  res.json(rows.map((r) => ({ ...r, amount: Number(r.amount) })));
});

// POST /api/financial/capital - record an owner contribution (+) / withdrawal (-), with its source
router.post('/capital', allowRoles('manager'), async (req, res) => {
  const { amount, txn_date, source, notes } = req.body || {};
  const amt = Number(amount);
  if (amount === undefined || amount === '' || !isFinite(amt) || amt === 0) {
    return res.status(400).json({ error: 'المبلغ مطلوب ويجب ألا يكون صفراً' });
  }
  if (!txn_date) return res.status(400).json({ error: 'التاريخ مطلوب' });
  const { rows } = await query(
    `INSERT INTO capital_transactions (amount, txn_date, source, notes, entered_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [amt, txn_date, (source && String(source).trim()) || 'أموال المالك', notes || null, req.user.id]
  );
  res.status(201).json({ ...rows[0], amount: Number(rows[0].amount) });
});

// DELETE /api/financial/capital/:id
router.delete('/capital/:id', allowRoles('manager'), async (req, res) => {
  const id = Number(req.params.id);
  const { rowCount } = await query('DELETE FROM capital_transactions WHERE id = $1', [id]);
  if (!rowCount) return res.status(404).json({ error: 'العملية غير موجودة' });
  res.status(204).end();
});

// GET /api/financial/adjustments - list of cashbox manual adjustments
router.get('/adjustments/list', allowRoles('manager'), async (req, res) => {
  const { rows } = await query(`
    SELECT to_char(a.adj_date, 'YYYY-MM-DD') AS adj_date, a.amount, a.notes, a.id, u.full_name AS entered_by_name
    FROM cashbox_adjustments a LEFT JOIN users u ON u.id = a.entered_by
    ORDER BY adj_date DESC, a.id DESC`);
  res.json(rows.map((r) => ({ ...r, amount: Number(r.amount) })));
});

// POST /api/financial/adjustments - seed opening cash / manual correction (+ in box, - out of box)
router.post('/adjustments', allowRoles('manager'), async (req, res) => {
  const { amount, adj_date, notes } = req.body || {};
  const amt = Number(amount);
  if (amount === undefined || amount === '' || !isFinite(amt) || amt === 0) {
    return res.status(400).json({ error: 'المبلغ مطلوب ويجب ألا يكون صفراً' });
  }
  if (!adj_date) return res.status(400).json({ error: 'التاريخ مطلوب' });
  const { rows } = await query(
    `INSERT INTO cashbox_adjustments (amount, adj_date, notes, entered_by)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [amt, adj_date, notes || null, req.user.id]
  );
  res.status(201).json({ ...rows[0], amount: Number(rows[0].amount) });
});

// DELETE /api/financial/adjustments/:id
router.delete('/adjustments/:id', allowRoles('manager'), async (req, res) => {
  const id = Number(req.params.id);
  const { rowCount } = await query('DELETE FROM cashbox_adjustments WHERE id = $1', [id]);
  if (!rowCount) return res.status(404).json({ error: 'التسوية غير موجودة' });
  res.status(204).end();
});

// GET /api/financial/old-debts - list old debts with collected & remaining amounts
router.get('/old-debts', allowRoles('manager'), async (req, res) => {
  const { rows } = await query(`
    SELECT d.id, d.description, d.amount,
           COALESCE(SUM(od.amount), 0)::numeric AS collected,
           (d.amount - COALESCE(SUM(od.amount), 0))::numeric AS remaining,
           to_char(d.created_at, 'YYYY-MM-DD') AS created_at,
           u.full_name AS entered_by_name
    FROM old_debts d
    LEFT JOIN old_debt_collections od ON od.old_debt_id = d.id
    LEFT JOIN users u ON u.id = d.entered_by
    GROUP BY d.id, d.description, d.amount, d.created_at, u.full_name
    ORDER BY d.created_at DESC, d.id DESC`);
  res.json(rows.map((r) => ({ ...r, amount: Number(r.amount), collected: Number(r.collected), remaining: Number(r.remaining) })));
});

// POST /api/financial/old-debts - register a new guaranteed old debt (amount + description/source)
router.post('/old-debts', allowRoles('manager'), async (req, res) => {
  const { amount, description } = req.body || {};
  const amt = Number(amount);
  if (amount === undefined || amount === '' || !isFinite(amt) || amt <= 0) {
    return res.status(400).json({ error: 'المبلغ مطلوب ويجب أن يكون أكبر من صفر' });
  }
  if (!description || !String(description).trim()) {
    return res.status(400).json({ error: 'وصف الدين/المصدر مطلوب' });
  }
  const { rows } = await query(
    `INSERT INTO old_debts (amount, description, entered_by)
     VALUES ($1, $2, $3) RETURNING *`,
    [amt, String(description).trim(), req.user.id]
  );
  res.status(201).json({ ...rows[0], amount: Number(rows[0].amount) });
});

// POST /api/financial/old-debts/:id/collect - collecting adds cash to the box (raises capital) in the same transaction
router.post('/old-debts/:id/collect', allowRoles('manager'), async (req, res) => {
  const id = Number(req.params.id);
  const { amount, collection_date, notes } = req.body || {};
  const amt = Number(amount);
  if (amount === undefined || amount === '' || !isFinite(amt) || amt <= 0) {
    return res.status(400).json({ error: 'المبلغ مطلوب ويجب أن يكون أكبر من صفر' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query('SELECT amount FROM old_debts WHERE id = $1 FOR UPDATE', [id]);
    if (!found.rows.length) return res.status(404).json({ error: 'الدين غير موجود' });
    const collected = await client.query('SELECT COALESCE(SUM(amount),0)::numeric AS total FROM old_debt_collections WHERE old_debt_id = $1', [id]);
    const remaining = Number(found.rows[0].amount) - Number(collected.rows[0].total);
    if (amt > remaining) {
      return res.status(400).json({ error: `المبلغ المحصّل يتجاوز المتبقي لهذا الدين (${remaining})` });
    }
    const { rows } = await client.query(
      `INSERT INTO old_debt_collections (old_debt_id, amount, collection_date, notes, entered_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, amt, collection_date || null, notes || null, req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ ...rows[0], amount: Number(rows[0].amount) });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

// DELETE /api/financial/old-debts/:id - remove a (still unpaid) old debt
router.delete('/old-debts/:id', allowRoles('manager'), async (req, res) => {
  const id = Number(req.params.id);
  const collected = await query('SELECT COUNT(*)::int AS count FROM old_debt_collections WHERE old_debt_id = $1', [id]);
  if (Number(collected.rows[0].count) > 0) {
    return res.status(400).json({ error: 'لا يمكن حذف دين تم تحصيل جزء منه — احذف التحصيلات أولاً' });
  }
  const { rowCount } = await query('DELETE FROM old_debts WHERE id = $1', [id]);
  if (!rowCount) return res.status(404).json({ error: 'الدين غير موجود' });
  res.status(204).end();
});

export default router;