# Case Study 08: Zip-Slip, Symlink Escapes & 4-Tier Decompression Bomb Guard

> **Domain:** Security & Sandboxing  
> **Source Project:** `WebPageAnalyz (Source Audit)`  
> **Language:** Node.js / yauzl  
> **Key Metric:** Bitmask symlink rejection, in-flight decompression byte tally abort

---

## 1. Problem

Allowing users to upload ZIP archives for source code vulnerability auditing (OSV scanner) introduces severe vulnerabilities: directory traversal escaping the destination folder (Zip-Slip), symlink dereferencing reading host files, and 42.zip decompression bombs.

---

## 2. Why Naive Approaches Fail

1. **Standard `unzip` Shell Executions:**
   * Vulnerable to arbitrary file writes via crafted `../../` entry paths and creates dangling symlinks that point to `/etc/passwd` or `/proc/self/environ`.
2. **Trusting ZIP Central Directory Headers:**
   * Decompression bombs spoof the uncompressed size field in entry headers. Pre-extraction checks believe the file is 10 KB, while decompression yields gigabytes of memory-crashing zeroes.
3. **Case-Insensitive File Clobbering:**
   * Extracting archives containing both `file.js` and `FILE.js` on Windows or macOS APFS causes silent overwrites and security boundary bypasses.

---

## 3. Architecture

1. **POSIX Bitmask Inspection:** Inspects `(entry.externalFileAttributes >>> 16) & 0o170000` before opening entry streams. Only regular files (`0o100000`), directories (`0o040000`) and entries without POSIX mode bits pass; symlinks (`0o120000`), FIFOs, sockets and device nodes fail immediately.
2. **4-Tier Quota Enforcement:** Validates entry count (max 20,000), total uncompressed bytes (max 500 MB), single-file ceiling (max 100 MB), and compression ratios (>200x for files >1 MB).
3. **Stream-Level Chunk Interception:** An active `stream.on('data')` counter tracks written bytes in flight, aborting the stream and deleting file descriptors if headers lied.
4. **Case-Folding & Exclusive Creation:** Tracks lowercase paths to stop case collisions, and writes files with `flags: 'wx', mode: 0o600` to ensure atomic, non-overwriting creation.

---

## 4. Behavior Comparison

| Attack Vector | Naive Unzip | Header-Only Check | **Streamed POSIX Guard** |
|---|---|---|---|
| Zip-Slip Traversal (`../../`) | Vulnerable | Blocked | **Blocked** |
| Symlink Host Escape | Vulnerable | Vulnerable | **Blocked (Bitmask)** |
| Spoofed Header Zip Bomb | Crushes Disk | Crushes Disk | **Aborted In-Flight** |
| Case-Collision Clobbering | Unhandled | Unhandled | **Blocked (Case-Fold)** |

_Qualitative comparison. Numbers appear only where a script in this folder measures them._

---

## 5. Implementation

See implementation in [`src/zip_security.js`](./src/zip_security.js).

---

## 6. Visual Representation

![Visual Architecture Card](./assets/code-card.png)
