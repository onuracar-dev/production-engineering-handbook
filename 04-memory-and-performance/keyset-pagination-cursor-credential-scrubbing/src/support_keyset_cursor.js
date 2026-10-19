export class AppError extends Error {
    constructor(message, { status = 500, code = 'INTERNAL_ERROR' } = {}) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

// 1. Keyset pagination cursor encoding and strict decoding
export function encodeCursor(value) {
    return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeCursor(value) {
    if (!value) return null;
    if (typeof value !== 'string' || value.length > 512) {
        throw new AppError('The support pagination cursor is invalid.', { status: 400, code: 'SUPPORT_CURSOR_INVALID' });
    }
    let decoded;
    try {
        decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    } catch {
        decoded = null;
    }
    // id 0 is a valid key; only a missing id, a non-scalar id or a bad timestamp is rejected
    const validId = (typeof decoded?.id === 'number' && Number.isFinite(decoded.id)) || (typeof decoded?.id === 'string' && decoded.id !== '');
    if (!validId || !Number.isFinite(Date.parse(decoded.at))) {
        throw new AppError('The support pagination cursor is invalid.', { status: 400, code: 'SUPPORT_CURSOR_INVALID' });
    }
    return { at: new Date(decoded.at).toISOString(), id: decoded.id };
}

// 2. Structured message context extraction scrubbing embedded credentials from URLs
// (excerpt: in the original project this runs inside the support message parser)
export function extractTargetUrl(fields) {
    let targetUrl = null;
    try {
        const parsed = fields.targeturl ? new URL(fields.targeturl) : null;
        if (parsed && ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password) {
            targetUrl = parsed.toString();
        }
    } catch { /* malformed context is ignored */ }
    return targetUrl;
}
