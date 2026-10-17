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

## Raw cargo accounting boundary

`shared/cargo-lots.js` owns strict, versioned integer-tonne lots. Totals remain
authoritative. New saves initialize empty cargo/storage ledgers; authenticated
login and solo import migrate missing legacy records to common only. Existing
malformed premium records reject loading/import rather than resetting grades.
Import validates before replacing a slot. Offline exchange delivery migrates and
validates its recipient before adding goods.

All cargo/storage writers in Game, Fleet Commands, Frontier, Hangar and Co-op use
the ledger. Their capacity comes from the explicit `holdUsed` facade, including
job cargo; unbounded station storage uses no hold capacity. Exchange orders hold
exact remaining `lots`; old orders without lots are common. Captain trades
preflight both inventories and destination storage before credits/items move.
Exchange reservations commit only after all fill destinations validate, and pending
escrow/book state commits before notifications; notification failures never refund
an already-completed fill.

Existing `trade` and `jettison` messages accept optional `lots: {common,rich,pure}`
whose integer quantities must exactly match the requested tonnage and owned
grades. `trade2` offers use `give.lots[commodity]` alongside `give.items`; exchange
sell orders and station processing also accept `lots`. Omission uses deterministic
common → rich → pure consumption. `you` includes copied `cargoLots`/`storageLots`.
Market purchases and genuinely new colony/plunder production are common. Raw
sale factors (1/1.3/1.6) weight the actual selected lots inside existing depth and
bonus calculations once; market/info grade subrows expose explicit sale/jettison.
Material-crate numeric quality and field richness remain separate.

Mining's existing economic parcel freezes its effective yield on first pickup
attempt (even a full hold), retains exact partial remainder, and claims one
progression hook on first accepted material. This interim compatibility owner is
not the later cutting service: no grade RNG, cutting, survey or Dredge action is
added here. Later cutting must supply once-resolved parcel lots and preserve this
conservation/progression contract, replacing—not stacking—the legacy yield path.

Scoped TypeScript includes all cargo writer modules and checks the Fleet Commands
boundary plus shared ledger contracts. PR #21 domain interfaces remain intact;
these scoped gradual checks are not a full-game type-safety claim.

## Mining survey/cutting provider

`features.mining` is composed by `bindOperations` with concrete `MiningCapabilities` in `server/mining-contracts.js`; it receives only DB/world access, pause query, named bonus/modifier/progression functions and its named tick operation. `MiningSpace` arguments expose only the rock/loot adapter, not unrestricted Game. Pure contact-union, grade and stage rules live in `shared/mining-rules.js`. Real collision provenance captures the normalized source captain at firing; clients can request only a validated survey pulse.

World schema1 persists deterministic geometry/generations, ready/heat/work, resolved finite budget, exact parcel remainders and original economic progression tokens. All three tools retain sixfold HP effectiveness; stage HP partitions original durability across1/2/3 stages. Readiness latches until authoritative contact release; clean affects grade rather than mass. Tapper leases use its real cadence and merge time across mounts/captains. Survey is private, radius1500, cooldown10s/reveal6s; gas is presented as vents/pressure. All values are provisional.

The saved logical clock advances once per unpaused Game tick independently of space scheduling; cold spaces catch up cooling/regrowth only. Process downtime freezes this clock. Field config changes fail closed with an explicit migration diagnostic rather than aliasing an old reward. A durable committed checkpoint journal covers player/world file pairs and is recovered before either is exposed after restart; backups skip pending checkpoints. This is coherent committed-checkpoint recovery, not a promise to retain actions performed after the latest checkpoint.

Source-at-first-emission yield is frozen once for the full generation, including the unchanged Lodestar bonus service; prospective overheat discards25% of un-emitted mass once. Original parcel progression tokens are shared over visible clusters and claimed once on actual accepted material. Ordinary nonmining damage cannot earn clean-contact credit. Existing numeric cargo totals and grade-ledger integration remain authoritative. Controls migrate additively with explicit null-unbound semantics; V is assigned only if free, F and all metadata are preserved. Future sweep/tow actions remain inactive/unbound.

## Mining3.0 refinery and pressure slice

The checked `refinery` service owns version1 quotes, timed batches, exact-grade input escrow, rational output and receipts in the existing world/player checkpoint. `pressure` owns logical-clock noise, finite scoped encounters, volatile telegraphs and local recovery. Neither service installs methods on Game. Explicit capability objects provide only prices, access, capacity, checkpoint, account/session lookup and named notifications; shared production trade-pricing functions are reused by ordinary trade and refinery quotes.

Processed Alloy Ingots/Fuel Cells/Cut Crystal/Composite Plating are ordinary common-only trade goods, distinct from raw grades and construction crates. Standard recipes consume selected exact raw grades (defaultcommon); composite consumes3 pure tonnes each. Recovery85% Concord,95% specialty/80% other,75% outlaw and100% own home is mass, not price. Integer300-unit ledgers preserve sub-tonne output and partial claims; only ready fractions pool. Instant≤30t; stored≤300t,30s cancellable queue plus5–30min processing. Stored base fees are20% lower but an explicitly displayed conservative anti-arbitrage floor takes precedence. Home's new-recipe advantage does not alter legacy12t+1500cr crate processing.

Binding quotes last30s and capture exact lots, fee, output and pricing fingerprint. Submit rechecks access/economics/caps and uses copied inventories for atomic multi-input settlement. Rich/pure raw grades cannot be bought locally; their sourcing-floor valuation uses the common ask as a conservative lower bound, not a fabricated premium purchase offer. Liability conservatively rounds complete output entitlement up including ready residue; this can make very small batches uneconomic. Locked local quote conversion cycles are bounded; future/travel market risk remains. Fuel Cells consume real goods for100 fuel each; capacity-clipping cells are rejected, and no inverse conversion exists.

Batches mature by real timestamp offline/while paused, like existing station production; confirmations/claims pause. Logical mining time still freezes stopped/paused. Escrow survives death/access/home-site changes; owner-only collection works within500 units plus port radius without landing/trade/repair access. Cancellation before processing returns exact lots in capacity-limited return escrow and refunds fee less10cr handling. A committed checkpoint failure freezes economic actions/ticks until recovery; no success is sent before flush. Settled batch/order/receipt history is bounded without deleting live returns or reservations.

Finite exact-grade mining orders reserve shared port/day or rush-event demand and premium budget at acceptance, require explicit exact delivery, and never use virtual cargo/generic landing payouts. Expiry/cancel release reservations; accepted deadlines survive event end and follow solo-pause adjustment. Mining Rush no longer creates repeatable premium supply offers/raw-price multipliers; finite sourcing progress and bounded faster regrowth reuse its lifetime/need resolution.

Useful authoritative contact and accepted tonnes add persistent captain/system noise; leave to decay. At70 warn, at100 allow at most one two-hull group per300 logical seconds per participant scope, with a shared active system budget. Separate live Armada mining opt-in is required; normal membership/follow/duel is not consent. Encounter acquisition, hostility, damage, projectiles and help calls enforce participant scope. Neutral captains, friendly wings and unconsenting Armada remain excluded; main-galaxy newcomers are not attacked, Farside retains no ambient truce. Volatiles show a complete-snapshot patterned radius/countdown for at least2s and resolve once, with explicit participant checks before damage; restart retires stale effects harmlessly. Field recovery delay is bounded and decays, never permanent/offline global depletion.

All new tuning is provisional, not measured balance. Dredge/plasma/mobile smelting/towing and final field evolution remain subsequent approved slices; this slice alone is not3.0 release readiness.

Fuel Cell consumption has a separate server-issued30s owner/ship/fuel-capacity binding quote and explicit confirmation; it cannot be resurrected by pruning a receipt because the persisted quote is consumed and monotonic IDs never recycle. Mining-order economics are bound into the opaque offer token, with a separate stable authored-slot reservation so a price/bonus change cannot reopen paid demand. Composite Plating has both a processing-throughput cap and a persisted shared30t/port/UTC-day buyer cap, displayed in market rows. Pressure contact leases retain immutable captain attribution: simultaneous captains share one useful-time noise union rather than making the last collision absorb everyone's noise. Hazard scopes capture original hull IDs as well as sessions/accounts; a replacement arrival cannot replay an old blast. Explicitly enrolled hostile encounter NPCs can be hit; ambient neutral NPCs remain excluded.
