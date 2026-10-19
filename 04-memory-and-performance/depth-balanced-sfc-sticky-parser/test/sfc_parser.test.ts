import test from 'node:test';
import assert from 'node:assert/strict';
import { findExpressionEnd, parseAttributes } from '../src/sfc_parser.ts';

test('nested braces and quoted braces are balanced', () => {
  const source = '{items.map(x => ({ val: "}" }))} rest';
  assert.equal(findExpressionEnd(source, 0), source.indexOf(' rest') - 1);
});

test('an escaped backslash before the closing quote still closes the string', () => {
  const source = String.raw`{ a ? "\\" : b }`;
  assert.equal(findExpressionEnd(source, 0), source.length - 1);
  const escapedQuote = String.raw`{ a ? "\"}" : b }`;
  assert.equal(findExpressionEnd(escapedQuote, 0), escapedQuote.length - 1);
});

test('unquoted values do not drop the following attributes', () => {
  const parsed = parseAttributes('id=main class="a" @click="save" :title=\'t\'', 'App.flow');
  assert.deepEqual(parsed.attributes, { id: 'main', class: 'a' });
  assert.deepEqual(parsed.events, { click: 'save' });
  assert.deepEqual(parsed.bindings, { title: 't' });
});
