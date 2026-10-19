import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDiscoveryLimits, DEFAULT_DISCOVERY_LIMITS } from '../src/crawler_limits.js';

test('defaults include the sitemap and queue limits', () => {
    assert.deepEqual(resolveDiscoveryLimits(50), { ...DEFAULT_DISCOVERY_LIMITS });
    const limits = resolveDiscoveryLimits(50);
    assert.equal(limits.maxSitemapDecompressedBytes, 8_000_000);
    assert.equal(limits.maxSitemapDepth, 3);
});

test('overrides are clamped, and invalid values fall back to the default', () => {
    const limits = resolveDiscoveryLimits(50, {
        maxSitemapDepth: 99,
        maxSitemapDecompressedBytes: 10 ** 12,
        maxPathDepth: 0,
        maxCalendarYearDrift: 0,
        maxQueuedUrls: 'lots',
        maxQueryVariantsPerPath: 2.5
    });
    assert.equal(limits.maxSitemapDepth, 5);
    assert.equal(limits.maxSitemapDecompressedBytes, 50 * 1024 * 1024);
    assert.equal(limits.maxPathDepth, 1);
    assert.equal(limits.maxCalendarYearDrift, 0);
    assert.equal(limits.maxQueuedUrls, 1_000);
    assert.equal(limits.maxQueryVariantsPerPath, 5);
});
