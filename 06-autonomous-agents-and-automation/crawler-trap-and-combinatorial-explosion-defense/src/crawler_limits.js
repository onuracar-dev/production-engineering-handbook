export const DEFAULT_DISCOVERY_LIMITS = Object.freeze({
    maxSitemaps: 20,
    maxSitemapUrls: 5_000,
    maxSitemapDecompressedBytes: 8_000_000,
    maxSitemapDepth: 3,
    maxQueuedUrls: 1_000,
    maxPathDepth: 16,
    maxQueryVariantsPerPath: 5,
    maxPaginationValue: 250,
    maxCalendarYearDrift: 5
});

// Missing or non-integer overrides fall back to the default; others are clamped into [min, max]
function boundedInteger(value, fallback, { min = 1, max }) {
    const number = Number(value);
    if (value === undefined || value === null || value === '' || !Number.isInteger(number)) return fallback;
    return Math.min(max, Math.max(min, number));
}

// Guard against faceted search matrix explosions, infinite calendar drift and sitemap bombs
export function resolveDiscoveryLimits(pageLimit, overrides = {}) {
    const d = DEFAULT_DISCOVERY_LIMITS;
    return {
        // Sitemap ceilings: 50,000 URLs and 50 MB uncompressed are the sitemaps.org per-file maximums
        maxSitemaps: boundedInteger(overrides.maxSitemaps, d.maxSitemaps, { max: 100 }),
        maxSitemapUrls: boundedInteger(overrides.maxSitemapUrls, d.maxSitemapUrls, { max: 50_000 }),
        maxSitemapDecompressedBytes: boundedInteger(overrides.maxSitemapDecompressedBytes, d.maxSitemapDecompressedBytes, { max: 50 * 1024 * 1024 }),
        maxSitemapDepth: boundedInteger(overrides.maxSitemapDepth, d.maxSitemapDepth, { max: 5 }),
        maxQueuedUrls: boundedInteger(overrides.maxQueuedUrls, d.maxQueuedUrls, { max: 100_000 }),
        maxPathDepth: boundedInteger(overrides.maxPathDepth, d.maxPathDepth, { max: 100 }),
        maxQueryVariantsPerPath: boundedInteger(overrides.maxQueryVariantsPerPath, d.maxQueryVariantsPerPath, { max: 100 }),
        maxPaginationValue: boundedInteger(overrides.maxPaginationValue, d.maxPaginationValue, { max: 100_000 }),
        maxCalendarYearDrift: boundedInteger(overrides.maxCalendarYearDrift, d.maxCalendarYearDrift, { min: 0, max: 50 })
    };
}
