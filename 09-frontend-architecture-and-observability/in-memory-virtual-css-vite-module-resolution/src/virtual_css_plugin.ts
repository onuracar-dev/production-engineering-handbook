// Excerpt: the body of the original project's Vite plugin factory (compileSource comes from its compiler).

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
