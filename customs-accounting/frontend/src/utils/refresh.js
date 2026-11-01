const EVENT = 'dashboard:refresh';

export function refreshDashboard() {
  try {
    window.dispatchEvent(new Event(EVENT));
  } catch (e) {
    /* noop */
  }
}

export function onDashboardRefresh(handler) {
  const fn = () => {
    try {
      handler();
    } catch (e) {
      /* noop */
    }
  };
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}