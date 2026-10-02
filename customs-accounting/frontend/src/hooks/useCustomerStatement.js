import { useCallback, useEffect, useState } from 'react';
import { customersApi } from '../utils/api.js';

// Shared data hook for the account statement (كشف حساب).
// Both the Customers page and the Debts page use this same logic via
// <AccountStatement customerId={...} /> so balances are always computed identically.
export function useCustomerStatement(customerId, { from, to, enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    if (!customerId || !enabled) { setData(null); setError(''); return; }
    setLoading(true);
    setError('');
    customersApi.statement(customerId, { from: from || undefined, to: to || undefined })
      .then(setData)
      .catch((e) => setError(e.message || 'تعذّر تحميل كشف الحساب'))
      .finally(() => setLoading(false));
  }, [customerId, from, to, enabled]);

  useEffect(() => { refresh(); }, [refresh]);

  return { data, loading, error, refresh };
}