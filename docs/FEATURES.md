# Feature composition and gradual JavaScript typing

## What changed

`Game` no longer receives feature methods through prototype merging. It owns
`game.features`, a fixed set of named service objects assembled in
`server/features.js`. `Space`, routes and coordinator code call a named service,
for example `game.features.fleetcmd.fleetOrder(session, order)`.

Each existing implementation module exports an `*Operations` object. The
composition root binds those operations to an **explicit capability facade**:
only listed core functions, live state accessors and named cross-feature
operations are visible as `this`. No feature receives `Game`, no shared context
is copied, and no last-writer-wins method resolution remains. Service shapes
are sealed; tests can deliberately replace an existing service operation.

The facade is a migration seam, not full state isolation. Persistent data is
still owned by `DB`; live sessions/spaces and legacy feature state still live on
`Game`. State accessors are live getters/setters so initialization, timer closures
and later assignments retain their behavior. `Game` declares the remaining
untyped feature state as `unknown` rather than pretending it has a checked schema.
Further state extraction can happen feature by feature after its internals have
specific contracts. Avoid using these legacy seams for new unrelated state.

## Shared calculations have explicit owners

- `features.bonuses.bonus`: Specialists adds specialty effects to Frontier's
  mastery/colony/survey additions, which calls Fronts' captain/research/crew and
  Armada calculation. Each layer calls an explicit capability (`frontierBonus`,
  `frontsBonus`), never another implementation with a borrowed `this`.
- `features.shipStats.stats`: Fronts calls the effective bonus service and the
  shared ship calculation. The obsolete Hangar-only bonus/stats were removed.
- `features.world.worldPayload`: Frontier adds colonies to Fronts' payload,
  retaining invasion, anomalies, event, calendar and living-system states.
- `features.sessions.sessionOf`: Co-op owns normalized, case-insensitive lookup.
  The obsolete case-sensitive Frontier implementation was removed.

Changing a layer is a gameplay change: preserve ordering, addition vs.
multiplication, optional fields and mutation behavior unless explicitly intended.

## Lifecycle and dispatch

Lifecycle calls remain explicit in `Game`, not in an event bus or automatic
registration system. Constructor order remains Fronts → Co-op → Frontier →
Rivals → Living init → Living tick → seeds. Login retains tutorial migration,
Hangar → Co-op migration → Docks → Hostile → Story → Syndicate → Arcs, followed by
the same subsequent login/idle/payload/landing work. Nested lazy initialization
is retained. Tick cadence, per-session order, paused behavior and error boundaries
are unchanged.

`Game.createMessageHandlers()` lists every top-level message route.
`createMessageRegistry()` rejects duplicate types; unknown/inherited names are
ignored. The existing flood, authentication and activity gates execute **before**
registry dispatch. Routes retain their coercion, checks and action-specific
permissions. Market `trade` and captain-to-captain `trade2` are separate routes.
JSDoc does not validate decoded JSON at runtime.

## Typing coverage: deliberately gradual

`npm install` installs development-only TypeScript and Node type definitions.
`npm run typecheck` runs `tsc --noEmit`: no game output, player dependency or
browser build is added. The game still starts directly with Node without those
dev dependencies installed.

Checked now (`// @ts-check`):

- composition and every explicit facade's shape/signature imports;
- service binding and the message registry;
- Fleet Commands' complete implementation;
- the concrete `CargoPlayer`, `CommandSession`, `CommandEntity`, `CommandSpace`
  and `FleetCommandsCapabilities` boundary contracts in `server/contracts.js`.

**Not claimed checked:** the other 14 legacy implementation bodies, full saved
player/world schemas, all wire payloads or shared physics internals. Their inferred
function imports check wiring/names and some arity/return relationships, but
legacy parameters can still infer as `any`. Explicit state typed `unknown` is not
a completed schema. Do not interpret a clean typecheck as proof these bodies are
fully typed. New and touched operations should adopt concrete JSDoc types and
`@ts-check` as part of their change, without blanket `any` or suppressions.

Fleet Commands checks an explicit null ship-stats case before accessing cargo;
it still throws a `TypeError` for an invalid hull, with a clearer message. Valid
ship behavior is unchanged.

## Ownership and adding a feature

`docs/feature-inventory.json` records each implementation owner file, its baseline
export, current operations, exact facade references, direct state assignments and
lifecycle hooks. Hook lists describe central integration points, not every nested
call; `Game` is the source of truth for sequence. Each feature change has one
owner. Changes to contracts/composition/routes have one integration owner; keep
these shared changes small prerequisite changes for parallel feature work.

1. Give the feature a unique namespace and explicit exports. Do not install any
   methods on `Game.prototype` or accept the unrestricted `Game` as a dependency.
2. Declare concrete JSDoc inputs, outputs and minimum capabilities, with separate
   saved/live/protocol types where appropriate. New implementation code is checked.
3. Add the capability object and `FeatureServices` entry explicitly in
   `server/features.js`. Reference named providers, not arbitrary client strings.
4. Add explicit initialization/migration/logout/tick/payload calls only as needed,
   in the correct phase. Declare cadence and state ownership in the inventory.
5. Add fixed message entries in `createMessageHandlers`. Keep validation and
   authorization intact; duplicate message IDs fail during construction.
6. Update the inventory and relevant behavior checks. Remove obsolete wiring and
   old forwarding APIs rather than maintaining duplicate implementations.

## Verification

See [the full game system/action coverage inventory](TEST-COVERAGE.md) and the
[repository regression contract](../AGENTS.md). New gameplay behavior requires
meaningful tests registered in the canonical CI manifest in the same change.

- `npm run typecheck`: checked scope above.
- `npm run test:features`: deterministic original-vs-current characterization,
  dependency inventory, no prototype feature installation, capability isolation,
  duplicate/unknown route handling, and authentication/flood/activity/action gates.
- `npm run test:types`: positive calls compile; wrong fleet-order argument and a
  missing required capability must fail compilation. No suppression comments.
- Existing `test/vNN.js`, simulation, fuzz and balance suites retain assertions;
  only internal feature access paths changed.

`test/fixtures/features-v26.json` was captured from untouched commit
`47bea35a9f3d773efa9a9f075e5b361d9533b390`, not from the replacement. It records
world/login phase traces, a sanitized fresh save, representative layered ship
bonuses/stats, the world payload and mixed-case lookup. Regeneration requires a
separate original checkout:

```sh
REFERENCE_ROOT=/path/to/original-checkout node test/capture-features.js > test/fixtures/features-v26.json
```

The capture freezes time/RNG and disables interval scheduling only in its own
process; it never shadow-runs both implementations against shared mutable state.
Keep the baseline fixture unchanged for refactoring. Behavior changes should
explain and review any intended fixture update.

Some existing simulation assertions depend on random traffic/escort behavior.
For a reproducible scenario without altering assertions, run e.g.
`node --import ./test/seed-random.js test/v203.js`. The default seed is 123456789;
set `RIFT_TEST_SEED` to explore another scenario. This helper is test-only and
is not used by the game. A seeded pass is not a claim about every random seed.
