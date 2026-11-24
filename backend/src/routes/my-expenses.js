import { Router } from 'express';
import { query } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { hasPermission, PERM } from '../middleware/permissions.js';

const router = Router();
router.use(authRequired);

// GET /api/my-expenses?date=YYYY-MM-DD[&employee_id=N]
// Employees see only the invoices they recorded themselves (entered_by = current user).
// Managers and accountants see ALL invoices for the day (with the recorder's name),
// optionally filtered by employee_id.
router.get('/', async (req, res) => {
  const { date, employee_id } = req.query;
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(String(date)) ? String(date) : new Date().toISOString().slice(0, 10);
  const canSeeAll = req.user.role === 'manager' || hasPermission(req.user.role, PERM.FIN_WORKER_EXPENSES_VIEW);

  const params = [day];
  let employeeCond = '';
  if (!canSeeAll) {
    params.push(req.user.id);
    // employees only see invoices of containers that are visible to them
    employeeCond = `AND i.entered_by = $${params.length}
      AND EXISTS (SELECT 1 FROM container_access ca WHERE ca.container_id = c.id AND ca.employee_id = $${params.length})`;
  } else if (employee_id && /^\d+$/.test(String(employee_id))) {
    params.push(Number(employee_id));
    employeeCond = `AND i.entered_by = $${params.length}`;
  }

  const { rows } = await query(`
    SELECT i.id, i.invoice_number, i.amount, i.entry_date, i.created_at, i.notes,
           t.name AS type_name, t.allowed_role,
           u.id AS employee_id, u.full_name AS employee_name,
           c.bl_number, c.container_number, cu.name AS customer_name, c.status AS container_status
    FROM invoices i
    JOIN invoice_types t ON t.id = i.invoice_type_id
    LEFT JOIN users u ON u.id = i.entered_by
    JOIN containers c ON c.id = i.container_id
    JOIN customers cu ON cu.id = c.customer_id
    WHERE i.entry_date = $1::date
      ${employeeCond}
    ORDER BY i.created_at DESC, i.id DESC
  `, params);

  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  res.json({ date: day, count: rows.length, total, invoices: rows });
});

export default router;