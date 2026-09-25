// formatting / label helpers shared across the redesigned pages

export function fmt(n) {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(Number(n || 0));
}

export function money(n) {
  return Number.isFinite(Number(n)) ? `${fmt(n)} MRU` : '—';
}

export function dmy(iso) {
  if (iso == null || iso === '') return '—';
  const s = String(iso).slice(0, 10);
  const [y, m, dd] = s.split('-');
  return dd && m && y ? `${dd}/${m}/${y}` : s;
}

export const STATUS_LABELS = {
  registered: 'مسجلة',
  processing: 'قيد تسجيل الفواتير',
  closed: 'جاهزة للتسعير',
  priced: 'تم التسعير',
};

export const DEBT_LABELS = {
  paid: 'مدفوع',
  partial: 'جزئي',
  due: 'مستحق',
  overdue: 'متأخر',
};

export const DEBT_BADGE = {
  paid: 'badge-paid',
  partial: 'badge-partial',
  due: 'badge-due',
  overdue: 'badge-overdue',
};

export const KIND_LABELS = {
  adjust: 'تسوية الصندوق',
  capital: 'رأس المال',
  collection: 'تحصيل من زبون',
  old_debt: 'تحصيل دين قديم',
  cost: 'تكاليف حاوية',
  expense: 'مصروف مؤسسة',
  salary: 'رواتب الموظفين',
};

export const KIND_COLORS = {
  adjust: '#64748b',
  capital: '#8b5cf6',
  collection: '#16a34a',
  old_debt: '#d97706',
  cost: '#2563eb',
  expense: '#dc2626',
  salary: '#d946ef',
};

export const ROLE_LABELS = { manager: 'مدير', employee: 'موظف' };