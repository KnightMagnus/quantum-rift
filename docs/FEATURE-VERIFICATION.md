# Feature regression fixtures

## Independent reference

`test/fixtures/features-v26.json` uses baseline commit
`47bea35a9f3d773efa9a9f075e5b361d9533b390`. The fixture records deterministic
world/login behavior, a sanitized save, layered bonuses and stats, world payloads
and case-insensitive session lookup. Keep this reference independent of the
implementation being checked; see [FEATURES.md](FEATURES.md) for capture commands.

## Checks

- `npm run typecheck` checks the declared JSDoc scope without emitting code.
- `npm run test:features` compares behavior with the reference and checks
  capabilities, inventory, dispatch and authorization.
- `npm run test:types` checks that valid calls compile and invalid arguments or
  missing capabilities fail compilation.
- `npm run test:regression` runs the canonical server and browser inventory.
- `git diff --check` checks whitespace.

For a reproducible simulation, run
`node --import ./test/seed-random.js test/<suite>.js`. The default seed is 123456789. A seeded pass does not cover all random traffic or escort scenarios.

## Limits

Type checking covers composition boundaries and Fleet Commands, not every legacy
feature body or the complete save/wire schemas. Legacy state remains on
`Game` behind explicit capability accessors. See [FEATURES.md](FEATURES.md) for
coverage and [TEST-COVERAGE.md](TEST-COVERAGE.md) for behavior-test limits.

Code changes do not establish distribution rights for inherited game assets.
