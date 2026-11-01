/**
 * Granular permissions per role.
 *
 * The manager keeps every existing capability (wildcard) so no current workflow
 * changes. The accountant gets a read/record-only financial subset: they may
 * record wages and company expenses and read every financial module, but they
 * cannot manage users, customers, containers, or edit/delete financial records
 * (reversal is used instead of deletion).
 */

export const PERM = {
  FIN_DASHBOARD_VIEW: 'financial.dashboard.view',
  FIN_WAGES_VIEW: 'financial.wages.view',
  FIN_WAGES_RECORD: 'financial.wages.record',
  FIN_WAGES_REVERSE: 'financial.wages.reverse',
  FIN_EXPENSES_VIEW: 'financial.expenses.view',
  FIN_EXPENSES_RECORD: 'financial.expenses.record',
  FIN_EXPENSES_EDIT: 'financial.expenses.edit',
  FIN_EXPENSES_REVERSE: 'financial.expenses.reverse',
  FIN_WORKER_EXPENSES_VIEW: 'financial.worker_expenses.view',
  FIN_INVOICES_VIEW: 'financial.invoices.view',
  FIN_CASHBOX_VIEW: 'financial.cashbox.view',
  FIN_CASHBOX_MANAGE: 'financial.cashbox.manage',
  FIN_REPORTS_VIEW: 'financial.reports.view',
  FIN_AUDIT_VIEW: 'financial.audit.view',
};

export const ROLES = ['manager', 'accountant', 'employee'];

export const ROLE_PERMISSIONS = {
  manager: ['*'],
  accountant: [
    PERM.FIN_DASHBOARD_VIEW,
    PERM.FIN_WAGES_VIEW,
    PERM.FIN_WAGES_RECORD,
    PERM.FIN_WAGES_REVERSE,
    PERM.FIN_EXPENSES_VIEW,
    PERM.FIN_EXPENSES_RECORD,
    PERM.FIN_EXPENSES_REVERSE,
    PERM.FIN_WORKER_EXPENSES_VIEW,
    PERM.FIN_INVOICES_VIEW,
    PERM.FIN_CASHBOX_VIEW,
    PERM.FIN_REPORTS_VIEW,
    PERM.FIN_AUDIT_VIEW,
  ],
  employee: [],
};

export function hasPermission(role, perm) {
  const list = ROLE_PERMISSIONS[role];
  if (!list) return false;
  return list.includes('*') || list.includes(perm);
}

export function requirePermission(perm) {
  return (req, res, next) => {
    if (!req.user || !hasPermission(req.user.role, perm)) {
      return res.status(403).json({ error: 'ليست لديك صلاحية لهذه العملية' });
    }
    next();
  };
}

export function isValidRole(role) {
  return ROLES.includes(role);
}
