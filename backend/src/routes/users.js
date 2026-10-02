import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { authRequired, allowRoles } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

function publicUser(row) {
  return { id: row.id, username: row.username, full_name: row.full_name, role: row.role, salary: Number(row.salary), is_active: row.is_active, created_at: row.created_at };
}

// GET /api/users  (manager only)
router.get('/', allowRoles('manager'), async (req, res) => {
  const { rows } = await query('SELECT id, username, full_name, role, salary, is_active, created_at FROM users ORDER BY id');
  res.json(rows);
});

// POST /api/users (manager only)
router.post('/', allowRoles('manager'), async (req, res) => {
  const { username, password, full_name, role, salary } = req.body || {};
  if (!username || !password || !full_name || !role) {
    return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
  }
  if (!['manager', 'employee'].includes(role)) {
    return res.status(400).json({ error: 'دور غير صالح' });
  }
  const salaryNum = salary === undefined || salary === '' ? 0 : Number(salary);
  if (!isFinite(salaryNum) || salaryNum < 0) {
    return res.status(400).json({ error: 'الراتب يجب أن يكون مبلغاً غير سالب' });
  }
  const { rows } = await query('SELECT id FROM users WHERE username = $1', [username.trim()]);
  if (rows.length) return res.status(409).json({ error: 'اسم المستخدم موجود مسبقاً' });

  const hash = await bcrypt.hash(password, 10);
  const result = await query(
    `INSERT INTO users (username, password_hash, full_name, role, salary)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [username.trim(), hash, full_name.trim(), role, salaryNum]
  );
  res.status(201).json({ user: publicUser(result.rows[0]) });
});

// PUT /api/users/:id (manager only)
router.put('/:id', allowRoles('manager'), async (req, res) => {
  const id = Number(req.params.id);
  const { full_name, role, password, is_active, salary } = req.body || {};
  if (id === req.user.id && is_active === false) {
    return res.status(400).json({ error: 'لا يمكنك تعطيل حسابك الخاص' });
  }
  const sets = [];
  const params = [];
  const push = (val) => { params.push(val); return `$${params.length}`; };

  if (full_name !== undefined) sets.push(`full_name = ${push(full_name.trim())}`);
  if (salary !== undefined) {
    const salaryNum = salary === '' ? 0 : Number(salary);
    if (!isFinite(salaryNum) || salaryNum < 0) {
      return res.status(400).json({ error: 'الراتب يجب أن يكون مبلغاً غير سالب' });
    }
    sets.push(`salary = ${push(salaryNum)}`);
  }
  if (role !== undefined) {
    if (!['manager', 'employee'].includes(role)) return res.status(400).json({ error: 'دور غير صالح' });
    if (id === req.user.id && role !== 'manager') return res.status(400).json({ error: 'لا يمكنك تغيير دور حسابك الخاص' });
    sets.push(`role = ${push(role)}`);
  }
  if (password) sets.push(`password_hash = ${push(await bcrypt.hash(password, 10))}`);
  if (is_active !== undefined) {
    const newActive = is_active === true || is_active === 'true' || is_active === 1;
    if (!newActive) {
      const target = await query('SELECT role, is_active FROM users WHERE id = $1', [id]);
      if (target.rows.length && target.rows[0].role === 'manager' && target.rows[0].is_active) {
        const managers = await query('SELECT COUNT(*)::int AS count FROM users WHERE role = $1 AND is_active = true', ['manager']);
        if (Number(managers.rows[0].count) <= 1) {
          return res.status(400).json({ error: 'لا يمكن تعطيل آخر مدير نشط في النظام' });
        }
      }
    }
    sets.push(`is_active = ${push(newActive)}`);
  }

  if (!sets.length) return res.status(400).json({ error: 'لا توجد بيانات للتحديث' });
  sets.push('updated_at = now()');
  params.push(id);
  const { rows } = await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
  if (!rows.length) return res.status(404).json({ error: 'المستخدم غير موجود' });
  res.json({ user: publicUser(rows[0]) });
});

// DELETE /api/users/:id (manager only)
router.delete('/:id', allowRoles('manager'), async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'لا يمكنك حذف حسابك الخاص' });
  const target = await query('SELECT role, is_active FROM users WHERE id = $1', [id]);
  if (!target.rows.length) return res.status(404).json({ error: 'المستخدم غير موجود' });
  if (target.rows[0].role === 'manager') {
    const managers = await query('SELECT COUNT(*)::int AS count FROM users WHERE role = $1 AND is_active = true', ['manager']);
    if (Number(managers.rows[0].count) <= 1) {
      return res.status(400).json({ error: 'لا يمكن حذف آخر مدير نشط في النظام' });
    }
  }
  const { rowCount } = await query('DELETE FROM users WHERE id = $1', [id]);
  if (!rowCount) return res.status(404).json({ error: 'المستخدم غير موجود' });
  res.status(204).end();
});

export default router;