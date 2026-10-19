import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForHumanYield } from '../src/collision_avoidance.ts';

test('returns true as soon as the user is idle', async () => {
    let polls = 0;
    const result = await waitForHumanYield(async () => ++polls < 3, 1_000, 10);
    assert.equal(result, true);
    assert.equal(polls, 3);
});

test('returns false when the user keeps moving past maxWaitMs', async () => {
    const result = await waitForHumanYield(async () => true, 100, 10);
    assert.equal(result, false);
});
