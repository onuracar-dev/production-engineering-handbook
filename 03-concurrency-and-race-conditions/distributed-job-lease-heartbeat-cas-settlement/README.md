# Case Study 18: Distributed Execution Leases with Heartbeat Renewals and CAS Settlement

> **Domain:** Concurrency & Race Conditions  
> **Source Project:** `WebPageAnalyz (Distributed Workers)`  
> **Language:** Node.js / PostgreSQL  
> **Key Metric:** `Heartbeat lease renewal, Compare-And-Swap settlement, path-traversal sandboxed cleanup`

---

## 1. Problem

In distributed architectures processing long-running browser analyses (multi-page audits taking minutes), worker nodes can experience temporary network partitions or high CPU freezes. When a queue manager assumes the job failed and reassigns it, the original worker can revive and overwrite the new worker's results with stale data (the "Zombie Worker" problem).

---

## 2. Why Naive Approaches Fail

1. **Static Job Timeouts:**
   * Setting a fixed timeout (e.g., 60 seconds) causes complex 50-page audits to be prematurely reassigned while still actively and legitimately computing.
2. **Unfenced Database Writes:**
   * Writing results with `UPDATE jobs SET status = 'completed'` allows whichever worker finishes last to overwrite database state, regardless of whether its claim was expired.
3. **Unbounded Retention Deletion:**
   * Automated cleanup workers cleaning up old artifacts can be tricked via path traversal into unlinking system or parent directories.

---

## 3. Architecture

1. **Heartbeat Lease Renewal:** An unref'd timer executes every `leaseMs / 3`, extending `lease_expires_at` in PostgreSQL as long as the worker process remains healthy.
2. **Compare-And-Swap (CAS) Settlement (original project, not in `src/`):** When settling job completion, the worker passes its unique `leaseOwner` and `leaseToken`. If a timeout expired the lease and reassigned the job, the CAS query updates 0 rows, gracefully rejecting the zombie write.
3. **Contained Path Sandboxing (original project, not in `src/`):** File cleanup routines use `isContainedPath(root, target)` to guarantee that retention workers can never delete files outside explicit artifact directories.

---

## 4. Behavior Comparison

| Distributed Worker Model | Zombie Worker Protection | Long-Running Job Support | Filesystem Safety |
|---|---|---|---|
| Static Queue Timeout | Vulnerable (Data Overwrites) | Broken (Premature Retries) | Unchecked |
| Unfenced Database Writes | Vulnerable | Supported | Unchecked |
| **Heartbeat Lease + CAS** | **Fenced (CAS rejects stale writes)** | **Continuous Renewal** | **Strict Path Sandbox** |

_Qualitative comparison. Numbers appear only where a script in this folder measures them._

---

## 5. Implementation

See implementation in [`src/lease_heartbeat.js`](./src/lease_heartbeat.js).

---

## 6. How to Verify

Run the automated test suite using Node.js built-in test runner:

```bash
node --test test/lease_heartbeat.test.js
```

### Verified Output:
```text
✔ a failed renewal is logged and the next tick renews again (1705.0584ms)
✔ no claim token means no heartbeat (0.3363ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
```

* **Test Environment:** Node.js v24.17.0, Windows 11, 2026-10-19 (no external dependencies, built-in node:test)

---

## 7. Visual Representation

![Visual Architecture Card](./assets/code-card.png)
