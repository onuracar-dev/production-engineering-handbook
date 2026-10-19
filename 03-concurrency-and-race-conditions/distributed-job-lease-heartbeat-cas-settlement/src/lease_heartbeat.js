// Active heartbeat loop renewing execution lease every leaseMs / 3
export function startExecutionLeaseHeartbeat(store, jobKey, claim, leaseMs, logger) {
    if (!claim?.leaseToken) return null;
    const duration = Math.max(1_000, Number(leaseMs) || 120_000);
    const timer = setInterval(() => {
        void Promise.resolve(store.renewExecutionResultLease(jobKey, {
            owner: claim.leaseOwner,
            leaseToken: claim.leaseToken,
            leaseMs: duration
        })).then((renewed) => {
            if (!renewed) logger?.warn('Execution lease lost; worker stale', { jobKey });
        }, (error) => {
            // A transient DB error must not become an unhandled rejection; the next tick retries
            logger?.warn('Execution lease renewal failed', { jobKey, error });
        });
    }, Math.floor(duration / 3));
    timer.unref?.();
    return timer;
}