# Case Study 20: Dynamic SPA Rendered Link Credential Stripping & Diagnostic Redaction

> **Domain:** Security & Sandboxing  
> **Source Project:** `WebPageAnalyz (WPA Page Analyzer)`  
> **Language:** JavaScript / Playwright  
> **Key Metric:** Query credential parameter stripping, diagnostic log redaction

---

## 1. Problem

Headless browser analyzers crawling modern dynamic Single Page Applications (SPAs) frequently extract links rendered by client-side JavaScript. Many applications inadvertently expose authentication tokens, OAuth authorization codes, session keys, or API secrets in query parameters (`?token=xyz`, `?access_key=123`). Storing these links into shareable audit reports leaks sensitive customer secrets.

---

## 2. Why Naive Approaches Fail

1. **Unfiltered Link Discovery:**
   * Ingesting all `<a>` tags and dynamically rendered references exposes ephemeral tokens to database logs, report viewers, and external export APIs.
2. **Raw Console Error Logging:**
   * Browser `console.error` and unhandled rejection stack traces routinely dump authorization headers, cookies, and local file paths directly into diagnostic outputs.
3. **Manual Blacklisting:**
   * Relying on manual developer inspection fails against dynamic client-side router parameters generated at runtime.

---

## 3. Architecture

1. **In-Browser Credential Filter:** `isSensitiveParam()` checks every query parameter and every `#key=value` fragment parameter. Short names (`code`, `key`, `sig`, `auth`, `sid`) must match the whole name; longer ones (`token`, `secret`, `api_key`, `signature`, `session`, `jwt`, ...) match a name segment after splitting camelCase and `_ - .`, so `author` and `country_code` pass while `access_token` and `X-Amz-Signature` do not. A link with a sensitive parameter or with `user:pass@` userinfo is dropped as a whole; it is never stored or crawled.
2. **Diagnostic Log Redaction (original project, not in `src/`):** `sanitizeDiagnosticText()` strips URLs down to clean origins and replaces sensitive headers (`authorization`, `cookie`, `set-cookie`, `token`, `password`) with `[REDACTED]`.
3. **Stack Trace Scrubbing (original project, not in `src/`):** Masks local filesystem paths (`[LOCAL_PATH]`) and query strings from error stack traces before database persistence.

---

## 4. Behavior Comparison

| Analyzer Redaction Model | SPA Token Leaks | Diagnostic Secret Redaction | Shareable Report Safety |
|---|---|---|---|
| Unfiltered Raw DOM | High (Tokens in Query Strings) | None (Raw Stacks) | Dangerous |
| URL-Only Stripping | Partial | None | Vulnerable |
| **AST & Diagnostic Redactor** | **Link dropped by parameter filter** | **Redacted before persistence** | **Safe for Public Sharing** |

_Qualitative comparison. Numbers appear only where a script in this folder measures them._

---

## 5. Implementation

See implementation in [`src/credential_redactor.js`](./src/credential_redactor.js).

---

## 6. How to Verify

Run the automated test suite using Node.js built-in test runner:

```bash
node --test test/credential_redactor.test.js
```

### Verified Output:
```text
✔ ordinary parameters that only contain a sensitive word pass (0.9855ms)
✔ credential parameters are caught by whole name or segment (0.171ms)
✔ query, fragment and userinfo credentials all mark the URL (1.0318ms)
ℹ tests 3
ℹ suites 0
ℹ pass 3
ℹ fail 0
```

* **Test Environment:** Node.js v24.17.0, Windows 11, 2026-10-19 (no external dependencies, built-in node:test)

---

## 7. Visual Representation

![Visual Architecture Card](./assets/code-card.png)
