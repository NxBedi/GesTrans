/**
 * Audit trail helper.
 *
 * `recordAudit` must be called with the same client/transaction as the business
 * write so the log entry is committed or rolled back together with it.
 */
export async function recordAudit(client, { actor, action, entityType, entityId, details }) {
  await client.query(
    `INSERT INTO audit_logs (actor_id, actor_name, actor_role, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      actor?.id ?? null,
      actor?.full_name ?? null,
      actor?.role ?? null,
      action,
      entityType,
      entityId === null || entityId === undefined ? null : String(entityId),
      details ?? null,
    ]
  );
}
