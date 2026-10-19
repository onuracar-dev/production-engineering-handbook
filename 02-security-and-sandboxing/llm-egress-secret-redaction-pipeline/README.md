# Systems Engineering Case Study: Multi-Layer Secret Redaction Pipeline for External LLM Egress

---

## 1. Problem

When integrating third-party LLM providers (such as OpenAI, Gemini, or OpenRouter) to summarize audit findings or explain vulnerabilities, raw code snippets and error logs are transmitted across the network. If logs contain database connection strings, JWTs, Stripe keys, or private SSH/RSA keys, sending them unredacted exposes critical infrastructure to third-party data leaks, violating SOC 2, HIPAA, and GDPR compliance.

---

## 2. Why Naive Approaches Fail

1. **Naive Keyword Filtering:**
   * Replacing only known environment variable values fails when logs contain credentials generated at runtime or keys belonging to customers.
2. **Unbounded Prompt Payloads:**
   * Giant stack traces or code snippets can trigger token quota exhaustion or prompt injection attacks.
3. **Null-Byte Injection Bypass:**
   * Embedded null-bytes (`\0`) can truncate strings in native C++ libraries or bypass naive regular expressions, leading to unscrubbed credential egress.

---

## 3. Architecture

1. **Null-Byte Scrubbing & Length Clamping:** `String(value).replace(/\0/g, '').slice(0, maxLength)` neutralizes null-byte bypasses and bounds prompt memory before regex execution.
2. **Frozen Pattern Filters:** Matches:
   * Private keys of any PEM flavour (`RSA`, `EC`, `DSA`, `OPENSSH`, `ENCRYPTED`, plain PKCS#8), including a key cut off by the length clamp -> `[redacted-private-key]`
   * JWT tokens (`eyJ...`) -> `[redacted-jwt]`
   * Database connection strings (`postgres://user:pass@host`) -> `postgres://[redacted]@host`
   * API tokens (Stripe `sk_live_`, OpenRouter `sk-or-v1-`, AWS `AKIA...`, Google `AIza...`) -> `[redacted-secret]`
   * Environment variable exports (`export SECRET=...`) -> `[redacted-environment-variable]`
3. **Structured Finding Normalization:** Normalizes titles, descriptions, and code snippets into an immutable object (`Object.freeze`), ensuring unredacted properties cannot be accidentally forwarded.

```javascript
// 1. Frozen cryptographic and credential token matching patterns
const SECRET_PATTERNS = Object.freeze([
    [/-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----/gi, '[redacted-private-key]'],
    // A key cut by the length clamp has no END line: redact it through the end of the text.
    [/-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*$/gi, '[redacted-private-key]'],
    [/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]'],
    [/\bsk-or-v1-[A-Za-z0-9_-]{16,}\b/gi, '[redacted-secret]'],
    [/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{8,}\b/gi, '[redacted-secret]'],
    [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, '[redacted-secret]'],
    [/\bAIza[0-9A-Za-z_-]{35}\b/g, '[redacted-secret]'],
    [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[redacted-jwt]'],
    [/(\b(?:https?|postgres(?:ql)?|mysql|mongodb(?:\+srv)?|rediss?|amqps?):\/\/)[^\s/@:]+(?::[^\s/]*)?@/gi, '$1[redacted]@'],
    [/(\bexport\s+[A-Za-z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|PRIVATE_?KEY|CREDENTIALS?)[A-Za-z0-9_]*=)\S+/gi, '$1[redacted-environment-variable]']
]);

// 2. Multi-stage sanitization pipeline stripping null-bytes and clamping length
function redactText(value, { maxLength = 4_000 } = {}) {
    let text = String(value ?? '').replace(/\0/g, '').slice(0, maxLength);
    for (const [pattern, replacement] of SECRET_PATTERNS) text = text.replace(pattern, replacement);
    return text.trim();
}
```

---

## 4. Behavior Comparison

| LLM Egress Protection | Credential Leak Risk | Database URI Redaction | Null-Byte Robustness |
|---|---|---|---|
| Unfiltered Payloads | Critical (Full Leaks) | None (Exposes Passwords) | Vulnerable |
| Keyword Masking | High (Misses Ephemeral Keys) | Incomplete | Vulnerable |
| **Frozen Pattern Sanitizer** | **Redacted (`[redacted-secret]`)** | **Redacted (`[redacted]@`)** | **Null-bytes stripped and length clamped** |

_Qualitative comparison. Numbers appear only where a script in this folder measures them._

---

## 5. Implementation

See implementation in [`src/secret_redaction.js`](./src/secret_redaction.js).

---

## 6. How to Verify

Run the automated test suite using Node.js built-in test runner:

```bash
node --test test/secret_redaction.test.js
```

### Verified Output:
```text
✔ redacts the core secret patterns in arbitrary text (2.05ms)
✔ pipeline strips null-bytes and clamps text to maxLength (0.25ms)
✔ redacts a private key cut off by the length clamp (1.12ms)
✔ redacts the key formats the README lists (0.18ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
```

* **Test Environment:** Node.js v24.17.0, Windows 11, 2026-10-19 (no external dependencies, built-in node:test)

---

## 7. Visual Representation

![Visual Architecture Card](./assets/code-card.png)
