import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

// DATE columns (OID 1082) arrive as JS Date by default → ugly "T00:00:00.000Z" in JSON.
// Return them as plain 'YYYY-MM-DD' strings globally.
pg.types.setTypeParser(1082, (v) => v);

export const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'customs',
  password: process.env.PGPASSWORD || 'customs_pass',
  database: process.env.PGDATABASE || 'customs_accounting',
  max: 10,
});

export async function query(text, params) {
  return pool.query(text, params);
}

export async function runMigrations() {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');
  await pool.query(schema);
}

export default pool;