# Development tools

Use the pinned Node runtime described in [TYPESCRIPT-RUNTIME.md](TYPESCRIPT-RUNTIME.md).
Install with `npm ci`; no global tool installation is required.

| Command                                          | Scope                                                                                                             |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                                   | Oxlint correctness rules across JavaScript and TypeScript, then type-aware lint for all application `.ts` sources |
| `npm run lint:fix`                               | Oxlint safe fixes; review the diff before committing                                                              |
| `npm run format`                                 | Oxfmt formatting across supported source, configuration and documentation files                                   |
| `npm run format:check`                           | Read-only formatting gate                                                                                         |
| `npm run typecheck`                              | Portable TypeScript checks, including the strict core configuration                                               |
| `npm run typecheck:tsrs`                         | Additional Rust type checks on supported native platforms                                                         |
| `npm run test:types` / `npm run test:types:tsrs` | Valid and deliberately invalid contract fixtures                                                                  |

## Lint and formatting policy

Oxlint 1.89.0 enables the correctness category as errors. Warnings also fail the
gate. Unused imports are removed; an underscore marks intentionally retained
unused bindings where evaluation or a callback signature should stay unchanged.
Object-rest exclusions are allowed so sensitive fields can be omitted from a
copy without reading them. Side-effecting short-circuit/ternary expressions are
allowed. Local, explained exceptions preserve snapshot iteration over mutable
collections and intentional control-character sanitizers; these rules remain
enabled everywhere else.

Type-aware lint uses oxlint-tsgolint 7.0.2004, which uses Go's TypeScript engine,
not the Rust tsrs checker. `tools/lint-types.mjs` discovers all application `.ts`
files without shell-specific glob expansion. The type-aware scope covers all
application modules. JavaScript test harnesses and developer tools receive
ordinary correctness lint. The build and typecheck commands reject unchecked
JavaScript inside application source directories.

Oxfmt 0.74.0 replaces the direct Prettier dependency. `.oxfmtrc.json` keeps single
quotes, 100-column lines and the existing save/output exclusions. Import and
package-field sorting are disabled to preserve module evaluation and review
order. The pre-commit hook runs lint and formatting checks; CI also runs types,
contracts and regression suites. Windows CI exercises the portable gates.

## Why not one Rust compiler?

The pinned tsrs 0.18.0-ts7.1.0-dev.20260929 package publishes Linux x64/ARM64
and Apple Silicon macOS binaries, but no Windows binary. It therefore cannot
replace the portable checker or build for this project's Windows contributors.
Its upstream goal is full TypeScript conformance; that is not a guarantee of
complete compatibility today. Keep `tsc` for the shared typecheck/build path,
and tsrs as an additional Linux CI gate with positive/negative contract tests.

The existing build emits browser modules, rewrites relative `.ts` imports and
checks types before emission. Oxc's transformer can strip TypeScript and lower
syntax, but does not replace those type checks. Replacing this small working
emitter would add custom output/import-rewrite logic without a current benefit.
Oxc Parser 0.155.0 replaces the feature-inventory test’s indirect use of
Prettier’s Babel parser. The test walks its ESTree AST, checks parse diagnostics
and still verifies all 20 providers against the unchanged dependency inventory.
Minification/bundling is not a current release requirement; source modules remain
debuggable. A standalone resolver has no additional consumer: existing Node and
browser module resolution remains unchanged.

## Upstream references

- [Oxlint](https://oxc.rs/docs/guide/usage/linter.html)
- [Type-aware lint](https://oxc.rs/docs/guide/usage/linter/type-aware.html)
- [Oxfmt](https://oxc.rs/docs/guide/usage/formatter) and [configuration](https://oxc.rs/docs/guide/usage/formatter/config-file-reference.html)
- [Parser](https://oxc.rs/docs/guide/usage/parser.html)
- [Transformer](https://oxc.rs/docs/guide/usage/transformer.html)
- [tsrs](https://github.com/oxc-project/tsrs) and [compatibility](https://github.com/oxc-project/tsrs/blob/main/docs/COMPATIBILITY.md)
