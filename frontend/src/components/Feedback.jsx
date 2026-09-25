import { createContext, useContext, useState, useCallback, useRef } from 'react';

const FeedbackContext = createContext(null);

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const confirmId = useRef(0);

  const toast = useCallback((message, kind = 'success') => {
    const id = ++confirmId.current;
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  const confirm = useCallback((message, opts = {}) => {
    return new Promise((resolve) => {
      setConfirmState({ id: ++confirmId.current, message, ...opts, resolve });
    });
  }, []);

  const closeConfirm = useCallback(() => setConfirmState(null), []);

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}

      {confirmState && (
        <div className="modal-overlay" onClick={() => { confirmState.resolve(false); closeConfirm(); }}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title" style={{ marginBottom: 8 }}>{confirmState.title || 'تأكيد العملية'}</div>
            <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{confirmState.message}</p>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => { confirmState.resolve(false); closeConfirm(); }}>
                {confirmState.cancelLabel || 'إلغاء'}
              </button>
              <button
                className={`btn ${confirmState.danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => { confirmState.resolve(true); closeConfirm(); }}
              >
                {confirmState.okLabel || 'تأكيد'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="toast-region">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <span>
              {t.kind === 'success' ? '✓' : t.kind === 'error' ? '✕' : t.kind === 'info' ? 'ℹ' : '•'}
            </span>
            {t.message}
          </div>
        ))}
      </div>
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  return useContext(FeedbackContext);
}
export { FeedbackContext };