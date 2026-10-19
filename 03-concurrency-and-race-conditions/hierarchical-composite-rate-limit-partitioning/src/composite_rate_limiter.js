// Excerpt from the original project: increment() is a method of its PostgreSQL rate-limit store class,
// and ipKeyGenerator comes from express-rate-limit. This file does not run on its own.

// 1. Hierarchical composite key generator preventing corporate NAT starvation
function clientKey(request) {
    if (request.platformIdentity?.workspaceId) {
        return `workspace:${request.platformIdentity.workspaceId}:${request.apiKeyId ? `key:${request.apiKeyId}` : `ip:${ipKeyGenerator(request.ip)}`}`;
    }
    if (request.apiKeyId) return `key:${request.apiKeyId}`;
    return `ip:${ipKeyGenerator(request.ip)}`;
}

// 2. Atomic single-query PostgreSQL fixed window state machine without Redis
async increment(key, windowMs = 900_000) {
    const { rows } = await this.pool.query(
        `INSERT INTO wpa_rate_limit_buckets(namespace,key,window_started_at,hits)
         VALUES($1,$2,now(),1)
         ON CONFLICT(namespace,key) DO UPDATE SET
            window_started_at=CASE WHEN wpa_rate_limit_buckets.window_started_at <= now()-($3::text || ' milliseconds')::interval THEN now() ELSE wpa_rate_limit_buckets.window_started_at END,
            hits=CASE WHEN wpa_rate_limit_buckets.window_started_at <= now()-($3::text || ' milliseconds')::interval THEN 1 ELSE wpa_rate_limit_buckets.hits+1 END,
            updated_at=now()
         RETURNING hits,window_started_at`, [this.namespace, key, windowMs]);
    return { totalHits: Number(rows[0].hits) };
}
