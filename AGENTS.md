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
client/ship-functions.js: a distinct accessible icon with a collapsible panel,
in normal flow above chat. Never add fixed-position function panels or offsets
per icon. Keep Mining visible but disabled when unavailable. Capability-specific
Towing, Dredge Processing, Fleet/Formation and Drones appear when applicable.
Retain authoritative action handlers and keyboard routes. New icons require three
labeled alternatives and explicit user selection; provisional artwork is not approval.
Add browser coverage for multiple expanded entries, long chat, keyboard/wheel
reachability and narrow/scaled viewports in the canonical regression manifest.
