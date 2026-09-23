import jwt from 'jsonwebtoken';
import { query } from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

export function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES || '7d' }
  );
}

export async function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'غير مصرح' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const { rows } = await query('SELECT id, username, full_name, role, is_active FROM users WHERE id = $1', [payload.id]);
    if (!rows.length || !rows[0].is_active) {
      return res.status(401).json({ error: 'الحساب غير نشط' });
    }
    req.user = rows[0];
    next();
  } catch {
    return res.status(401).json({ error: 'انتهت الجلسة، سجل الدخول مجدداً' });
  }
}

export function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'ليست لديك صلاحية لهذه العملية' });
    }
    next();
  };
}