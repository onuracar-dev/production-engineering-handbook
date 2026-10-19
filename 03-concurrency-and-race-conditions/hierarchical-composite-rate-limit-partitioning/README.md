# Systems Engineering Case Study: Hierarchical Composite Rate Limit Keys & Single-Query SQL Fixed Window

---

## 1. Problem

Standard API rate limiters rely either on raw IP addresses or simple API key strings.
1. **IP-Only Limits Break Corporate NATs:** Large enterprise organizations share single egress IP addresses across thousands of employees. A single automated script can exhaust the rate limit for the entire corporate office.
2. **API-Key-Only Limits Cause Internal Starvation:** In multi-user workspaces, a misconfigured script using one API key can starve other workspace members.
3. **Redis Dependency Bloat:** Standard shared rate limiters require running Redis clusters with custom Lua scripts, adding infrastructure complexity.

---

## 2. Why Naive Approaches Fail

1. **Noisy Neighbor Starvation:**
   * Global IP keys cause multi-tenant workspaces behind shared corporate proxies to constantly encounter HTTP 429 errors.
2. **Redis Failover Outages:**
   * When Redis goes down, APIs either fail open (allowing DDoS attacks) or fail closed (taking down the entire platform).
3. **Application Memory Leaks:**
   * In-memory `Map` stores do not synchronize across multi-pod container deployments, allowing clients to bypass limits by cycling across pods.

---

## 3. Architecture

1. **Hierarchical Composite Key Resolution:**
   * If a workspace identity exists: resolves to `workspace:{id}:key:{apiKeyId}` (if authenticated via key) or `workspace:{id}:ip:{ip}` (if authenticated via web session).
   * Unauthenticated traffic falls back cleanly to normalized IP keys (`ip:{ip}`).
2. **Selective Route Skipping:** `isScanProgressRead()` automatically bypasses rate limiting for high-frequency SSE progress polling endpoints (`/scans/:id/events`).
3. **Atomic Single-Query SQL Fixed Window:** Uses PostgreSQL `INSERT ... ON CONFLICT (namespace, key) DO UPDATE` with inline `CASE` evaluation. In 1 network roundtrip, it resets the window if expired, increments hits if active, and returns current hit counts atomically. This is a fixed window: across a window boundary a client can get up to 2× the limit in a short span.

```javascript
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
```

---

## 4. Behavior Comparison

| Rate Limiting Engine | Infrastructure Overhead | Enterprise NAT Starvation | Multi-Pod Consistency |
|---|---|---|---|
| In-Memory Map | Minimal | High (Per IP) | Broken (Non-Synchronized) |
| Redis + Lua Script | Requires Redis Cluster | High (Per IP) | Synchronized |
| **Hierarchical Key + Postgres Upsert** | **No added services (Existing DB)** | **Partitions quota by tier (IP vs User)** | **ACID Synchronized via PostgreSQL** |

_Qualitative comparison. Numbers appear only where a script in this folder measures them._

---

## 5. Implementation

See implementation in [`src/composite_rate_limiter.js`](./src/composite_rate_limiter.js).

---

## 6. Visual Representation

![Visual Architecture Card](./assets/code-card.png)
