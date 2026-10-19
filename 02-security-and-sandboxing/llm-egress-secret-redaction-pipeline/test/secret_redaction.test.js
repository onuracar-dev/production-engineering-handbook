import test from 'node:test';
import assert from 'node:assert/strict';
import { redactText, SECRET_PATTERNS } from '../src/secret_redaction.js';

test('redacts all 6 secret patterns reliably in arbitrary text', () => {
    // 1. Private Key (RSA / EC / OPENSSH)
    const privateKeyText = 'Config error: -----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0m4w...\n-----END RSA PRIVATE KEY----- detected';
    assert.equal(
        redactText(privateKeyText),
        'Config error: [redacted-private-key] detected'
    );

    const sshKeyText = 'Key: -----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjE...\n-----END OPENSSH PRIVATE KEY-----';
    assert.equal(
        redactText(sshKeyText),
        'Key: [redacted-private-key]'
    );

    // 2. Bearer Authentication Tokens
    const bearerText = 'Request header: Authorization: Bearer eyJhbGciOiJIUzI1NiIs.tokensample.signature==';
    assert.match(
        redactText(bearerText),
        /Bearer \[redacted\]/
    );

    // 3. OpenRouter API Keys (sk-or-v1-*)
    const openRouterText = 'LLM client initialized with key sk-or-v1-abcdef0123456789abcdef0123456789 in prompt';
    assert.equal(
        redactText(openRouterText),
        'LLM client initialized with key [redacted-secret] in prompt'
    );

    // 4. Stripe / Service Keys (sk_live_*, rk_test_*, pk_live_*)
    const stripeText = 'Failed webhook call with secret sk_live_9876543210abcdef and key rk_test_abcdef1234567890';
    assert.equal(
        redactText(stripeText),
        'Failed webhook call with secret [redacted-secret] and key [redacted-secret]'
    );

    // 5. JSON Web Tokens (eyJ...)
    const jwtText = 'User token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c in session';
    assert.equal(
        redactText(jwtText),
        'User token: [redacted-jwt] in session'
    );

    // 6. Database / API URL with Embedded Basic Credentials
    const postgresUrl = 'Connecting to postgres://db_admin:SuperSecretPass123@pg-cluster.internal:5432/main_db';
    assert.equal(
        redactText(postgresUrl),
        'Connecting to postgres://[redacted]@pg-cluster.internal:5432/main_db'
    );

    const redisUrl = 'Redis URI: redis://default:mypassword@cache.prod.vpc:6379/0';
    assert.equal(
        redactText(redisUrl),
        'Redis URI: redis://[redacted]@cache.prod.vpc:6379/0'
    );
});

test('pipeline strips null-bytes and clamps text to maxLength', () => {
    // Null byte injection attempt
    const nullByteInput = 'SELECT * \0FROM users WHERE api_key = "sk_live_12345678abcdef"';
    const sanitized = redactText(nullByteInput);
    assert.equal(sanitized.includes('\0'), false);
    assert.equal(sanitized, 'SELECT * FROM users WHERE api_key = "[redacted-secret]"');

    // Clamps string to maxLength
    const longInput = 'A'.repeat(5000);
    const clamped = redactText(longInput, { maxLength: 100 });
    assert.equal(clamped.length, 100);
});

test('redacts a private key cut off by the length clamp', () => {
    const key = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0m4wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\n-----END RSA PRIVATE KEY-----';
    const text = 'x'.repeat(3_950) + ' ' + key;
    const out = redactText(text);
    assert.equal(out.includes('MIIEow'), false);
    assert.ok(out.endsWith('[redacted-private-key]'));
});

test('redacts the key formats the README lists', () => {
    assert.equal(redactText('aws AKIAIOSFODNN7EXAMPLE end'), 'aws [redacted-secret] end');
    assert.equal(redactText('gcp AIzaSyA1234567890abcdefghijklmnopqrstuv end'), 'gcp [redacted-secret] end');
    assert.equal(redactText('export DB_PASSWORD=hunter2hunter2'), 'export DB_PASSWORD=[redacted-environment-variable]');
    assert.equal(redactText('export PATH=/usr/bin'), 'export PATH=/usr/bin');
    assert.equal(
        redactText('-----BEGIN ENCRYPTED PRIVATE KEY-----\nMIIFHz\n-----END ENCRYPTED PRIVATE KEY-----'),
        '[redacted-private-key]'
    );
    assert.equal(redactText('postgres://admin:p@ssw0rd@db:5432/x'), 'postgres://[redacted]@db:5432/x');
    assert.equal(redactText('amqp://user:pass@rabbit:5672'), 'amqp://[redacted]@rabbit:5672');
    assert.equal(redactText('see https://example.com/a?mail=x@y.com'), 'see https://example.com/a?mail=x@y.com');
});
