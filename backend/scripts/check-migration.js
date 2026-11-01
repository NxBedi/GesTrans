import { runMigrations, query, pool } from '../src/db.js';

try {
  await runMigrations();
  console.log('MIGRATION OK');
  const t = await query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('audit_logs', 'cash_general_expenses', 'cash_salary_transactions')`
  );
  console.log('tables:', t.rows.map((r) => r.table_name).join(', '));
  for (const tbl of ['general_expenses', 'salary_transactions']) {
    const c = await query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY column_name`,
      [tbl]
    );
    console.log(tbl + ':', c.rows.map((x) => x.column_name).join(', '));
  }
} catch (e) {
  console.error('FAIL:', e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
