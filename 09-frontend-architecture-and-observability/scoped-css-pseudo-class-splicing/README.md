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

1. **Pseudo-Class Boundary Detection:** Scans selector strings with `selector.search(/:{1,2}[A-Za-z-])` to find the exact index of any pseudo-class or pseudo-element.
2. **Pre-Pseudo Splicing:** Splices `[data-fluxdom="hash"]` *before* the colon (`button[data-fluxdom]:hover`). This preserves browser selector matching and CSS specificity rules.
3. **Keyframe Step Whitelist:** `isKeyframeSelector()` checks for `from`, `to`, and `^\d+(?:\.\d+)?%$`, leaving animation keyframe steps untouched.
4. **At-Rule Pass-Through:** Ignores selectors starting with `@` (`@media`, `@supports`), scoping only inner declarations.

```typescript
// 1. Scope selector transformation attaching attribute before pseudo-classes
function scopeSelector(selector: string, scope: string): string {
  if (selector === ':root' || selector.includes(':global(')) return selector;
  const pseudoIndex = selector.search(/:{1,2}[A-Za-z-]/);
  if (pseudoIndex < 0) return `${selector}${scope}`;
  return `${selector.slice(0, pseudoIndex)}${scope}${selector.slice(pseudoIndex)}`;
}

// 2. Preserving CSS at-rules and keyframe step selectors untouched
function isKeyframeSelector(selector: string): boolean {
  return selector === 'from' || selector === 'to' || /^\d+(?:\.\d+)?%$/.test(selector);
}

export function transformStyle(styleContent: string, hash: string): string {
  if (!styleContent) return '';
  const scope = `[data-fluxdom="${hash}"]`;
  return styleContent.replace(/([^{}]+)\{/g, (full, rawSelector: string) => {
    const selector = rawSelector.trim();
    if (!selector || selector.startsWith('@') || isKeyframeSelector(selector)) return full;
    const scoped = selector.split(',').map((part) => scopeSelector(part.trim(), scope)).join(', ');
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

Run the automated test suite using Node.js built-in test runner with native TypeScript type stripping (requires Node 22.6+):

```bash
node --experimental-strip-types --test test/scoped_css_transformer.test.ts
```

### Verified Output:
```text
✔ splices scoping attribute BEFORE pseudo-classes and pseudo-elements (:hover, ::before) (1.14ms)
✔ preserves keyframe steps (from, to, percentage) and @-rules without mangling selectors (0.24ms)
✔ preserves :root and :global(...) selectors without scope injection (0.17ms)
ℹ tests 3
ℹ suites 0
ℹ pass 3
ℹ fail 0
```

* **Test Environment:** Node.js v24.17.0, Windows 11, 2026-10-17 (no external dependencies, native type stripping)

---

## 7. Visual Representation

![Visual Architecture Card](./assets/code-card.png)
