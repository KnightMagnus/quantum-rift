# Browser HTML templates

All runtime-authored HTML lives in `client/templates/*.eta`. The static `client/index.html` shell is not a runtime template. View-model decisions, collection mapping and child composition stay in native TypeScript; IDs, attributes, whitespace and literal markup are owned by Eta sources. Empty-string DOM clears and DOM APIs that set text are not templates.

## Build boundary

Eta **4.6.0** is an exact, development-only dependency. `tools/eta-generate.ts` inspects the manifest, reads authored sources and emits `client/eta-templates.ts`. Run `npm run templates:generate` after editing templates; `npm run templates:check` checks deterministic byte identity without writing. Build runs generation before strict tsrs compilation. Generated output is checked in so source-native tests can import the same static functions as the compiled browser. Oxfmt formats the generated TypeScript deterministically.

The pinned installed API's `compileToString` returns a function _body_, including include/layout closures that refer to Eta context. Instead of constructing a Function or copying those closures into the browser, our generator uses the installed `compileBody(parse(source))` API for interpolation-only templates. Configuration is `useWith:false`, `debug:false`, `autoTrim:false`. Only `<%= it.namedField %>` and `<%~ it.namedField %>` tags are accepted. Includes, layouts, executable tags, arbitrary expressions, filters and runtime template compilation are deliberately unsupported. Composition invokes imported, generated child functions in TypeScript instead. The generator validates every tag against the manifest's ordered, typed model.

Browser modules import only generated functions, existing escaping helpers and the tiny typed fragment boundary. They never import Eta or evaluate template source. The packaged-runtime regression proves emitted Eta view/runtime modules ship and an extracted game starts without node_modules.

Build preserves an existing dist directory by moving it into a unique `.artifacts/dist-before-*/dist` directory rather than deleting it. These preserved outputs are ignored by Git and excluded from package inventories.

## Escaping and raw composition

- Normal escaped fields use the existing `escapeHtml` helper, including nullish-to-empty behavior and apostrophes as `&#39;`. Pass the original primitive, not an already escaped value.
- Fields with `doubleQuoted:true` retain `escapeDoubleQuotedHtml`'s intentional literal-apostrophe behavior. Eta's compiled escape call is wired to that helper per field; neither helper's policy changes.
- Raw fields require `LegacyHtmlFragment`. `legacyHtml(value)` marks an existing, reviewed raw interpolation and preserves original String conversion. It is **not a sanitizer** and is not a permission to insert arbitrary user content. Existing raw numbers, local attribute flags, catalog labels, URL/style policies, pre-escaped aggregates and rendered child markup retain their previous policy exactly. New user text must use an escaped field.
- Escaping alone does not validate URLs, CSS or scripts. Do not broaden existing URL/style sources in this migration.

The manifest records each original source expression and escaping policy. The frozen baseline was matched against AST literals from commit `0e5bd0410b51d67fffba5b9866dc5f3d12bab88f`, not rendered by the new implementation. The unit regression checks all 596 original literal shapes, 4,768 primitive/entity/Unicode/malicious-value outputs, and all 1,377 original model-expression trees (expanding nested generated calls). This audits the 1,086 existing raw interpolations against their original expressions rather than declaring every raw string intrinsically safe. Every template must be reached by an audited call site. Baselines are compatibility evidence: do not regenerate them from replacement output to silence a failure.

## Verification

`test/eta-templates.ts` also checks generation determinism, authored-markup coverage and that browser ASTs contain no Eta imports or eval/Function calls. `test/eta-templates-browser.ts` serves real emitted modules under a strict self-only script CSP, proves dynamic compilation is blocked, and exercises nested mission/contract/direct-message fragments, malicious text and quoted attributes, delegated actions, preserved input drafts, focus and scroll. Existing canonical game browsers continue to cover the full UI. Both regressions are registered in `test/regression-manifest.json`.

For preservation-only verification, set an absolute `RIFT_PRESERVE_FILES` directory on the same filesystem and preload `test/helpers/preserve-files.ts` through `NODE_OPTIONS=--import=/absolute/repository/test/helpers/preserve-files.ts`. It changes existing fixture and journal cleanup from deletion to rename, retaining path-removal semantics and all evidence. It is opt-in test tooling, not application behavior. Do not run deleting fixtures unchanged when preservation is required.
