import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyPaddleSignature } from '../src/webhook_verifier.js';

const secret = 'whsec_test';
const body = '{"event_type":"subscription.updated"}';
const nowMs = 1_760_000_000_000;
const ts = String(nowMs / 1000);
const sign = (t) => crypto.createHmac('sha256', secret).update(t + ':' + body).digest('hex');
const verify = (header, at = nowMs) => verifyPaddleSignature(body, header, secret, { now: () => at });
const rejected = (err) => err.status === 400 && err.code === 'INVALID_SIGNATURE';

test('accepts a valid signature inside the window', () => {
    assert.doesNotThrow(() => verify(`ts=${ts};h1=${sign(ts)}`));
    assert.doesNotThrow(() => verify(`ts=${ts};h1=${sign(ts)}`, nowMs + 5_000));
});

test('rejects trailing junk after a valid hex digest', () => {
    assert.throws(() => verify(`ts=${ts};h1=${sign(ts)}zz`), rejected);
});

test('rejects a non-numeric or stale timestamp', () => {
    assert.throws(() => verify(`ts=abc;h1=${sign('abc')}`), rejected);
    assert.throws(() => verify(`ts=;h1=${sign('')}`), rejected);
    assert.throws(() => verify(`ts=${ts};h1=${sign(ts)}`, nowMs + 6_000), rejected);
});

test('rejects a wrong signature and a missing one', () => {
    assert.throws(() => verify(`ts=${ts};h1=${'0'.repeat(64)}`), rejected);
    assert.throws(() => verify(`ts=${ts}`), rejected);
});
