import test from 'node:test';
import assert from 'node:assert/strict';
import { effect, track, type ReactiveEffect } from '../src/effect_tracking.ts';

test('a branch switch drops the stale subscription', () => {
  const cond = new Set<ReactiveEffect>(), a = new Set<ReactiveEffect>(), b = new Set<ReactiveEffect>();
  let useA = true;
  const runs: string[] = [];
  effect(() => {
    track(cond);
    if (useA) { track(a); runs.push('a'); } else { track(b); runs.push('b'); }
  });
  assert.equal(a.size, 1);
  useA = false;
  for (const runner of [...cond]) runner();
  assert.deepEqual(runs, ['a', 'b']);
  assert.equal(a.size, 0);
  assert.equal(b.size, 1);
});

test('disposing unlinks every subscriber set and runs the cleanup', () => {
  const source = new Set<ReactiveEffect>();
  let cleanups = 0;
  const dispose = effect(() => {
    track(source);
    return () => { cleanups += 1; };
  });
  assert.equal(source.size, 1);
  dispose();
  assert.equal(source.size, 0);
  assert.equal(cleanups, 1);
  dispose(); // idempotent
  assert.equal(cleanups, 1);
});
