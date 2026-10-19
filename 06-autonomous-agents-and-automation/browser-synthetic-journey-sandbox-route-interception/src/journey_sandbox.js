// Excerpt from the original journey runner (page, origin, step and blockedRequests come from there).
// The browser context is created with { serviceWorkers: 'block' }: requests a Service Worker
// handles never reach page.route().

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
