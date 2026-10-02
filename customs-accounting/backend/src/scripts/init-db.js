import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'customs',
  password: process.env.PGPASSWORD || 'customs_pass',
  database: process.env.PGDATABASE || 'customs_accounting',
});

const EMPLOYEE_TYPES = [
  'Charge Locale','Manutention','TS Douane','Facture Port','Bonnop',
  'Armande','Transport','Déchargement','Bon de sortie Port',
  'Bon de sortie Douane','Fédération','Forfait','Autre','Transfert',
  'Telex Release','Sortie TC CEVA','Déclarant',
];
const MANAGER_TYPES = ['LIQUIDATION'];

async function init() {
  const schema = fs.readFileSync(path.join(__dirname, '..', '..', 'sql', 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('Schema created.');

  // Seed invoice types
  for (let i = 0; i < EMPLOYEE_TYPES.length; i++) {
    await pool.query(
      `INSERT INTO invoice_types (name, allowed_role, sort_order)
       VALUES ($1, 'employee', $2)
       ON CONFLICT (name) DO NOTHING`,
      [EMPLOYEE_TYPES[i], i]
    );
  }
  for (let i = 0; i < MANAGER_TYPES.length; i++) {
    await pool.query(
      `INSERT INTO invoice_types (name, allowed_role, sort_order)
       VALUES ($1, 'manager', $2)
       ON CONFLICT (name) DO NOTHING`,
      [MANAGER_TYPES[i], EMPLOYEE_TYPES.length + i]
    );
  }
  console.log(`Invoice types seeded (${EMPLOYEE_TYPES.length} employee types, ${MANAGER_TYPES.length} manager types).`);

  // Default admin
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const fullName = process.env.ADMIN_FULLNAME || 'مدير النظام';
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (username, password_hash, full_name, role)
     VALUES ($1, $2, $3, 'manager')
     ON CONFLICT (username) DO NOTHING`,
    [username, hash, fullName]
  );
  console.log(`Admin user ensured: username=${username} / password=${password}`);

  await pool.end();
  console.log('Database initialized.');
}

init().catch((e) => {
  console.error('Init failed:', e.message);
  process.exit(1);
});