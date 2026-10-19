// Excerpt from the original project's worker startup (Pool comes from `pg`, options from the env parser).

// 2. Worker startup attestation fails closed on role mismatch
async function assertDatabaseRole(env = process.env, PoolClass = Pool) {
    const pool = new PoolClass(options);
    const actualRole = (await pool.query('SELECT current_user AS role')).rows[0]?.role;
    if (actualRole !== env.DATABASE_EXPECTED_ROLE) {
        throw new Error('WORKER_DATABASE_ROLE_MISMATCH: expected ' + env.DATABASE_EXPECTED_ROLE);
    }
}
