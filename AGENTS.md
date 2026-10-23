# Repository regression contract

Start with [docs/CODE-NAVIGATION.md](docs/CODE-NAVIGATION.md) for the codebase map,
action trace and state-ownership guide.

For every new game feature or behavior change, add or update meaningful durable
regression tests in the same change. Exercise the intended observable outcome and
relevant denial/edge behavior; syntax checks, file-name checks, empty smoke tests
and regenerated snapshots alone are not behavior coverage.

Register each behavior test in `test/regression-manifest.json` (or an explicitly declared
child of a registered test). Newly introduced test programs must not be left
unclassified or silently omitted from CI. Update the system/action mapping and
`docs/TEST-COVERAGE.md` when the covered surface changes. New feature providers and
message actions must have reviewed behavior-test evidence, not just inventory
entries. Run the relevant case while developing and the canonical
`npm run test:regression` before reporting a completed gameplay change; preserve
all pre-existing CI checks. Fix in-scope failures without weakening expectations.

Tests must use isolated temporary saves, deterministic fixtures, bounded waits,
proper process cleanup and failure evidence. External services must use offline
fixtures for CI; do not require player saves, credentials or a running server.
Keep slow/browser tests in the browser CI group and explain intentional coverage
limits. A passing suite does not prove every branch, random seed or device.

## Ship-function cockpit convention

Existing and future special ship functions belong in the shared registry in
client/ship-functions.ts: a distinct accessible icon with a collapsible panel,
in normal flow above chat. Never add fixed-position function panels or offsets
per icon. Keep Mining visible but disabled when unavailable. Capability-specific
Towing, Dredge Processing, Fleet/Formation and Drones appear when applicable.
Retain authoritative action handlers and keyboard routes. New icons require three
labeled alternatives and explicit user selection; provisional artwork is not approval.
Add browser coverage for multiple expanded entries, long chat, keyboard/wheel
reachability and narrow/scaled viewports in the canonical regression manifest.

## Code readability

Use descriptive names for variables, parameters, functions and types. Avoid opaque
abbreviations and single-letter names except for conventional, short-lived indices
or mathematical coordinates whose meaning is immediately clear.

Document native TypeScript types at their declarations. Put field descriptions on
the corresponding interface/type members, not in detached `TypeName fields:` lists
or duplicate JSDoc type declarations. Preserve explanatory text when moving it.

Keep JSDoc type references readable: declare named imported type aliases near the
top of the module and reuse them instead of scattering inline `import(...).Type`
expressions at points of use. Preserve useful type precision; do not replace types
with `any` or introduce runtime imports solely for annotations.

Prefer straightforward control flow, focused functions and explicit dependencies.
Reduce unnecessary nesting and duplication when doing so clarifies intent; avoid
clever shorthand, speculative abstractions and unrelated rewrites. Comments should
explain non-obvious intent or constraints, not narrate obvious operations.

Readability changes must preserve behavior and public contracts, including saved
data and network field names. Keep changes reviewable and run relevant tests, type
checks and formatting checks; do not weaken checks to accommodate a cleanup.

## Documentation language

Write documentation for its readers: describe current behavior, usage, architecture
and necessary limitations accurately. Remove assistant-task instructions, prompt
residue, conversation references, approval chatter and temporary progress updates
from product and technical documentation. Keep durable contributor rules here,
separate from reader-facing product documentation.

Do not include development-diary stories about steps, phases or milestones completed
along the way. Preserve substantive technical facts and user-relevant release notes
without narrating the implementation process. Keep operational handoff notes outside
shipped documentation.

Review all repository-authored documentation prose and code comments for natural,
plain technical language. Use the available humanization workflow to audit first,
then rewrite only where needed. Preserve facts, caveats, examples, links, commands,
JSDoc types and tags, tool directives, and license or attribution notices. Do not
change executable code or quoted third-party material merely to alter its voice.

## Beta save generator maintenance

Keep `test/Save Generator/` functional for every future release while this beta
testing tool remains in the repository. When the version, fresh-save schema, ships,
station sites, landing ports, research or tutorial/radio defaults change, refresh
its catalog with `node "test/Save Generator/export-catalog.ts"` and format the
result. Update its instructions and Windows scripts when their requirements change.

Preserve the generator's custom credits, ship, station location/tier and player-name
controls. Run the registered save-generator import/login and browser regressions;
keep the native Windows EXE build/export check in CI. Import/export must remain
Solo-only and unavailable to online players. Do not remove the tool or its checks
until the human explicitly requests its removal after beta.
