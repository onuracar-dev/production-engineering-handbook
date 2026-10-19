# Systems Engineering Case Study: Stripe Live/Test Mode & Multi-Account Webhook Spoofing Fencing

---

## 1. Problem

Verifying Stripe webhook signatures using `stripe.webhooks.constructEvent()` only proves that the payload was signed by the configured webhook signing secret. In staging/production shared environments or Stripe Connect multi-account configurations, signing secrets can be misrouted. An attacker or staging tester sending a signed test-mode event (`livemode: false`) to a production webhook endpoint can trick the server into provisioning free paid subscriptions.

---

## 2. Why Naive Approaches Fail

1. **Standard Signature Verification Alone:**
   * Signature checks only validate cryptographic integrity against a signing secret. If a test webhook endpoint URL points to production, signatures validate successfully.
2. **Missing Livemode Cross-Referencing:**
   * Applications frequently check `event.type === 'checkout.session.completed'` and immediately grant tenant entitlements without validating whether `event.livemode` matches the server's configured Stripe API key.
3. **Cross-Account Spoofing in Multi-Tenant Connect:**
   * In multi-account architectures, webhooks originating from an unauthorized connected merchant account can be replayed against global platform handlers.

---

## 3. Architecture

1. **Cryptographic Key Prefix Inference:** `expectedStripeLiveMode()` inspects the server's configured secret key. If it begins with `sk_live_` or `rk_live_` (restricted key), livemode must strictly be `true`; if `sk_test_` or `rk_test_`, livemode must be `false`.
2. **Production Environment Assertion:** In `production`, if `expectedLiveMode` is unverified or `event.livemode` is missing, the request is immediately rejected with HTTP 503 `BILLING_PROVIDER_ENVIRONMENT_UNVERIFIED`.
3. **Deterministic Mode Mismatch Fencing:** If `event.livemode !== expectedLiveMode`, the handler fails closed with HTTP 400 `BILLING_PROVIDER_ENVIRONMENT_MISMATCH`.
4. **Stripe Connect Account Fencing:** Asserts that `event.account` matches the exact configured `catalog.accountId`, preventing multi-account cross-tenant replay attacks.

```javascript
// 1. Derive expected live mode from cryptographic secret key prefix
function expectedStripeLiveMode(config) {
    const secretKey = stripeCatalog(config).secretKey || '';
    // Restricted keys (rk_) are scoped the same way as secret keys (sk_).
    if (/^[sr]k_live_/.test(secretKey)) return true;
    if (/^[sr]k_test_/.test(secretKey)) return false;
    return null;
}

// 2. Strict webhook environment and account attestation
function assertStripeWebhookEnvironment(event, config) {
    const catalog = stripeCatalog(config);
    const expectedLiveMode = expectedStripeLiveMode(config);
    if (config.nodeEnv === 'production' && (expectedLiveMode === null || typeof event.livemode !== 'boolean')) {
        throw new AppError('Stripe webhook environment could not be verified.', { status: 503, code: 'BILLING_PROVIDER_ENVIRONMENT_UNVERIFIED' });
    }
    if (typeof event.livemode === 'boolean' && expectedLiveMode !== null && event.livemode !== expectedLiveMode) {
        throw new AppError('Stripe webhook environment does not match the configured key.', { status: 400, code: 'BILLING_PROVIDER_ENVIRONMENT_MISMATCH' });
    }
    if (catalog.accountId && event.account && catalog.accountId !== event.account) {
        throw new AppError('Stripe webhook account does not match the configured account.', { status: 400, code: 'BILLING_PROVIDER_ACCOUNT_MISMATCH' });
    }
}
```

---

## 4. Behavior Comparison

| Stripe Webhook Validation | Signature Integrity | Test-Mode Event Replay | Cross-Account Connect Fencing |
|---|---|---|---|
| Naive `constructEvent()` | Validated | Vulnerable (Provisions Paid Plan) | Vulnerable |
| Environment Variable Check | Partial | Vulnerable | Missing |
| **Strict Environment & Account Fence** | **Validated** | **Rejected (HTTP 400 MISMATCH)** | **Enforced (HTTP 400 MISMATCH)** |

_Qualitative comparison. Numbers appear only where a script in this folder measures them._

---

## 5. Implementation

See implementation in [`src/stripe_webhook_fence.js`](./src/stripe_webhook_fence.js).

---

## 6. Visual Representation

![Visual Architecture Card](./assets/code-card.png)
