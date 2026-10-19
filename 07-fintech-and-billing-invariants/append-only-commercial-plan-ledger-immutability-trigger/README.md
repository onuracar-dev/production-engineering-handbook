# Systems Engineering Case Study: Append-Only Commercial Plan Change Ledger with Database Immutability Triggers

---

## 1. Problem

In multi-tenant SaaS platforms, commercial plan changes (upgrades, downgrades, cancellations) are often applied as direct row mutations (`UPDATE workspaces SET plan_id = ...`). If a database admin accidentally mutates records or a billing race condition occurs, historical subscription state is lost, making financial audits and disputes impossible to resolve.

---

## 2. Why Naive Approaches Fail

1. **Direct In-Place Column Updates:**
   * Overwriting `plan_id` destroys historical billing provenance. There is no cryptographic proof of who authorized a change, when it occurred, or what the preceding plan was.
2. **Application-Layer Audit Logging Alone:**
   * If application code fails to write to an audit table or a developer modifies rows directly via `psql`, application-layer audit mechanisms are completely bypassed.
3. **Duplicate Billing Webhooks:**
   * Payment provider webhook retries can execute state transitions out of sequence without strict idempotency constraints.

---

## 3. Architecture

1. **Append-Only Transition Ledger:** Every commercial plan change is recorded in `wpa_user_plan_changes` with `before_plan_id`, `after_plan_id`, `source` (`admin`, `provider`, `redeem`, `system`), `reason`, and `created_by`.
2. **Database Engine Immutability Trigger:** Enforces immutability at the PostgreSQL engine level via a `BEFORE UPDATE OR DELETE` trigger that raises SQLSTATE `55000` (`WPA_USER_PLAN_CHANGES_APPEND_ONLY`). Even a superuser executing an accidental `DELETE` is stopped by the database engine.
3. **Per-User Idempotency Constraint:** Imposes `UNIQUE (user_id, idempotency_key)`, ensuring duplicate provider webhook dispatches or retried administrative API requests cannot create duplicate billing mutations.
4. **Foreign Key Deletion Restrictions:** Configures `ON DELETE RESTRICT` on user and plan references, preventing orphaned billing histories.

```sql
-- 1. Dedicated append-only commercial transition ledger
CREATE TABLE IF NOT EXISTS wpa_user_plan_changes (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
    before_plan_id text REFERENCES wpa_plan_catalog(id) ON DELETE RESTRICT,
    after_plan_id text NOT NULL REFERENCES wpa_plan_catalog(id) ON DELETE RESTRICT,
    source text NOT NULL DEFAULT 'admin' CHECK(source IN ('admin','provider','redeem','system','legacy')),
    reason text NOT NULL,
    created_by text NOT NULL,
    idempotency_key text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id, idempotency_key)
);

-- 2. Database engine level immutability trigger blocking UPDATE, DELETE & TRUNCATE
CREATE OR REPLACE FUNCTION wpa_user_plan_changes_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'WPA_USER_PLAN_CHANGES_APPEND_ONLY' USING ERRCODE='55000';
END $$;

DROP TRIGGER IF EXISTS wpa_user_plan_changes_immutable ON wpa_user_plan_changes;
CREATE TRIGGER wpa_user_plan_changes_immutable
BEFORE UPDATE OR DELETE ON wpa_user_plan_changes
FOR EACH ROW EXECUTE FUNCTION wpa_user_plan_changes_immutable();

-- Row triggers never fire on TRUNCATE, so it needs its own statement-level trigger;
-- the same function raises unconditionally.
DROP TRIGGER IF EXISTS wpa_user_plan_changes_no_truncate ON wpa_user_plan_changes;
CREATE TRIGGER wpa_user_plan_changes_no_truncate
BEFORE TRUNCATE ON wpa_user_plan_changes
FOR EACH STATEMENT EXECUTE FUNCTION wpa_user_plan_changes_immutable();
```

---

## 4. Behavior Comparison

| Commercial Audit Model | Historical Plan Provenance | Tampering Protection | Webhook Replay Defense |
|---|---|---|---|
| In-Place `UPDATE` | Lost (Overwritten) | None | Vulnerable |
| Application-Layer Log | Partial | Bypassed via Direct SQL | Software Enforced |
| **Engine-Level Immutable Ledger** | **Preserved (Full Before/After history)** | **Engine-enforced (SQLSTATE 55000 aborts UPDATE/DELETE/TRUNCATE)** | **Unique constraint deduplication** |

_Qualitative comparison. Numbers appear only where a script in this folder measures them._

---

## 5. Implementation

See implementation in [`src/immutable_plan_ledger.sql`](./src/immutable_plan_ledger.sql).

---

## 6. Visual Representation

![Visual Architecture Card](./assets/code-card.png)
