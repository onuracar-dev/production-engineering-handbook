import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalize, operationFingerprint, assertIdempotentReplay, AppError } from '../src/idempotency.js';

test('canonicalize sorts object keys recursively regardless of insertion order', () => {
    const payloadA = {
        name: 'test-operation',
        params: { z: 1, a: 2, m: { secondary: 'val', primary: 'val' } },
        tags: ['prod', 'audit']
    };

    const payloadB = {
        params: { a: 2, z: 1, m: { primary: 'val', secondary: 'val' } },
        tags: ['prod', 'audit'],
        name: 'test-operation'
    };

    // Different key order yields identical JSON representation after canonicalization
    assert.equal(
        JSON.stringify(canonicalize(payloadA)),
        JSON.stringify(canonicalize(payloadB))
    );

    // Yields exact identical SHA-256 hash
    const hashA = operationFingerprint(payloadA);
    const hashB = operationFingerprint(payloadB);
    assert.equal(hashA, hashB);
});

test('mutated payload produces different fingerprint and triggers 409 replay rejection', () => {
    const original = { accountId: 'acc_123', amount: 5000, currency: 'USD' };
    const mutated = { accountId: 'acc_123', amount: 9999, currency: 'USD' };

    const originalHash = operationFingerprint(original);
    const mutatedHash = operationFingerprint(mutated);

    assert.notEqual(originalHash, mutatedHash);

    // Matching replay succeeds
    assert.doesNotThrow(() => {
        assertIdempotentReplay(originalHash, originalHash);
    });

    // Mutated payload replay fails closed with 409 IDEMPOTENCY_KEY_REUSED
    assert.throws(
        () => assertIdempotentReplay(originalHash, mutatedHash),
        (err) => {
            assert(err instanceof AppError);
            assert.equal(err.status, 409);
            assert.equal(err.code, 'IDEMPOTENCY_KEY_REUSED');
            return true;
        }
    );
});

test('Date values change the fingerprint; Map and Set are rejected', () => {
    const a = operationFingerprint({ at: new Date('2026-01-01T00:00:00Z') });
    const b = operationFingerprint({ at: new Date('2026-06-01T00:00:00Z') });
    assert.notEqual(a, b);
    assert.equal(a, operationFingerprint({ at: '2026-01-01T00:00:00.000Z' }));
    assert.throws(() => operationFingerprint({ m: new Map([['k', 1]]) }), TypeError);
    assert.throws(() => operationFingerprint({ s: new Set([1]) }), TypeError);
});

test('a stored key replayed without a fingerprint fails closed', () => {
    const stored = operationFingerprint({ amount: 1 });
    assert.throws(() => assertIdempotentReplay(stored, undefined), (err) => err.code === 'IDEMPOTENCY_KEY_REUSED');
    // First use: nothing stored yet
    assert.doesNotThrow(() => assertIdempotentReplay(undefined, stored));
});
