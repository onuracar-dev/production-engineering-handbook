import test from 'node:test';
import assert from 'node:assert/strict';
import { isSensitiveParam, hasCredentialInUrl } from '../src/credential_redactor.js';

test('ordinary parameters that only contain a sensitive word pass', () => {
    for (const name of ['author', 'country_code', 'keyword', 'monkey', 'signup', 'q', 'page']) {
        assert.equal(isSensitiveParam(name), false, name);
    }
});

test('credential parameters are caught by whole name or segment', () => {
    for (const name of ['token', 'access_token', 'accessToken', 'apiKey', 'api-key', 'key', 'sig',
        'X-Amz-Signature', 'jwt', 'code', 'password', 'session_id', 'client_secret']) {
        assert.equal(isSensitiveParam(name), true, name);
    }
});

test('query, fragment and userinfo credentials all mark the URL', () => {
    const has = (url) => hasCredentialInUrl(new URL(url));
    assert.equal(has('https://a.example/blob?sv=2024&sig=abc'), true);
    assert.equal(has('https://a.example/?jwt=eyJ'), true);
    assert.equal(has('https://a.example/cb#access_token=xyz&state=1'), true);
    assert.equal(has('https://user:pass@a.example/'), true);
    assert.equal(has('https://a.example/posts?author=ann&country_code=TR'), false);
    assert.equal(has('https://a.example/docs#section-2'), false);
});
