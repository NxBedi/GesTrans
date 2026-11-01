import { pool, query } from '../src/db.js';

const tables = ['users', 'general_expenses', 'salary_transactions', 'audit_logs', 'invoices', 'payments', 'customers'];
for (const t of tables) {
  const r = await query(`SELECT COUNT(*)::int AS c FROM ${t}`);
  console.log(t, r.rows[0].c);
}
const users = await query('SELECT id, username, role FROM users ORDER BY id');
console.log(users.rows);
await pool.end();
