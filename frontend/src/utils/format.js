// Formatting / label helpers shared across the pages.
// All helpers read the active language at call time, so they automatically
// follow the language switcher (and the language used for printed documents).
import {
  fmt,
  money,
  dmy,
  dlong,
  dtm,
  t,
  getLang,
  getDir,
  getLocale,
  statusLabel,
  debtLabel,
  kindLabel,
  roleLabel,
  companyName,
} from '../i18n/runtime.js';

export {
  fmt,
  money,
  dmy,
  dlong,
  dtm,
  t,
  getLang,
  getDir,
  getLocale,
  statusLabel,
  debtLabel,
  kindLabel,
  roleLabel,
  companyName,
};

// Legacy label maps kept for pages that still import them; values are resolved
// from the dictionaries on access so they follow the active language.
export const STATUS_LABELS = {
  get registered() { return statusLabel('registered'); },
  get processing() { return statusLabel('processing'); },
  get closed() { return statusLabel('closed'); },
  get priced() { return statusLabel('priced'); },
};

export const DEBT_LABELS = {
  get paid() { return debtLabel('paid'); },
  get partial() { return debtLabel('partial'); },
  get due() { return debtLabel('due'); },
  get overdue() { return debtLabel('overdue'); },
};

// badge class names stay language independent
export const DEBT_BADGE = {
  paid: 'badge-paid',
  partial: 'badge-partial',
  due: 'badge-due',
  overdue: 'badge-overdue',
};

export const KIND_LABELS = {
  get adjust() { return kindLabel('adjust'); },
  get capital() { return kindLabel('capital'); },
  get collection() { return kindLabel('collection'); },
  get cost() { return kindLabel('cost'); },
  get expense() { return kindLabel('expense'); },
  get salary() { return kindLabel('salary'); },
};

export const KIND_COLORS = {
  adjust: '#64748b',
  capital: '#8b5cf6',
  collection: '#16a34a',
  cost: '#2563eb',
  expense: '#dc2626',
  salary: '#d946ef',
};

export const ROLE_LABELS = {
  get manager() { return roleLabel('manager'); },
  get employee() { return roleLabel('employee'); },
};

/**
 * One balance rule for every screen:
 *   debit  (positive)  -> the client owes money  -> red
 *   credit (negative)  -> the client has credit  -> green
 *   zero                -> neutral
 */
export function balanceTone(value) {
  const n = Number(value || 0);
  if (n > 0) return 'debit';
  if (n < 0) return 'credit';
  return 'zero';
}

export function balanceClass(value) {
  return `balance-${balanceTone(value)}`;
}
