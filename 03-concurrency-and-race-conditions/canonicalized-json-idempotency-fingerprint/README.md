# Systems Engineering Case Study: Canonicalized JSON Key Sorting & SHA-256 Idempotency Fingerprinting

---

## 1. Problem

Standard HTTP API idempotency implementations rely solely on the `Idempotency-Key` HTTP header. If a malicious or buggy client sends a modified request body using an existing idempotency key, the server may either blindly return the cached response of the earlier request (serving mismatched data) or re-execute the mutation under the conflicting key. Furthermore, JSON serialization has non-deterministic object key order (`{"a":1,"b":2}` vs `{"b":2,"a":1}`), causing naive hashing to trigger false mismatch errors.

---

## 2. Why Naive Approaches Fail

1. **Header-Only Idempotency Validation:**
   * Checking only `key = store.get(header)` fails to detect payload tampering or client parameter divergence.
2. **Raw JSON String Hashing:**
   * Computing `sha256(JSON.stringify(req.body))` fails when clients or proxies alter key order or formatting, producing false 409 conflict errors for semantically identical requests.
3. **Database-Level Race Windows:**
   * Committing mutations before verifying payload hashes risks partial state corruption if parallel requests race into the endpoint.

---

## 3. Architecture

1. **Recursive Canonicalization:** `canonicalize()` traverses arrays and objects recursively, applying `Object.keys(value).sort()` at every nesting level to ensure deterministic JSON representation regardless of serialization order. Values with `toJSON` (such as `Date`) are canonicalized through it; `Map` and `Set` throw instead of collapsing to `{}`.
2. **Cryptographic SHA-256 Fingerprinting:** Computes `sha256(JSON.stringify(canonicalize(body)))`, generating a stable 64-character hexadecimal digest.
3. **Fail-Closed Replay Assertion:** `assertIdempotentReplay()` cross-references the requested fingerprint with the existing stored transaction. If fingerprints diverge, or a stored key is replayed without a fingerprint, it immediately throws HTTP 409 `IDEMPOTENCY_KEY_REUSED`.
4. **Header Normalization (original project, not in `src/`):** Enforces strict regex validation (`^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$`) on idempotency keys to reject empty, malformed, or excessively long headers.

```javascript
// 1. Recursive deterministic JSON object key sorting
function canonicalize(value) {
    if (value === null || typeof value !== 'object') return value;
    // Date (and any toJSON type) is fingerprinted the way JSON.stringify would send it
    if (typeof value.toJSON === 'function') return canonicalize(value.toJSON());
    // Map and Set have no own keys and would all collapse to {}
    if (value instanceof Map || value instanceof Set) throw new TypeError('Map and Set cannot be fingerprinted.');
    if (Array.isArray(value)) return value.map(canonicalize);
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

// 2. Cryptographic payload fingerprint calculation
function operationFingerprint(value) {
    return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

// 3. Fail-closed replay verification preventing key reuse for mutated payloads
function assertIdempotentReplay(existingFingerprint, requestedFingerprint) {
    // A stored key replayed without a fingerprint is a mismatch, not a pass
    if (existingFingerprint && existingFingerprint !== requestedFingerprint) {
        throw new AppError('The idempotency key was already used for a different request.', {
            status: 409,
            code: 'IDEMPOTENCY_KEY_REUSED'
        });
    }
}
```

---

## 4. Behavior Comparison

| Idempotency Strategy | Key Ordering Robustness | Mutated Payload Detection | Replay Integrity |
|---|---|---|---|
| Header-Only Matching | Irrelevant | Fails to detect mutated payload | Vulnerable |
| Raw String SHA-256 | Broken (False Conflicts) | Detected | Brittle |
| **Recursive Canonicalized SHA-256** | **Deterministic key sorting (O(N log N))** | **Rejects mutated payload with HTTP 409** | **Replay detected via hash match** |

_Qualitative comparison. Numbers appear only where a script in this folder measures them._

---

## 5. Implementation

See implementation in [`src/idempotency.js`](./src/idempotency.js).

---

## 6. How to Verify

Run the automated test suite using Node.js built-in test runner:

```bash
node --test test/idempotency.test.js
```

### Verified Output:
```text
✔ canonicalize sorts object keys recursively regardless of insertion order (1.377ms)
✔ mutated payload produces different fingerprint and triggers 409 replay rejection (0.6102ms)
✔ Date values change the fingerprint; Map and Set are rejected (2.117ms)
✔ a stored key replayed without a fingerprint fails closed (0.2757ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
```

* **Test Environment:** Node.js v24.17.0, Windows 11, 2026-10-19 (no external dependencies, built-in node:test)

---

## 7. Visual Representation

![Visual Architecture Card](./assets/code-card.png)
