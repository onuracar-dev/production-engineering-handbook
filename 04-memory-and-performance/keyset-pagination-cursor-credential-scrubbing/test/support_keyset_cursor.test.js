import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeCursor, decodeCursor, extractTargetUrl } from '../src/support_keyset_cursor.js';

const at = '2026-10-19T12:00:00.000Z';
const isInvalidCursor = (err) => err.status === 400 && err.code === 'SUPPORT_CURSOR_INVALID';

test('round-trips a cursor, including id 0', () => {
    assert.deepEqual(decodeCursor(encodeCursor({ at, id: 42 })), { at, id: 42 });
    assert.deepEqual(decodeCursor(encodeCursor({ at, id: 0 })), { at, id: 0 });
    assert.equal(decodeCursor(''), null);
});

test('every malformed cursor is a 400, not a 500', () => {
    const bad = [
        'not-json',
        Buffer.from('{"id":1').toString('base64url'),
        encodeCursor({ id: 1 }),
        encodeCursor({ at }),
        encodeCursor({ at, id: '' }),
        encodeCursor({ at, id: { $gt: 0 } }),
        encodeCursor(null),
        'a'.repeat(513)
    ];
    for (const value of bad) assert.throws(() => decodeCursor(value), isInvalidCursor, value);
});

test('URLs with userinfo credentials are discarded', () => {
    assert.equal(extractTargetUrl({ targeturl: 'https://user:pass@internal.example/debug' }), null);
    assert.equal(extractTargetUrl({ targeturl: 'javascript:alert(1)' }), null);
    assert.equal(extractTargetUrl({ targeturl: 'not a url' }), null);
    assert.equal(extractTargetUrl({ targeturl: 'https://app.example/page' }), 'https://app.example/page');
});
