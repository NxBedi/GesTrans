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

export { fmt, money, dmy, dlong, dtm, t, getLang, getDir, getLocale, statusLabel, debtLabel, kindLabel, roleLabel, companyName };

// badge class names stay language independent
export const DEBT_BADGE = {
  paid: 'badge-paid',
  partial: 'badge-partial',
  due: 'badge-due',
  overdue: 'badge-overdue',
};

export const KIND_COLORS = {
  adjust: '#64748b',
  capital: '#8b5cf6',
  collection: '#16a34a',
  cost: '#2563eb',
  expense: '#dc2626',
  salary: '#d946ef',
};
