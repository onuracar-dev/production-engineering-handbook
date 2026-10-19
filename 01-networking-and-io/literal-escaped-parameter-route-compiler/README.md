# Systems Engineering Case Study: Dynamic Parameter Route Compiler with Literal Metacharacter Escaping

---

## 1. Problem

Client-side Single Page Application routers that support file-system-style parameter routes (such as Next.js/SvelteKit `/users/[userId]/posts/[postId]`) compile paths into regular expressions. If static path segments contain literal regex characters—such as version dots (`/docs/v1.0/[slug]`) or parentheses (`/releases/(draft)/[id]`)—naive string substitution produces unescaped regular expressions, causing wildcard injection, unintended matches, or syntax crashes.

---

## 2. Why Naive Approaches Fail

1. **Unescaped Dot Wildcards:**
   * `/docs/v1.0/[slug]` compiles to `/docs/v1.0/([^/]+)`. Because `.` is an unescaped regex wildcard, `/docs/v1x0/slug` falsely matches!
2. **Parentheses Capture Group Corruption:**
   * Literal parentheses `/(draft)/` alter regex capture group numbering, shifting parameter extraction indices.
3. **Query String Contamination:**
   * Matching raw `window.location.href` without pathname isolation causes query parameters (`?preview=true`) to pollute dynamic route parameters.

---

## 3. Architecture

1. **Metacharacter Escaping Pass:** `escapeRegex()` replaces all special characters (`.*+?^${}()|[]\`) with escaped literals (`\\`).
2. **Bracket Parameter Tokenization:** Scans route paths for bracket tokens (`/[([^]]+)]/g`). Each token compiles into `([^/]+)` while its identifier is pushed to `paramNames`.
3. **URL Pathname Isolation:** Normalizes URLs via `new URL(url, 'http://localhost').pathname`, cleanly stripping query strings and hash anchors before route evaluation.
4. **Reactive Navigation Signals:** Successfully matched routes update `currentPath` and `currentParams` signals, waking only subscribed UI components.

```typescript
// 1. Literal regex metacharacter escaping pass
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 2. Compiling [param] paths into safe regular expressions
function compileRoutePath(path: string): { regex: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];
  const parameterPattern = /\[([^\]]+)\]/g;
  let regexPath = '';
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = parameterPattern.exec(path)) !== null) {
    regexPath += escapeRegex(path.slice(cursor, match.index));
    regexPath += '([^/]+)';
    paramNames.push(match[1]);
    cursor = match.index + match[0].length;
  }

  regexPath += escapeRegex(path.slice(cursor));
  return { regex: new RegExp(`^${regexPath}$`), paramNames };
}
```

---

## 4. Behavior Comparison

| Route Pattern Matching | Version Dots (`/v1.0/`) | Parentheses (`/(draft)/`) | Parameter Extraction |
|---|---|---|---|
| Naive String Replace | Matches `v1x0` (Wildcard Dot) | Broken Capture Groups | Mismatched Indices |
| Path-to-Regexp (Heavy) | Escaped | Escaped | Requires Extra Dependency |
| **FluxDOM Route Compiler** | **Strict Literal (`v1\.0`)** | **Strict Literal (`\(draft\)`)** | **Preserves parameter indices** |

_Qualitative comparison. Numbers appear only where a script in this folder measures them._

---

## 5. Implementation

See implementation in [`src/route_compiler.ts`](./src/route_compiler.ts).

---

## 6. How to Verify

Run the automated test suite using Node.js built-in test runner with native TypeScript type stripping (requires Node 22.6+):

```bash
node --experimental-strip-types --test test/route_compiler.test.ts
```

### Verified Output:
```text
✔ route with dot literal (/v1.0/[id]) matches exact dot and rejects wildcard matches (/v1x0/[id]) (1.54ms)
✔ route with parenthesis literal (/(draft)/[slug]) treats parentheses literally without capturing groups (0.27ms)
✔ escapeRegex escapes all standard regex metacharacters (0.19ms)
ℹ tests 3
ℹ suites 0
ℹ pass 3
ℹ fail 0
```

* **Test Environment:** Node.js v24.17.0, Windows 11, 2026-10-17 (no external dependencies, native type stripping)

---

## 7. Visual Representation

![Visual Architecture Card](./assets/code-card.png)
