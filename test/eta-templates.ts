import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseSync } from 'oxc-parser';
import * as templates from '../client/eta-templates.ts';
import { escapeHtml, escapeDoubleQuotedHtml, type HtmlValue } from '../client/html.ts';
import { legacyHtml } from '../client/eta-runtime.ts';
import { generateTemplates } from '../tools/eta-generate.ts';

interface TemplateBaseline {
  name: string;
  literal: string;
  quasis: string[];
  modes: ('html' | 'double' | 'raw')[];
}
interface TemplateManifest {
  name: string;
  source: string;
  slots: { name: string; escaped: boolean; doubleQuoted?: boolean; policy: string }[];
}
const baseline = JSON.parse(
  fs.readFileSync(new URL('./fixtures/eta-baseline.json', import.meta.url), 'utf8'),
) as { commit: string; templates: TemplateBaseline[] };
const manifest = JSON.parse(
  fs.readFileSync(new URL('../client/templates/manifest.json', import.meta.url), 'utf8'),
) as TemplateManifest[];
assert.equal(baseline.commit, '0e5bd0410b51d67fffba5b9866dc5f3d12bab88f');
assert.deepEqual(
  manifest.map((entry) => entry.name),
  baseline.templates.map((entry) => entry.name),
);
const etaPackage = JSON.parse(
  fs.readFileSync(new URL('../node_modules/eta/package.json', import.meta.url), 'utf8'),
) as { version: string };
assert.equal(etaPackage.version, '4.6.0', 'Compiler API is audited at the exact pinned version');
const values: HtmlValue[] = [
  null,
  undefined,
  false,
  0,
  12.5,
  '',
  'Pilot\'s &amp; <img src=x onerror=attack()> "quoted" 船 🚀',
  '\n\t<&>',
];
assert.throws(
  () => legacyHtml(Symbol('unsupported')),
  TypeError,
  'Template interpolation never silently stringifies Symbols',
);
assert.equal(legacyHtml({ [Symbol.toPrimitive]: (hint: string) => hint }), 'string');
let assertions = 0;
for (const expected of baseline.templates) {
  const entry = manifest.find((template) => template.name === expected.name)!;
  const render = Reflect.get(templates, expected.name) as (
    model: Record<string, unknown>,
  ) => string;
  assert.equal(typeof render, 'function', expected.name);
  for (const value of values) {
    const model: Record<string, unknown> = {};
    let html = expected.quasis[0];
    for (let index = 0; index < entry.slots.length; index++) {
      const slot = entry.slots[index];
      assert.ok(slot.policy.length > 0);
      const mode = expected.modes[index];
      assert.equal(slot.escaped ? (slot.doubleQuoted ? 'double' : 'html') : 'raw', mode);
      model[slot.name] = mode === 'raw' ? legacyHtml(value) : value;
      html +=
        (mode === 'html'
          ? escapeHtml(value)
          : mode === 'double'
            ? escapeDoubleQuotedHtml(value)
            : String(value)) + expected.quasis[index + 1];
    }
    assert.equal(render(model), html, expected.name);
    assertions++;
  }
}
// Two compiler passes must neither change checked-in output nor rewrite its timestamp.
const generatedUrl = new URL('../client/eta-templates.ts', import.meta.url);
const before = fs.readFileSync(generatedUrl, 'utf8');
const modified = fs.statSync(generatedUrl).mtimeMs;
assert.equal(await generateTemplates(true), manifest.length);
assert.equal(await generateTemplates(true), manifest.length);
assert.equal(fs.readFileSync(generatedUrl, 'utf8'), before);
assert.equal(fs.statSync(generatedUrl).mtimeMs, modified);

function inspect(node: unknown, callback: (node: Record<string, unknown>) => void): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) inspect(child, callback);
    return;
  }
  const record = node as Record<string, unknown>;
  if (typeof record.type === 'string') callback(record);
  for (const child of Object.values(record)) inspect(child, callback);
}
type SyntaxNode = Record<string, unknown>;
const originalNodes = new Map<string, SyntaxNode>();
for (const entry of baseline.templates) {
  const parsed = parseSync('eta-baseline.ts', 'const originalView = ' + entry.literal + ';');
  assert.equal(parsed.errors.length, 0, entry.name);
  const declaration = parsed.program.body[0];
  assert.ok(declaration.type === 'VariableDeclaration');
  const original = declaration.declarations[0].init;
  assert.ok(original);
  originalNodes.set(entry.name, original as unknown as SyntaxNode);
}
const seen = new Set<string>();
let provenanceChecks = 0;
function normalize(value: unknown, expand = true): unknown {
  if (Array.isArray(value)) return value.map((child) => normalize(child, expand));
  if (!value || typeof value !== 'object') return value;
  const node = value as SyntaxNode;
  if (node.type === 'ParenthesizedExpression') return normalize(node.expression, expand);
  if (expand && node.type === 'CallExpression') {
    const callee = node.callee as { name?: string };
    const original = originalNodes.get(callee.name!);
    if (original) {
      const entry = manifest.find((template) => template.name === callee.name)!;
      seen.add(entry.name);
      const argumentsList = node.arguments as SyntaxNode[];
      if (entry.slots.length) {
        assert.equal(argumentsList.length, 1, entry.name);
        const model = argumentsList[0];
        assert.equal(model.type, 'ObjectExpression', entry.name);
        const properties = model.properties as { key: { name: string }; value: SyntaxNode }[];
        const expressions = original.expressions as SyntaxNode[];
        assert.equal(properties.length, entry.slots.length, entry.name);
        for (let index = 0; index < entry.slots.length; index++) {
          const slot = entry.slots[index];
          const property = properties[index];
          assert.equal(property.key.name, slot.name, entry.name);
          let actual = property.value;
          let expected = expressions[index];
          if (slot.escaped) expected = (expected.arguments as SyntaxNode[])[0];
          else {
            assert.equal(actual.type, 'CallExpression', entry.name + '.' + slot.name);
            assert.equal((actual.callee as { name: string }).name, 'legacyHtml', entry.name);
            assert.equal((actual.arguments as unknown[]).length, 1);
            actual = (actual.arguments as SyntaxNode[])[0];
          }
          assert.deepEqual(
            normalize(actual),
            normalize(expected, false),
            entry.name + '.' + slot.name + ' changed its original input expression',
          );
          provenanceChecks++;
        }
      } else assert.equal(argumentsList.length, 0, entry.name);
      return normalize(original, false);
    }
  }
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => !['start', 'end', 'raw', 'loc'].includes(key))
      .map(([key, child]) => [key, normalize(child, expand)]),
  );
}
const sinksByOwner: Record<string, number> = {};
// Guard the browser boundary, not textual occurrences inside rendered game prose.
for (const name of fs
  .readdirSync(new URL('../client/', import.meta.url))
  .filter((name) => name.endsWith('.ts'))) {
  const source = fs.readFileSync(new URL('../client/' + name, import.meta.url), 'utf8');
  const parsed = parseSync(name, source);
  assert.equal(parsed.errors.length, 0, name);
  if (name !== 'eta-templates.ts') normalize(parsed.program);
  inspect(parsed.program, (node) => {
    if (node.type === 'AssignmentExpression') {
      const left = node.left as { type: string; property?: { name?: string } };
      if (
        left.type === 'MemberExpression' &&
        ['innerHTML', 'outerHTML'].includes(left.property?.name || '')
      )
        sinksByOwner[name] = (sinksByOwner[name] || 0) + 1;
    }
    if (node.type === 'ImportDeclaration')
      assert.ok(!/^eta(?:\/|$)/.test((node.source as { value: string }).value), name);
    if (node.type === 'CallExpression' || node.type === 'NewExpression') {
      const callee = node.callee as { type: string; name?: string };
      assert.ok(callee.type !== 'Identifier' || !['eval', 'Function'].includes(callee.name!), name);
    }
    if (name !== 'eta-templates.ts' && node.type === 'TemplateLiteral')
      for (const quasi of node.quasis as { value: { cooked: string } }[])
        assert.ok(!/[<>]/.test(quasi.value.cooked), name + ' contains authored HTML');
    if (
      name !== 'eta-templates.ts' &&
      name !== 'html.ts' &&
      node.type === 'Literal' &&
      typeof node.value === 'string'
    )
      assert.ok(!/[<>]/.test(node.value), name + ' contains authored HTML');
  });
}
assert.deepEqual(
  sinksByOwner,
  {
    'chat-projection.ts': 1,
    'cockpit-state.ts': 1,
    'coop_ui.ts': 2,
    'economy-ui.ts': 1,
    'main.ts': 5,
    'radio.ts': 2,
    'ship-functions.ts': 2,
    'ui.ts': 21,
  },
  'All 35 original HTML sinks remain in the audited owner set',
);
assert.equal(
  seen.size,
  manifest.length,
  'Every template is used by an audited application call site',
);
console.log(
  'Original expression provenance: ' + provenanceChecks + ' scalar/child slots verified.',
);
console.log(
  'Eta parity: ' +
    manifest.length +
    ' independently captured original literals, ' +
    assertions +
    ' output cases; deterministic and compiler-free browser boundary.',
);
