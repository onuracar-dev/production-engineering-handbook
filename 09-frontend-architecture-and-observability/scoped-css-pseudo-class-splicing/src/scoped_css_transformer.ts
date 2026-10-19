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
