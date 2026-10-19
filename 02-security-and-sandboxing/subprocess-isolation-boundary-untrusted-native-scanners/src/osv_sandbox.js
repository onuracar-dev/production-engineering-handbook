// Excerpt from the original project's OSV scanner wrapper (timer, context and the isolation runner come from the surrounding code).

// 1. Spawning third-party CLI scanner within isolated sandbox policy
if (!isolationRunner) throw new Error('OSV_ISOLATION_UNAVAILABLE');

const child = spawn(isolationRunner, [...isolationArgs, '--', executable, 'scan', 'source', '-r', root, '--format', 'json'], {
    cwd: root, shell: false, windowsHide: true,
    detached: process.platform !== 'win32',
    env: { PATH: process.env.PATH || '', HOME: '/nonexistent', NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
});

// 2. Kill entire process tree on abort/timeout and cap stdout inflation
const finish = (error, value) => {
    clearTimeout(timer);
    // The group may already be gone after a normal exit; kill(-pid) then throws ESRCH.
    try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
    } catch (err) {
        if (err.code !== 'ESRCH') throw err;
    }
};

// 3. Cryptographic zero-fill RAM buffer wiping immediately after extraction
context.sourceBuffer.fill(0);
