# Systems Engineering Case Study: In-Memory Virtual CSS Module Resolution & Vite Pipeline Integration

---

## 1. Problem

Compiling Single File Components containing `<style scoped>` blocks requires extracting CSS and feeding it into modern bundlers (like Vite, PostCSS, or Tailwind). Naive plugins write temporary CSS files to disk (e.g. `.tmp/component.css`), causing disk I/O bottlenecks, file watcher loops during Hot Module Replacement (HMR), and file system race conditions across concurrent worker threads.

---

## 2. Why Naive Approaches Fail

1. **Disk I/O Bottlenecks:**
   * Writing intermediate CSS files to `.tmp` on every keystroke wears SSDs and slows HMR feedback loops.
2. **File Watcher Thrashing:**
   * Writing temporary files triggers Vite's internal file system watcher, creating infinite build loops.
3. **Dirty Working Trees:**
   * Residual temporary files pollute source directories and risk accidental git commits.

---

## 3. Architecture

1. **In-Memory Buffer Cache:** Holds compiled, scoped CSS strings in a process-level `Map<string, string>()` keyed by the component's unique file ID.
2. **Rollup Virtual Module Convention (`\0`):** `resolveId()` prefixes virtual CSS identifiers with a null byte (`\0${id}`). This tells Rollup and Vite that the module is a virtual asset not present on the physical disk.
3. **Seamless Vite Pipeline Forwarding:** In `transform()`, appending `import "${id}.css";` instructs Vite to process the virtual module through its native CSS pipeline (PostCSS, CSS modules, autoprefixer, minifier) entirely in RAM.
4. **HMR Coordination (original project, not in `src/`):** Sends full-reload WebSocket signals directly to `server.ws` when `.flow` components change.

```typescript
// 1. In-memory virtual CSS storage avoiding temporary disk file writes
const cssMap = new Map<string, string>();

return {
  name: 'vite-plugin-FluxDOM',
  enforce: 'pre',

  // 2. Resolve virtual CSS identifiers using Rollup null-byte convention
  resolveId(id) {
    if (id.endsWith('.flow.css')) return '\0' + id;
    return null;
  },

  // 3. Load virtual CSS directly from memory
  load(id) {
    if (id.startsWith('\0') && id.endsWith('.flow.css')) {
      // Strip the leading \0 and the trailing ".css" only; replace('.css') would hit the first match in the path
      const actualId = id.slice(1, -'.css'.length);
      return cssMap.get(actualId) || '';
    }
    return null;
  },

  // 4. Transform .flow SFC: extract scoped CSS and inject virtual import
  transform(code, id) {
    if (!id.endsWith('.flow')) return null;
    const { js, css } = compileSource(code, id);
    if (css) cssMap.set(id, css);

    return {
      code: css ? `${js}\nimport ${JSON.stringify(`${id}.css`)};` : js,
      map: null,
    };
  }
};
```

---

## 4. Behavior Comparison

| Single File Component CSS Pipeline | Disk I/O Overhead | Vite HMR File Watcher Loops | Memory Footprint |
|---|---|---|---|
| Disk Temporary Files (`.tmp/*.css`) | Heavy (Disk Writes per Keystroke) | Vulnerable (Watches Temp Dirs) | Disk + Heap |
| Inline Injected Style Tags | Bypasses PostCSS/Minifier | Broken (No CSS Extraction) | Low |
| **Rollup `\0` Virtual Module Cache** | **In-memory RAM buffer (No disk writes)** | **Ignored by physical disk watcher** | **Bounded (Process-level string Map)** |

_Qualitative comparison. Numbers appear only where a script in this folder measures them._

---

## 5. Implementation

See implementation in [`src/virtual_css_plugin.ts`](./src/virtual_css_plugin.ts).

---

## 6. Visual Representation

![Visual Architecture Card](./assets/code-card.png)
