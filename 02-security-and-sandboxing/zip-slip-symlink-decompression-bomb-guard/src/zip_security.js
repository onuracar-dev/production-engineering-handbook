// Excerpt from the original project's ZIP extractor (entry, names, stream and the quota counters come from the surrounding loop).

// 1. Bitmask POSIX file type inspection before extraction
const unixType = (entry.externalFileAttributes >>> 16) & 0o170000;
if (!safeEntryName(entry.fileName)) throw new AppError('Unsafe path.', 'ZIP_SLIP_DETECTED');
if (unixType === 0o120000) throw new AppError('Symlinks rejected.', 'ZIP_SYMLINK_DETECTED');
// Only regular files, directories or entries without POSIX mode bits pass (no FIFOs, sockets, devices)
if (![0, 0o100000, 0o040000].includes(unixType)) throw new AppError('Special file rejected.', 'ZIP_SPECIAL_FILE_DETECTED');

// 2. Prevent case-collision attacks on case-insensitive filesystems
const folded = normalized.toLocaleLowerCase('en-US');
if (names.has(folded)) throw new AppError('Path collision.', 'ZIP_PATH_COLLISION');
names.add(folded);

// 3. Exclusive file creation with user-only permissions (O_CREAT | O_EXCL)
const output = fs.createWriteStream(absolute, { flags: 'wx', mode: 0o600 });

// 4. In-flight stream data listener destroys stream if headers lied
stream.on('data', (chunk) => {
    written += chunk.length;
    total += chunk.length;
    if (written > maxFileBytes || total > maxUncompressedBytes) {
        stream.destroy(new AppError('Quota exceeded.', 'ZIP_BOMB_DETECTED'));
    }
});