import test from 'node:test';
import assert from 'node:assert/strict';
import { createZapDistributedLock } from '../src/zap_lock.js';

function fakePool({ unlockFails }) {
    const released = [];
    const client = {
        async query(sql) {
            if (sql.includes('pg_try_advisory_lock')) return { rows: [{ acquired: true }] };
            if (unlockFails) throw new Error('connection terminated');
            return { rows: [{ pg_advisory_unlock: true }] };
        },
        release(destroy) { released.push(destroy); }
    };
    return { pool: { connect: async () => client }, released };
}

test('a clean unlock returns the connection to the pool', async () => {
    const { pool, released } = fakePool({ unlockFails: false });
    const release = await createZapDistributedLock({ pool }).acquire();
    await release();
    await release(); // idempotent
    assert.deepEqual(released, [false]);
});

test('a failed unlock destroys the connection instead of pooling it', async () => {
    const { pool, released } = fakePool({ unlockFails: true });
    const release = await createZapDistributedLock({ pool }).acquire();
    await release();
    assert.deepEqual(released, [true]);
});
