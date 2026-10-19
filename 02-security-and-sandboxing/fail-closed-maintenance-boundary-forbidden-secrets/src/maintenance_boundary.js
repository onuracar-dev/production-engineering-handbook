// Excerpt from the original project's maintenance entrypoint (truthy() is a shared env helper there).

// 1. Blacklist of forbidden credentials that must NEVER exist in maintenance
const FORBIDDEN_MAINTENANCE_SECRETS = Object.freeze([
    'BETTER_AUTH_SECRET', 'GEMINI_API_KEY', 'STRIPE_SECRET_KEY',
    'GITHUB_CLIENT_SECRET', 'ADMIN_API_KEYS', 'SOURCE_ENCRYPTION_KEY',
    'POSTGRES_ADMIN_PASSWORD', 'CHROME_PATH', 'QUEUE_DATABASE_URL'
]);

// 2. Boot-time fail-closed secret & engine boundary attestation
function assertMaintenanceBoundary(env = process.env) {
    if (env.EXECUTION_ROLE !== 'maintenance') throw new Error('MAINTENANCE_ROLE_REQUIRED');
    
    // Verify execution engines are strictly disabled
    const disabled = ['BROWSER_EXECUTION_DISABLED', 'SOURCE_EXECUTION_DISABLED', 'PDF_EXECUTION_DISABLED'].filter((k) => !truthy(env[k]));
    if (disabled.length) throw new Error('MAINTENANCE_EXECUTION_DISABLED_REQUIRED: ' + disabled.join(', '));
    
    // Fail closed if any external API or admin secrets leaked in
    const leaked = FORBIDDEN_MAINTENANCE_SECRETS.filter((k) => String(env[k] || '').length > 0);
    if (leaked.length) throw new Error('MAINTENANCE_SECRET_BOUNDARY_VIOLATION: ' + leaked.join(', '));
}
