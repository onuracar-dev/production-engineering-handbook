import crypto from 'node:crypto';

export class AppError extends Error {
    constructor(message, { status = 500, code = 'INTERNAL_ERROR' } = {}) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

// 1. Recursive deterministic JSON object key sorting
export function canonicalize(value) {
    if (value === null || typeof value !== 'object') return value;
    // Date (and any toJSON type) is fingerprinted the way JSON.stringify would send it
    if (typeof value.toJSON === 'function') return canonicalize(value.toJSON());
    // Map and Set have no own keys and would all collapse to {}
    if (value instanceof Map || value instanceof Set) throw new TypeError('Map and Set cannot be fingerprinted.');
    if (Array.isArray(value)) return value.map(canonicalize);
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

// 2. Cryptographic payload fingerprint calculation
export function operationFingerprint(value) {
    return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

// 3. Fail-closed replay verification preventing key reuse for mutated payloads
export function assertIdempotentReplay(existingFingerprint, requestedFingerprint) {
    // A stored key replayed without a fingerprint is a mismatch, not a pass
    if (existingFingerprint && existingFingerprint !== requestedFingerprint) {
        throw new AppError('The idempotency key was already used for a different request.', {
            status: 409,
            code: 'IDEMPOTENCY_KEY_REUSED'
        });
    }
}
