# Systems Engineering Case Study: Fail-Closed Destructive Maintenance Boundary with Forbidden Secret Auditing

---

## 1. Problem

Background workers handling destructive operations—such as data retention pruning or GDPR workspace purging—typically run inside the same container image as API workers. If an API worker is compromised, possessing destructive deletion rights and billing/AI secrets in the same container creates an immense blast radius.

---

## 2. Why Naive Approaches Fail

1. **Shared Container Environments:**
   * Running maintenance tasks inside standard worker containers means destructive database credentials sit adjacent to Stripe secrets, AI keys, and Chromium binaries.
2. **Assuming Correct Configuration:**
   * Containers misconfigured by Compose or Kubernetes deployments silently run with excessive secrets without alerting operators.
3. **Generic Database Roles:**
   * Using standard database roles gives maintenance scripts authority to drop schema tables rather than strictly scoped row deletions.

---

## 3. Architecture

1. **Forbidden Secret Auditing on Boot:** Scans `process.env` against 9 prohibited credentials (`BETTER_AUTH_SECRET`, `STRIPE_SECRET_KEY`, `SOURCE_ENCRYPTION_KEY`). If even one secret is found, the container crashes with `MAINTENANCE_SECRET_BOUNDARY_VIOLATION`.
2. **Mandatory Execution Disablement:** Requires `BROWSER_EXECUTION_DISABLED`, `SOURCE_EXECUTION_DISABLED`, and `PDF_EXECUTION_DISABLED` to all be true, preventing destructive workers from executing untrusted code.
3. **Database Role Verification (original project, not in `src/`):** Queries `SELECT current_user AS role` and crashes if the active role does not match `wpa_maintenance` (which has scoped DELETE grants on retention tables and no DDL authority).
4. **Enforced Connection Parameters (original project, not in `src/`):** Enforces `connect_timeout`, `statement_timeout`, `lock_timeout`, and mandatory TLS verification in production.

```javascript
// 1. Blacklist of forbidden credentials that must NEVER exist in maintenance
const FORBIDDEN_MAINTENANCE_SECRETS = Object.freeze([
    'BETTER_AUTH_SECRET', 'GEMINI_API_KEY', 'STRIPE_SECRET_KEY',
    'GITHUB_CLIENT_SECRET', 'ADMIN_API_KEYS', 'SOURCE_ENCRYPTION_KEY',
    'POSTGRES_ADMIN_PASSWORD', 'CHROME_PATH', 'QUEUE_DATABASE_URL'
]);

// 2. Boot-time fail-closed secret & engine boundary attestation
function assertMaintenanceBoundary(env = process.env) {
    if (env.EXECUTION_ROLE !== 'maintenance') throw new Error('MAINTENANCE_ROLE_REQUIRED');
    
    // Verify execution engines are strictly disabled
    const disabled = ['BROWSER_EXECUTION_DISABLED', 'SOURCE_EXECUTION_DISABLED', 'PDF_EXECUTION_DISABLED'].filter((k) => !truthy(env[k]));
    if (disabled.length) throw new Error('MAINTENANCE_EXECUTION_DISABLED_REQUIRED: ' + disabled.join(', '));
    
    // Fail closed if any external API or admin secrets leaked in
    const leaked = FORBIDDEN_MAINTENANCE_SECRETS.filter((k) => String(env[k] || '').length > 0);
    if (leaked.length) throw new Error('MAINTENANCE_SECRET_BOUNDARY_VIOLATION: ' + leaked.join(', '));
}
```

---

## 4. Behavior Comparison

| Maintenance Isolation Model | Blast Radius on Worker RCE | Secret Leakage Risk | Startup Attestation |
|---|---|---|---|
| Shared Worker Container | Full (All Secrets + Deletion) | High (Stripe/AI Keys Present) | None |
| Scoped Roles without Checks | Dependent on Configuration | Medium | Unchecked |
| **Air-Gapped Maintenance Worker** | **Disabled (Execution engines blocked)** | **Rejects Prohibited Secrets (9 Credentials Audited)** | **Fail-Closed on Boot** |

_Qualitative comparison. Numbers appear only where a script in this folder measures them._

---

## 5. Implementation

See implementation in [`src/maintenance_boundary.js`](./src/maintenance_boundary.js).

---

## 6. Visual Representation

![Visual Architecture Card](./assets/code-card.png)
