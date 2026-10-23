# Development tools

Use the pinned Node runtime described in [TYPESCRIPT-RUNTIME.md](TYPESCRIPT-RUNTIME.md).
Install with `npm ci`. Linux and Apple Silicon macOS need no global tools;
Windows requires the native compiler setup below before installation.

| Command                | Scope                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`         | Oxlint correctness rules across JavaScript and TypeScript, then type-aware lint for application, test and tool `.ts` sources |
| `npm run lint:fix`     | Oxlint safe fixes; review the diff before committing                                                                         |
| `npm run format`       | Oxfmt formatting across supported source, configuration and documentation files                                              |
| `npm run format:check` | Read-only formatting gate                                                                                                    |
| `npm run typecheck`    | Rust tsrs checks for application, core, tools and tests                                                                      |
| `npm run test:types`   | Valid and deliberately invalid contract fixtures                                                                             |

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
not the Rust tsrs checker. `tools/lint-types.ts` discovers all application, test and tool `.ts`
files without shell-specific glob expansion. The type-aware scope covers application modules, regression harnesses and developer tools.
Strict compiler projects also check the complete test and tool inventories. The build and
typecheck commands reject unchecked JavaScript inside application source directories.

Oxfmt 0.74.0 replaces the direct Prettier dependency. `.oxfmtrc.json` keeps single
quotes, 100-column lines and the existing save/output exclusions. Import and
package-field sorting are disabled to preserve module evaluation and review
order. The pre-commit hook runs lint and formatting checks; CI also runs types,
contracts and regression suites. Windows CI exercises the same native-tool gates.

## One compiler for checking and emission

The pinned Rust compiler, tsrs 0.18.0-ts7.1.0-dev.20260929, performs all type
checks, contract checks and ordinary-module JavaScript emission. There are no tsc command paths
or duplicate compiler gates. The build preserves relative import rewriting and
checks types before emitting browser and server modules.

The pinned npm release includes Linux x64/ARM64 and Apple Silicon macOS binaries,
but no Windows binary. Native Windows CI builds the same release from upstream
commit `5f92808bc92bb97b06212153ab73d28d551c0b9b`, using its Rust 1.99.1 toolchain
and locked dependencies. It sets `TSRS_BINARY` to the resulting native executable
before `npm ci`, then runs the same checks and Windows persistence regressions.
A compiler build failure fails the job; no fallback checker or skipped gate is used.

Windows contributors need Rust 1.99.1 and the MSVC C++ build tools. Check out the
pinned upstream commit, then run:

```powershell
$env:TSRS_TS_VERSION = '7.1.0-dev.20260930.4'
cargo +1.99.1 build --profile ci --locked -p tsrs_cli --bin tsrs
$env:TSRS_BINARY = (Resolve-Path target/ci/tsrs.exe).Path
```

Keep `TSRS_BINARY` set when installing dependencies and running project commands.
The compiler’s conformance goal is not a guarantee of compatibility; positive and
negative contract fixtures and compiled-runtime regressions remain required.

Oxc Parser 0.155.0 replaces the feature-inventory test’s indirect use of
Prettier’s Babel parser. The test walks its ESTree AST, checks parse diagnostics
and still verifies all 20 providers against the unchanged dependency inventory.
Ordinary source modules remain debuggable. Native online runtime and SDK bundles
are the exceptions described below; existing ordinary Node and browser module
resolution remains unchanged.

## Native runtime build and tests

`npm run build` also runs the native build path in `tools/build-nakama.ts`.
esbuild bundles the shared Game and its dependencies; Babel 8 lowers syntax only
for the ES5 Nakama artifact at `dist/nakama/quantum-rift.js`. These tools do not
replace tsrs as the checker/emitter of ordinary application modules. The official
Nakama JavaScript SDK 2.8.0 browser transport is bundled locally; no external
script CDN is required. The unchanged official `server/nakama-runtime.d.ts` is
excluded from formatting to preserve upstream bytes, not to relax application
formatting or type gates. See [third-party notices](third-party/README.md).

Native fixture prerequisites:

- `node tools/runtime/install-nakama.ts` installs the checksum-verified official
  Linux x64 Nakama 3.41.0 binary at
  `.artifacts/nakama/nakama-3.41.0/nakama`. It does not deploy or start a service.
- Tests accept `NAKAMA_BINARY` for an operator-provided binary on other platforms.
- Set `POSTGRES_BIN` to the PostgreSQL executable directory reported by
  `pg_config --bindir`; native fixtures require it. CI supplies this setting.
- Browser cases also require Playwright Chromium, installed with
  `npx playwright install --with-deps chromium`.

Run `npm run test:regression:unit`, `npm run test:regression:browser`, or the full
`npm run test:regression` command. The native helper starts disposable
PostgreSQL/Nakama services with isolated storage and bounded cleanup; it does not
use player saves, production credentials or an existing service. See
[native coverage](TEST-COVERAGE.md#native-online-authority) for what those tests
establish. Production service configuration remains an operator prerequisite,
documented in [NAKAMA.md](NAKAMA.md).

## Upstream references

- [Oxlint](https://oxc.rs/docs/guide/usage/linter.html)
- [Type-aware lint](https://oxc.rs/docs/guide/usage/linter/type-aware.html)
- [Oxfmt](https://oxc.rs/docs/guide/usage/formatter) and [configuration](https://oxc.rs/docs/guide/usage/formatter/config-file-reference.html)
- [Parser](https://oxc.rs/docs/guide/usage/parser.html)
- [Transformer](https://oxc.rs/docs/guide/usage/transformer.html)
- [tsrs](https://github.com/oxc-project/tsrs) and [compatibility](https://github.com/oxc-project/tsrs/blob/main/docs/COMPATIBILITY.md)
