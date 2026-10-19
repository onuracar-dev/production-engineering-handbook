// 1. Frozen cryptographic and credential token matching patterns
export const SECRET_PATTERNS = Object.freeze([
    [/-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----/gi, '[redacted-private-key]'],
    // A key cut by the length clamp has no END line: redact it through the end of the text.
    [/-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*$/gi, '[redacted-private-key]'],
    [/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]'],
    [/\bsk-or-v1-[A-Za-z0-9_-]{16,}\b/gi, '[redacted-secret]'],
    [/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{8,}\b/gi, '[redacted-secret]'],
    [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, '[redacted-secret]'],
    [/\bAIza[0-9A-Za-z_-]{35}\b/g, '[redacted-secret]'],
    [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[redacted-jwt]'],
    [/(\b(?:https?|postgres(?:ql)?|mysql|mongodb(?:\+srv)?|rediss?|amqps?):\/\/)[^\s/@:]+(?::[^\s/]*)?@/gi, '$1[redacted]@'],
    [/(\bexport\s+[A-Za-z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|PRIVATE_?KEY|CREDENTIALS?)[A-Za-z0-9_]*=)\S+/gi, '$1[redacted-environment-variable]']
]);

// 2. Multi-stage sanitization pipeline stripping null-bytes and clamping length
export function redactText(value, { maxLength = 4_000 } = {}) {
    let text = String(value ?? '').replace(/\0/g, '').slice(0, maxLength);
    for (const [pattern, replacement] of SECRET_PATTERNS) text = text.replace(pattern, replacement);
    return text.trim();
}
