import { query, pool } from './db.js';

// Per-container visibility (إظهار للموظفين).
//
// Manager and accountant always see every container: visibility is only a
// restriction on the employee role. Everything here is enforced server-side so
// hiding rows in the UI is never the only line of defence.

const RESTRICTED_ROLES = new Set(['employee']);

export function isRestricted(user) {
  return !!user && RESTRICTED_ROLES.has(user.role);
}

/**
 * SQL condition limiting rows to containers the user may see.
 * Returns null when the user is unrestricted. Pushes its own bind param.
 */
export function accessCondition(user, alias, params) {
  if (!isRestricted(user)) return null;
  params.push(user.id);
  return `EXISTS (SELECT 1 FROM container_access ca WHERE ca.container_id = ${alias}.id AND ca.employee_id = $${params.length})`;
}

/** True for managers/accountants, or for employees explicitly granted access. */
export async function canAccessContainer(user, containerId) {
  if (!isRestricted(user)) return true;
  const { rows } = await query(
    'SELECT 1 FROM container_access WHERE container_id = $1 AND employee_id = $2 LIMIT 1',
    [containerId, user.id]
  );
  return rows.length > 0;
}

/** Employees must never receive the visibility metadata of a container. */
export function stripAccessMeta(row, user) {
  if (!row || !isRestricted(user)) return row;
  const { access_list, access_count, ...rest } = row;
  return rest;
}

export function normalizeIds(value) {
  if (!Array.isArray(value)) return [];
  const ids = value.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  return [...new Set(ids)];
}

/** Only active employee accounts can be granted visibility. */
export async function activeEmployeeIds(ids) {
  if (!ids.length) return [];
  const { rows } = await query(
    "SELECT id FROM users WHERE id = ANY($1::int[]) AND role = 'employee' AND is_active = true",
    [ids]
  );
  return rows.map((r) => r.id);
}

async function logChange(client, containerId, employeeId, action, actorId) {
  await client.query(
    `INSERT INTO container_access_log (container_id, employee_id, action, actor_id)
     VALUES ($1, $2, $3, $4)`,
    [containerId, employeeId, action, actorId]
  );
}

/**
 * Replace the full visibility set of one container (add + remove + clear).
 * Returns the ids actually granted / revoked.
 */
export async function replaceContainerAccess(containerId, employeeIds, actorId) {
  const next = new Set(await activeEmployeeIds(normalizeIds(employeeIds)));
  const granted = [];
  const revoked = [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT employee_id FROM container_access WHERE container_id = $1',
      [containerId]
    );
    const current = new Set(rows.map((r) => r.employee_id));
    const toRemove = [...current].filter((id) => !next.has(id));
    const toAdd = [...next].filter((id) => !current.has(id));

    if (toRemove.length) {
      await client.query(
        'DELETE FROM container_access WHERE container_id = $1 AND employee_id = ANY($2::int[])',
        [containerId, toRemove]
      );
      for (const id of toRemove) {
        await logChange(client, containerId, id, 'revoke', actorId);
        revoked.push(id);
      }
    }

    for (const id of toAdd) {
      const res = await client.query(
        `INSERT INTO container_access (container_id, employee_id, granted_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (container_id, employee_id) DO NOTHING`,
        [containerId, id, actorId]
      );
      if (res.rowCount) {
        await logChange(client, containerId, id, 'grant', actorId);
        granted.push(id);
      }
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  return { granted, revoked };
}

/**
 * Bulk grant/revoke across several containers (list multi-select).
 * Only real changes are logged.
 */
export async function bulkContainerAccess(containerIds, employeeIds, action, actorId) {
  const cids = normalizeIds(containerIds);
  const rawEids = normalizeIds(employeeIds);
  const eids = action === 'revoke' ? rawEids : await activeEmployeeIds(rawEids);
  const result = { granted: 0, revoked: 0, containers: 0, employees: eids.length };
  if (!cids.length || !eids.length) return result;

  const { rows: existing } = await query(
    'SELECT id FROM containers WHERE id = ANY($1::int[])',
    [cids]
  );
  const valid = existing.map((r) => r.id);
  result.containers = valid.length;
  if (!valid.length) return result;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (action === 'revoke') {
      const { rows: doomed } = await client.query(
        'SELECT container_id, employee_id FROM container_access WHERE container_id = ANY($1::int[]) AND employee_id = ANY($2::int[])',
        [valid, eids]
      );
      await client.query(
        'DELETE FROM container_access WHERE container_id = ANY($1::int[]) AND employee_id = ANY($2::int[])',
        [valid, eids]
      );
      for (const row of doomed) {
        await logChange(client, row.container_id, row.employee_id, 'revoke', actorId);
      }
      result.revoked = doomed.length;
    } else {
      for (const cid of valid) {
        for (const eid of eids) {
          const res = await client.query(
            `INSERT INTO container_access (container_id, employee_id, granted_by)
             VALUES ($1, $2, $3)
             ON CONFLICT (container_id, employee_id) DO NOTHING`,
            [cid, eid, actorId]
          );
          if (res.rowCount) {
            await logChange(client, cid, eid, 'grant', actorId);
            result.granted += 1;
          }
        }
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  return result;
}
