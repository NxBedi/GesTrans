import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { authRequired, allowRoles } from '../middleware/auth.js';
import { query } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
const LOGO_FILE = path.join(UPLOAD_DIR, 'logo');
const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
};
const EXTS = Object.values(ALLOWED);

let currentExt = null;

function ensureDir() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function discoverExt() {
  if (currentExt && fs.existsSync(LOGO_FILE + currentExt)) return currentExt;
  for (const ext of EXTS) {
    if (fs.existsSync(LOGO_FILE + ext)) { currentExt = ext; return ext; }
  }
  currentExt = null;
  return null;
}

function clearLogo() {
  for (const ext of EXTS) {
    try { fs.unlinkSync(LOGO_FILE + ext); } catch { /* file not present */ }
  }
  currentExt = null;
}

function saveLogo(dataUrl) {
  const m = /^data:([^;,]+);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) {
    const err = new Error('صيغة الصورة غير صالحة');
    err.status = 400;
    throw err;
  }
  const ext = ALLOWED[String(m[1]).toLowerCase()];
  if (!ext) {
    const err = new Error('الأنواع المسموحة: PNG، JPG، WEBP، GIF أو SVG');
    err.status = 400;
    throw err;
  }
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length === 0) {
    const err = new Error('الملف المختار فارغ');
    err.status = 400;
    throw err;
  }
  if (buf.length > MAX_BYTES) {
    const err = new Error('حجم الصورة يتجاوز 3MB');
    err.status = 400;
    throw err;
  }
  ensureDir();
  clearLogo();
  fs.writeFileSync(LOGO_FILE + ext, buf);
  currentExt = ext;
  return ext;
}

const router = express.Router();

const COMPANY_DEFAULTS = {
  nameAr: 'مؤسسة التوبة للتخليص الجمركي',
  nameFr: 'Établissement TEWBA',
  form: 'ETS TEWBA',
  tel: '+222 22 43 50 99 - 49 94 69 11',
  email: 'etstewba@gmail.com',
  nifRcAgrement: 'NIF : 00792648 - Agrément N°104/TRASSA/1999',
};

const COMPANY_FIELDS = ['nameAr', 'nameFr', 'form', 'tel', 'email', 'nifRcAgrement'];
const COMPANY_KEYS = {
  nameAr: 'company_nameAr',
  nameFr: 'company_nameFr',
  form: 'company_form',
  tel: 'company_tel',
  email: 'company_email',
  nifRcAgrement: 'company_nifRcAgrement',
};

async function loadCompany() {
  const { rows } = await query('SELECT key, value FROM settings WHERE key = ANY($1)', [COMPANY_FIELDS.map((f) => COMPANY_KEYS[f])]);
  const out = { ...COMPANY_DEFAULTS };
  rows.forEach((r) => {
    const field = COMPANY_FIELDS.find((f) => COMPANY_KEYS[f] === r.key);
    if (field) out[field] = r.value;
  });
  return out;
}

// public — company identity used by all reports, printouts and PDF exports
router.get('/company', async (req, res) => {
  res.json(await loadCompany());
});

// manager only — save company identity
router.put('/company', authRequired, allowRoles('manager'), async (req, res) => {
  const body = req.body || {};
  const values = {};
  for (const field of COMPANY_FIELDS) {
    const v = String(body[field] ?? '').trim();
    if (!v) {
      return res.status(400).json({ error: `الحقل «${field}» مطلوب` });
    }
    values[field] = v;
  }
  for (const field of COMPANY_FIELDS) {
    await query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [COMPANY_KEYS[field], values[field]]
    );
  }
  res.json(values);
});

// public — used by <img> and by PDF generation
router.get('/logo', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const ext = discoverExt();
  if (!ext) return res.status(404).json({ error: 'لا يوجد شعار مخصص' });
  res.sendFile(LOGO_FILE + ext);
});

// manager only — upload a new logo
router.post('/logo', authRequired, allowRoles('manager'), (req, res) => {
  const ext = saveLogo(req.body?.dataUrl);
  res.json({ ok: true, ext });
});

// manager only — restore the default logo
router.delete('/logo', authRequired, allowRoles('manager'), (req, res) => {
  clearLogo();
  res.json({ ok: true });
});

export default router;