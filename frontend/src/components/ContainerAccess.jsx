import { useEffect, useMemo, useState } from 'react';
import { containersApi } from '../utils/api.js';

// Compact "Visibilité" cell for the manager's BL list.
export function AccessSummary({ accessList, max = 2 }) {
  const list = accessList || [];
  if (!list.length) return <span className="badge badge-access-hidden">Masquée</span>;
  const shown = list.slice(0, max);
  return (
    <span className="access-chips" title={list.map((a) => a.name).join('، ')}>
      {shown.map((a) => <span key={a.id} className="access-chip">{a.name}</span>)}
      {list.length > max && <span className="access-chip access-chip-more">+{list.length - max}</span>}
    </span>
  );
}

// Multi-select checklist of registered employees.
export function EmployeePicker({ employees, value, onChange }) {
  const selected = useMemo(() => new Set(value || []), [value]);

  if (!employees.length) {
    return <div className="muted access-empty">Aucun employé enregistré</div>;
  }

  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  return (
    <div className="access-picker">
      <div className="access-picker-head">
        <span className="muted">{selected.size} employé(s) sélectionné(s)</span>
        {selected.size > 0 && (
          <button type="button" className="btn btn-outline btn-sm" onClick={() => onChange([])}>
            Tout effacer
          </button>
        )}
      </div>
      <div className="access-picker-list">
        {employees.map((emp) => (
          <label key={emp.id} className={`access-picker-item ${selected.has(emp.id) ? 'on' : ''}`}>
            <input type="checkbox" checked={selected.has(emp.id)} onChange={() => toggle(emp.id)} />
            <span>{emp.full_name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// Manager-only panel: change who can see one container (add / remove / clear).
export default function ContainerAccessPanel({ container, employees, onSaved }) {
  const [value, setValue] = useState(() => (container.access_list || []).map((a) => a.id));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  // reset when a different container is opened
  useEffect(() => {
    setValue((container.access_list || []).map((a) => a.id));
    setErr('');
    setMsg('');
  }, [container.id]);

  const initial = useMemo(() => (container.access_list || []).map((a) => a.id), [container.access_list]);
  const dirty = initial.length !== value.length || value.some((id) => !initial.includes(id));

  const save = async () => {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const res = await containersApi.setAccess(container.id, value);
      setMsg('Visibilité enregistrée');
      if (res?.container) onSaved?.(res.container);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="access-panel">
      <div className="access-panel-head">
        <b>Visible pour les employés</b> <span className="muted">— إظهار للموظفين</span>
      </div>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
        Le gestionnaire voit toujours toutes les BL. Un employé ne voit que les BL qui lui sont attribuées.
      </div>
      <EmployeePicker employees={employees} value={value} onChange={setValue} />
      {err && <div className="form-error">{err}</div>}
      {msg && <div className="form-success">{msg}</div>}
      <div className="access-panel-actions">
        <button className="btn btn-success btn-sm" disabled={busy || !dirty} onClick={save}>
          {busy ? '...' : '💾 Enregistrer la visibilité'}
        </button>
      </div>
    </div>
  );
}
