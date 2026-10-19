# Systems Engineering Case Study: Automated Pre-Flight Shell Script Byte-Level LF Audit & Shebang Verification

---

## 1. Problem

In cross-platform engineering teams, developers working on Windows machines often edit bootstrap scripts, database backup scripts, or Docker entrypoint scripts. Windows editors default to CRLF (`\r\n`) line endings. When pushed and built into Debian, Alpine, or Ubuntu Docker images, executing the script fails with cryptic POSIX kernel errors: `/bin/sh: ./entrypoint.sh: /bin/sh^M: bad interpreter: No such file or directory`, bringing down production deployments during pod startup.

---

## 2. Why Naive Approaches Fail

1. **Relying on Developer Operating System Discipline:**
   * Hoping all developers configure their local IDEs or git configurations with `core.autocrlf = input` is non-deterministic and fails on new developer machines.
2. **Post-Build Dockerfile Workarounds (`dos2unix`):**
   * Running `RUN dos2unix /entrypoint.sh` in Dockerfiles adds container layer overhead and bloat to production base images.
3. **Missing Automated CI Verification:**
   * Linters typically check code syntax, ignoring raw byte-level carriage returns in untracked or auxiliary shell scripts.

---

## 3. Architecture

1. **Git-Aware Shell Discovery:** Executes `git ls-files -z` to discover all tracked files safely across null-terminated byte streams.
2. **Byte-Level Shebang Inspection:** Evaluates raw buffer slices without string conversions. Checks for `.sh` extension or POSIX shebang syntax (`^#!.*(?:/|env\s+)(?:ba|da|a|k|z)?sh`).
3. **Strict Carriage Return Assertion:** Filters buffer bytes for `0x0d` (ASCII carriage return `\r`). Any script containing even a single `\r` immediately fails the test suite.
4. **Git Attributes Enforcement:** Validates repository `.gitattributes` using `git check-attr eol`, ensuring git checkout rules enforce `eol=lf` permanently across all developer environments.

```javascript
// 1. Inspect raw buffer bytes for shebang lines and Windows CRLF carriage returns
function isShellScript(relativePath, bytes) {
    if (relativePath.endsWith('.sh')) return true;
    const newline = bytes.indexOf(0x0a);
    const firstLine = bytes.subarray(0, newline === -1 ? Math.min(bytes.length, 512) : newline).toString('utf8').replace(/\r$/, '');
    return /^#!.*(?:\/|env\s+(?:-\S+\s+)*)(?:ba|da|a|k|z)?sh(?:\s|$)/.test(firstLine); // also `env -S bash -eu`
}

// 2. Automated test asserting no carriage return bytes (0x0d) across all tracked shell files
test('tracked Linux shell scripts use LF-only bytes and explicit Git attributes', () => {
    const scripts = trackedShellScripts();
    const carriageReturns = scripts.filter(({ bytes }) => bytes.includes(0x0d)).map(({ relativePath }) => relativePath);
    assert.deepEqual(carriageReturns, [], `carriage-return bytes found in: ${carriageReturns.join(', ')}`);

    if (scripts.length === 0) return; // `git check-attr eol --` with no paths exits 129
    const checkedAttributes = execFileSync('git', ['check-attr', 'eol', '--', ...scripts.map(s => s.relativePath)], { encoding: 'utf8' });
    // Every script needs eol=lf, not just one of them.
    const missingLf = checkedAttributes.trim().split('\n').filter((line) => !line.endsWith(': eol: lf'));
    assert.deepEqual(missingLf, [], `scripts without eol=lf in .gitattributes: ${missingLf.join(', ')}`);
});
```

---

## 4. Behavior Comparison

| Shell Script Line-Ending Defense | Windows Dev Portability | Production Docker Startup | CI/CD Enforcement |
|---|---|---|---|
| Manual IDE Settings | Fragile (Fails Frequently) | `/bin/sh^M` Crashes | None |
| Dockerfile `dos2unix` | Works | Adds Image Overhead | None (Allows Corrupt Source) |
| **Byte-Level Pre-Flight Test** | **Deterministic (.gitattributes eol=lf)** | **Protected (Rejects \r bytes in CI)** | **Fails Fast Before Merge** |

_Qualitative comparison. Numbers appear only where a script in this folder measures them._

---

## 5. Implementation

See implementation in [`src/shell_line_endings_audit.js`](./src/shell_line_endings_audit.js).

---

## 6. Visual Representation

![Visual Architecture Card](./assets/code-card.png)
