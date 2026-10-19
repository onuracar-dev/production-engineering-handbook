import test from 'node:test';
import assert from 'node:assert/strict';
import { transformStyle, scopeSelector } from '../src/scoped_css_transformer.ts';

test('splices scoping attribute BEFORE pseudo-classes and pseudo-elements (:hover, ::before)', () => {
  const hash = 'a1b2c3';

  // Direct unit check on scopeSelector
  assert.equal(scopeSelector('.btn:hover', `[data-fluxdom="${hash}"]`), `.btn[data-fluxdom="${hash}"]:hover`);
  assert.equal(scopeSelector('h1::before', `[data-fluxdom="${hash}"]`), `h1[data-fluxdom="${hash}"]::before`);
  assert.equal(scopeSelector('input:focus-visible', `[data-fluxdom="${hash}"]`), `input[data-fluxdom="${hash}"]:focus-visible`);

  // Transform CSS stylesheet containing pseudo-classes
  const inputCss = `
    .btn:hover { color: red; }
    .card::before { content: ""; }
    a:hover, button:active { outline: none; }
  `;

  const output = transformStyle(inputCss, hash);

  assert.match(output, /\.btn\[data-fluxdom="a1b2c3"\]:hover \{/);
  assert.match(output, /\.card\[data-fluxdom="a1b2c3"\]::before \{/);
  assert.match(output, /a\[data-fluxdom="a1b2c3"\]:hover, button\[data-fluxdom="a1b2c3"\]:active \{/);
});

test('preserves keyframe steps (from, to, percentage) and @-rules without mangling selectors', () => {
  const hash = 'x9y8z7';
  const keyframeCss = `
    @keyframes spin {
      from { transform: rotate(0deg); }
      50% { transform: rotate(180deg); }
      to { transform: rotate(360deg); }
    }
  `;

  const output = transformStyle(keyframeCss, hash);

  // from, 50%, to must NOT have [data-fluxdom="..."] appended
  assert.match(output, /from \{/);
  assert.match(output, /50% \{/);
  assert.match(output, /to \{/);
  assert.doesNotMatch(output, /from\[data-fluxdom=/);
  assert.doesNotMatch(output, /50%\[data-fluxdom=/);
  assert.doesNotMatch(output, /to\[data-fluxdom=/);
});

test('preserves :root and :global(...) selectors without scope injection', () => {
  const hash = 'root123';
  const inputCss = `
    :root { --primary: #0070f3; }
    :global(.modal-overlay) { position: fixed; }
  `;

  const output = transformStyle(inputCss, hash);

  assert.match(output, /:root \{/);
  assert.match(output, /:global\(\.modal-overlay\) \{/);
  assert.doesNotMatch(output, /:root\[data-fluxdom=/);
});

test('keyframe step lists, escaped colons and quoted colons are not mangled', () => {
  const scope = '[data-fluxdom="h"]';
  const output = transformStyle(`
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      from, to { opacity: 0.5; }
    }
  `, 'h');
  assert.match(output, /0%, 100% \{/);
  assert.match(output, /from, to \{/);
  assert.doesNotMatch(output, /data-fluxdom/);

  const escaped = String.raw`.sm\:flex`; // Tailwind-style escaped colon
  assert.equal(scopeSelector(escaped, scope), `${escaped}${scope}`);
  assert.equal(scopeSelector(`${escaped}:hover`, scope), `${escaped}${scope}:hover`);
  assert.equal(scopeSelector('a[href^="mailto:x"]', scope), `a[href^="mailto:x"]${scope}`);
  assert.equal(scopeSelector('a[href^="mailto:x"]:hover', scope), `a[href^="mailto:x"]${scope}:hover`);
});

test('commas inside :not() do not split the selector list', () => {
  assert.equal(
    transformStyle('a:not(.x, .y), p { margin: 0; }', 'h').trim(),
    'a[data-fluxdom="h"]:not(.x, .y), p[data-fluxdom="h"] { margin: 0; }'
  );
});
