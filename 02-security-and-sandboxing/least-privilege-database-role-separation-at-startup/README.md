# Case Study 25: Database Least-Privilege Role Separation & Fail-Closed Startup Attestation

> **Domain:** Security & Sandboxing  
> **Source Project:** `WebPageAnalyz (DB Security)`  
> **Language:** PostgreSQL / Node.js  
> **Key Metric:** 5 dedicated PostgreSQL roles, worker has no DELETE grants, startup role attestation fails closed on mismatch

---

## 1. Problem

Most web backends connect to PostgreSQL using a single administrative or generic user (`postgres:postgres`). If a container running untrusted headless browser workloads is compromised via an RCE exploit, the attacker inherits full database privileges, allowing them to delete user accounts, drop audit tables, or dump payment secrets.

---

## 2. Why Naive Approaches Fail

1. **Single Shared Database User:**
   * Grants every microservice, background worker, and script identical full DML/DDL permissions across all tables.
2. **Application-Layer Authorization Alone:**
   * If an attacker gains shell execution inside a worker container, application-layer permission checks are bypassed; they talk directly to PostgreSQL.
3. **Unvalidated Database Connections:**
   * Containers misconfigured with wrong credentials silently connect with excessive privileges without alerting operators.

---

## 3. Architecture

1. **5 Segregated PostgreSQL Roles:**
   * `wpa_owner` (NOLOGIN): Owns all platform tables.
   * `wpa_migrator`: Exclusive DDL permissions for schema migrations.
   * `wpa_runtime`: API backend user (SELECT, INSERT, UPDATE on application tables; no DDL privileges).
   * `wpa_worker`: Browser analysis workers (SELECT, INSERT, UPDATE on scan/source tables; **no DELETE permissions** on event history, reports, or users).
   * `wpa_maintenance`: Exclusive narrowly-scoped DELETE authority for data retention and confirmed workspace purging.
2. **Fail-Closed Startup Role Attestation:** On boot, workers query `SELECT current_user AS role` and crash immediately with `WORKER_DATABASE_ROLE_MISMATCH` if the active role does not match `DATABASE_EXPECTED_ROLE`.
3. **Mandatory Connection String Timeouts (original project, not in `src/`):** URL strings strictly enforce 4 timeouts: `connect_timeout`, `statement_timeout`, `lock_timeout`, and `idle_in_transaction_session_timeout`.

---

## 4. Behavior Comparison

| Database Authority Model | Blast Radius on Worker RCE | Audit Log Tampering Risk | Startup Role Validation |
|---|---|---|---|
| Single `postgres` User | Complete Database Destruction | High (DELETE Allowed) | None |
| Granular Roles without Validation | Dependent on Configuration | Medium | Unchecked |
| **5 Segregated Roles + Startup Attestation** | **No DELETE / No Schema Access** | **Protected (No DELETE Grants)** | **Fail-Closed (`current_user`)** |

_Qualitative comparison. Numbers appear only where a script in this folder measures them._

---

## 5. Implementation

See implementation in [`src/database_roles.sql`](./src/database_roles.sql) (roles) and [`src/assert_database_role.js`](./src/assert_database_role.js) (startup attestation).

---

## 6. Visual Representation

![Visual Architecture Card](./assets/code-card.png)
