/** أدوات مشتركة لواجهة المحاسب */
import { kindLabel, t } from '../i18n/runtime.js';

export const PAYMENT_METHODS = [
  { value: 'cash', get label() { return t('accountant.paymentCash'); } },
  { value: 'bank', get label() { return t('accountant.paymentBank'); } },
  { value: 'credit', get label() { return t('accountant.paymentCredit'); } },
];

export const PAYMENT_METHOD_SHORT = {
  get cash() { return t('accountant.methodCash'); },
  get bank() { return t('accountant.methodBank'); },
  get credit() { return t('accountant.methodCredit'); },
};

/** أنواع حركات الصندوق كما تُرجعها الواجهة الخلفية */
export const MOVEMENT_KIND_LABELS = {
  get adjust() { return kindLabel('adjust'); },
  get capital() { return kindLabel('capital'); },
  get collection() { return kindLabel('collection'); },
  get cost() { return kindLabel('cost'); },
  get expense() { return kindLabel('expense'); },
  get salary() { return kindLabel('salary'); },
};

export function movementKindLabel(kind) {
  return kindLabel(kind);
}

export function paymentMethodLabel(value) {
  return PAYMENT_METHODS.find((m) => m.value === value)?.label || PAYMENT_METHOD_SHORT[value] || value;
}

/** تنسيق التاريخ بصيغة YYYY-MM-DD سواء جاء كنص أو كائن Date */
export function fmtDate(value) {
  if (!value) return '—';
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/** مفتاح تفرّد يمنع تسجيل العملية مرتين عند إعادة الإرسال أو تحديث الصفحة */
export function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `k-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function csvCell(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * تصدير CSV يفتح في Excel بترميز عربي سليم (BOM + UTF-8).
 * columns: [{ key, label }] — rows: array of objects
 */
export function downloadCsv(filename, columns, rows) {
  const header = columns.map((c) => csvCell(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => csvCell(c.get ? c.get(r) : r[c.key])).join(',')).join('\r\n');
  const csv = '\uFEFF' + header + '\r\n' + body;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
