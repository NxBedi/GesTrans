import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { authRequired, allowRoles } from '../middleware/auth.js';
import { query } from '../db.js';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BACKUP_DIR = path.join(__dirname, '..', '..', 'backups');

const PG_CONTAINER = process.env.PG_CONTAINER || 'customs_db';
const PG_USER = process.env.PGUSER || 'customs';
const PG_DB = process.env.PGDATABASE || 'customs_accounting';

const BACKUP_NAME_RE = /^[A-Za-z0-9._-]+\.dump$/;
const KEEP = Number(process.env.BACKUP_KEEP || 14);

function ensureDir() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function meta(name) {
  const p = path.join(BACKUP_DIR, name);
  const s = fs.statSync(p);
  return { name, size: s.size, created: s.mtime.toISOString() };
}

export function listBackups() {
  ensureDir();
  return fs.readdirSync(BACKUP_DIR)
    .filter((f) => BACKUP_NAME_RE.test(f))
    .map((f) => { const s = fs.statSync(path.join(BACKUP_DIR, f)); return { name: f, size: s.size, created: s.mtime.toISOString() }; })
    .sort((a, b) => b.created.localeCompare(a.created));
}

function safePath(name) {
  if (!BACKUP_NAME_RE.test(name)) throw new Error('اسم النسخة غير صالح');
  const p = path.join(BACKUP_DIR, name);
  if (!p.startsWith(BACKUP_DIR + path.sep)) throw new Error('مسار النسخة غير صالح');
  return p;
}

function prune() {
  listBackups().slice(KEEP).forEach((b) => {
    try { fs.unlinkSync(path.join(BACKUP_DIR, b.name)); } catch { /* ignore */ }
  });
}

// Creates a consistent custom-format (binary) dump of the whole database.
export async function createBackup() {
  ensureDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');
  const name = `backup_${stamp}.dump`;
  const { stdout } = await execFileAsync(
    'docker', ['exec', PG_CONTAINER, 'pg_dump', '-U', PG_USER, '-d', PG_DB, '-Fc'],
    { encoding: 'buffer', maxBuffer: 500 * 1024 * 1024 }
  );
  fs.writeFileSync(path.join(BACKUP_DIR, name), stdout);
  prune();
  console.log(`[backup] created ${name} (${(stdout.length / 1024).toFixed(1)} KB)`);
  return meta(name);
}

// Restores from an uploaded/selected dump buffer with safety:
// 1) validate the archive parses and carries the required tables,
// 2) take an automatic safety copy of the current database,
// 3) terminate live connections, drop & recreate from the archive (--clean),
// 4) verify essential tables are present afterwards.
export async function restoreBackup(buffer) {
  ensureDir();
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('ملف الاستعادة فارغ');
  if (buffer.length > 500 * 1024 * 1024) throw new Error('حجم ملف الاستعادة أكبر من المسموح (500MB)');

  const tmp = path.join(BACKUP_DIR, `restore_tmp_${Date.now()}.dump`);
  fs.writeFileSync(tmp, buffer);
  try {
    await execFileAsync('docker', ['cp', tmp, `${PG_CONTAINER}:/tmp/restore.dump`]);
    const { stdout } = await execFileAsync('docker', ['exec', PG_CONTAINER, 'pg_restore', '--list', '/tmp/restore.dump'], { maxBuffer: 10 * 1024 * 1024 });
    const tables = [...stdout.matchAll(/TABLE\s+([A-Za-z_][A-Za-z0-9_.]*)/g)].map((m) => m[1]);
    if (!tables.includes('users')) throw new Error('الملف لا يحوي جدول users — ليس نسخة صالحة لهذا النظام');
    if (!tables.includes('settings')) throw new Error('الملف لا يحوي جدول settings — ليس نسخة صالحة لهذا النظام');

    const safety = await createBackup();

    const script = [
      `psql -U ${PG_USER} -d ${PG_DB} -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${PG_DB}' AND pid <> pg_backend_pid();"`,
      `pg_restore --clean --if-exists --no-owner -U ${PG_USER} -d ${PG_DB} /tmp/restore.dump`,
      `rm -f /tmp/restore.dump`,
    ].join(' && ');
    await execFileAsync('docker', ['exec', PG_CONTAINER, 'sh', '-c', script], { maxBuffer: 10 * 1024 * 1024 });

    const check = await query('SELECT count(*)::int AS n FROM users');
    if (check.rows[0].n < 1) throw new Error('النسخة المستعادة لا تحتوي على أي مستخدم');

    fs.unlinkSync(tmp);
    return { restored: true, safetyCopy: safety.name };
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw err;
  }
}

// Daily automatic backups: on boot (if the newest copy is older than a day)
// then every 6 hours. Keeps the newest KEEP copies.
let backupTimer = null;
export function startBackupScheduler() {
  if (backupTimer) return;
  const CHECK_MS = 6 * 3600 * 1000;
  const MAX_AGE_MS = 24 * 3600 * 1000;
  const tick = async () => {
    try {
      const items = listBackups();
      const latest = items[0];
      const age = latest ? Date.now() - Date.parse(latest.created) : Infinity;
      if (age > MAX_AGE_MS) await createBackup();
    } catch (e) {
      console.error('[backup] scheduled run failed:', e.message);
    }
  };
  tick();
  backupTimer = setInterval(tick, CHECK_MS);
  if (backupTimer.unref) backupTimer.unref();
}

const router = express.Router();

// list backups (manager only)
router.get('/', authRequired, allowRoles('manager'), (req, res) => {
  res.json(listBackups());
});

// create a backup now
router.post('/', authRequired, allowRoles('manager'), async (req, res) => {
  const b = await createBackup();
  res.status(201).json(b);
});

// download a backup for off-site storage
router.get('/:name/download', authRequired, allowRoles('manager'), (req, res) => {
  const p = safePath(req.params.name);
  res.download(p, req.params.name);
});

// delete an old backup
router.delete('/:name', authRequired, allowRoles('manager'), (req, res) => {
  const p = safePath(req.params.name);
  fs.unlinkSync(p);
  res.json({ ok: true });
});

// restore an existing backup from the list
router.post('/restore/:name', authRequired, allowRoles('manager'), async (req, res) => {
  const p = safePath(req.params.name);
  const result = await restoreBackup(fs.readFileSync(p));
  res.json(result);
});

// restore from an uploaded file (raw .dump body, octet-stream)
router.post('/restore', authRequired, allowRoles('manager'), (req, res, next) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('error', next);
  req.on('end', async () => {
    try {
      const result = await restoreBackup(Buffer.concat(chunks));
      res.json(result);
    } catch (err) {
      next(err);
    }
  });
});

export default router;