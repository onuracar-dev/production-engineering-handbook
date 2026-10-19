# Case Study 14: FIDO2 / WebAuthn Final Passkey Deletion Lock & Show-Once HMAC Recovery

> **Domain:** Security & Sandboxing  
> **Source Project:** `WebPageAnalyz (Operator Plane)`  
> **Language:** Node.js / FIDO2 / WebAuthn  
> **Key Metric:** Atomic passkey deletion lock rejects last key, HMAC-SHA256 recovery codes

---

## 1. Problem

In high-security administrator planes mandating phishing-resistant FIDO2/WebAuthn hardware keys, concurrent deletion requests from two browser tabs can race past checks and delete the operator's last remaining passkey, locking them out permanently. Furthermore, plaintext recovery code storage creates credential leak hazards.

---

## 2. Why Naive Approaches Fail

1. **Generic ORM Hook Validation:**
   * Official authentication library plugin hooks often bypass generic application model hooks during passkey deletion, allowing concurrent deletes to succeed unnoticed.
2. **Unserialized Client-Side Checks:**
   * Checking passkey count in the browser before showing the delete button fails when an admin has the settings panel open in two separate browser tabs.
3. **Plaintext Recovery Codes:**
   * Storing backup codes in database columns allows database read leaks to expose permanent account takeover material.

---

## 3. Architecture

1. **Serialized Atomic Key Deletion:** Protects passkey deletion with application middleware and per-user atomic locking, re-evaluating credentials inside the lock and throwing `409 ADMIN_FINAL_PASSKEY_REQUIRED` if only one key remains. The delete itself is scoped by `userId`, so a passkey ID from another account deletes nothing and returns 404.
2. **Show-Once CSPRNG Recovery Codes:** 10 recovery codes generated with cryptographic randomness, shown only in the initial generation response, and stored strictly as HMAC-SHA256 hashes.
3. **Session Revocation on Break-Glass:** Consuming a recovery code requires password + TOTP verification, consumes the single code, rotates out stale step-up markers, revokes active sessions, and increments the account's `security_version`.

---

## 4. Behavior Comparison

| Passkey Security Model | Concurrent Deletion Race | Break-Glass Storage | Session Invalidation |
|---|---|---|---|
| Plugin Default Hooks | Vulnerable (Accidental Lockout) | Plaintext | None |
| Client-Side Count Check | Vulnerable (Multi-Tab Race) | Plaintext | None |
| **Atomic Lock + HMAC Batch** | **Rejects last passkey deletion with HTTP 409** | **HMAC-SHA256 (Show-Once)** | **Immediate Global Revocation** |

_Qualitative comparison. Numbers appear only where a script in this folder measures them._

---

## 5. Implementation

See implementation in [`src/passkey_lock.js`](./src/passkey_lock.js).

---

## 6. Visual Representation

![Visual Architecture Card](./assets/code-card.png)
