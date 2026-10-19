// Excerpt from the original project's plan catalog store (store.pool is a `pg` Pool).
// Reviewed by reading; not run against PostgreSQL in this repo.

// 3. Audit log atomicity (Rollback on audit insert failure)
async function setPlanEntitlementWithAudit({ store, planId, moduleId, entitlement, actorId, reason, requestId }) {
    const client = await store.pool.connect();
    try {
        await client.query('BEGIN');
        // Change only this module's key; the other modules' entitlements stay as they are
        const updated = await client.query(
            `UPDATE wpa_plan_catalog
                SET entitlements = jsonb_set(COALESCE(entitlements::jsonb, '{}'::jsonb), ARRAY[$1::text], $2::jsonb)
              WHERE id = $3`,
            [moduleId, JSON.stringify(entitlement), planId]
        );
        // An unknown plan must not leave an audit row for a change that never happened
        if (updated.rowCount !== 1) throw new Error(`PLAN_NOT_FOUND: ${planId}`);
        // If audit insert fails, entire mutation rolls back
        await client.query('INSERT INTO wpa_audit_log (action, actor_id, reason, request_id) VALUES ($1, $2, $3, $4)',
            ['plan.entitlement_changed', actorId, reason, requestId]);
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}
