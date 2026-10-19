-- 1. Database-enforced singleton open intent per workspace
CREATE UNIQUE INDEX IF NOT EXISTS wpa_checkout_one_open_intent_idx
    ON wpa_checkout_acceptances(workspace_id)
    WHERE status IN ('accepted','checkout_created');

-- 2. Setup lease columns to serialize provider session creation
ALTER TABLE wpa_checkout_acceptances
    ADD COLUMN IF NOT EXISTS setup_lease_owner text,
    ADD COLUMN IF NOT EXISTS setup_lease_token text,
    ADD COLUMN IF NOT EXISTS setup_lease_expires_at timestamptz;

-- 3. Audit log atomicity: see plan_entitlement_audit.js
