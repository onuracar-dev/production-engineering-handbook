# Case Study 15: PostgreSQL Atomic Single-Query Fixed Window Rate Limiting

> **Domain:** Concurrency & Race Conditions  
> **Source Project:** `WebPageAnalyz (Middleware Core)`  
> **Language:** SQL / Node.js  
> **Key Metric:** Single-query atomic upsert, no external cache cluster required

---

## 1. Problem

Implementing shared rate limiting across distributed containerized workers typically leads teams to deploy Redis clusters and maintain custom Lua scripts. Adding Redis adds operational complexity, memory eviction issues, and network failure modes.

---

## 2. Why Naive Approaches Fail

1. **In-Memory Rate Limiters (Node.js Map/LRU):**
   * Only protects a single process. In multi-container topologies behind load balancers, memory counters are fragmented, allowing N-times traffic multiplication.
2. **Standard Redis + Lua Scripts:**
   * Requires managing separate Redis clusters, Sentinel/failover configuration, and eviction policies, introducing a second stateful infrastructure dependency.
3. **Multi-Query Read-Then-Write SQL:**
   * Running `SELECT hits` followed by `UPDATE hits` introduces severe race conditions under concurrent burst traffic, allowing limits to be exceeded.

---

## 3. Architecture

1. **Atomic Upsert Invariant:** Executes an atomic `INSERT ... ON CONFLICT (namespace, key) DO UPDATE` in a single database roundtrip.
2. **In-Database Window Evaluation:** Evaluates whether `window_started_at` has exceeded the window duration directly inside SQL `CASE` expressions:
   * If the window expired: Resets `window_started_at` to `now()` and sets `hits` to 1.
   * If the window is active: Retains `window_started_at` and increments `hits + 1`.
3. **Immediate Atomic Return:** The query returns `RETURNING hits, window_started_at`, providing exact count and calculated reset time without advisory locks.
4. **Fixed-Window Trade-off:** The counter resets when the window expires, so a client can send up to the limit at the end of one window and the limit again at the start of the next: up to 2× the limit in a short span. A two-bucket weighted counter would smooth this; it is not implemented here. (The folder name keeps the old "sliding window" wording so existing links still work.)

---

## 4. Behavior Comparison

| Rate Limiting Strategy | Distributed Consistency | Infrastructure Footprint | Race Condition Risk |
|---|---|---|---|
| In-Memory Node.js Map | Fragmented (Per-Process) | Local memory only | High (Cluster Bypass) |
| Redis + Lua Script | Consistent | Requires external Redis cluster | Low |
| **PostgreSQL Atomic Upsert** | **ACID Consistent** | **No added services (Existing DB pool)** | **Serialized by row upsert** |

_Qualitative comparison. Numbers appear only where a script in this folder measures them._

---

## 5. Implementation

See implementation in [`src/rate_limiter.sql`](./src/rate_limiter.sql).

---

## 6. Visual Representation

![Visual Architecture Card](./assets/code-card.png)
