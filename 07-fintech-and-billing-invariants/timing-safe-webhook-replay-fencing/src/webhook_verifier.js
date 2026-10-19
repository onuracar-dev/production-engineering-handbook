import crypto from 'node:crypto';

export class AppError extends Error {
    constructor(message, { status = 500, code = 'INTERNAL_ERROR' } = {}) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

// Paddle-Signature header: "ts=1671552777;h1=<hex>[;h1=<hex>]"
export function parseSignatureHeader(header) {
    let timestamp = null;
    const signatures = [];
    for (const part of String(header || '').split(';')) {
        const [key, value] = part.split('=', 2).map((s) => s?.trim());
        if (key === 'ts') timestamp = value;
        else if (key === 'h1' && value) signatures.push(value);
    }
    return { timestamp, signatures };
}

export function verifyPaddleSignature(rawBody, signatureHeader, secret, { now = () => Date.now(), toleranceSeconds = 5 } = {}) {
    const { timestamp, signatures } = parseSignatureHeader(signatureHeader);
    const currentSeconds = Math.floor(now() / 1000);

    // Strict 5-second replay tolerance fence; a non-numeric ts would make the comparison NaN and pass
    const ts = /^\d{1,12}$/.test(timestamp ?? '') ? Number(timestamp) : NaN;
    if (!Number.isSafeInteger(ts) || signatures.length === 0 || Math.abs(currentSeconds - ts) > toleranceSeconds) {
        throw new AppError('Expired or invalid webhook timestamp.', { status: 400, code: 'INVALID_SIGNATURE' });
    }

    // Prevent byte-by-byte timing attacks on HMAC hex digest
    const expected = crypto.createHmac('sha256', secret).update(timestamp + ':' + rawBody).digest('hex');
    const isValid = signatures.some((sig) => {
        // Buffer.from(hex) silently stops at the first non-hex character, so check the format first
        if (!/^[0-9a-f]{64}$/i.test(sig)) return false;
        const a = Buffer.from(sig, 'hex'), b = Buffer.from(expected, 'hex');
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    });
    if (!isValid) throw new AppError('Invalid webhook signature.', { status: 400, code: 'INVALID_SIGNATURE' });
}
