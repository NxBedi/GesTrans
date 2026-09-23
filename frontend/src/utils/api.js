const BASE = '/api';

function getToken() {
  return localStorage.getItem('token');
}

export function setToken(token) {
  if (token) localStorage.setItem('token', token);
  else localStorage.removeItem('token');
}

export async function api(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(BASE + path, { ...options, headers });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'حدث خطأ في الطلب');
    err.status = res.status;
    throw err;
  }
  return data;
}

export const authApi = {
  login: (username, password) => api('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  me: () => api('/auth/me'),
};

export const usersApi = {
  list: () => api('/users'),
  create: (data) => api('/users', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => api(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id) => api(`/users/${id}`, { method: 'DELETE' }),
};

export const customersApi = {
  list: () => api('/customers'),
  create: (data) => api('/customers', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => api(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id) => api(`/customers/${id}`, { method: 'DELETE' }),
  setOpeningBalance: (id, openingBalance) => api(`/customers/${id}/opening-balance`, { method: 'PUT', body: JSON.stringify({ opening_balance: openingBalance }) }),
  payments: (id) => api(`/customers/${id}/payments`),
  addPayment: (id, data) => api(`/customers/${id}/payments`, { method: 'POST', body: JSON.stringify(data) }),
  removePayment: (customerId, paymentId) => api(`/customers/${customerId}/payments/${paymentId}`, { method: 'DELETE' }),
  statement: (id) => api(`/customers/${id}/statement`),
};

export const invoiceTypesApi = {
  list: () => api('/invoice-types'),
  create: (data) => api('/invoice-types', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => api(`/invoice-types/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id) => api(`/invoice-types/${id}`, { method: 'DELETE' }),
};

export const myExpensesApi = {
  list: (params = {}) => api('/my-expenses' + buildQs(params)),
};

export const containersApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== '' && v != null) qs.set(k, v); });
    const q = qs.toString();
    return api('/containers' + (q ? `?${q}` : ''));
  },
  readyForPricing: () => api('/containers/ready-for-pricing'),
  finished: () => api('/containers/finished'),
  liquidations: (params = {}) => api('/containers/liquidations' + buildQs(params)),
  get: (id) => api(`/containers/${id}`),
  create: (data) => api('/containers', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => api(`/containers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id) => api(`/containers/${id}`, { method: 'DELETE' }),
  close: (id) => api(`/containers/${id}/close`, { method: 'POST' }),
  invoices: (id) => api(`/containers/${id}/invoices`),
  addInvoice: (id, data) => api(`/containers/${id}/invoices`, { method: 'POST', body: JSON.stringify(data) }),
  updateInvoice: (containerId, invoiceId, data) => api(`/containers/${containerId}/invoices/${invoiceId}`, { method: 'PUT', body: JSON.stringify(data) }),
  removeInvoice: (containerId, invoiceId) => api(`/containers/${containerId}/invoices/${invoiceId}`, { method: 'DELETE' }),
  setPricing: (id, data) => api(`/containers/${id}/pricing`, { method: 'POST', body: JSON.stringify(data) }),
  removePricing: (id) => api(`/containers/${id}/pricing`, { method: 'DELETE' }),
  reopen: (id) => api(`/containers/${id}/reopen`, { method: 'POST' }),
};

export const generalExpensesApi = {
  list: (params = {}) => api('/general-expenses' + buildQs(params)),
  categories: () => api('/general-expenses/categories'),
  summary: (params = {}) => api('/general-expenses/summary' + buildQs(params)),
  create: (data) => api('/general-expenses', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => api(`/general-expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id) => api(`/general-expenses/${id}`, { method: 'DELETE' }),
};

export const financialApi = {
  overview: () => api('/financial/overview'),
  movements: (params = {}) => api('/financial/movements' + buildQs(params)),
  capitalList: (params = {}) => api('/financial/capital/list' + buildQs(params)),
  addCapital: (data) => api('/financial/capital', { method: 'POST', body: JSON.stringify(data) }),
  removeCapital: (id) => api(`/financial/capital/${id}`, { method: 'DELETE' }),
  adjustmentsList: () => api('/financial/adjustments/list'),
  addAdjustment: (data) => api('/financial/adjustments', { method: 'POST', body: JSON.stringify(data) }),
  removeAdjustment: (id) => api(`/financial/adjustments/${id}`, { method: 'DELETE' }),
  oldDebts: () => api('/financial/old-debts'),
  addOldDebt: (data) => api('/financial/old-debts', { method: 'POST', body: JSON.stringify(data) }),
  collectOldDebt: (id, data) => api(`/financial/old-debts/${id}/collect`, { method: 'POST', body: JSON.stringify(data) }),
  removeOldDebt: (id) => api(`/financial/old-debts/${id}`, { method: 'DELETE' }),
};

export const salaryApi = {
  employees: (params = {}) => api('/salary/employees' + buildQs(params)),
  statement: (userId, params = {}) => api(`/salary/statement/${userId}` + buildQs(params)),
  transactions: (params = {}) => api('/salary/transactions' + buildQs(params)),
  advance: (data) => api('/salary/advance', { method: 'POST', body: JSON.stringify(data) }),
  remainder: (data) => api('/salary/remainder', { method: 'POST', body: JSON.stringify(data) }),
  remove: (id) => api(`/salary/transactions/${id}`, { method: 'DELETE' }),
};

export const reportsApi = {
  summary: () => api('/reports/summary'),
  profits: (params = {}) => api('/reports/profits' + buildQs(params)),
  balances: () => api('/reports/customer-balances'),
  containers: (params = {}) => api('/reports/containers' + buildQs(params)),
  expenses: (params = {}) => api('/reports/expenses' + buildQs(params)),
  expensesSummary: (params = {}) => api('/reports/expenses-summary' + buildQs(params)),
  invoiceTypesSummary: (params = {}) => api('/reports/invoice-types-summary' + buildQs(params)),
};

function buildQs(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, v);
  });
  const s = qs.toString();
  return s ? `?${s}` : '';
}
