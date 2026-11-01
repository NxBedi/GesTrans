/**
 * Shared helpers for accountant financial writes.
 */

export const PAYMENT_METHODS = ['cash', 'bank', 'credit'];

export const PAYMENT_METHOD_LABELS = {
  cash: 'نقدي — يخصم من الصندوق',
  bank: 'حوالة / بنك — لا يلمس الصندوق',
  credit: 'آجل (غير مدفوع) — لا يلمس الصندوق',
};

// payment_method values that leave the cash box untouched
export const NON_CASH_METHODS = ['bank', 'credit'];

export function normalizePaymentMethod(value) {
  if (value === undefined || value === null || value === '') return 'cash';
  const v = String(value).trim().toLowerCase();
  if (!PAYMENT_METHODS.includes(v)) return null;
  return v;
}

export function normalizeIdempotencyKey(value) {
  if (value === undefined || value === null || value === '') return null;
  const v = String(value).trim();
  if (v.length > 120) return null;
  return v;
}

export function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
