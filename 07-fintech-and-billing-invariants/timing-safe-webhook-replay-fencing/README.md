# Case Study 17: Timing-Safe Webhook HMAC Signature Verification & 5-Second Replay Fencing

> **Domain:** Fintech & Billing Invariants  
> **Source Project:** `WebPageAnalyz (Billing Gateway)`  
> **Language:** Node.js / Timing-Safe Crypto  
> **Key Metric:** `Constant-time verification, 5s replay fence`

---

## 1. Problem

Webhooks from billing providers (Paddle, Stripe) are vulnerable to timing attacks when verified with standard string comparisons, allowing attackers to deduce valid signatures. Furthermore, lack of timestamp replay fencing enables replay attacks where valid historic payment events are re-sent to grant unauthorized subscriptions.

---

## 2. Why Naive Approaches Fail

1. **Standard Equality Operators (`=== / ==`):**
   * Early-exit string comparisons terminate on the first mismatched byte, leaking cryptographic signature byte values through nanosecond timing discrepancies.
2. **Missing or Loose Timestamp Windows:**
   * Many handlers only check signature validity without timestamp bounds, allowing captured historical webhooks to be replayed days or weeks later.
3. **Out-of-Order Delivery Race Conditions:**
   * Network lag can deliver an older `subscription.canceled` webhook *after* a newer `subscription.resumed` webhook, mistakenly canceling an active paid subscription.

---

## 3. Architecture

1. **Constant-Time Verification:** Compares cryptographic signature buffers strictly using `crypto.timingSafeEqual()`, eliminating side-channel timing leaks. Each `h1` value must be exactly 64 hex characters first, because `Buffer.from(sig, 'hex')` silently ignores trailing junk.
2. **5-Second Replay Fence:** Enforces `Math.abs(currentSeconds - timestamp) > 5` to reject any captured or delayed webhook outside an immediate 5-second window. A non-numeric `ts` is rejected up front; otherwise `Math.abs(now - NaN) > 5` is `false` and the fence would pass.
3. **Monotonic Event Sequencing (original project, not in `src/`):** The billing engine records `occurred_at` timestamps and verifies that older events cannot regress newer subscription state.

---

## 4. Behavior Comparison

| Webhook Verification Model | Side-Channel Timing Leak | Replay Attack Window | Out-of-Order Safety |
|---|---|---|---|
| String Equality (`===`) | Vulnerable (Early Exit) | Indefinite | None |
| Loose Timestamp Check | Vulnerable | Hours / Days | None |
| **Timing-Safe + 5s Fence** | **Protected (crypto.timingSafeEqual)** | **Bounded (5-second timestamp window)** | **Monotonic event timestamp sequencing** |

_Qualitative comparison. Numbers appear only where a script in this folder measures them._

---

## 5. Implementation

See implementation in [`src/webhook_verifier.js`](./src/webhook_verifier.js).

---

## 6. How to Verify

Run the automated test suite using Node.js built-in test runner:

```bash
node --test test/webhook_verifier.test.js
```

### Verified Output:
```text
✔ accepts a valid signature inside the window (1.5393ms)
✔ rejects trailing junk after a valid hex digest (0.4489ms)
✔ rejects a non-numeric or stale timestamp (0.3154ms)
✔ rejects a wrong signature and a missing one (0.211ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
```

* **Test Environment:** Node.js v24.17.0, Windows 11, 2026-10-19 (no external dependencies, built-in node:test)

---

## 7. Visual Representation

![Visual Architecture Card](./assets/code-card.png)
