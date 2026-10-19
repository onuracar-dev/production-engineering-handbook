// Excerpt from the original project's queue class: the first block runs in its constructor and
// ensureQueue() is one of its methods. This file does not run on its own.

// 1. Explicit EventEmitter error listener preventing uncaughtException on DB restart
this.boss = new BossClass({ ...connection, schema: 'wpa_queue', migrate: false });
this.boss.on?.('error', (error) => {
    try {
        queueLogger?.error?.('PostgreSQL queue connection failed', {
            component: 'platform-queue',
            errorCode: error?.code || 'POSTGRES_QUEUE_ERROR',
            error
        });
    } catch { /* Logger failure must never terminate API process */ }
});

// 2. Canonical queue enforcement failing closed on unprovisioned queues
async ensureQueue(name) {
    if (!Object.prototype.hasOwnProperty.call(QUEUE_DEFINITIONS, name)) {
        throw new Error(`Queue ${name} is not a canonical worker queue.`);
    }
    await this.start();
    if (this.queues.has(name)) return;
    const queue = await this.boss.getQueue(name);
    if (!queue) throw new Error(`Queue ${name} is not provisioned.`);
    this.queues.add(name);
}
