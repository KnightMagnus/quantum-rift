import assert from 'node:assert/strict';
import { escapeHtml, escapeDoubleQuotedHtml } from '../client/html.ts';

for (const [value, expected] of [
  [null, ''],
  [undefined, ''],
  [false, 'false'],
  [0, '0'],
  [12.5, '12.5'],
  ['Captain A & B <cargo> "quoted"', 'Captain A &amp; B &lt;cargo&gt; &quot;quoted&quot;'],
  ['&amp; already encoded', '&amp;amp; already encoded'],
  ['船 🚀', '船 🚀'],
]) {
  assert.equal(escapeHtml(value), expected);
  assert.equal(escapeDoubleQuotedHtml(value), expected);
}
assert.equal(escapeHtml("Pilot's <ship>"), 'Pilot&#39;s &lt;ship&gt;');
assert.equal(escapeDoubleQuotedHtml("Pilot's <ship>"), "Pilot's &lt;ship&gt;");
assert.equal(
  escapeHtml('<img src=x onerror="attack()">'),
  '&lt;img src=x onerror=&quot;attack()&quot;&gt;',
);
console.log(
  'Presentation escaping preserves primitive, entity, punctuation and Unicode contracts.',
);
