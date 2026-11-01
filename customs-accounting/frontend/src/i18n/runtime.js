// Language runtime shared by React components AND non-React helpers
// (PDF/Excel exports, api.js...). The I18n provider keeps it in sync.
import { DICTIONARIES, DEFAULT_LANG, LANG_CODES, LANGUAGES, metaOf } from './dictionaries.js';

const STORAGE_KEY = 'lang';

let currentLang = readStoredLang();

function readStoredLang() {
  try {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (stored && DICTIONARIES[stored]) return stored;
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_LANG;
}

export function getLang() {
  return currentLang;
}

export function setLang(code) {
  if (!code || !DICTIONARIES[code]) return;
  currentLang = code;
  const { dir, locale } = metaOf(code);
  try {
    localStorage.setItem(STORAGE_KEY, code);
    // cached direction so index.html can set <html dir> before the first paint
    localStorage.setItem(`${STORAGE_KEY}Dir`, dir);
  } catch {
    /* ignore quota / privacy mode */
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = code;
    document.documentElement.dir = dir;
    document.body?.setAttribute('dir', dir);
    document.documentElement.style.setProperty('--app-locale', `"${locale}"`);
  }
  return code;
}

export function getDir(lang = currentLang) {
  return metaOf(lang).dir;
}

export function getLocale(lang = currentLang) {
  return metaOf(lang).locale;
}

// Resolve a dotted key ("nav.dashboard") in the active language, falling back
// to the default language and finally to the key itself.
function lookup(dict, key) {
  return key.split('.').reduce((acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined), dict);
}

export function translate(key, vars, lang = currentLang) {
  const value = lookup(DICTIONARIES[lang], key) ?? lookup(DICTIONARIES[DEFAULT_LANG], key);
  if (value == null) {
    if (import.meta.env?.DEV) console.warn(`[i18n] missing key: ${key} (${lang})`);
    return key;
  }
  if (typeof value !== 'string') return key;
  if (!vars) return value;
  return value.replace(/\{(\w+)\}/g, (match, name) => (vars[name] ?? match));
}

export const t = translate;

// ---------- number / money / date formatting ----------

function intlLocale(lang = currentLang) {
  const base = getLocale(lang);
  return base.includes('-u-') ? base : `${base}-u-nu-latn-ca-gregory`;
}

export function fmt(n, opts = {}) {
  const value = Number(n);
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(intlLocale(), {
    maximumFractionDigits: 2,
    ...opts,
  }).format(value);
}

export function money(n) {
  const value = Number(n);
  if (!Number.isFinite(value)) return '—';
  return `${fmt(value)} ${translate('common.currency')}`;
}

function toDate(iso) {
  if (iso == null || iso === '') return null;
  if (iso instanceof Date) return Number.isNaN(iso.getTime()) ? null : iso;
  const str = String(iso);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(str) ? new Date(`${str}T00:00:00`) : new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Intl inserts invisible bidi marks (RLM/LRM) around the separators of ar-MA
// dates. They are noise outside HTML (and they break jsPDF's own bidi pass), so
// every formatted date is returned as plain text.
const BIDI_MARKS = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
const clean = (value) => String(value).replace(BIDI_MARKS, '');

// short numeric date, e.g. "30/10/2026"
export function dmy(iso) {
  const d = toDate(iso);
  if (!d) return '—';
  return clean(new Intl.DateTimeFormat(intlLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d));
}

// long date for printed documents, e.g. "30 octobre 2026" / "30 أكتوبر 2026"
export function dlong(iso) {
  const d = toDate(iso);
  if (!d) return '—';
  return clean(new Intl.DateTimeFormat(intlLocale(), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d));
}

// date + time
export function dtm(iso) {
  const d = toDate(iso);
  if (!d) return '—';
  return clean(new Intl.DateTimeFormat(intlLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d));
}

export function todayLong() {
  return dlong(new Date());
}

// ---------- domain labels ----------
// Fall back to the raw code (or an empty string) when a translation is missing,
// so technical values never leak as "namespace.key" in the UI.
function domainLabel(ns, code) {
  if (!code) return '';
  const key = `${ns}.${code}`;
  const value = translate(key);
  return value === key ? code : value;
}

export const statusLabel = (code) => domainLabel('status', code);
export const debtLabel = (code) => domainLabel('debtStatus', code);
export const kindLabel = (code) => domainLabel('kinds', code);
export const roleLabel = (code) => domainLabel('roles', code);

export function companyName(company) {
  if (!company) return '';
  return currentLang === 'ar' ? company.nameAr || company.nameFr || '' : company.nameFr || company.nameAr || '';
}

export { LANGUAGES, LANG_CODES, metaOf, DEFAULT_LANG };
