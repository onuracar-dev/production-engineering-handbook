# Systems Engineering Case Study: Browser Synthetic Journey Sandbox: Route Interception & Click Mutation Guard

---

## 1. Problem

Executing automated synthetic user journeys against live customer websites introduces catastrophic safety risks: synthetic scripts can inadvertently click form submit buttons that process real financial transactions, delete production data, or navigate to malicious cross-origin URLs.

---

## 2. Why Naive Approaches Fail

1. **Standard Playwright / Puppeteer Scripts:**
   * Blindly execute `page.click()` on any selector, triggering unwanted POST mutations or form submissions.
2. **Relying on Target Web App Safeguards:**
   * Third-party applications under test rarely have safe staging boundaries, meaning test clicks execute real production side-effects.
3. **Unfiltered Network Requests:**
   * Subresources, third-party trackers, and tracking pixels can execute side-channel mutations or leak session state during automated runs.

---

## 3. Architecture

1. **Fail-Closed Network Route Interception:** Intercepts all browser network traffic via `page.route('**/*', ...)`. Restricts requests strictly to `GET`, `HEAD`, and `OPTIONS`. Any mutating method (`POST`, `PUT`, `DELETE`) or cross-origin destination is immediately aborted with `blockedbyclient`. Three gaps need handling outside the route: the browser context is created with `serviceWorkers: 'block'` (Service-Worker-handled requests skip `page.route`), WebSockets are closed with `page.routeWebSocket`, and `page.route` sees only the first URL of a redirect chain, so a same-origin URL that redirects cross-origin is not caught here. Redirect targets are not re-checked in `src/`.
2. **DOM-Level Click Safety Assertions:** Before clicking any element, evaluates its properties directly in browser DOM memory:
   * Anchor tags (`<a>`) must strictly match the current origin (`new URL(el.href).origin === location.origin`).
   * Buttons (`<button>`) must explicitly be `type="button"`. Any `type="submit"` button is strictly blocked.
3. **Bounded Journey Schema Validation:** Validates journey contracts before execution: steps are capped between 2 and 20, step timeouts are bounded between 50ms and 15,000ms, and actions are strictly restricted to `goto`, `click`, `expectVisible`, `expectText`, and `waitFor`.

```javascript
// 1. Fail-closed network route interception: block mutations & cross-origin subresources
await page.route('**/*', async (route) => {
    const request = route.request();
    let allowed = ['GET', 'HEAD', 'OPTIONS'].includes(request.method());
    try { allowed = allowed && new URL(request.url()).origin === origin; }
    catch { allowed = false; }

    if (allowed) await route.continue();
    else {
        blockedRequests.push({ method: request.method(), url: request.url() });
        await route.abort('blockedbyclient');
    }
});

// WebSockets bypass page.route(); close every one (Playwright >= 1.48)
await page.routeWebSocket(/.*/, (ws) => {
    blockedRequests.push({ method: 'WEBSOCKET', url: ws.url() });
    ws.close();
});

// 2. DOM-level click mutation guard rejecting form submit buttons & external links
if (step.action === 'click') {
    const target = page.locator(step.selector).first();
    const safe = await target.evaluate((el) =>
        el.tagName === 'A'
            ? new URL(el.href).origin === location.origin
            : el.tagName === 'BUTTON' && (el.type || 'submit') === 'button'
    );
    if (!safe) throw new Error('Only same-origin links and non-submit buttons are allowed.');
    await target.click({ timeout: step.timeoutMs || 10_000 });
}
```

---

## 4. Behavior Comparison

| Journey Execution Model | Accidental Form Submission | Cross-Origin Data Leakage | Destructive Mutation Risk |
|---|---|---|---|
| Unrestricted Playwright | High (Unchecked Clicks) | Unrestricted | High (Unrestricted POST) |
| Selector Whitelisting | Fragile (DOM Drift) | Moderate | Moderate |
| **Fail-Closed Journey Sandbox** | **Blocked (Non-Submit Only)** | **Restricted (Same-Origin Only)** | **Aborted (Mutating Requests Canceled)** |

_Qualitative comparison. Numbers appear only where a script in this folder measures them._

---

## 5. Implementation

See implementation in [`src/journey_sandbox.js`](./src/journey_sandbox.js).

---

## 6. Visual Representation

![Visual Architecture Card](./assets/code-card.png)
