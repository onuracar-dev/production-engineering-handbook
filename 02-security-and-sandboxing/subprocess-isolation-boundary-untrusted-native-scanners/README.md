# Systems Engineering Case Study: Subprocess Isolation Boundary & Sanitized Environment Stripping for Untrusted Scanners

---

## 1. Problem

Running native CLI security scanners (such as `osv-scanner`) against untrusted user code repositories introduces container breakout risks. Third-party scanner binaries can be tricked into reading local developer/server secrets (`~/.ssh/id_rsa`, `~/.gitconfig`, `.env`) or consuming unbounded RAM via inflated stdout JSON payloads.

---

## 2. Why Naive Approaches Fail

1. **Direct Child Process Spawning (`child_process.exec`):**
   * Inherits all parent container environment variables (API secrets, database credentials) and runs under default shell execution vulnerable to command injection.
2. **Standard Process Termination (`child.kill()`):**
   * On Linux/macOS, calling `kill()` on a parent process leaves orphaned child worker processes running in the background.
3. **Persisting Customer Code in Memory:**
   * Holding decrypted customer source archives in Node.js Buffers indefinitely exposes sensitive intellectual property to heap dumps and side-channel memory reads.

---

## 3. Architecture

1. **Isolated Subprocess Wrapper:** Enforces execution strictly through a dedicated `isolationRunner` sandbox wrapper. Direct execution is rejected fail-closed with `OSV_ISOLATION_UNAVAILABLE`.
2. **Environment Stripping & Synthetic Home:** Wipes all environment variables except essential paths, explicitly setting `HOME: '/nonexistent'` to prevent scanners from reading developer dotfiles (`.ssh`, `.npmrc`).
3. **Detached Process Tree Killing:** Spawns with `detached: true` on POSIX, allowing `process.kill(-child.pid, 'SIGKILL')` to terminate the entire process group cleanly upon timeout or client abort.
4. **Stdout Byte Ceiling:** Stream-level listener tallies stdout chunks and kills the process immediately if output exceeds 25 MB (`maxOutputBytes`), neutralizing memory inflation attacks.
5. **Zero-Fill RAM Buffer Overwrite:** Calls `context.sourceBuffer.fill(0)` immediately upon extraction, physically erasing proprietary source code from V8 memory.

```javascript
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
```

---

## 4. Behavior Comparison

| Subprocess Execution Model | Credential Leakage Surface | Orphaned Zombie Processes | Memory Retention |
|---|---|---|---|
| Direct `exec` / `spawn` | High (Full `process.env` Inherited) | Frequent (Standard `kill`) | Indefinite (Heap Retained) |
| Docker-in-Docker | High Overhead / Privileged Daemon | Medium | Heavy Disk Footprint |
| **Sanitized Subprocess Boundary** | **Stripped (`HOME=/nonexistent`)** | **Kills process group (`-child.pid`)** | **Immediate Zero-Fill Wipe** |

_Qualitative comparison. Numbers appear only where a script in this folder measures them._

---

## 5. Implementation

See implementation in [`src/osv_sandbox.js`](./src/osv_sandbox.js).

---

## 6. Visual Representation

![Visual Architecture Card](./assets/code-card.png)
