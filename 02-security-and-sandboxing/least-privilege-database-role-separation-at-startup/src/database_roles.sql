-- 1. Segregate database authority by workload role
CREATE ROLE wpa_owner NOLOGIN;       -- Owns all platform tables
CREATE ROLE wpa_runtime NOLOGIN;     -- API role (standard application DML)
CREATE ROLE wpa_worker NOLOGIN;      -- Browser worker (SELECT/INSERT/UPDATE on scan tables; 0 DELETE)
CREATE ROLE wpa_maintenance NOLOGIN; -- Retention executor (scoped DELETE on retention tables only)
CREATE ROLE wpa_migrator NOLOGIN;    -- Schema migrations (DDL authority)

-- 2. Worker startup attestation: see assert_database_role.js