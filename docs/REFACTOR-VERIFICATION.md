# Explicit-feature refactor verification

Baseline: `47bea35a9f3d773efa9a9f075e5b361d9533b390`.

## Results

- `npm run typecheck`: passed (development-only, no emit).
- `npm run test:features`: passed original/current characterization and
  capability, inventory, dispatch and authorization checks.
- `npm run test:types`: valid calls compile; invalid argument and missing
  capability fail compilation as expected.
- All 23 existing simulation, version, fuzz and balance suites passed in a fresh
  reproducible run using `node --import ./test/seed-random.js test/<suite>.js`.
  Seed: 123456789. Assertions were retained; migrated callers use namespaces.
- Baseline fixture regenerated from an untouched source copy and matched byte
  for byte. All 43 baseline server/shared files were checked against the baseline
  Git tree before accepting that comparison.
- Before restart, network bot checks passed on both original and refactored
  isolated servers. The bot's outdated flat-price expectation was corrected for
  the existing v2.5 bulk pricing rule, retaining exact cargo/credit assertions.
- Before restart, six browser smoke checks passed on each implementation:
  login/landing, jobs, market, departure/snapshots, fleet commands and ship info.
  No page errors were recorded.
- `git diff --check`: passed.

## Limits

Random simulation assertions can fail under other seeds; a seeded pass does not
prove all stochastic scenarios. Type checking fully covers the Fleet Commands
pilot and composition boundaries, not the other 14 legacy implementation bodies
or complete save/wire schemas. Shared legacy state remains on Game behind explicit
capability accessors. See [FEATURES.md](FEATURES.md) for the migration contract.

No production deployment, remote push or Steam release was performed. This code
refactor does not establish distribution rights for inherited game assets.
