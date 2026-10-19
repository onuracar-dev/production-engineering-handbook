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
