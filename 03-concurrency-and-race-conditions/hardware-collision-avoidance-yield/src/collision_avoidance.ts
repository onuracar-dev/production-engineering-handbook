export function createCollisionAvoidanceRuntime() {
  return `
    (function() {
      if (window.__collisionRuntimeReady) return;
      window.__collisionRuntimeReady = true;

      window.__humanIntervening = false;
      let debounceTimer = null;

      const onInteraction = function() {
        window.__humanIntervening = true;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function() {
          window.__humanIntervening = false;
        }, 1800);
      };

      window.addEventListener('mousemove', onInteraction, { passive: true });
      window.addEventListener('mousedown', onInteraction, { passive: true });
      window.addEventListener('keydown', onInteraction, { passive: true });
      window.addEventListener('wheel', onInteraction, { passive: true });
    })();
  `;
}

export async function waitForHumanYield(
  evaluator: (expr: string) => Promise<boolean>,
  maxWaitMs = 5000,
  pollMs = 250
): Promise<boolean> {
  const start = performance.now();
  while (performance.now() - start < maxWaitMs) {
    const intervening = await evaluator("Boolean(window.__humanIntervening)");
    if (!intervening) return true;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  // The user is still moving: the caller must skip the action, not click anyway
  return false;
}
