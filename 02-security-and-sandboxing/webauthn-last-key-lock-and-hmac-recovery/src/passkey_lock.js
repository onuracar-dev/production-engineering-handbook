// Excerpt from the original project (store, AppError, secret and verifyPasswordAndTotp come from the surrounding code).

// 1. Concurrent deletion serialized per user; re-counts active credentials
async function deletePasskeyWithLock({ store, userId, passkeyId }) {
    return store.withUserLock(userId, async () => {
        const remaining = await store.countUserPasskeys(userId);
        if (remaining <= 1) {
            throw new AppError('Cannot delete final passkey.', {
                status: 409,
                code: 'ADMIN_FINAL_PASSKEY_REQUIRED'
            });
        }
        // Scoped by userId: a passkeyId from another account deletes nothing
        const deleted = await store.deletePasskey({ userId, passkeyId });
        if (!deleted) throw new AppError('Passkey not found.', { status: 404 });
        await store.logAudit({ action: 'security.webauthn_removed', userId });
    });
}

// 2. Recovery code verification: one-time consumption, clears previous step-ups
async function consumeRecoveryCode({ store, userId, code, password, totpCode }) {
    await verifyPasswordAndTotp(userId, password, totpCode);
    const codeHash = crypto.createHmac('sha256', secret).update(code).digest('hex');
    const consumed = await store.consumeRecoveryCodeHash(userId, codeHash);
    if (!consumed) throw new AppError('Invalid recovery code.', { status: 403 });

    // Revoke previous sessions, increment security version, enforce key re-enrollment
    await store.revokeUserSessions(userId);
    await store.incrementSecurityVersion(userId);
}