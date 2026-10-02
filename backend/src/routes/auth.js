import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { signToken, authRequired } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'أدخل اسم المستخدم وكلمة المرور' });
  }
  const { rows } = await query('SELECT * FROM users WHERE username = $1', [username.trim()]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  }
  if (!user.is_active) {
    return res.status(403).json({ error: 'الحساب معطل' });
  }
  const token = signToken(user);
  res.json({
    token,
    user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role },
  });
});

// GET /api/auth/me
router.get('/me', authRequired, async (req, res) => {
  res.json({ user: req.user });
});

export default router;