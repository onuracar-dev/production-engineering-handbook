import test from 'node:test';
import assert from 'node:assert/strict';
import { startExecutionLeaseHeartbeat } from '../src/lease_heartbeat.js';

test('a failed renewal is logged and the next tick renews again', async (t) => {
    const unhandled = [];
    const onUnhandled = (reason) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    t.after(() => process.off('unhandledRejection', onUnhandled));

    let calls = 0;
    const store = {
        async renewExecutionResultLease() {
            calls += 1;
            if (calls === 2) throw new Error('connection reset');
            return true;
        }
    };
    const warnings = [];
    const logger = { warn: (message) => warnings.push(message) };

    const timer = startExecutionLeaseHeartbeat(store, 'job-1', { leaseOwner: 'w1', leaseToken: 't1' }, 1_500, logger);
    // leaseMs 1500 -> renew every 500 ms; wait for 3 ticks
    await new Promise((resolve) => setTimeout(resolve, 1_700));
    clearInterval(timer);

    assert.ok(calls >= 3, `expected at least 3 renewals, got ${calls}`);
    assert.deepEqual(warnings, ['Execution lease renewal failed']);
    assert.deepEqual(unhandled, []);
});

test('no claim token means no heartbeat', () => {
    assert.equal(startExecutionLeaseHeartbeat({}, 'job-1', {}, 1_000), null);
});
