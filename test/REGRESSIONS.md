# Durable gameplay regressions

The canonical source is [regression-manifest.json](regression-manifest.json).
See [the system/action inventory](../docs/TEST-COVERAGE.md) for behavior contracts,
implementation owners, test links and honest coverage limits. Follow
[the repository regression contract](../AGENTS.md) for every new feature/change.

Run with Node 22+ and the repository's locked development dependencies:

```sh
npm ci
npx playwright install --with-deps chromium
npm run test:regression
```

`test:regression:unit` runs all registered legacy/recent gameplay, deterministic
simulation/balance, persistence/authentication, protocol, HTTP and real network
client regressions. `test:regression:browser` runs registered Chromium workflows
for existing settings/audio/emulated input, map and Solo save workflows. New
3.0-specific regression cases are registered by later feature layers. CI runs
the groups independently, preserving the original characterization/type checks.

The shared runner isolates subprocesses and temporary saves, seeds fixture RNG,
uses ephemeral server ports, enforces deadlines, cleans up process groups and
retains per-case logs plus JSON summaries under `.artifacts/regression/`.
Override the evidence base with `RIFT_TEST_ARTIFACTS`. CI uploads this evidence
even on failure. Browser tests also save screenshots and diagnostic server logs.
A nonzero exit or deadline failure fails the group; the runner still exercises
remaining registered cases so the failure summary is useful.

To debug one case, run for example:

```sh
node --import ./test/seed-random.js test/v24.js
node test/client-systems-browser.mjs
```
