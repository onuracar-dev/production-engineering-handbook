// 1. Derive expected live mode from cryptographic secret key prefix
function expectedStripeLiveMode(config) {
    const secretKey = stripeCatalog(config).secretKey || '';
    // Restricted keys (rk_) are scoped the same way as secret keys (sk_).
    if (/^[sr]k_live_/.test(secretKey)) return true;
    if (/^[sr]k_test_/.test(secretKey)) return false;
    return null;
}

// 2. Strict webhook environment and account attestation
function assertStripeWebhookEnvironment(event, config) {
    const catalog = stripeCatalog(config);
    const expectedLiveMode = expectedStripeLiveMode(config);
    if (config.nodeEnv === 'production' && (expectedLiveMode === null || typeof event.livemode !== 'boolean')) {
        throw new AppError('Stripe webhook environment could not be verified.', { status: 503, code: 'BILLING_PROVIDER_ENVIRONMENT_UNVERIFIED' });
    }
    if (typeof event.livemode === 'boolean' && expectedLiveMode !== null && event.livemode !== expectedLiveMode) {
        throw new AppError('Stripe webhook environment does not match the configured key.', { status: 400, code: 'BILLING_PROVIDER_ENVIRONMENT_MISMATCH' });
    }
    if (catalog.accountId && event.account && catalog.accountId !== event.account) {
        throw new AppError('Stripe webhook account does not match the configured account.', { status: 400, code: 'BILLING_PROVIDER_ACCOUNT_MISMATCH' });
    }
}
