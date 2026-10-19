# Systems Engineering Case Study: Precision Scoped CSS Splicing with Pseudo-Class Specificity Preservation

---

## 1. Problem

Scoped CSS in Single File Components ensures component styles do not leak to other parts of the application. However, naive scoped CSS compilers that simply append attribute selectors to the end of rules (e.g. `button:hover[data-scope]`) corrupt CSS semantics:
1. Attaching attributes after pseudo-classes or pseudo-elements (`button::before[data-scope]`) produces invalid CSS that browsers reject entirely.
2. Transforming keyframe percentage rules (`0% { opacity: 0 }` -> `0%[data-scope]`) breaks CSS animations.

---

## 2. Why Naive Approaches Fail

1. **End-of-String Appending:**
   * `selector + scope` fails on `:hover`, `:focus`, `:disabled`, and pseudo-elements like `::before`.
2. **Animation Keyframe Corruption:**
   * Scoping `from`, `to`, and `50%` selectors inside `@keyframes` blocks breaks animations.
3. **Media Query & At-Rule Mangling:**
   * Naive regex parsers attempt to scope `@media (min-width: 768px)`, producing broken stylesheet syntax.

---

## 3. Architecture

1. **Pseudo-Class Boundary Detection:** Scans the selector at the top level for the first `:` followed by a letter, `-` or `:`, to find the index of the first pseudo-class or pseudo-element. Backslash escapes (`.sm\:flex`), `[attribute]` contents (`a[href^="mailto:x"]`) and quoted strings are skipped, and selector lists are split only on top-level commas, so `:not(.x, .y)` stays whole.
2. **Pre-Pseudo Splicing:** Splices `[data-fluxdom="hash"]` *before* the colon (`button[data-fluxdom]:hover`). This preserves browser selector matching and CSS specificity rules.
3. **Keyframe Step Whitelist:** `isKeyframeSelector()` checks for `from`, `to`, and `^\d+(?:\.\d+)?%$`. A rule is left untouched when every item in its selector list is a keyframe step, so `0%, 100%` and `from, to` are not scoped.
4. **At-Rule Pass-Through:** Ignores selectors starting with `@` (`@media`, `@supports`), scoping only inner declarations.

```typescript
// Walks a selector at the top level only: skips backslash escapes (.sm\:flex),
// [attribute] contents (a[href^="mailto:x"]) and quoted strings.
function scanTopLevel(selector: string, visit: (char: string, index: number, parens: number) => boolean): void {
  let brackets = 0;
  let parens = 0;
  let quote = '';
  for (let index = 0; index < selector.length; index += 1) {
    const char = selector[index];
    if (char === '\\') { index += 1; continue; }
    if (quote) { if (char === quote) quote = ''; continue; }
    if (char === '"' || char === "'") quote = char;
    else if (char === '[') brackets += 1;
    else if (char === ']') brackets -= 1;
    else if (brackets === 0) {
      if (char === '(') parens += 1;
      else if (char === ')') parens -= 1;
      if (visit(char, index, parens)) return;
    }
  }
}

// Splits a selector list on top-level commas only, so :is(a, b) stays whole
export function splitSelectorList(selectorList: string): string[] {
  const parts: string[] = [];
  let start = 0;
  scanTopLevel(selectorList, (char, index, parens) => {
    if (char === ',' && parens === 0) {
      parts.push(selectorList.slice(start, index).trim());
      start = index + 1;
    }
    return false;
  });
  parts.push(selectorList.slice(start).trim());
  return parts;
}

// 1. Scope selector transformation attaching attribute before pseudo-classes
export function scopeSelector(selector: string, scope: string): string {
  if (selector === ':root' || selector.includes(':global(')) return selector;
  let pseudoIndex = -1;
  scanTopLevel(selector, (char, index) => {
    if (char === ':' && /[:A-Za-z-]/.test(selector[index + 1] ?? '')) pseudoIndex = index;
    return pseudoIndex >= 0;
  });
  if (pseudoIndex < 0) return `${selector}${scope}`;
  return `${selector.slice(0, pseudoIndex)}${scope}${selector.slice(pseudoIndex)}`;
}

// 2. Preserving CSS at-rules and keyframe step selectors untouched
export function isKeyframeSelector(selector: string): boolean {
  return selector === 'from' || selector === 'to' || /^\d+(?:\.\d+)?%$/.test(selector);
}

export function transformStyle(styleContent: string, hash: string): string {
  if (!styleContent) return '';
  const scope = `[data-fluxdom="${hash}"]`;
  return styleContent.replace(/([^{}]+)\{/g, (full, rawSelector: string) => {
    const selector = rawSelector.trim();
    if (!selector || selector.startsWith('@')) return full;
    const parts = splitSelectorList(selector);
    // Keyframe step lists such as `0%, 100%` or `from, to` stay untouched
    if (parts.every(isKeyframeSelector)) return full;
    const scoped = parts.map((part) => scopeSelector(part, scope)).join(', ');
    return `${rawSelector.match(/^\s*/)?.[0] ?? ''}${scoped} {`;
  });
}
```

---

## 4. Behavior Comparison

| Scoped CSS Strategy | Pseudo-Class Output (`:hover`) | Pseudo-Element (`::before`) | Keyframe Animations |
|---|---|---|---|
| Naive Suffix Append | `button:hover[data-scope]` (Weaker Specificity) | `button::before[data-scope]` (Syntax Error) | Broken (`50%[scope]`) |
| CSS Modules | Mangled Classnames | Works | Requires Class Remap |
| **Pre-Pseudo Splicing** | **`button[data-scope]:hover`** | **`button[data-scope]::before`** | **Preserved (Keyframe rules untouched)** |

_Qualitative comparison. Numbers appear only where a script in this folder measures them._

---

## 5. Implementation

See implementation in [`src/scoped_css_transformer.ts`](./src/scoped_css_transformer.ts).

---

## 6. How to Verify

Run the automated test suite using Node.js built-in test runner:

```bash
node --experimental-strip-types --test test/scoped_css_transformer.test.ts
```

### Verified Output:
```text
✔ splices scoping attribute BEFORE pseudo-classes and pseudo-elements (:hover, ::before) (1.3112ms)
✔ preserves keyframe steps (from, to, percentage) and @-rules without mangling selectors (0.1849ms)
✔ preserves :root and :global(...) selectors without scope injection (0.1416ms)
✔ keyframe step lists, escaped colons and quoted colons are not mangled (0.1906ms)
✔ commas inside :not() do not split the selector list (0.1369ms)
ℹ tests 5
ℹ suites 0
ℹ pass 5
ℹ fail 0
```

* **Test Environment:** Node.js v24.17.0, Windows 11, 2026-10-19 (no external dependencies, built-in node:test)

---

## 7. Visual Representation

![Visual Architecture Card](./assets/code-card.png)
