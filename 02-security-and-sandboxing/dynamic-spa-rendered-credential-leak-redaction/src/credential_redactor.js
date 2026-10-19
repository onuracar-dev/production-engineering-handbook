// Excerpt: normalizePageUrl comes from the original project's URL helpers and is not part of this file.

// Short names match only as the whole parameter name, so `author` and `country_code` pass.
const SENSITIVE_PARAM_EXACT = new Set(['code', 'key', 'sig', 'auth', 'sid']);
// Longer names match as a segment after splitting camelCase and `_ - .` separators:
// access_token, apiKey, X-Amz-Signature, session_id, jwt.
const SENSITIVE_PARAM_SEGMENT = /(?:^|_)(?:token|secret|password|passwd|api_?key|access_key|signature|credential|session|jwt|auth_code)(?:_|$)/;

export function isSensitiveParam(name) {
    const normalized = name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[-.]/g, '_').toLowerCase();
    return SENSITIVE_PARAM_EXACT.has(normalized) || SENSITIVE_PARAM_SEGMENT.test(normalized);
}

// Query parameters, `#access_token=` style fragments and `user:pass@` userinfo all count.
export function hasCredentialInUrl(parsed) {
    if (parsed.username || parsed.password) return true;
    const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ''));
    return [...parsed.searchParams.keys(), ...fragment.keys()].some(isSensitiveParam);
}

export function normalizeRenderedLinks(values, baseUrl, limit = 500) {
    const links = [], seen = new Set();
    for (const val of values) {
        if (links.length >= limit) break;
        try {
            const parsed = new URL(val, baseUrl);
            if (!['http:', 'https:'].includes(parsed.protocol)) continue;
            // Drop the whole link when it carries a credential; it is never stored or crawled
            if (hasCredentialInUrl(parsed)) continue;
            const normalized = normalizePageUrl(parsed.toString());
            if (!seen.has(normalized)) {
                seen.add(normalized);
                links.push(normalized);
            }
        } catch { continue; }
    }
    return links;
}
