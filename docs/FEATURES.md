# Feature composition and gradual JavaScript typing

For a codebase map and a concrete action trace, see [CODE-NAVIGATION.md](CODE-NAVIGATION.md).

## Service composition

`Game` owns `game.features`, a fixed set of named service objects assembled in
`server/features.ts`. `Space`, routes and coordinator code call a named service,
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

Infrastructure references in the feature facades (`db`, `sessions`, `spaces`) are
getter-only. The composition root can replace them; features see the current
reference on each read. Core-picked capability types mark those references readonly.
This prevents replacing infrastructure, not mutations to objects inside it.

Fronts owns its six-hour anomaly cache in a per-service closure. Its facade offers
`readAnomalies`, not writable cache fields on Game. Repeated reads keep the same
mutable map within a window; clock changes across windows rebuild it from the
shared deterministic calculation. This does not make returned maps immutable.
Invasion scheduling and other legacy feature state remain on Game.

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
TypeScript does not validate decoded JSON at runtime.

## TypeScript source and runtime

All application modules in `server/`, `shared/` and `client/` use native TypeScript.
`npm run typecheck` checks the complete application with strict settings and
verifies that no application JavaScript, omitted source files or blanket type-check
suppressions bypass those checks. `npm run test:types` verifies that invalid
feature calls and incomplete capability objects are rejected.

`npm run build` compiles application modules into `dist/` and rewrites relative
TypeScript imports to JavaScript imports. The server and browser use that compiled
output; `npm start` builds before launching the server. Release archives include
compiled output, so players do not need development dependencies to run them.
Development and tests use the pinned Node runtime described in
[the runtime guide](TYPESCRIPT-RUNTIME.md).

Types describe saved state, live entities, capabilities and protocol payloads;
they do not validate decoded JSON at runtime. Preserve existing validation and
migration logic. Use concrete types for new operations without blanket `any` or
suppressions.

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
2. Declare concrete TypeScript inputs, outputs and minimum capabilities, with separate
   saved/live/protocol types where appropriate. New implementation code is checked.
3. Add the capability object and `FeatureServices` entry explicitly in
   `server/features.ts`. Reference named providers, not arbitrary client strings.
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
- Existing `test/vNN.ts`, simulation, fuzz and balance suites retain assertions;
  only internal feature access paths changed.

`test/fixtures/features-v26.tson` was captured from untouched commit
`47bea35a9f3d773efa9a9f075e5b361d9533b390`, not from the replacement. It records
world/login phase traces, a sanitized fresh save, representative layered ship
bonuses/stats, the world payload and mixed-case lookup. Regeneration requires a
separate original checkout:

```sh
REFERENCE_ROOT=/path/to/original-checkout node test/capture-features.ts > test/fixtures/features-v26.tson
```

The capture freezes time/RNG and disables interval scheduling only in its own
process; it never shadow-runs both implementations against shared mutable state.
Keep the baseline fixture unchanged for refactoring. Behavior changes should
explain and review any intended fixture update.

Some existing simulation assertions depend on random traffic/escort behavior.
For a reproducible scenario without altering assertions, run e.g.
`node --import ./test/seed-random.ts test/v203.ts`. The default seed is 123456789;
set `RIFT_TEST_SEED` to explore another scenario. This helper is test-only and
is not used by the game. A seeded pass is not a claim about every random seed.

## Raw cargo accounting boundary

`shared/cargo-lots.ts` owns strict, versioned integer-tonne lots. Totals remain
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
progression hook on first accepted material. Cutting supplies once-resolved parcel lots and preserves this
conservation/progression contract rather than stacking a second yield path.

Strict TypeScript checks include all cargo writers, the Fleet Commands boundary
and shared ledger contracts. Static checks do not replace behavioral regressions.

## Mining survey/cutting provider

`features.mining` is composed by `bindOperations` with concrete `MiningCapabilities` in `server/mining-contracts.ts`; it receives only DB/world access, pause query, named bonus/modifier/progression functions and its named tick operation. `MiningSpace` arguments expose only the rock/loot adapter, not unrestricted Game. Pure contact-union, grade and stage rules live in `shared/mining-rules.ts`. Real collision provenance captures the normalized source captain at firing; clients can request only a validated survey pulse.

World schema 1 persists deterministic geometry/generations, ready/heat/work, resolved finite budget, exact parcel remainders and original economic progression tokens. All three tools retain sixfold HP effectiveness; stage HP partitions original durability across 1/2/3 stages. Readiness latches until authoritative contact release; clean affects grade rather than mass. Tapper leases use its real cadence and merge time across mounts/captains. Survey is private, radius 1500, cooldown 10 s/reveal 6 s; gas is presented as vents/pressure. All values are provisional.

The saved logical clock advances once per unpaused Game tick independently of space scheduling; cold spaces catch up cooling/regrowth only. Process downtime freezes this clock. Field config changes fail closed with an explicit migration diagnostic rather than aliasing an old reward. A durable committed checkpoint journal covers player/world file pairs and is recovered before either is exposed after restart; backups skip pending checkpoints. This is coherent committed-checkpoint recovery, not a promise to retain actions performed after the latest checkpoint.

Source-at-first-emission yield is frozen once for the full generation, including the unchanged Lodestar bonus service; prospective overheat discards 25% of un-emitted mass once. Original parcel progression tokens are shared over visible clusters and claimed once on actual accepted material. Ordinary nonmining damage cannot earn clean-contact credit. Existing numeric cargo totals and grade-ledger integration remain authoritative. Controls migrate additively with explicit null-unbound semantics; V is assigned only if free, F and all metadata are preserved.

## Refinery and mining pressure

The checked `refinery` service owns version 1 quotes, timed batches, exact-grade input escrow, rational output and receipts in the existing world/player checkpoint. `pressure` owns logical-clock noise, finite scoped encounters, volatile telegraphs and local recovery. Neither service installs methods on Game. Explicit capability objects provide only prices, access, capacity, checkpoint, account/session lookup and named notifications; shared production trade-pricing functions are reused by ordinary trade and refinery quotes.

Processed Alloy Ingots/Fuel Cells/Cut Crystal/Composite Plating are ordinary common-only trade goods, distinct from raw grades and construction crates. Standard recipes consume selected exact raw grades (defaultcommon); composite consumes 3 pure tonnes each. Recovery 85% Concord,95% specialty/80% other,75% outlaw and 100% own home is mass, not price. Integer 300-unit ledgers preserve sub-tonne output and partial claims; only ready fractions pool. Instant≤30 t; stored≤300 t,30 s cancellable queue plus5–30 min processing. Stored base fees are 20% lower but an explicitly displayed conservative anti-arbitrage floor takes precedence. Home's new-recipe advantage does not alter legacy 12 t+1500 cr crate processing.

Binding quotes last 30 s and capture exact lots, fee, output and pricing fingerprint. Submit rechecks access/economics/caps and uses copied inventories for atomic multi-input settlement. Rich/pure raw grades cannot be bought locally; their sourcing-floor valuation uses the common ask as a conservative lower bound, not a fabricated premium purchase offer. Liability conservatively rounds complete output entitlement up including ready residue; this can make very small batches uneconomic. Locked local quote conversion cycles are bounded; future/travel market risk remains. Fuel Cells consume real goods for 100 fuel each; capacity-clipping cells are rejected, and no inverse conversion exists.

Batches mature by real timestamp offline/while paused, like existing station production; confirmations/claims pause. Logical mining time still freezes stopped/paused. Escrow survives death/access/home-site changes; owner-only collection works within 500 units plus port radius without landing/trade/repair access. Cancellation before processing returns exact lots in capacity-limited return escrow and refunds fee less 10 cr handling. A committed checkpoint failure freezes economic actions/ticks until recovery; no success is sent before flush. Settled batch/order/receipt history is bounded without deleting live returns or reservations.

Finite exact-grade mining orders reserve shared port/day or rush-event demand and premium budget at acceptance, require explicit exact delivery, and never use virtual cargo/generic landing payouts. Expiry/cancel release reservations; accepted deadlines survive event end and follow solo-pause adjustment. Mining Rush no longer creates repeatable premium supply offers/raw-price multipliers; finite sourcing progress and bounded faster regrowth reuse its lifetime/need resolution.

Useful authoritative contact and accepted tonnes add persistent captain/system noise; leave to decay. At 70 warn, at 100 allow at most one two-hull group per 300 logical seconds per participant scope, with a shared active system budget. Separate live Armada mining opt-in is required; normal membership/follow/duel is not consent. Encounter acquisition, hostility, damage, projectiles and help calls enforce participant scope. Neutral captains, friendly wings and unconsenting Armada remain excluded; main-galaxy newcomers are not attacked, Farside retains no ambient truce. Volatiles show a complete-snapshot patterned radius/countdown for at least 2 s and resolve once, with explicit participant checks before damage; restart retires stale effects harmlessly. Field recovery delay is bounded and decays, never permanent/offline global depletion.

Mining tuning is provisional, not measured balance.

Fuel Cell consumption has a separate server-issued 30 s owner/ship/fuel-capacity binding quote and explicit confirmation; it cannot be resurrected by pruning a receipt because the persisted quote is consumed and monotonic IDs never recycle. Mining-order economics are bound into the opaque offer token, with a separate stable authored-slot reservation so a price/bonus change cannot reopen paid demand. Composite Plating has both a processing-throughput cap and a persisted shared 30 t/port/UTC-day buyer cap, displayed in market rows. Pressure contact leases retain immutable captain attribution: simultaneous captains share one useful-time noise union rather than making the last collision absorb everyone's noise. Hazard scopes capture original hull IDs as well as sessions/accounts; a replacement arrival cannot replay an old blast. Explicitly enrolled hostile encounter NPCs can be hit; ambient neutral NPCs remain excluded.

## Star Dredge industrial provider

`features.industrial` receives explicit typed DB, pause, capacity, specialty-power, finite mining-sweep, actual root-loot, private refresh and toast capabilities. Industrial mode requests accept only mode/recipe/exact grade; clients cannot supply heat, work, yield or source budgets. Hull 815 is the 400 t Survey Star Dredge at final 2.4M base price; the old ten specialist discounts and Lodestar 200%-times-power/protected hold/Riftore remain intact. Canonical upgrade IDs retain their existing stat effects under industrial labels; specialty power only reduces active thermal demand by a capped 20%, never mass, rate or drone count. Plasma cargo alone funds parts, five actual tonnes per part; stock building requires no plasma.

Forward sweep needs actual forward motion above 20 units/s, shares one 1500 HP/s root work budget, affects only unworked single-stage rocks, emits 97/3/0 common/rich/pure from the existing once-frozen generation budget, and cannot clean-finish intact multistage seams. Two noncombat utility collectors retrieve exact original parcels for the root captain. They neither fight/tank nor grant bounty/ammo; F-controlled fitted fighter bays remain distinct. Tagged finite minor pockets are added append-only in Meridian/Halcyon; migration preserves every pre-existing generation, heat, budget and parcel. Other field edits still fail closed.

Hull-owned version 1 industrial state preserves heat, earned mobile work and bounded sub-tonne buffers across real stored hulls/restart; automation never resumes on login. Unprotected destruction destroys work/output remainders with cargo. No mobile offline production. Common recipes use 70/300 output units per exact input tonne at one input/10 active seconds, sharing port recipe IDs but not escrow/output ownership. Post-input capacity is checked, then whole output and remainder are settled through the same journal checkpoint. Pre-journal failures safely restore; uncertain committed failures freeze economics until recovery.

Authored local stellar collectors are separate from decorative parallax suns, with labelled striped world-space bands outside ordinary port/gate lanes. Only opted-in Dredge harvests natural plasma, with real cargo capacity, a finite shared renewable band budget and persisted fractional active-flight progress. No ship fuel creates plasma; finite plasma→Quantum Fuel/Exotic Matter recipes are one-way ordinary cargo goods, not free regeneration. Stock 0-heat harvesting alone gains 5 t in 15 s at 45 heat; outward stock exit is tested within 10 s. High-heat/combined-mode bootstrap is denied. Ship heat sources are separate from rock heat: warning 70, active cutoff 100/hysteresis 65, shield drain 120, hull critical 150; ordinary ships get no new corona damage. Navigation/combat assist cancels harvest. Audio has one mixer-respecting intake voice and three upward threshold alarms, with visual equivalents.

Industrial tuning remains provisional. Scripted production scenarios measure loadout bonuses, work and settlement under explicit travel/selection assumptions; they do not establish exhaustive balance or human-play results. Dredge sprite sheets use a deterministic mesh with 108 headings/banks, paired glow and a yard portrait, alongside code-native blueprint, plasma and part icons.

## Towing and motherlodes

The checked `towing` provider owns version 1 bounded authored field slots, monotonically allocated object IDs, exact fixed 24 t grade lots, transfer offers and at most 64 settled receipts. This is a **separate finite authored source**, not an ordinary rock reserve/copy: it yields no normal rock parcels, yield bonuses, credit bounty, blueprint fragments or automatic order completion. Destroying it discards those 24 t. A terminal slot gets a new ID only after 900 simulation seconds modified by the existing pressure field recovery/Rush factor; lazy wake never accumulates offline rewards or replaces a live asset. Slot counters satisfy issued=delivered+discarded+live mass. Existing pressure fieldState publishes bounded opportunity labels; no second pressure/encounter ledger.

Tow Rig 9920 costs 45,000 credits and 4 outfit tonnes, maximum 1, fitting nonfighter hulls with at least 60 t cargo; stock Dredge 815 includes capability. Server physical stepping hard-clamps actual speed after all thrust/afterburner/catchup and before position:60 Dredge,30 every other eligible hull. Attached transit, landing and autonomous steering are denied; detach or deliver first. Every actual ship removal detaches before relocation. External motherlodes have no ship collision or unconsented damage paths.

Survey reveals fixed tonnes and same-system accepted ports. ATTACH/DETACH is an unbound-by-default rebindable action, preserving F and custom keys; contextual controls also support explicit two-captain transfer acceptance. Offers bind revision, both flight identities and stable hull UIDs. Detach/disconnect grants 300 simulation seconds of owner-only recovery, frozen offline/paused, with no reconnect refresh. Restart detaches a previously attached object in place. Static patterned tethers retain a distance/tension visual equivalent. One restrained tether oscillator routes through the existing effects/master/mute mixer and stops on detach, pause or hidden flight. Three new 384 px transparent lossless ore-family motherlode rasters use the existing lit-3D rock renderer/noise/material style, with distinct mineral inclusions and a SHA256 manifest; ordinary rock mappings remain unchanged.

Delivery requires both tug/load near an accepted accessible port at speed≤10 and 24 t free after mission/industrial cargo. Exact raw lots are journal-checkpointed with the terminal object/receipt before success. Precommit errors restore memory; uncertain postcommit errors retain committed state and freeze economics until restart. Replays cannot pay twice, even after bounded receipt pruning because old IDs never become current again.

## Renewable mining deposits

Ore asteroids, gas pockets, shard deposits and industrial minor/sweep rocks renew as
fresh full-health generations. Fully depleted deposits keep their existing seeded
100–160 simulation-second recovery (modified by faction fronts and field pressure).
A partially damaged or partially extracted deposit now renews after **300 seconds
without mining contact**, so abandoned fields recover without interrupting active
cutting or sweep work. Untouched full-health deposits do not churn. Five quiet
minutes is provisional tuning: longer than normal depletion recovery and parcel
lifetime, with no periodic reset in the middle of mining.

Renewal retires the old identity and unextracted remainder; any original floating
parcels keep their exact original finite accounting/progression. It creates no
pickup or immediate reward. Restart preserves deadlines; older version-1 saves
receive a conservative full quiet interval on first load. Timers use unpaused
server simulation only, never stopped-server wall time; a sleeping system lazily
renews at most one current generation when observed, not a backlog of rewards.
Existing other-source recovery remains: delivered/destroyed motherlodes reissue
at full 100 health after 900 simulation seconds × field recovery factor, and
stellar plasma sources replenish 15 units/second (300 units per tonne, capped at
300,000), enough to replace one mined tonne every 20 simulation seconds. Live or
attached motherlodes are never replaced. These cadences retain existing economy
balance rather than giving other mining sources an additional duplicate payout.

## Ordinary job ownership

`server/jobs.ts` owns ordinary board generation, acceptance and landing-completion
operations, with `Game.offers/accept/completeOnLanding` retained as compatibility
entry points. `Game.createJobService` provides eleven explicit live capabilities.
The service uses the same account mission array and DB: no new save store, copied
state, lifecycle hook, protocol action or feature-provider namespace is added.
Auth/flood/freeze gates stay in `Game.onMessage`; Story Jobs, Armada contracts,
mining orders and specialized progression retain their existing providers.
Operation bodies and capability boundaries are checked by strict TypeScript.
Positive/negative type fixtures do not replace runtime wire validation.

## Ordinary port-commerce ownership

`server/port-services.ts` owns ordinary market/material trading, shipyard/trade-in
and outfitter operations. The existing Game methods forward to `game.portService`;
`Game.createPortService` supplies nineteen explicit live capabilities, preserving
current provider lookup and method receiver. Shared trade pricing, exact cargo
lots, finite refined-goods demand, station access, job capacity and settlement
remain the same existing authorities. No second inventory/save store, new route,
feature namespace or lifecycle hook is introduced. Operation bodies are checked by strict TypeScript; positive/negative boundary
types are not runtime wire validation.

## Station action service

`server/station-service.ts` owns Personal Station actions, including claim,
upgrade, processing, collection, research and relocation. It mutates the existing
captain/station and claim records. `Game.station` remains the public orchestration
entry; dispatch authorization and persistence still use their existing owners.
The service receives only station checks, inventory operations, claim storage and
explicit feature callbacks. Database/Solo accessors and callback forwarding read
current providers, including replacements after construction. Timer advancement,
trade cancellation, spending, dirty marking and player/landed refresh order are
unchanged. The service does not own a clock, account copy or checkpoint.
