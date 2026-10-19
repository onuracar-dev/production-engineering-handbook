# Case Study 12: PostgreSQL Session Advisory Lock for Heavy Scanner Queue Serialization

> **Domain:** Concurrency & Race Conditions  
> **Source Project:** `WebPageAnalyz (Security Engine)`  
> **Language:** Node.js / PostgreSQL  
> **Key Metric:** Dedicated connection advisory lock, AbortSignal integration, automatic release on socket drop

---

## 1. Problem

Dynamic security scanners like OWASP ZAP are stateful and CPU/RAM heavy. When multiple worker containers process crawl queues concurrently, bombarding a single ZAP daemon causes session cross-pollution, crashed daemon processes, and corrupted scan reports.

---

## 2. Why Naive Approaches Fail

1. **Spinning Up External Redis Mutexes (Redlock):**
   * Adds operational complexity, network failure modes, separate cluster health checks, and memory management for a single serialized task.
2. **Application Process Mutexes:**
   * In-memory Node.js mutexes only serialize threads within a single container; they cannot coordinate across multiple containerized worker instances.
3. **Queue Concurrency = 1:**
   * Restricting entire worker queues to concurrency: 1 starves other lightweight non-ZAP tasks (Lighthouse, Axe, broken link checks).

---

## 3. Architecture

1. **Postgres Session Advisory Lock:** Uses `SELECT pg_try_advisory_lock(hashtext('wpa-zap-baseline'))` on a dedicated database pool client.
2. **Dedicated Connection Retain:** The acquired connection is held open for the exact duration of the scan, tying the advisory lock lifetime directly to the TCP socket.
3. **AbortSignal & Timeout Integration:** Propagates client cancellations and job timeouts via `signal.throwIfAborted()`, ensuring clean socket release without hung locks.
4. **Idempotent Cleanup Hook:** Returns an asynchronous release function that unlocks the advisory mutex and releases the client back to the pool. If the unlock query fails, the client is destroyed with `client.release(true)` instead, because a pooled connection that still holds the session lock would let the next `acquire()` succeed.

---

## 4. Behavior Comparison

| Locking Architecture | Cross-Container Coordination | Infrastructure Footprint | Crash Resilience |
|---|---|---|---|
| In-Memory Mutex | None (Single Process Only) | Local memory only | N/A |
| Redis Redlock | Yes | Requires external Redis cluster | Complex (TTL Expiry Race) |
| **PostgreSQL Advisory Lock** | **Yes (Cluster-Wide)** | **No added services (Existing pool)** | **Automatic on Socket Close** |

_Qualitative comparison. Numbers appear only where a script in this folder measures them._

---

## 5. Implementation

See implementation in [`src/zap_lock.js`](./src/zap_lock.js).

---

## 6. How to Verify

Run the automated test suite using Node.js built-in test runner:

```bash
node --test test/zap_lock.test.js
```

### Verified Output:
```text
✔ a clean unlock returns the connection to the pool (2.0433ms)
✔ a failed unlock destroys the connection instead of pooling it (0.3364ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
```

* **Test Environment:** Node.js v24.17.0, Windows 11, 2026-10-19 (no external dependencies, built-in node:test)

---

## 7. Visual Representation

![Visual Architecture Card](./assets/code-card.png)
