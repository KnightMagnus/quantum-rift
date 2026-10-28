# Game regression coverage inventory

## Authored content

`content-validation.ts` belongs to `ships-catalog-art`. It validates the composed
ship catalog and local yard, flight and glow artwork references without starting
a server or changing content. Negative fixtures cover mismatched IDs, invalid
capacities, combat/movement stats and recharge rates, weapon references/counts/ammo,
stock gun and turret overflow, missing
files and nonlocal artwork paths. Diagnostics carry the authoring file; refit and
Armada hull references and outfit weapon references are checked against the
composed catalog. CLI checks exercise successful validation, failed staged-asset
validation and invalid arguments.

NPC-only hulls retain the existing player-mount exception; unknown weapons still
fail. Fixed weapons without corresponding outfits do not consume shop mounts,
matching `makeLoadout` and `shipStats`. This is an authoring check for the typed,
composed ship catalog, not a schema for arbitrary untrusted JSON. Mission
prerequisites and dialogue destinations are checked against the composed narrative
catalogs. Non-ship asset references and decoded image integrity remain outside
this validator. Existing artwork/browser tests retain their image checks.
Narrative fixtures cover duplicate IDs, unknown prerequisites and cycles,
missing destinations, relative contact locators, decision/choice references,
mission types, rewards and required dialogue. Diagnostics name source/key without
printing dialogue or reward values. Dynamic dialogue and generated offers remain
outside this offline check.
See [CONTENT-VALIDATION.md](CONTENT-VALIDATION.md) for commands and scope.

## Wire contracts and receive bounds

`shared/wire-actions.ts` owns trade, refinery, mining-order, towing, industrial and
ordinary port-purchase (`buyship`, `outfit`, `buymat`) request shapes. Both local
sockets and native matches reach the same Game routes and
service validators. Auth, flood, checkpoint freeze and activity gates remain in
Game; ownership, pricing, location, receipts and settlement remain in services.
Trade still accepts finite numeric text and uses signed 32-bit truncation.
Refinery and towing reject unexpected authority fields; malformed numeric values
and oversized identifiers cannot reach settlement.

`wire-contracts.ts` checks parsers, legacy coercion, malformed account/world
no-mutation denials and entry-gate order. `refinery-network.ts` and
`nakama-network.ts` send malformed economic packets through actual local and
native services and verify unchanged credits/cargo followed by a valid request.
`nakama-client-connection.ts` verifies identical economic receive validation for
Solo, friend and native connections. Compiler fixtures reject invalid economic
request discriminators and non-scalar quantities. Independent routing traces
remain unchanged.

Industrial controls validate plain records, operation names and bounded text
selectors before initializing ship state. Recipe/catalog, exact-grade, flight,
hull, pause, freeze and harvest prerequisites remain server-owned. Direct calls
may omit `t`; `off` retains its legacy behavior of ignoring bounded text selectors.
`wire-contracts.ts` checks malformed roots, null/array/object/nonfinite selectors,
oversized text and forged production fields against both initialized and missing
ship state, comparing the full saved player and world before and after each
request. It also checks valid toggles, exact-grade selection, all-off behavior and
flight/economic denials. `dredge-network.ts` follows malformed local packets with
successful harvest/off commands. `nakama-network.ts` sends malformed industrial
packets from an ordinary fresh captain; this covers native denial/continued
service, not successful native Dredge controls or complete transport parity.

Port purchases validate required finite numeric values, bounded identifiers and the
optional boolean hangar selector before invoking port services. Finite numeric
text, signed 32-bit wrapping/truncation and empty numeric text retain their old
conversion; null, arrays, objects, booleans in numeric fields and forged price or
credit fields are rejected. Prices, inventory, fitting and location checks still
belong to port services. `wire-contracts.ts` checks unchanged player/world state
on malformed requests, route coercion and real material purchases and sales.
The existing local/native economic denial fixtures also check malformed purchase
packets and unchanged ship/material projections. These transport cases prove
denial and continued service, not successful ship purchases on both transports.
Compiler fixtures reject malformed purchase shapes and forged prices.

`shared/refinery-wire.ts` contains implementation-independent refinery payload
types. `shared/wire-payloads.ts` validates complete quote field shapes and the
`you`/`landed` economic headers, with finite-number, depth, string, collection and
total-node bounds across their nested data. These headers are not complete
runtime schemas for player state or port offers. The client retains inferred
application types for those nested structures. Static typing and bounded traversal
do not prove nested semantic validity or authorize client economic decisions.

`shared/wire-commands.ts` covers the remaining authenticated command families,
including flight, station/hangar management, co-op, social, jobs and hails.
`ClientAction` is a discriminated union derived from the executable field rules;
the economic variants reuse their existing contracts. Both transports validate at
Game ingress after the unchanged auth, flood, freeze and activity gates.
Economic validation stays inside the existing routes/services so malformed
industrial requests retain their denial toasts. Pre-login `hello` remains with
the login owner. Operation selectors, fields, nested trade offers and collection
sizes are bounded; command strings are limited to 4,096 characters, encoded
commands to 8,192 UTF-8 bytes, and trade dictionaries to 128 entries, matching
the native ingress envelope. Native scheduling additionally retains its
existing sequence/flight-control checks and per-tick traffic limit; legacy numeric text and partial grade selections are not
normalized. Missing optional fields retain their existing defaults or service
denials. Hail's legacy `sender` and portrait's `name`/`target` fields are bounded
but ignored. Flight
position/credit/timestep echoes are also bounded and ignored; only the existing
input controls affect flight. The server retains identity, money and clock
authority.

`wire-contracts.ts` compares the contract families with all 57 registered routes,
checks malformed field denial before dispatch, exercises nested trade offers and
compares saved account/world state after malformed commands. The fuzzer sends a
valid bounded probe to every route before malformed random sampling, retaining
its complete route-coverage assertion. Local/native network fixtures send
malformed rename, bank, station, trade-offer and mining requests before a valid
refinery barrier; these prove denial and continued service, not every successful
operation on each transport.

All received server families have finite-number, depth, collection, string and
total-node bounds. Communication/control headers additionally validate their
required scalar fields and dialogue choice entries before reaching the UI.
`nakama-client-connection.ts` checks malformed communication headers on Solo,
friend and native receive paths, including actual global, system and Armada chat
from docked and flying sessions. Null and finite ship markers reach the client;
malformed markers are dropped. Snapshot tuples retain their existing precise
checks. World, sites and arena content and nested feature state remain bounded
but do not yet have complete runtime semantic schemas.

## Native wall-clock performance

`performance-native.ts` belongs to `performance-health` and runs disposable native
Nakama/Goja, PostgreSQL and SDK sockets. Its 32-second concentrated flight case
observes real input progress and movement, bounded packet/error retention,
900-tick numeric health summaries, authoritative reconnect, actual checkpoints,
process restart and restored nondefault captain markers. It verifies invalid
workload/CLI limits before resource creation, fixed numeric health extraction and
cleanup after a real post-join injected failure. Numeric reports exclude payloads,
identifiers, credentials and exception contents. The companion
`tools/performance-native.ts` defaults to 60 measured seconds for repeatable host
observations. No latency or production-capacity threshold is asserted; client
seeding is not server determinism. Distributed/combat/mining native workloads,
Internet conditions, browser rendering and multihour soak coverage remain absent.
See [PERFORMANCE.md](PERFORMANCE.md) for pacing, retention and timing semantics.

## Development tooling

`tooling-contracts.ts` runs in the unit CI lane. It checks that Oxlint accepts
valid source and rejects unused bindings and floating promises, and that Oxc
Parser preserves optional/member access needed by the feature-dependency audit.
The existing feature test checks all 21 providers against the unchanged inventory.
Both TypeScript and tsrs run valid/invalid contract fixtures; tsrs remains a
Linux CI check because its pinned native package has no Windows binary.

## Friend-host authority

The `friend-hosting` system registers configuration, save-ownership and
real-process network checks in the unit/server lane and a browser check in the
browser lane. The fixtures use isolated synthetic accounts and a private friend
save directory, not player saves or a running Nakama service.

| Program                  | Behavior contract                                                                                                                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `friend-host-config.ts`  | Loopback default, explicit bind/port, incompatible mode/save/seed rejection, protected-store aliases, origin denial, empty developer seeds and mode-paired local transport selection                           |
| `friend-save-owner.ts`   | Two hosts on different ports cannot own one save directory; clean-stop restart and fail-closed stale-lock recovery, private POSIX save permissions and HTTP/WebSocket Host denial                              |
| `friend-host-network.ts` | Three password-protected captains on one real server, private output, missing/wrong-password denial, Solo endpoint/pause denial, shared flight/input progress, reconnect and account/world restart persistence |
| `friend-host-browser.ts` | Real browser password sign-in, same-origin gameplay socket, physical flight with bounded latency, input cadence, reconnect and runtime-error checks                                                            |

The program contracts are separate from individual run results or hosted-CI
status. Loopback processes and browser latency fixtures do not prove
LAN/VPN routing, router port forwarding, public Internet access, TLS deployment,
Windows/macOS launcher execution or every gameplay/device/network case. They do
not establish cross-backend synchronization or full native Nakama parity.

See [HOSTING.md](HOSTING.md) for the player workflow and save boundaries.

## Native online authority

The `nakama-online` system covers the pinned Nakama 3.41.0 boundary; local native
verification uses PostgreSQL 18.6 and SDK 2.8.0. The network and browser integration
programs use disposable native services supplied by `helpers/nakama-service.ts`;
the focused cases run without those services:

| Program                       | Behavior contract                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `portable-game-core.ts`       | Shared Game portability without Node-owned online timing                                         |
| `nakama-storage.ts`           | Private storage, full checkpoint CAS and fail-closed uncertain commits                           |
| `nakama-legacy-transition.ts` | Synthetic offline preview/apply, idempotence, guarded rollback and legacy password compatibility |
| `nakama-client-connection.ts` | Native client connection/session ownership and retained local-authority transport boundary       |
| `authority-callbacks.ts`      | Serial scheduled callbacks advanced by the match clock                                           |
| `nakama-network.ts`           | Real Nakama/PostgreSQL authentication, authoritative match, persistence and denial behavior      |
| `nakama-browser.ts`           | Browser sign-in, native flight transport/prediction, reconnect, logout and account switching     |

Local native network checks exercise actual Goja legacy-scrypt first login,
once-only bcrypt-sha256 upgrade and repeat login with encoded names; wrong
passwords and stripped session vars;
actual Game accounts and private `you` packets; non-custom joins, forged tokens
and private storage permission denial; depart, finite flight, movement and input
acknowledgement; future/replayed/spoofed/flooded input with continued progress for
another captain; duplicate-sign-in replacement without stale input; access/refresh
revocation; and restart restoration of actual account/world state.
Socket delivery can split a flood across match callbacks, so the highest
acknowledged sequence is not a count of admitted packets. The native flood checks
peer progress, submitted-sequence bounds and authoritative physics.

The native browser case exercises space-containing display names, physical thrust
and turn under 70 ms CDP network latency, finite authoritative state and a rendered
prediction delta below 500, contiguous input sequence numbers and
physical input release before captures. A test-only counter seed reaches the
long-lived sequence boundary without advancing physics or adding an input loop;
physical controls cross 4096, then a fresh native welcome must reset the epoch
and new controls must acknowledge, move and turn after reconnect. It also checks reconnect balance,
successful native HTTP session logout with state clearing and no auto-reconnect,
Bravo/Alpha account switching with retained balances, and absence of console/page
errors. These are bounded local observations, not all-network/device guarantees.

Existing business-rule and browser regressions explicitly use
`server/local-main.ts` and the `localAuthority` transport. Their gameplay
assertions remain reference-backend evidence, not proof that every feature was
accepted through native online transport. The Game features run inside the native
match, but this does not turn reference tests into full native parity coverage.
Synthetic migration coverage is not evidence of a real player-data import.
`nakama-world-lease.ts` exercises expired/re-entrant singleton creation, loser
retirement and lost publish acknowledgement recovery. Negative calls into the
actual match callbacks verify pending/orphan worlds do not advance deferred work,
Game ticks or joins; those narrow SDK spies are not a substitute for the separate
actual Game/Space native tests. A deterministic batch through the actual ingress
callback supplies 150 inputs from one session and ten from another: exactly eight
per session are admitted, rejected packets cannot advance acknowledgement, and
the next callback restores each session's budget.

`nakama-diagnostics.ts` checks token redaction across bearer, URL and JSON
delimiters, base64url signature tails and private absolute paths. CI retains only
sanitized summaries and synthetic-player screenshots, not service configuration,
databases, browser profiles or raw authentication traffic.

Focused core, storage, legacy, client and serial-callback cases and local native
network/browser checks have passed; full canonical, clean-install, archive and
hosted-CI results must be checked separately. No production-readiness or complete
social-service replacement claim follows from this inventory.

## Reusable foundations

`reusable-core` checks ordered galaxy traversal against an independent baseline,
including every galaxy origin, freight offers and nearest buyers. It also checks
hold allocation and mission reservations, signed versus clamped free capacity,
and the existing HTML-escaping policies. Independent original-source fixtures also
check random streams, hashes, the generated galaxy, rivals, arcs and 651 radio-tour
starts. Story-only Gateway placement, routing metadata and lore changes are reversed
on cloned systems for the original goldens; all other generated data stays under
strict comparison. Freight uses current ports in the original body order and
explicitly checks that the moved Gateway has no offers. Compiled startup checks cover online/Solo entry points, the default seed
catalog and executable browser modules. Release packaging checks rebuild compiled
output, reject untracked source output, exclude private/stale files and launch an
extracted archive without compiler dependencies. The archive fixture uses real
modules and catalogs but omits the unrelated artwork/audio library.
These are calculation and compatibility
tests, not proof that every UI or simulation branch is covered.

## Message-routing contracts

`robustness-wiring` includes `message-routing.ts`: independent reference traces
for all 56 routes and 79 dispatch scenarios, preserving arguments/coercion, call
order, representative state mutations, unknown/inherited action handling and live
service/method/space replacement. It separately exercises actual entry-gate login,
economic freeze, activity and flood ordering. The canonical server lane runs it;
existing real action, fuzz, persistence and browser cases remain intact. Route
spies do not establish all delegated gameplay rules. See
[MESSAGE-ROUTING.md](MESSAGE-ROUTING.md) for baseline provenance.

## Ordered stylesheet organization

The `sidebar-scrollbars` browser case additionally loads all ten component CSS
imports through the actual server and verifies nonempty CSSOM sheets and no failed
stylesheet requests, while retaining its 13 geometry/scale/trim/keyboard cases.
It also verifies CAPTAINS visibility with the production Solo class enabled and
disabled. The legacy `v26.ts` source contract follows the entry point's local CSS
imports instead of assuming every rule resides in `style.css`.
The organization preserves the original 566-rule browser CSSOM order, declaration
values and relative asset paths. A one-time original-versus-split comparison checked
34,650 computed properties across login, landing, JOBS, flight and narrow flight,
with animation/transition disabled equally for deterministic comparison. That
evidence does not replace durable interaction, resize, scene and landing suites.

## Courier and freight progression

`cargo-courier-progression` covers two untimed starter-fit deliveries across 2,304
inner-board/time-window cases, low-danger plotted routes, five stable public freight
bands through 1,800 t, named stock-hauler capacities, existing commodity and mission
hold reservations, six-job limits, duplicate/forged/oversized acceptance denial,
wrong-port and once-only payment, real high-tonnage delivery and saved accepted
weights/pay. `cargo-couriers.ts` runs in the unit/server CI lane. It also verifies that the
ordinary-job service reads a replaced offer provider through the core forwarding
seam, preserving the Game receiver and denying a removed offer.
`mission-ui-browser.ts` additionally exercises a genuinely fresh starter captain's
visible large-cargo denial and real button acceptance of both small shipments.
Existing cargo, mission consent and browser checks remain intact. Availability
coverage is not a measured credits-per-hour or all-career balance comparison.

## 3.2.1 mission choices

`mission-choices` adds `mission-consent.ts` (real authoritative 2/4-captain sessions) and `mission-ui-browser.ts` (two real WebSocket/browser captains). Coverage includes authoritative rejection of expired team-offer IDs across the ten-minute boundary, unchanged captain credits/jobs on denial, acceptance of the refreshed offer without bypassing consent, board facts, visible denial reasons, retained filters, separate plotting/acceptance, explicit Ready/Start, exact integer-pool shares, revised-roster consent, refusal, capacity changes, reconnect/leave/late join, persisted offline completion and duplicate turn-in. Existing accepted rewards and legacy contracts are not migrated. `v26.ts` now exercises the new consent gate before its existing actual kingpin/escort/completion checks. There is no measured career-rate or reward-balance claim.

## 3.2.1 cockpit QoL

`cockpit-qol` covers per-captain view/search/scroll/subtab retention, a single explicitly pinned objective with other tracking retained, native detail/Back keyboard focus, unavailable cargo next-action links and narrow/scaled layouts. `qol-browser.ts` uses an isolated real server and actual accepted mission; existing refinery, logout, input and sidebar checks guard integrated behavior. `sidebar-sizing-browser.ts` additionally checks independent mouse/touch/keyboard minimap and lower-menu heights, canvas backing geometry, persistence, viewport/zoom limits and automatic reset. Default minimap aspect/fill coverage remains intact in `sidebar-browser.ts`. Presentation preferences never store passwords, execute actions, auto-accept work or modify authoritative saves.

## 3.2.1 economy verification

The `economy-32` system and additional trade/refinery action mappings register
`economy-32.ts`. It covers real server purchase/sale versus preview totals,
invalid/fractional/full/poor requests, higher-grade/delivery cargo warnings,
trip-attributed cash flow and save reload, automatic cost-preview churn without
invalidating legacy binding quotes, atomic missing-input/expired/duplicate denial,
and baseline-report arithmetic/completeness/stress-profile exclusion. The existing
refinery browser case is updated for automatic pricing and one Start action while
retaining real debit, cancellation, partial collection and fuel-cell checks.

No measured progression rate or tuned balance is claimed. The developer-only
[measurement protocol](ECONOMY-BASELINES.md) specifies the 36 matched session cells,
closure/cost requirements and reproducible evidence. Do not treat synthetic report
fixtures as actual game observations.

This is the reviewed **system-level behavior inventory**, not a claim of 100%
line/branch coverage. `test/regression-manifest.json` is the executable CI
registration source. `test/coverage-inventory.ts` rejects unregistered system
references, newly unmapped feature providers/actions, missing tests, omitted legacy release suites and newly unclassified test
programs. It is a wiring guard, not itself a behavior test.

## Run and CI ownership

```sh
npm ci
npx playwright install --with-deps chromium
npm run test:regression       # complete canonical manifest
npm run test:regression:unit  # server, physics, HTTP, persistence and network
npm run test:regression:browser
```

Node 22+ is required for development tests. Production retains its separate
runtime requirements. `.github/workflows/ci.yml` executes both manifest groups
in four independent server workers and four independent browser workers, preserving
formatting, type checks, feature characterization,
contract checks and every previously included regression. No registered program
is run twice across those jobs. Each case has isolated temporary data, seeded
fixtures, a hard deadline and process cleanup. Logs, screenshots and JSON results
are retained in `.artifacts/regression/` and uploaded even on CI failure.

Each worker runs its assigned programs sequentially on its own VM, so tests cannot
collide on fixed ports, save files, browser resources or generated repository files.
Shards use the manifest order modulo the worker count: every registered program
belongs to exactly one shard. Append `-- --shard=1/4` to either group command to
reproduce one worker. Omit the option for the complete local lane. The worker count
and matrix must be changed together in the workflow. More workers require more
hosted-runner capacity and repeat dependency installation; no fixed speedup is
assumed. Matrix failure does not cancel sibling workers, and evidence artifacts
have distinct shard names. The existing required check names aggregate all shard
outcomes and fail on failure, cancellation or skipped dependencies.

`regression-runner-contracts.ts` checks exactly-once assignment for the real
manifest, invalid shard rejection, subprocess failure and timeout reporting,
cancellation, descendant cleanup and retained logs. Runtime deadlines remain
180 seconds per program, or 240 seconds for `network-systems.ts`. Cancellation
signals the active process tree, allowing up to five seconds for fixture cleanup
before forced termination, removes its temporary directory and exits nonzero.

## Behavior systems

Tests below contain outcome assertions, not just import/parse checks. A named
suite can include both behavior checks and static asset/schema checks; the
behavior contract here describes what is exercised, not every branch in its
owner. Legacy `vNN` names are retained for traceability, and now run in CI.

| System                    | Implementation owner(s)                                                                                                          | CI behavior evidence                                                                                                                                                                                                               | Asserted contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accounts-persistence`    | `server/db.ts`, `server/game.ts`                                                                                                 | [persistence-auth.ts](../test/persistence-auth.ts), [account-defaults.ts](../test/account-defaults.ts), [v03.ts](../test/v03.ts), [v202.ts](../test/v202.ts), [v203.ts](../test/v203.ts), [http-api.ts](../test/http-api.ts)       | Account authentication/save safety, atomic player/world persistence/backups, Windows directory-sync capability, checkpoint recovery and denied writes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `protocol-http`           | `server/main.ts`                                                                                                                 | [http-api.ts](../test/http-api.ts)                                                                                                                                                                                                 | Real HTTP static/MIME/cache/404/traversal checks and online-vs-solo API permissions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `protocol-websocket`      | `server/ws.ts`                                                                                                                   | [websocket-transport.ts](../test/websocket-transport.ts), [network-systems.ts](../test/network-systems.ts)                                                                                                                         | Frame masking/fragmentation/control/limits, quiet-peer ping and half-open close, upgrade handshake and actual multiplayer client/server state transitions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `network-faults`          | `server/game.ts`, `server/ws.ts`                                                                                                 | [network-faults.ts](../test/network-faults.ts), [websocket-transport.ts](../test/websocket-transport.ts), [network-faults-loopback.ts](../test/network-faults-loopback.ts)                                                         | Replayed claims, accepts and landings settle once; evicted or closed local connections cannot act or steer; late frames after close never dispatch; restart keeps only flushed progress; real-TCP delay, lost replies, lost requests and half-open peers reconcile on reconnect.                                                                                                                                                                                                                                                                                                                                           |
| `hangar`                  | `server/hangar.ts`                                                                                                               | [v05.ts](../test/v05.ts), [v12.ts](../test/v12.ts), [v21.ts](../test/v21.ts)                                                                                                                                                       | Shuttle dispatch/resolution/repair, officer assignment/XP/ranks, research prerequisites/queue, refining, stored loadouts and boarding.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `fronts`                  | `server/fronts.ts`                                                                                                               | [v06.ts](../test/v06.ts), [v09.ts](../test/v09.ts), [faction-standing.ts](../test/faction-standing.ts)                                                                                                                             | Invasion start/damage/win, anomalies/events/goals, faction store standing and convoy/rescue/survey/smuggling jobs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `frontier`                | `server/frontier.ts`                                                                                                             | [v07.ts](../test/v07.ts)                                                                                                                                                                                                           | Colony ownership/accrual, station raid/defense waves, mastery, arena matchmaking/rating, exchange escrow/matching and profiles/leaderboards.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `specialists`             | `server/specialists.ts`                                                                                                          | [v08.ts](../test/v08.ts)                                                                                                                                                                                                           | Specialty roles, blueprint/part requirements, construction, tiers/upgrades and gameplay bonuses.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `hostile`                 | `server/hostile.ts`                                                                                                              | [v09.ts](../test/v09.ts), [v26.ts](../test/v26.ts)                                                                                                                                                                                 | Hostile levels/chest loot, Station Holdout wave/rewards and co-op helpers, weekly events/Eclipse.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `story`                   | `server/story.ts`                                                                                                                | [v10.ts](../test/v10.ts)                                                                                                                                                                                                           | Story offers/acceptance, board/travel/kill progression, gifts and Deep unlock.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `rivals`                  | `server/rivals.ts`                                                                                                               | [v11.ts](../test/v11.ts), [core-actions.ts](../test/core-actions.ts)                                                                                                                                                               | Named career population, relationships, hunters, damage/death/bounty, news/market flashes and status route.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `hailing`                 | `server/hail.ts`, `server/hail-service.ts`                                                                                       | [v11.ts](../test/v11.ts), [hailing.ts](../test/hailing.ts), [network-systems.ts](../test/network-systems.ts), [station-docking.ts](../test/station-docking.ts)                                                                     | NPC bribes/fuel/landing clearance and encounters, authentic player hails, inbox privacy/blocking/flood controls.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `fleet-orders`            | `server/fleetcmd.ts`                                                                                                             | [v11.ts](../test/v11.ts), [v21.ts](../test/v21.ts)                                                                                                                                                                                 | Escort target/formation/hold/fire orders, jettison/loot limits and combat rating.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `syndicate`               | `server/syndicate.ts`                                                                                                            | [v12.ts](../test/v12.ts), [v203.ts](../test/v203.ts), [ship-banking.ts](../test/ship-banking.ts)                                                                                                                                   | Black market/Syndicate career, officer promotion/lower decks, bank deposits/loans/interest, timed delivery contracts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `faction-arcs`            | `server/arcs.ts`                                                                                                                 | [v12.ts](../test/v12.ts)                                                                                                                                                                                                           | Faction story acceptance/progression/rewards and Farside expedition stages.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `docks`                   | `server/docks.ts`                                                                                                                | [v21.ts](../test/v21.ts), [outfitter-wing-repairs.ts](../test/outfitter-wing-repairs.ts), [ship-economy.ts](../test/ship-economy.ts), [companion-fixes.ts](../test/companion-fixes.ts)                                             | Save migration/dock capacity, storing/flying/swapping, wing loadouts/officers/repairs, ship purchases and resale.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `living-galaxy`           | `server/living.ts`                                                                                                               | [v24.ts](../test/v24.ts), [v25.ts](../test/v25.ts), [v252.ts](../test/v252.ts)                                                                                                                                                     | Living-state timers/resolution, trade impact/depth, supply jobs and war/newcomer behavior.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `quests`                  | `server/quests.ts`                                                                                                               | [v24.ts](../test/v24.ts), [passenger-quests.ts](../test/passenger-quests.ts), [core-actions.ts](../test/core-actions.ts)                                                                                                           | Generated contacts and handcrafted chains, per-step completion, failure/retry/salvage, passenger capacity and explicit abandonment isolation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `cooperative-social`      | `server/coop.ts`                                                                                                                 | [v26.ts](../test/v26.ts), [network-systems.ts](../test/network-systems.ts)                                                                                                                                                         | Friends/offline DM/blocking, Armada formation/leadership/chat/buffs/shared bounties, rescue, contracts and co-op Holdout.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `consensual-pvp`          | `server/coop.ts`, `server/frontier.ts`                                                                                           | [v26.ts](../test/v26.ts), [v07.ts](../test/v07.ts)                                                                                                                                                                                 | Open-galaxy friendly-fire prevention, solo/Armada duel consent/nonlethal outcomes and arena team matching.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `station-trading`         | `server/coop.ts`                                                                                                                 | [v26.ts](../test/v26.ts)                                                                                                                                                                                                           | Two-party credits/cargo/crates/blueprint/part escrow, accept/cancel and location guards.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `galaxy-navigation`       | `shared/galaxy.ts`, `shared/gen.ts`, `shared/rules.ts`                                                                           | [v04.ts](../test/v04.ts), [v08.ts](../test/v08.ts), [v23.ts](../test/v23.ts), [eventide.ts](../test/eventide.ts)                                                                                                                   | Seeded galaxy generation, reachable routes, Sol/Farside gates, authored Eventide landmarks, and Concordia display naming with stable home-system/station IDs.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `sleep-traffic-ai`        | `server/space.ts`                                                                                                                | [v04.ts](../test/v04.ts), [v201.ts](../test/v201.ts), [v23.ts](../test/v23.ts), [v24.ts](../test/v24.ts), [sim.ts](../test/sim.ts)                                                                                                 | Sleeping/waking systems, faction traffic/landing, wing steering, flee/broadside/friend assistance and combat/death/respawn.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `cargo-grade-ledger`      | `shared/cargo-lots.ts`, `shared/cargo-contracts.ts`                                                                              | [cargo-lots.ts](../test/cargo-lots.ts)                                                                                                                                                                                             | Versioned/idempotent cargo + storage migration, exact grade denial, immutable single-use withdrawals, atomic bounded transfers, fixed partial pickups, seeded per-grade conservation and real DB roundtrip. Pure prerequisite; production writer integration is separate.                                                                                                                                                                                                                                                                                                                                                  |
| `mining-existing`         | `server/space.ts`, `server/game.ts`                                                                                              | [v04.ts](../test/v04.ts), [v05.ts](../test/v05.ts), [v252.ts](../test/v252.ts)                                                                                                                                                     | Existing asteroid damage/ore pickup/processing/charting, officer mining bonus and visible mining guidance. Staged cutting/survey coverage is listed separately under `mining-cutting`.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `station-progression`     | `server/game.ts`, `server/hangar.ts`, `server/station-progress.ts`                                                               | [sim.ts](../test/sim.ts), [v05.ts](../test/v05.ts), [v26.ts](../test/v26.ts), [station-progress.ts](../test/station-progress.ts), [station-docking.ts](../test/station-docking.ts)                                                 | Claim/build tiers, refinery/research/shipyard, prerequisites and station relocation ownership/material gates. Timers preserve maturity/caps, completion-before-queue order, live providers and you/idle/route/save integration.                                                                                                                                                                                                                                                                                                                                                                                            |
| `market-materials`        | `server/game.ts`, `shared/rules.ts`                                                                                              | [v25.ts](../test/v25.ts), [v203.ts](../test/v203.ts), [ship-economy.ts](../test/ship-economy.ts), [core-actions.ts](../test/core-actions.ts), [network-systems.ts](../test/network-systems.ts)                                     | Trade buy/sell/depth/cargo/credit limits, material buy/sell and dock-only/insufficient-credit guards.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `missions-passengers`     | `server/game.ts`, `server/fronts.ts`                                                                                             | [v06.ts](../test/v06.ts), [v12.ts](../test/v12.ts), [passengers.ts](../test/passengers.ts), [passenger-quests.ts](../test/passenger-quests.ts), [eventide.ts](../test/eventide.ts)                                                 | Cargo/bounty/patrol/convoy/rescue/survey/smuggling/rush/Syndicate/passenger jobs, acceptance/capacity/deadline/reward/failure behavior.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `flight-combat-weapons`   | `server/space.ts`, `shared/rules.ts`                                                                                             | [sim.ts](../test/sim.ts), [v03.ts](../test/v03.ts), [v21.ts](../test/v21.ts), [original-weapons.ts](../test/original-weapons.ts), [v08.ts](../test/v08.ts)                                                                         | Movement/fire/hit events, weapon damage/types, missiles/point defense/drone controls, ship-role interactions, disabled cleanup and respawn.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `combat-assist`           | `server/combat-assist.ts`                                                                                                        | [combat-assist.ts](../test/combat-assist.ts), [network-systems.ts](../test/network-systems.ts)                                                                                                                                     | Consent-only autopilot/delegation, group odds, independent isolation, manual takeover and Hold Fire.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `newcomer-standing`       | `server/game.ts`, `server/space.ts`                                                                                              | [main-map-protection.ts](../test/main-map-protection.ts), [local-retaliation.ts](../test/local-retaliation.ts), [faction-standing.ts](../test/faction-standing.ts), [v203.ts](../test/v203.ts), [v252.ts](../test/v252.ts)         | Main-galaxy truce thresholds, Farside/combat/aggression exceptions, stray damage and standing/reputation impacts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `armada-follow`           | `server/armada-formation.ts`, `client/main.ts`                                                                                   | [armada-formation.ts](../test/armada-formation.ts), [armada-formation-network.ts](../test/armada-formation-network.ts)                                                                                                             | Size/wing-aware V convergence while moving/turning/stopping, consent/takeover/leader changes and real automatic leader-jump arrival.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `landing-gateway`         | `client/landing_autopilot.ts`, `client/gateway_autopilot.ts`, `server/game.ts`                                                   | [landing-autopilot.ts](../test/landing-autopilot.ts), [gateway-navigation.ts](../test/gateway-navigation.ts), [gateway-browser.ts](../test/gateway-browser.ts), [wormhole-loop.ts](../test/wormhole-loop.ts)                       | Smooth drifting landings, direct-center Gateway throttle/aperture guidance, bidirectional crossing and exit anti-bounce.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `ships-catalog-art`       | `shared/rules.ts`, `client/artwork.ts`, `client/render.ts`                                                                       | [catalog-artwork.ts](../test/catalog-artwork.ts), [outfitter-icons.ts](../test/outfitter-icons.ts), [animation-frames.ts](../test/animation-frames.ts), [ship-banking.ts](../test/ship-banking.ts), [v25.ts](../test/v25.ts)       | Versioned catalog URL/cache semantics, shipped icon headers/dimensions and asset wiring, animation bounds and banked sprite selection; all 122 stock hull turn rates in both directions at 30/60/144 Hz and stationary quantization-noise rejection.                                                                                                                                                                                                                                                                                                                                                                       |
| `world-scenery`           | `client/render.ts`, `client/exotic_scenery.ts`                                                                                   | [eventide.ts](../test/eventide.ts), [comet.ts](../test/comet.ts), [stars.ts](../test/stars.ts), [background-scale.ts](../test/background-scale.ts), [v25.ts](../test/v25.ts)                                                       | Authored scenery configuration, comets/stars/background scaling, atmosphere/artwork invariants.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `planet-render-cache`     | `client/planets.ts`, `client/render-cache-budget.ts`                                                                             | [render-cache-budget.ts](../test/render-cache-budget.ts), [planet-cache-budget-browser.ts](../test/planet-cache-budget-browser.ts)                                                                                                 | Byte-budgeted LRU eviction of procedural and pre-rendered planet caches, exact size accounting, on-screen worlds kept over budget and rebuilt after eviction; measured over a 12-system tour with artwork loading and with planet artwork missing.                                                                                                                                                                                                                                                                                                                                                                         |
| `station-art-identity`    | `client/station_wheel.ts`, `client/exotic_scenery.ts`, `client/render.ts`                                                        | [station-landing-browser.ts](../test/station-landing-browser.ts)                                                                                                                                                                   | 14 real landing/departure sessions, 110 stations/245 tier variants, actual flight-source identity, transient load recovery and frozen original Luna wheel pixels.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `login-scene`             | `client/login_scene.ts`                                                                                                          | [login-scene-browser.ts](../test/login-scene-browser.ts)                                                                                                                                                                           | Starting-system landmarks, six actual moving ship sheets, rotating/cloud planet frames, animated hub sheet and beacon pulses, 30% smaller planet disk, high-DPI resize, usable form, reduced motion (including dropped-change-event fallback) and rendering lifecycle.                                                                                                                                                                                                                                                                                                                                                     |
| `sidebar-scrollbars`      | `client/style.css`, `client/cockpit.css`, `client/main.ts`, `client/ui.ts`                                                       | [sidebar-browser.ts](../test/sidebar-browser.ts)                                                                                                                                                                                   | 13 viewport/scale/unread cases; visible tabs, saved-width recovery, wide radar, chat cap, utility spacing and centered group-anchored vent, invariant blue rail pixels, keyboard/wheel and scrollbars.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `client-options-map-save` | `client/main.ts`, `client/ui.ts`                                                                                                 | [client-systems-browser.ts](../test/client-systems-browser.ts)                                                                                                                                                                     | Real browser options/key remapping/scaling/palette, map routes and Solo pause/save workflows; see test assertions for exact exercised controls.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `communications-log`      | `server/game.ts`, `client/ui.ts`                                                                                                 | [chat-bubbles.ts](../test/chat-bubbles.ts), [v26.ts](../test/v26.ts), [core-actions.ts](../test/core-actions.ts)                                                                                                                   | Chat channel scoping, plain-text transient ship bubbles, bounded captain notes and non-idle-resetting ping/pong.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `radio-discovery`         | `server/radio-discovery.ts`, `server/quests.ts`, `shared/radio-stations.ts`, `client/radio.ts`, `client/ui.ts`, `server/main.ts` | [radio-discovery.ts](../test/radio-discovery.ts), [radio-playlists.ts](../test/radio-playlists.ts), [radio-content.ts](../test/radio-content.ts), [radio-browser.ts](../test/radio-browser.ts), [http-api.ts](../test/http-api.ts) | Saved per-captain unlocks and actual faction/system arrivals; scientist salvage and return reward; rare stable five-stop tour, real save reload, three seats, limits/abandonment and once-only payout; shuffle/ordered album looping, real browser ended events with silent WAV fixtures, pending-audio UI and same-browser captain/favorite isolation; retired provider routes and MP3 byte ranges. All 33 owner recordings have hash/size checks and actual browser decoding; Saved radio unlocks survive login; captain names never grant stations. Stations 1–4 hide titles; the ordered eight-track album shows them. |
| `economy-balance`         | `shared/galaxy.ts`, `shared/rules.ts`                                                                                            | [balance.ts](../test/balance.ts), [ship-economy.ts](../test/ship-economy.ts)                                                                                                                                                       | Price/strength ladder thresholds, progression-income bounds, Holdout reward floor and real loadout transaction arithmetic.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `robustness-wiring`       | `server/features.ts`, `server/message-registry.ts`, `server/game.ts`, `server/game-message-handlers.ts`                          | [fuzz.ts](../test/fuzz.ts), [message-routing.ts](../test/message-routing.ts)                                                                                                                                                       | Malformed/flooded gameplay messages preserve server invariants; feature/type checks separately verify composition and characterization, not full behavior coverage.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `input-audio`             | `client/main.ts`, `client/audio.ts`                                                                                              | [input-audio-browser.ts](../test/input-audio-browser.ts)                                                                                                                                                                           | Persistent mixer volumes/mute and N shortcut, emulated gamepad axes/deadzone/fire in actual outgoing WebSocket packets, touch fire/release/map. Not physical-device or audible-output certification.                                                                                                                                                                                                                                                                                                                                                                                                                       |

### Login scene media-event loss

The registered login browser test changes the real reduced-motion media state while deliberately withholding its reduce callback from production. It checks the original static-pixel/no-recurring-draw assertions, an independently calculated phase-zero traffic pose, normal media resume, hide/show and actual login cleanup. A bounded failure-only trace records native query/listener/event delivery, visibility/resize and final media/renderer state. This is not a claim of exhaustive browser-event reliability.

### Default accounts and custom Solo saves

`test/account-defaults.ts` checks that fresh online and Solo servers create no
built-in testing captain. Existing saves, credentials and station ownership survive
restart unchanged, and names do not grant radio stations. Explicit operator seed
files remain supported.

`test/save-generator.ts` creates and imports 346 Python-generated saves, covering
all 122 hulls, 27 station sites, six tiers and 191 public starting ports. It checks
real login payloads, invalid settings, file overwrite denial and station ownership
conflicts, release and reload. `test/save-generator-browser.ts` loads an exported
file through the Solo captain screen and plays the imported captain. The separate
HTTP regression verifies that online import/export endpoints return 404. Native
Windows generator GUI and EXE execution are not covered by these checks.

### Cross-platform persistence and startup

`test/persistence-platform.ts` runs production DB flush/recovery with a simulated
Windows platform and directory-only `EPERM` fsync behavior. It checks paired
player/world journal recovery from the first 3.0.0 startup crash, regular-file
fsyncs, propagated file-open/write/fsync and rename failures, and propagated POSIX
directory-sync failures. Real child servers start in online and Solo modes with
isolated saves under that simulation and serve the login page. This is not native
Windows or `.bat` execution certification. Windows retains file fsync and journal
recovery but cannot supply the POSIX directory-metadata durability barrier.

## Feature composition

All 15 provider namespaces from `docs/feature-inventory.json` and
`server/features.ts` are represented in the table above. Shared `bonuses`,
`shipStats`, `world` and `sessions` facades delegate to those providers; their
layer ordering and representative payloads are additionally characterized by
`test/features.ts`. That fixed baseline and `test/typecheck-contracts.ts` are
**not** substitutes for gameplay behavior tests.

## Exposed action mapping

The 50 registered `Game.createMessageHandlers()` action names below map to
registered test programs (or declared network-client children). This proves
reviewable representative action evidence and CI reachability, not every
operation value or malformed payload branch. Pre-dispatch `hello` is covered by
`persistence-auth.ts`, `http-api.ts` and real network/browser logins.

| Action      | Representative evidence in CI                                                                                                                                                                                                                                                                                                                                                            |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `combat`    | [combat-assist.ts](../test/combat-assist.ts), [combat-network.ts](../test/combat-network.ts)                                                                                                                                                                                                                                                                                             |
| `input`     | [armada-formation-network.ts](../test/armada-formation-network.ts), [armada-formation.ts](../test/armada-formation.ts), [bot.ts](../test/bot.ts), [combat-network.ts](../test/combat-network.ts), [fuzz.ts](../test/fuzz.ts), [message-routing.ts](../test/message-routing.ts), [sim.ts](../test/sim.ts), [input-audio-browser.ts](../test/input-audio-browser.ts)                       |
| `target`    | [v03.ts](../test/v03.ts)                                                                                                                                                                                                                                                                                                                                                                 |
| `tutskip`   | [v03.ts](../test/v03.ts)                                                                                                                                                                                                                                                                                                                                                                 |
| `land`      | [bot.ts](../test/bot.ts), [v11.ts](../test/v11.ts)                                                                                                                                                                                                                                                                                                                                       |
| `depart`    | [armada-formation-network.ts](../test/armada-formation-network.ts), [bot.ts](../test/bot.ts), [combat-network.ts](../test/combat-network.ts), [hailing-network.ts](../test/hailing-network.ts), [sim.ts](../test/sim.ts), [v03.ts](../test/v03.ts), [v04.ts](../test/v04.ts), [v101.ts](../test/v101.ts), [v203.ts](../test/v203.ts), [v21.ts](../test/v21.ts), [v24.ts](../test/v24.ts) |
| `jump`      | [armada-formation-network.ts](../test/armada-formation-network.ts), [bot.ts](../test/bot.ts), [v10.ts](../test/v10.ts)                                                                                                                                                                                                                                                                   |
| `trade`     | [bot.ts](../test/bot.ts), [v203.ts](../test/v203.ts)                                                                                                                                                                                                                                                                                                                                     |
| `buyship`   | [sim.ts](../test/sim.ts), [v21.ts](../test/v21.ts)                                                                                                                                                                                                                                                                                                                                       |
| `docks`     | [outfitter-wing-repairs.ts](../test/outfitter-wing-repairs.ts), [sim.ts](../test/sim.ts), [v21.ts](../test/v21.ts)                                                                                                                                                                                                                                                                       |
| `questdrop` | [core-actions.ts](../test/core-actions.ts)                                                                                                                                                                                                                                                                                                                                               |
| `outfit`    | [bot.ts](../test/bot.ts), [v203.ts](../test/v203.ts)                                                                                                                                                                                                                                                                                                                                     |
| `accept`    | [bot.ts](../test/bot.ts), [v12.ts](../test/v12.ts), [v203.ts](../test/v203.ts), [v24.ts](../test/v24.ts), [v26.ts](../test/v26.ts)                                                                                                                                                                                                                                                       |
| `abandon`   | [v203.ts](../test/v203.ts), [v24.ts](../test/v24.ts)                                                                                                                                                                                                                                                                                                                                     |
| `station`   | [sim.ts](../test/sim.ts), [v04.ts](../test/v04.ts), [v05.ts](../test/v05.ts), [v07.ts](../test/v07.ts), [v203.ts](../test/v203.ts), [v21.ts](../test/v21.ts), [v26.ts](../test/v26.ts), [station-progress.ts](../test/station-progress.ts)                                                                                                                                               |
| `buymat`    | [core-actions.ts](../test/core-actions.ts)                                                                                                                                                                                                                                                                                                                                               |
| `rename`    | [v203.ts](../test/v203.ts)                                                                                                                                                                                                                                                                                                                                                               |
| `note`      | [core-actions.ts](../test/core-actions.ts)                                                                                                                                                                                                                                                                                                                                               |
| `chat`      | [bot.ts](../test/bot.ts), [v06.ts](../test/v06.ts), [v26.ts](../test/v26.ts)                                                                                                                                                                                                                                                                                                             |
| `officer`   | [v05.ts](../test/v05.ts), [v21.ts](../test/v21.ts)                                                                                                                                                                                                                                                                                                                                       |
| `shuttle`   | [v05.ts](../test/v05.ts)                                                                                                                                                                                                                                                                                                                                                                 |
| `dock`      | [v05.ts](../test/v05.ts), [v101.ts](../test/v101.ts), [v203.ts](../test/v203.ts), [v21.ts](../test/v21.ts)                                                                                                                                                                                                                                                                               |
| `board`     | [v05.ts](../test/v05.ts), [v06.ts](../test/v06.ts), [v10.ts](../test/v10.ts), [v26.ts](../test/v26.ts)                                                                                                                                                                                                                                                                                   |
| `spec`      | [v08.ts](../test/v08.ts)                                                                                                                                                                                                                                                                                                                                                                 |
| `armada`    | [armada-formation-network.ts](../test/armada-formation-network.ts), [combat-network.ts](../test/combat-network.ts), [v06.ts](../test/v06.ts), [v26.ts](../test/v26.ts)                                                                                                                                                                                                                   |
| `holdout`   | [v09.ts](../test/v09.ts), [v26.ts](../test/v26.ts)                                                                                                                                                                                                                                                                                                                                       |
| `storyacc`  | [v10.ts](../test/v10.ts)                                                                                                                                                                                                                                                                                                                                                                 |
| `social`    | [hailing-network.ts](../test/hailing-network.ts), [v26.ts](../test/v26.ts)                                                                                                                                                                                                                                                                                                               |
| `trade2`    | [v26.ts](../test/v26.ts)                                                                                                                                                                                                                                                                                                                                                                 |
| `duel`      | [v26.ts](../test/v26.ts)                                                                                                                                                                                                                                                                                                                                                                 |
| `goal`      | [v06.ts](../test/v06.ts)                                                                                                                                                                                                                                                                                                                                                                 |
| `store`     | [faction-standing.ts](../test/faction-standing.ts), [v06.ts](../test/v06.ts)                                                                                                                                                                                                                                                                                                             |
| `colony`    | [v07.ts](../test/v07.ts)                                                                                                                                                                                                                                                                                                                                                                 |
| `arena`     | [v07.ts](../test/v07.ts)                                                                                                                                                                                                                                                                                                                                                                 |
| `exchange`  | [v07.ts](../test/v07.ts)                                                                                                                                                                                                                                                                                                                                                                 |
| `boards`    | [v07.ts](../test/v07.ts)                                                                                                                                                                                                                                                                                                                                                                 |
| `profile`   | [v07.ts](../test/v07.ts)                                                                                                                                                                                                                                                                                                                                                                 |
| `ping`      | [core-actions.ts](../test/core-actions.ts)                                                                                                                                                                                                                                                                                                                                               |
| `hail`      | [hailing-network.ts](../test/hailing-network.ts), [v11.ts](../test/v11.ts)                                                                                                                                                                                                                                                                                                               |
| `hailin`    | [hailing-network.ts](../test/hailing-network.ts)                                                                                                                                                                                                                                                                                                                                         |
| `hailopt`   | [hailing-network.ts](../test/hailing-network.ts), [v11.ts](../test/v11.ts)                                                                                                                                                                                                                                                                                                               |
| `order`     | [combat-network.ts](../test/combat-network.ts), [v11.ts](../test/v11.ts), [v21.ts](../test/v21.ts)                                                                                                                                                                                                                                                                                       |
| `jettison`  | [v11.ts](../test/v11.ts)                                                                                                                                                                                                                                                                                                                                                                 |
| `rivals`    | [core-actions.ts](../test/core-actions.ts)                                                                                                                                                                                                                                                                                                                                               |
| `bm`        | [v12.ts](../test/v12.ts)                                                                                                                                                                                                                                                                                                                                                                 |
| `arcacc`    | [v12.ts](../test/v12.ts)                                                                                                                                                                                                                                                                                                                                                                 |
| `promote`   | [v12.ts](../test/v12.ts)                                                                                                                                                                                                                                                                                                                                                                 |
| `lower`     | [v12.ts](../test/v12.ts), [v203.ts](../test/v203.ts)                                                                                                                                                                                                                                                                                                                                     |
| `bank`      | [v12.ts](../test/v12.ts)                                                                                                                                                                                                                                                                                                                                                                 |
| `pause`     | [v10.ts](../test/v10.ts)                                                                                                                                                                                                                                                                                                                                                                 |

## Known limits and deliberate exclusions

- Full browser CI uses pinned Chromium. Narrow Firefox/WebKit engine smoke covers
  login, keyboard/modal isolation, canvas fallback and exported/imported Solo saves.
  This is not shipping Safari, physical gamepad/touch, screen-reader, audible-output
  or exhaustive resolution certification. Synthetic input/UI checks verify software behavior only.
- Radio checks use bundled recordings and offline playback fixtures. They do not
  establish subjective listening quality or external broadcast availability.
- Visual assets have decode/identity/layout checks and supporting screenshots;
  most artwork is not a full-scene pixel snapshot. Luna's original wheel has an
  intentional frozen raw-pixel identity check. Do not regenerate it to hide a
  failure. Perceptual artistic quality still needs human review.
- Balance has explicit numerical thresholds, not a claim that every strategy is
  fair. Seeded simulations cover chosen scenarios, not all random seeds or
  multihour soak/load behavior.
- Mining, refinery, pressure, Star Dredge and towing have separate suites below.
  Their deterministic fixtures do not establish exhaustive human-play balance.
- The Python screenshot/crawler scripts and older specialist browser probes are
  supplemental/manual tools, not independently claimed CI coverage. Overlapping
  gameplay is covered by the canonical suites above; any unique uncovered
  behavior must get a registered test when changed.

## New features and changes

Follow [the repository regression contract](../AGENTS.md). Add meaningful outcome
and relevant denial/edge assertions in the same change, register them in the
manifest and update this inventory. New feature providers, dispatched action names and new test programs fail the
registration guard until explicitly mapped or classified. Review test assertions: adding
an inventory row, asserting a function exists or regenerating a snapshot alone
is not sufficient. Keep tests offline, isolated, bounded and reproducible.

## Production raw-grade integration

`cargo-grade-ledger` additionally covers the cargo writers in `server/game.ts`,
`server/fleetcmd.ts`, `server/frontier.ts`, `server/hangar.ts`, `server/coop.ts`,
and commodity grade rows in the market/info UI. [cargo-flows.ts](../test/cargo-flows.ts)
exercises real production methods and dispatch: strict legacy/corrupt login and import,
all nine raw-grade sales through depth/bonuses, common repurchases, exact denial,
jettison/job-aware partial recollection, five-simulation-second owner/fleet-only pickup grace (close-spawn Space.tick, root-authority denial, foreign partial pickup, respawn and exact expiry), frozen mining rewards/progression, unchanged
12 t + 1,500 cr station processing and supply, colony/plunder, graded exchange
escrow/partial fill/refund/offline delivery, atomic captain swaps/full-hold storage,
and death/Lodestar preservation. [cargo-ui-browser.ts](../test/cargo-ui-browser.ts)
clicks actual grade-specific sale/jettison buttons and verifies server inventory,
including a real rivals response between pointer-down/up on DUMP. It also checks
that the Captains tab still refreshes from the same asynchronous response.

Ledger tests cover accounting; the production cargo-flow tests cover the integrations
listed above. Cutting, survey, refinery, Dredge and controls have separate suites.
Accounting checks do not establish progression balance.
Legacy fixtures use `test/helpers/cargo-fixture.ts` for deliberate common-only
inventory replacement; production never silently repairs stale premium records.

## Mining cutting (`mining-cutting`)

The checked `features.mining` service owns deterministic persisted generations, staged readiness and server collision leases. `mining.ts` exercises real beam/Tapper fire, populated/quiet departed-Tapper overheat parity (ready and not-ready) and separated real Tapper-to-Tapper/beam release ordering and first-frame beam work, bounded retired history across 32 real regrowth/collection/TTL cycles with a live original parcel retained exactly once, finite budgets/grades, partial holds and recovery of a committed journal after an injected fault between snapshot renames. `mining-network.ts` uses real WebSockets for private bounded survey, cooldown, forged-authority denial, primary fire and reconnect refresh. `mining-controls-browser.ts` preserves default/custom/unbound keys, metadata, F/drone launch/recall and alternate steering. `mining-ui-browser.ts` drives actual mouse-aim cutting and partial pickup with gas labels at 0.8/1/1.4 scale, 2xDPI and reduced motion. Registered in both CI groups; screenshots are retained as evidence, not merely text inventories.

Clock advances only with unpaused server simulation; stopped servers do not cool/regrow offline. Catch-up never awards work/rewards. Config-changed fields fail closed pending explicit migration. Numeric tuning is provisional. Refinery, pressure, Dredge and towing coverage is documented separately.

## Mining refinery and pressure

`mining-refinery`: `refinery.ts` covers production binding quotes, fractional ready balances, multi-input denial atomicity, exact cancellation returns, access-loss collection, Fuel Cell sink, grade-specific finite orders and offline readiness. `refinery-economy.ts` checks explicit-spread 28 cr example, all recovery/recipe/residue/bonus combinations and repeated real production buy/refine/claim/sell cycles with price impact. `refinery-persistence.ts` injects real checkpoint faults before/after journal commit, between snapshots and after both writes, then reopens and retries. `refinery-network.ts` uses real authenticated WebSockets, private owner data, duplicate confirms, partial claims and exact-grade delivery. `refinery-ui-browser.ts` uses actual quote/confirm/cancel/claim/fuel controls, unrelated reply during pointer gesture, scale 0.8/1/1.4 and 2xDPI/reduced motion.

`mining-pressure`: `mining-pressure.ts` drives actual beam collisions and checks actual shields/armor,2 s telegraph, noise deduplication, persisted cooldowns, bounded encounter targeting and damage, explicit group opt-in/withdrawal, neutral/wing/Armada/newcomer immunity and Farside difference. Browser evidence includes readable countdown/radius and pressure warnings. Values remain provisional; this is not exhaustive random-seed or human balance validation.

## `industrial-dredge`

`dredge.ts`, `dredge-smelter.ts`, `dredge-corona.ts`, `dredge-economy.ts`, `dredge-network.ts` run in the server/network lane; `dredge-browser.ts` runs in browser CI. Cover actual T3/40-fragment no-plasma specialist build/parts, finite minor sweep and shared root/drone collection, legacy Lodestar prices/protection identity, useful large-rock bootstrap opportunities and append-only field migration without reminting original generations. Mobile production checks exact selected grades, 70/300 rational recovery at 6 input t/min, different frame partitions, pause/offline/hull/death persistence, pre-journal and post-unlink fault recovery. Stock tests use actual flight physics for 15 s harvest then 10 s exit at four starting headings; fine/coarse actual thermal damage and source depletion/full-hold/navigation denial remain bounded. Real WS checks auth/private modes/forged authority/reconnect. Browser checks actual build and plasma controls, custom/unbound migration, separate meters, scales/reduced motion and 108 unique heading/bank/glow frames through production rendering. Fixed-travel/selection twenty-minute production-boundary scenarios are explicitly not autonomous-flight, human-play or all-market balance proofs; finite plasma recipe purchase/process/sale loops and forward conversion graph are tested. Useful-work provenance persists per captain (first 64 participants, capped 1.5 s each); one qualifying opportunity per generation, deterministic account-order ties, never ordinary last-hit credit. Cooperative/restart attribution, jettisoned-input partial-work discard without transfer/residue loss, truthful off-in-corona warnings and conservative automatic route keep-out are tested. Production input-tick composition tests preserve navigation cancellation through stationary/low-speed rejection and immediate stop completion, moving rejection and safe normal routes; manual opt-in continues and intent clears the next tick. The real browser starts harvesting before stationary route rejection and observes authoritative cancellation. Actual in-reach industrial collectors share owner jettison grace and recover exact pure-grade mass after expiry. Baseline suites remain registered.

### `towing-motherlodes`

Registered unit programs `towing.ts`, `towing-persistence.ts`, `field-evolution.ts`, `towing-network.ts` and browser `towing-browser.ts` exercise production finite issuance, one-owner revision races, equipment/survey denial, hard speed limits and actual transit/lifecycle hooks, explicit private transfer, capacity-first exact grade delivery, four real journal fault boundaries/reopen/retry, malformed save rejection,300-second grace boundary and 100 bounded recovery epochs. Browser covers real canvas selection, custom/unbound bindings, preserved F fighter controls, full hold denial, two-page transfer/delivery,0.8/1/1.4 control bounds, static reduced motion, actual production body.scaled/CSS zoom with changed HUD geometry, single-voice mute/effects-bus attenuation, and new 384 px transparent motherlode decode/hash checks. Moving transfer regressions deny unsafe relative motion without mutating ownership/offer and cap safe handoff velocity immediately. These are bounded deterministic fixtures, not certification of all seeds, physical devices, human profitability or every removal/economy interleaving.

## Mining panel usability

`mining-panel.ts` tests existing Survey-role / tow-rig eligibility, nonzero operational cargo capacity, full and mission-loaded holds, and active-control safety. `mining-panel-browser.ts` exercises the production drill toggle at the former bottom-left panel anchor, default collapse, click/keyboard dismissal, full-hold and ship/landing transitions, independent hail inbox, and responsive final-control reachability. Transition snapshots are explicit client fixtures, not claimed server ship transactions. Existing mining, Dredge and towing browser suites exercise actual authoritative operations through the collapsed panel. Both tests are registered in canonical CI lanes.

## Account switching

`logout-browser.ts` runs real online and Solo servers with isolated saves. It covers
Escape precedence for typing/options/map, default Cancel/keyboard confirmation,
Solo temporary and preexisting pause, flight logout to login without reload,
immediate durable dock/save, cleared credentials/chat/social/navigation state,
refreshed Solo slot summaries, no automatic relogin and repeated account switches.
It does not simulate every network outage or certify every peripheral device.

### Automatic motherlode collection and mining shortcuts

`towing-auto-delivery.ts` covers authoritative load-centred port collection at
all towing speeds and headings, a swept tangent crossing, tug-only proximity
denial, rejected ports/standing, full-hold safe reserved detachment/reclaim,
exact grade conservation and owner-only idempotent receipt replay.
`mining-keys-browser.ts` drives real browser keys for scanning, attach/detach,
manual delivery, Dredge modes/input/all-off, group consent and panel toggle;
it checks one-shot repeats, typing/modal/landed denial, remapping/unbinding and
effective labels. `towing-browser.ts` additionally uses Home/End for explicit
cross-browser transfer and flies into the port for automatic delivery. The
WebSocket suite exercises full-hold release and reconnect/reclaim delivery. Selection fields retain native keyboard navigation; focus
must leave text/select fields before global game shortcuts apply.

Mining defaults: V scan, backtick panel, comma attach/detach, period deliver,
Home offer transfer, End accept transfer, minus group consent, left/right
brackets Sweep/Harvest, semicolon Smelter, equals set selected input, backslash
all off. All use the existing rebind UI. The exact legacy automatically inserted
four-null mining bundle is upgraded once; existing custom/individual unbound
keys and subsequent explicit unbinding are preserved. Conflicting defaults
remain unassigned rather than displacing an existing control.

## Landing cruise heading

`landing-autopilot.ts` runs production guidance and shared flight physics for every
stock hull across four port radii, inward/outward and lateral drift, including
long capped-speed approaches. Four light/heavy hulls additionally assert targetward
cruise orientation at 90% and 100% maximum speed with tiny lateral drift. Existing
settled-authority, stale snapshot and duplicate request guards remain exercised.

`landing-autopilot-browser.ts` runs in the browser CI lane: real L
input, delayed WebSocket inputs, authoritative cruise heading, retrograde braking,
one successful server landing, manual steering takeover and permission denial.
Fixtures use disposable Solo saves and seeded ambient conditions, not player saves.
Targets are static stellars (the production landing contract); moving-target
rendezvous, arbitrary network jitter and cross-browser behavior are not claimed.

## `native-dropdown-theme` — native dropdown appearance

`dropdowns-browser.ts` runs in the browser CI lane. It checks black backgrounds,
white text and dark native popup hints on actual dynamic DOCKS controls, hangar
crew/job selectors, station relocation, shipyard sort, refinery, map commodity
and initialized mining/towing controls. Real dock assignment survives a server
re-render; keyboard sorting and focus outlines remain functional. Synthetic
optgroup/disabled cases cover future controls. Native OS popup rendering and
forced-colors overrides are platform-owned, not cross-platform screenshot proof.

The same browser program covers `shipyard-selection-scroll`: selecting a ship
from the bottom of the actual catalog immediately resets `#landbody` to the top,
exposes stats and purchase controls, and preserves the selected hull and money.
An unrelated production renderer refresh preserves the browsing scroll offset.
Ship cards currently have no keyboard-selection handler; native sort keyboard
interaction remains covered. No purchasing is performed by selection.

Login-scene coverage also rejects the removed bottom-left location caption and
checks the title banner’s centered flex alignment, measured text fit and retained
30 px horizontal inset at desktop/mobile widths and 0.8×/1.4× UI scales. The Solo
client-system test checks the same banner while exercising save/login workflows.

## `trade-custom-amount` — entered market quantities

`trade-amount-browser.ts` runs in the browser CI lane against isolated deterministic
Solo saves. Native black/white number fields submit actual buys and sells; empty,
zero, negative, fractional and int32-overflow values never reach the wire. Tests
exercise exact quantities, common-first graded cargo, hold/inventory caps, authoritative
insufficient-funds denial, unchanged presets, and draft/focus retention across a
market repaint. A 390 px viewport exercises controls, but the game's existing
narrow-screen sidebar/landing layout is not claimed to be fully responsive.
The server retains authority for bulk discounts, specialist bonuses and finite
buyer demand; browser amounts do not guess an affordable limit from list prices.

## Natural mining renewal

`mining-renewal.ts` (canonical unit lane, `mining-cutting`) exercises exact 300-second
quiet renewal and existing depletion deadlines for ore, gas and shards through
production mining operations. It checks full-health new identities, no stale-object
damage/reward, active/recent cutting and sweep protection, lazy late-stage escrow
conservation, bounded history, stable restart and version-1 migration, paused clock
and no healthy-generation churn. `field-evolution.ts` additionally checks renewed
motherlode full health; `dredge-corona.ts` verifies an exhausted plasma source
replenishes enough for another actual harvest. Their existing timing/budget rules
are unchanged. Fixtures are isolated deterministic simulation cases, not exhaustive
seed coverage, rendered resource-reappearance certification or long-run balance.

## Concordia legacy-world compatibility

The Eventide legacy-world fingerprint normalizes only the intentional qgate display-name change after explicitly asserting Concordia; all other legacy properties retain the existing golden hash. The home-system regression preserves stable qgate and qstation IDs.

## Dock selection names

Dropdowns browser coverage uses production dock markup for missing, empty, whitespace,
default and custom names in lead/wing selectors. It checks HTML escaping, selected
IDs, flying-current labels and wing-only eligibility, then exercises actual server
assignment and re-rendering through the existing live browser case.

### Motherlode material artwork

`motherlode-art.ts` checks authoritative generated ore/gas/shards and visibility-safe mapping.
`motherlode-art-browser.ts` exercises production canvas material pixels (not labels),
free/attached parity, neutral undiscovered/unknown objects and failed-image geometry.
The same renderer handles detached objects. Screenshots show all three states plus
unscanned objects. Existing towing browser tests retain real survey/attach/delivery coverage.
No new message actions or save fields. Server payload already exposes resource IDs;
artwork now respects its `revealed` flag rather than disclosing composition before survey.

## NPC landing orientation

The registered v201.ts case reproduces perpendicular cruise with three hulls and three speed-ceiling fractions at both planet and station destinations (18 deterministic cases). Production NPC AI and shared physics must align toward the destination, then emit a real landing event within the original radius/speed bounds without fuel consumption. Existing randomized trader arrival and moving-leader escort checks remain. This tests simulation headings and arrival, not every device or rendered bank animation.

- `ship-turning-assets-browser.ts`: all 122 actual WebP atlases decode 108 nonempty base frames, every bank differs from its neutral heading, enabled glows match dimensions, and stock-rate runtime turns select both valid banks. Original large-hull repair also has an inspected 17-hull contact sheet.

### Multiplayer Follow coasting

`armada-follow-coasting.ts` exercises unchanged production physics for seven stock hulls,
including Constitution and slow-turn capital ships: sixty-second matching without
circling/stopping, achievable world-velocity limits, and normal/slow ship
reacquisition after a moving leader stops, restarts and turns sharply. Mixed stock
hulls additionally exercise faster-follower capture and physically unreachable
faster-leader separation without catch-up boosts. Formation cases explicitly
check root ownership, disabled/jumping suspension, missing leader sessions, and
ordinary fuel/disabled/invalid-route jump denial without fuel consumption.
`armada-follow-two-clients.ts` uses two isolated Chromium contexts and distinct
disposable multiplayer accounts, direct INVITE auto-formation and JOIN through the
actual UI (no friendship/FORM prerequisite), no implicit flight consent on JOIN or
departure, explicit Follow off/on and real-key takeover. Leader-only guidance
replaces the inapplicable self-follow control; followers retain explicit opt-in.
The disclosed fixture starts an attainable matched cruise with small lateral
velocity error; it accelerates production ticks without changing flight physics.
Real key gestures run on the native timer and wait for authoritative release;
only the long coasts are accelerated. A turn beyond a right angle and a bounded
250ms thrust-release delay exercise restart input without relying on immediate
browser delivery. The leader must retain catch-up speed headroom. It asserts sustained authoritative movement/heading, sharp-turn slot
recovery and manual override. Existing formation/network tests retain fleet envelope, consent,
combat/landing suspension and leader-jump coverage. The five-client network case
also closes the actual leader WebSocket, asserts follower suspension, reconnects
the same elected leader, departs again after logout safe-docking and checks
formation resumes without changing the root. Browser evidence is Chromium
only; not exhaustive hull/loadout or real WAN latency testing.

### Ship-function cockpit stack

- `ship-function-stack`: ship-functions-browser.ts and mining-panel-browser.ts exercise toggles, disabled mining, action messages, multi-panel flow, long chat and 1440/1024/800/640 px layouts at 0.8–1.4 UI scale. Capability fixtures are explicit; authoritative behavior remains covered by network suites.
- Inventory: Combat, Mining (survey/cutting/group help), Towing, Dredge Processing, Fleet/Formation wing orders, Drones secondary-input shortcut. Hailing uses its indicator/modal rather than a duplicate COMMS panel. Armada Follow stays in Allies; server follow is unchanged.
- Icon variants: Combat A, Towing B, Fleet A, Drones A, Hailing B and Processing C. Drone shortcut preserves secondary fire, including other secondary weapons.

### Chat history projection

The keyboard-scroll check drains each programmatic reset's own native `scrollend`
before arming the PageDown completion listener. A previously queued reset event
must not falsely finish a later gesture; the exact no-jump assertion is unchanged.

System: `communications-log`. `chat-projection-browser.ts` exercises one live log
moving between console and holographic projection, native keyboard activation,
real chat sending, the existing 40-entry retention limit, escaped inbound text,
history scrolling without incoming-message jumps, focus restoration, Escape before
logout, automatic retraction for menus, sidebar pointer resizing, six narrow/scaled
viewport combinations and reduced-motion support. Screenshots use the actual game
with isolated deterministic accounts and seeded chat conversations. The `chat` action
mapping includes this test; authoritative channel scoping remains covered separately.

### 3.1 cockpit restyle

System: `cockpit-restyle`.

`cockpit-browser.ts` checks the bundled Pixelify Sans font is genuinely loaded,
retains the original animated login scene/title and production landed illustration,
and observes actual canvas ship-name and ship-chat drawing with that font. It
exercises eight dock buttons, real Map/Hail activation, the single connected
full-height tray trim, actual pointer resizing and persisted width, correct initial
canvas backing pixels before resize, native
keyboard tray/tab activation, popup close, and flight/chat separation at 1440,
1024 and 640 px (including 1.4 UI scale). `ship-functions-browser.ts` retains
multi-panel, long-history scrolling, all existing actions and keyboard/wheel
reachability coverage. Existing sidebar/catalog/outfitter tests now explicitly
open the collapsible tray before accessing its content; sidebar width persistence
uses the dedicated tray-width preference. Menu tabs fit a 520 px scale-aware
default and wrap without horizontal scrolling at narrow or saved widths; saved
width survives a narrow-viewport reload and recovers when the viewport expands. Chat-bubble renderer mocks include its
new bezel/scanline drawing primitives. Tests use isolated saves and offline assets;
these Chromium checks are not exhaustive device/OS coverage.

## 3.1 `presentation-polish`

Canonical browser case polish-browser.ts checks engine-mask extrusion across
three hulls/four headings, boost/idle, neutral texture concealment, revealed
crystal distinction, gesture gating, music restart/cancel, ambience teardown and
mute. Production-renderer fixtures are not an all-hull performance benchmark or
a human listening test.

Login title checks cover standalone placement, 1440/640-wide and 480-high screens,
independently traced electric accents, reduced-motion static fallback and animation
pause after login. New 64-second synthesized horn/string score uses the same tested
music bus, gesture gate and stop/restart lifecycle; subjective timbre needs listening.

### 3.1 exhaust raster budget

The polish browser case retains aft-direction/normal/boost/idle checks and rejects
per-draw blur on the layered engine masks. The source glow is already softened.
A 60-frame, readback-forced Chromium raster comparison on the industrial hull
measured 1251–1307ms with repeated blur versus 100–104ms without it. These are
bounded local measurements, not a universal FPS claim or proof of a hosted
landing failure's cause. Flight physics, autopilot and landing assertions remain
unchanged. Browser CI now allows 30 minutes for the expanded full inventory;
individual subprocess deadlines remain 180 seconds (network-systems: 240).

### 3.1 cockpit-cursors

System: `cockpit-cursors`. The canonical cursors-browser.ts test decodes all ten
transparent 32 px assets and checks browser computed cursor states and hotspots,
disabled/ARIA-disabled controls, text entry, resize, map and busy precedence.
Class selection is a CSS fixture, not a flight hit-testing claim. Native OS cursor
painting is not captured by headless screenshots. Artwork is reviewed on dark
and light backgrounds. Rebuild with python3 tools/cursors.py (Pillow build only).

### Empty-space target deselection

The registered mining-ui-browser.ts case selects a second real captain, clicks
verified empty flight canvas at 2x DPI with mouse aim both off and on, and asserts
local deselection plus the outgoing target-clear message. It then reselects the
captain and retains the existing rock-selection, held mouse-aim cutting, clean
release and pickup checks. Object clicks retain their existing selection paths.

### Target snapshot race and hosted simulation timing

The mining UI regression replays an authentic pre-clear server snapshot immediately
after the real target-clear command, then waits for server confirmation. This
reproduced target resurrection before the pending-clear guard; clearing now remains
stable until confirmation. Reselecting and resource cutting retain their checks.

The fleet two-client test still requires 180 simulated seconds of post-turn
reacquisition and unchanged formation bounds. Its accelerated clock needs at least
13.5 wall-clock seconds; the former 15-second wait expired on hosted CI before the
simulation reached the observation point. This one wait allows 30 seconds, within
the unchanged 180-second enclosing process deadline. No flight physics changed.

### HUD layout

`cockpit-browser.ts` exercises 520 px scale-aware defaults, real pointer resizing to 760 px at 0.8/1/1.4 UI scales, restored local-storage settings in a fresh browser context, viewport-shrink bounding without destroying the saved preference, COMMS/utility presentation, literal incoming-hail edge containment and modal suppression. The CSS upper bound remains 60vw and minimum 280 px; no widened maximum is claimed.

- `landed-live-scene` — Live landed observation: test/landed-live-browser.ts (browser CI) uses isolated
  seeded servers in online and Solo modes. Verifies authoritative and interpolated
  real traffic displacement across Overview/Trade/Outfitter, nonblack canvas,
  no controllable landed entity or leaked flight input, and explicit Solo pause /
  resume snapshot semantics. Depart/redock uses the real controls and authoritative
  landing handler, with a stopped, in-range departure fixture so scene restoration
  does not depend on a random flight approach. Varied approach/drift and delayed
  input remain covered by `landing-autopilot-browser.ts`; this is not additional
  autopilot coverage. Paired actual frames and motion JSON are retained.
- Expanded cockpit column: test/cockpit-browser.ts verifies full-height Tray,
  utility reachability/non-overlap and adjacency at 1600/1440/1024/640 widths,
  default/max Tray widths and UI scales 0.8/1/1.4, alongside persistence/real drag.

The landed-live-scene browser contract also switches all 11 selectable faction
stores, decodes each original insignia image, checks its canonical menu color,
top-left header separation and narrow/high-scale reachability, while verifying
unearned purchases remain disabled. All 16 roster entries have authored assets;
non-store regions/hidden powers do not gain store access.

## Ordinary port-service boundary

`market-materials`, `cargo-grade-ledger`, `missions-passengers` and `economy-32`
cover the ordinary port owner with their existing
transaction, denial, capacity and persistence assertions. `economy-32.ts` also
replaces the market provider after service construction and proves a denied trade
changes neither credits nor exact cargo lots; the provider retains its Game
receiver. Constructorless ship-economy fixtures explicitly initialize the port
service and retain stock/refit/recruitment assertions.

## Native browser engine

`excalibur-runtime` registers `excalibur-runtime-browser.ts` in the browser CI lane.
It exercises the production Engine/SpaceScene, display-only physics and decoded
native Sprite registries, physical-pixel camera picking at DPR 1/2 and zoom limits,
responsive canvas size, keyboard thrust, typing/blur release, sequenced input,
actor removal, local module loading and a script CSP without unsafe-eval. It runs
Chromium explicit WebGL/Canvas and automatic backend selection. Landed traffic
checks use supported Engine screenshots and native Graphics post-draw callbacks,
retaining real-pixel and rendered-motion assertions. Existing input/audio, logout,
sidebar, asset and gameplay assertions remain registered.

Projectile pixels are compared with an uncropped production procedural reference at
zoom 2, three headings and two same-weapon speeds in both iteration orders. Missing
and extra visible tail pixels are bounded independently of registry/Sprite counts.
Projectile frames must be drawable on their first update without any canvas PNG
blob encoding; that round trip previously stalled busy fights. Nearby speeds share
a cached canvas at a fixed phase and zoom, while a different trail bucket gets its
own canvas. Every catalog projectile look is checked across all 16 animation phases:
static looks share one canvas, animated looks retain distinct frames with changing
pixels, and wrapped phases reuse their cached canvas. Replacement snapshots retain
Actors and refresh position, heading and opacity; shrinking and empty snapshots
remove obsolete Actors.

These checks do not establish cross-browser parity, every weapon animation, a
frame-time improvement, or all lifecycle/network latency combinations. The Canvas
fallback cannot apply the WebGL additive glow material.

## Planet render caches

`planet-render-cache` registers `render-cache-budget.ts` in the unit lane and
`planet-cache-budget-browser.ts` in the browser lane. The unit test checks
least-recently-used eviction by retained bytes, that entries used within the live
window are never evicted even over budget, exact byte totals across replacement and
deletion, budget changes and the typed-array/canvas size estimate.

The browser test draws the real catalog worlds of the 12 busiest systems in Chromium,
one system at a time, through the production `planetSprite` path. It runs the tour
twice with planet artwork loading and twice with every planet asset returning 404,
which forces the procedural fallback. Each pair compares unbounded caches with the
shipped budgets: unbounded retention must outgrow the budget, bounded retention may
exceed it only by the live system's worlds, the worlds on screen must keep the same
cached sprite objects for 20 further frames, and an evicted system must rebuild when
revisited. The JSON evidence records per-system retention and the rebuild time.

Sizes are estimates of typed-array and canvas backing stores. They exclude decoded
image elements, GPU copies and browser overhead, so they are not process memory. The
tour is a deterministic cache workload, not recorded player sessions, and rebuild
timings depend on the host.

## `faction-store-locations`: local stores and standing

`faction-stores-browser.ts` loads real saved captains at all 11 eligible faction
landings, including non-trade ports where available. It checks one local store
button, no button in the DOM at neutral or visitor landings, local-only selectors,
all stores at the captain’s own Personal Station, decoded insignia and actual
purchases. The selected faction’s standing appears above the store on open and
updates from the server’s player payload after buying a standing writ.
`faction-standing.ts` checks every landable public port and resource-preserving
foreign-faction, unclaimed station and flight denials through store messages.

`input-audio-browser.ts` checks login music before activation under explicit
allowed and blocked autoplay policies, real-interaction recovery and stopping
the theme on login. Its native timer and DOM checks retain the newcomer notice
through ordinary-toast bursts, ordinary expiry and the end of its ten-second
fade. Other notice timing is unchanged. Radio queue and album behavior remain
covered with the simplified ON AIR label. These checks do not certify physical
speaker output or every device’s autoplay policy.

## Responsive cockpit and attention

`responsive-hud-attention`: canonical unit tests `attention.ts` and `attention-scan.ts` cover current weapon-target selection, cancellation, death, disabled sources, system departure and recent patrol-scan expiry. Orange reports a completed scan, not a new scanning mechanic or inferred nearby threat. The real patrol action is exercised for both contraband outcomes and scan eligibility limits.

`responsive-hud-browser.ts` measures fixed controls, expanding center chat, sidebar clearance and overflow at 1920×1080, 2560×1440, 3840×2160, 3440×1440 and 5120×1440. Real authenticated game screens cover flight, landing, map, captain details (shortcut and original key), settings, multiple function panels and expanded chat. Narrow checks include 1440×1000, 1024×768, 640×700 and 640×480. A deterministic server fixture supplies targeting/recent-scan state through real snapshots; the browser checks combat precedence, server-driven expiry and visible reduced-motion colors. Existing cockpit/sidebar/function/chat and native runtime regressions remain registered. This is Chromium coverage, not a cross-browser or physical-device claim.

`attention-runtime.ts` exercises actual Game/Space ticks with two flying captains and one docked observer: real NPC AI/fight targeting, real patrol-scan production, per-recipient packet isolation, unchanged public tuple shapes, AI cancellation, the production NPC disable threshold and incapable-patrol denial. Native `nakama-network.ts` additionally verifies encoded attention keys and boolean types on actual authenticated Goja match snapshots. This native contract check does not claim deterministic native combat encounters; the shared real-game fixture owns that evidence.

The responsive browser test also opens the tray at 1100/1101/1200/1250/1251 px, checks utility controls cannot intersect chat and exercises the input. It disconnects the real game socket from both active alert colors and checks immediate clear and successful reconnect with a new authoritative ship identity. The default sidebar still fits all seven tabs, including unread badges, without shrinking the larger text: spacing comes from tab padding/gaps instead.

## Sidebar allocation and landing feedback

`sidebar-sizing-browser.ts` exercises the lower menu's top divider with mouse,
touch and keyboard input, saved desired heights, UI scaling, viewport limits and
independent resets. The lower menu fills the space below its divider; the minimap
uses the remaining space. Temporary viewport limits do not rewrite saved sizes.

`sidebar-gauges-browser.ts` reads actual server snapshots after fixture damage and
fuel changes, then checks production shield regeneration, meter fill, visibility,
socket-close clearing, reconnect and account switching. The expanded sidebar hides
the duplicate viewscreen readout. These synthetic accounts do not establish every
hull or assistive-technology combination.

`landing-feedback.ts` checks situation changes and scoped refusal recognition.
`landing-autopilot-browser.ts` sends repeated real landing keys during physical
approaches and counts newly created notices, not just retained DOM children. It
also repeats an authoritative permission refusal after five seconds. Unrelated
toasts retain their existing behavior; no global notification timeout is used.

## Login traffic and purchase audio

`login-traffic.ts` checks the real catalog subset, early light craft, progressively
stronger formations, trailing escort slots, the eleven-sprite bound and loop reset.
`audio-flyby-browser.ts` supplies a short decoded WAV as the score fixture, then
uses the real WebAudio source and context to observe visible mid/late hull draws,
suspension, natural loop and immediate login stop. It also buys through a real
Trade control and checks the decoded selected-B 320ms signal and actual independent mixer
bus gains. A seeded station owner buys to the hangar through the confirmation
dialog; stored-ship count verifies settlement. Cancelled confirmations, sales
and disabled controls do not play the purchase signal.
The owner-supplied theme remains unchanged; `radio-audio.ts` retains its recording
hash checks. These checks do not establish subjective listening quality.

`purchase-audio.ts` reproduces the checked-in original oscillator signal exactly
and checks its duration, mono PCM format, 10.5% peak and 4% RMS, attack and tail. Both the focused
generator and the broad legacy generator use the same source. `audio-defaults-browser.ts`
checks fresh, empty and malformed options plus saved zero, mute, fractional and
full-volume values. Existing options migrations remain in place; no new preference
migration or reset is introduced.

The existing login-scene browser test retains the actual station/planet artwork,
lamp-brightness, reduced-motion event-loss, resize and lifecycle checks. It verifies
that blocked autoplay holds traffic still before any user activation, then uses a
real click to start playback before checking movement of all six courier hulls. Station
lamp dimming uses a precomputed black alpha mask instead of filtering the full
mutable atlas on each paint. Private headless 4x-CPU profiles are constrained-host
comparisons, not physical midrange-laptop or audible-output certification.

## Planetary landscapes and portraits

`planet-portrait-art` covers all mapped planetary scene identities, colony stage selection, asset hashes and portrait allowlists. `portrait-persistence.ts` exercises selection denials, authenticated-account-only mutation, bounded acknowledgement tokens and reload through Solo journals and the native checkpoint/CAS adapter. `planet-portrait-browser.ts` checks actual landed colony rendering, the personal chooser (every choice icon decodes under the current artwork version) and hail windows, denied or unconfirmed save recovery, stale-reply isolation and Captain-tab controls at narrow/scaled and desktop sizes. `nakama-network.ts` verifies selected portraits through real Nakama authentication and match ingress, spoofed-target isolation, public lookup, PostgreSQL checkpoint storage and a native service restart. The adapter unit fixture remains a separate bounded persistence check. Main-story portrait coverage checks the five character identities, completion-specific faces, exclusion from player and generic pools, text-only fallback, decoded browser images and narrow-screen dialogue controls.

## Functional cockpit layout

`cockpit-layout-browser.ts` runs the functional cockpit through a real
local game fixture. At 3440×1440 it checks the map at 1380×989 and the landed
window at 1610×856.75, each 15% larger than the previous size caps. It verifies
centered labels, identical LED geometry on pressable controls, and a non-clickable
warning lens above Captain without a button LED. Profile selection and confirmed
saving use a tab inside Captain, with no separate flight or landed profile button.
The browser checks keyboard isolation, focus containment, nested settings Escape
priority, actual key reassignment, and narrow/scaled menu containment.

Existing mute/mixer, portrait-denial/persistence and authoritative alert regressions remain registered.

`audio-flyby-browser.ts` also verifies that the retired `10110` upgrade sound is
absent from the shipped assets/catalog and cannot load through numeric, string or
preload calls. A real cargo purchase and subsequent sale/hangar refreshes retain
the quiet purchase confirmation without replaying that sound from `landed`.

## Release/platform gates

`release-platform-gates` maps `release-readiness.ts`, `archive-verification.ts`,
`platform-browser-smoke.ts` and existing `packaged-runtime.ts`. Readiness tests deny
every missing, failed, cancelled or skipped required lane. Archive verification
tests verify exact bytes/modes/inventory and reject tampering, traversal, symbolic
links, duplicates and missing files before extraction. Chromium runs the registered
engine smoke in the canonical browser group; additional CI jobs run that same case
on Firefox and WebKit. `release-archive-smoke.ts` is a CI artifact entry point, not
a skipped canonical regression: it requires complete-archive inputs, executes on
three native OS families and retains commit/hash/runtime reports. It requires clean
launcher IPC shutdown and verifies the purchased balance after restart, without
waiting for the periodic save timer. See
[release readiness](RELEASE-READINESS.md) for scope, manual checks and rollback
limits, including pending cross-version fixture integration.

### Story groundwork

`story-foundations` is covered by the existing Gateway, story and expedition suites. The Gateway suite reuses its isolated game for the stable stellar ID, Concordia approach, unchanged qv rewards, spoiler bounds, fixed Aureole hulk, and accepted expedition compatibility checks. Browser coverage verifies both transit directions and the stationary non-interactive scenery. The existing generation golden remains unchanged after explicitly reversing only the authored Gateway relocation and lore edits. No Index/Nhal combat, later story acts or endings are implemented by these checks.

## Index worksite

The `index-worksite` contract extends the existing Eventide and Gateway browser
fixtures. The server case checks neutral passage despite standing, exact-rock
warnings, captain/wing attribution, innocent bystanders, NPC damage, disengagement,
unload-safe health and finite replacement counts, conserved extraction, deliberate
salvage theft and the peaceful per-captain Last Survey quest. The browser checks
live sprite decoding, claim data and the real hail controls. Transformations,
Kernel tactics, regional sorties and later story missions are not covered here.

## Personal story realities and endgame artwork

The `story-realities` contract uses `story-realities-browser.ts` to exercise the native actor registry with isolated viewer
state: Act III ghost opacity, engine glow, friend-game precedence, different-ending
ghosts, a persisted real Reduced effects options toggle, faded nameplates and opaque target outlines. Its helper
checks ownership chains, cyclic owners, NPC faction lenses and private scenery
visibility. The browser also denies selection of hidden story systems and captures
a saved captain flying in Beyond the Rift with the supplied arrival backdrop and
animated atlas. An eligible saved captain chooses the Table through the real story
UI, launches into their own ship view, and watches the supplied awake ark render
without adding a targetable combat entity. These presentation fixtures do not grant progress or prove online
combat authority; authoritative choices and access gates have separate story tests.

## Story continuation and faction encounters

`story-continuation` checks the authoritative Acts II and III lifecycle, landed
choice denials and replay protection, per-captain flags, exhaustive ending gates,
actual journal persistence and hidden-place travel gates. Portal tests require a
fitted unique Harness, verify turn-away without it, cross and return through the
real server operation, and deny extra rewards or outfit resale. Authored quest
prerequisites and all destination references are checked separately from combat.

The registered Eventide helpers exercise native Nhal population staging, finite
Watcher and brood budgets, latch/status escape, regeneration, rivalry and no
generic bounty. Transforming Index checks cover neutral captain attribution,
Mutable/Hive postures, Loom clearance and shared finite extraction, real Trident
blades with persistent loss and one reward, bounded Kernel reboot and Talon escape.
Browser checks cover supplied faction artwork and the actual private Vigil,
prepared Dreamer witness route and player-ship ark departure. The all-port job
regression includes the real Table board, denies locked queries and hidden offer
injection, and keeps encounter-only salvage out of public freight. Original graph,
freight, arc and radio-tour goldens retain their baseline hashes after exact
reviewed story-content reversals. Stock travelling hulls retain closed-loop landing
and banking bounds; deployed NPC work postures keep all braking checks and have
explicitly tested transit counterparts. These are deterministic
fixtures, not an exhaustive balance, seed, hardware or human multiplayer playtest.

## Performance and operational health

The `performance-health` system registers `health.ts` for bounded numeric sampling, UTF-8 sizing, failed-checkpoint freeze
privacy, and enabled/disabled authoritative parity across six seeded workloads.
The scenarios cover real combat, mining/towing, concentrated/distributed captains,
reconnect state and accelerated soak. Snapshot/checkpoint size ceilings guard
fixture payload growth, not latency on unmeasured hardware.
`excalibur-runtime-browser.ts` also checks opt-in update/draw samples in the actual
Canvas/WebGL Engine at its existing DPR combinations and saves numeric reports.
See [PERFORMANCE.md](PERFORMANCE.md) for interpretation, commands and limits.
In-process memory-CAS measurements exclude production PostgreSQL/network latency;
accelerated soak does not establish wall-clock or multihour endurance.

## `diagnostic-captures`: opt-in support captures

`diagnostic-capture.ts` checks that the recorder is off until started, copies
only allowlisted fields for the previewed commodity and keeps chat, names,
passwords, tokens and other cargo out of the exported text. It covers the
entry-count, 30-minute lifetime, per-entry and file byte limits, a full 50-entry
order-heavy export/replay round trip, stop/clear behavior and bounded build labels.
Corrupt JSON, non-object roots,
oversized text (measured in UTF-8 bytes), other formats, other versions, unknown
fields, missing/null required terms, other-commodity data, unsupported subsystems
and non-finite numbers are
rejected without throwing. Exported captures and the committed
`fixtures/diagnostic-capture-v1.json` replay with exact results; tampered results
and internally inconsistent cargo report mismatches. The replay tool's exit
statuses are checked for matching, mismatched, oversized, newer, missing and non-file inputs.

`diagnostic-capture-browser.ts` uses the actual Settings controls and market in
a Solo game: typed estimates are not recorded before opt-in, are recorded after
it (market re-renders add nothing), export as a local download that parses and replays offline without the
captain name, and stop being recorded after the box is cleared. Clear discards
entries. Logout clears entries and opt-in; a second captain starts with recording
off and no previous account projections available to export.
No non-GET or cross-origin request is made while recording and nothing
is written to browser storage. Only the trade-estimate subsystem is covered;
whole-world, server settlement and other subsystem replay remain out of scope.

## HUD containment and availability

`cockpit-layout-browser.ts` checks expanded-tray utility buttons and vent against
the inset cockpit frame at 1920, 2560, 3440 and 5120px widths, at 0.8×, 1× and 1.4× UI
scale. Status, navigation and menu panels must clear the sidebar trim by at least
3px. It also checks that HAIL stays visible and disabled while landed and becomes
enabled after takeoff.

`motherlode-art-browser.ts` checks that non-mining ships see the physical deposit
without its targeting outline or label. Mining-capable ships and captains actively
towing a load retain highlights. Both programs run in the canonical browser suite.

## `playtest-clarity`: readable bonuses and HUD-clear arrows

`playtest-clarity.ts` checks that every research node and syndicate trait bonus
reads as words, such as "+10% shields", with no raw stat keys. It also checks the
off-screen arrow placement against a 21:9 career card: the arrow keeps its
bearing but stops before the card and its label room, and arrows on other
edges are unchanged. Overlapping cards are cleared regardless of their order.
The card rectangle is measured from the page at runtime; the geometry checks
use fixed rectangles. `cockpit-layout-browser.ts` checks map canvas height,
reachable details and the narrow-screen fallback from 640×300 to 2560×1080.
`radio-content.ts` also verifies that audio reimports preserve later uploads and
reject missing supplemental recordings.

## `difficulty-curve`: Station Tier 3 and fair fights

`difficulty-curve.ts` checks the truce carried over after Station Tier 3: it holds
until 5 kills or 30 jumps from the build, ends early at 150 ship power, and posts
one end notice. Saves already past Tier 3 and the protection opt-out stay
unprotected. It runs 300 ambient raid spawns per case through `spawnTraffic` and
checks every group stays within the power budget for the captain present, with
the weakest raider as the floor. Farside and empty systems are unscaled. Mission
danger labels are checked for patrols and bounties against a 72-power Caravel, and
cargo jobs keep the system rating. The career practice raider is checked for size,
one-at-a-time spawning and the systems it skips. The Caravel stock loadout is
checked for its Cinder Driver. `main-map-protection.ts` keeps covering the truce's
targeting rules. Raid balance across real multiplayer sessions is not simulated.

## `modal-input-ownership`: dialogs and manual controls

`overlay-input-browser.ts` checks nested confirmation/quit and
confirmation/boarding priority, one Escape consumer, Tab wrapping and focus
return. Native Enter cancels or confirms according to the focused button. The
fixture checks a custom thrust binding, release-latched keys and gamepad controls,
blocked outgoing actions, canvas pointer and touch handlers, disabled/repeated
boarding shortcuts, typing and callback cleanup on reset. It uses a synthetic
absent boarding target and does not claim a successful authoritative boarding.

Options and Controls share those priority and focus checks, including confirmation
above either dialog, Controls above the galaxy map, and Change Keys returning to
the cockpit trigger. The fixture exercises native checkbox, range, Reset and
Close keyboard activation; binding-capture cancellation, reserved-key denial,
duplicate-key swaps, Delete/Backspace unbinding and saved custom bindings. It
checks that neither dialog sends Solo pause commands and held keyboard/gamepad
input remains blocked after closing until release. A seeded navigation intent
continues through real guidance in both dialogs; reset clears pending binding
capture without changing the saved binding.
Focus fallback checks cover a removed opener above Options and Controls closing
above the still-open, independently owned map; focus cannot remain in the hidden
dialog. Closing an underlay also preserves existing valid focus in the top dialog.

Map, ship/captain info, hails, story, storage and ship-loss notices use the same
priority and focus owner. The fixture checks nested confirmation, hails above
profile, native hail typing and exactly one Enter submission, profile Tab wrap,
map search selection and two-stage search Escape. Story Escape defers without a
story-accept packet, while a focused native Continue closes a notice. Storage and
ship-loss dismissal cannot open quit or dismiss an underlying dialog. These
receive packets and storage authorization are presentation fixtures, not proof of
server-side dialogue rewards, caller identity or storage settlement.

`logout-browser.ts` retains real Solo and online-style login/logout, temporary
pause restoration, account isolation and persistence. `input-audio-browser.ts`
retains gamepad and touch activation outside dialogs. These tests emulate device
APIs; they do not certify physical hardware. Other overlays still have their
existing dismissal/focus owners and are not claimed as controller migrations.

## Ultrawide windows and Index presentation

`ui-polish-browser.ts` drives real Solo login, the shipyard, Controls and Codex.
At 3440×1440 and UI scales 0.8/1/1.4 it checks landed width/height against 70%/86%
of usable flight space and verifies centering outside the Tray and console. It
retains ordinary/narrow fitting, two-column Controls with paired descriptions and
a one-column fallback, and hidden story equipment through Codex browse/search
and stale detail navigation. `cockpit-layout-browser.ts` checks frame fasteners
against every function control and label across 1920–5120 widths and those scales.

The browser seeds a bounded mixed Index roster through the existing local game,
then captures actual moving ships and an incoming ship-only hail. Intentional
image failures check actual ship-art fallback and no humanoid substitution.
`index-presentation.ts` checks outgoing/incoming/archive identities for every
Index and Nhal hull, and advances a densely packed seven-large-hull fixture
through 1,800 production steering/physics ticks with footprint clearance and
restore/health/budget checks. After the group settles, every neutral hull must
keep moving around the worksite within its radius, and a Quarry's drones must
sweep around it rather than hold fixed points. A separate damage-triggered split must naturally
return and rejoin through production steering without restoring lost health or
spending replacement budget. The mixed-hull accelerated 60-second fixture is not a
wall-clock soak or proof of every combat interleaving. Existing story and faction
regressions retain reward, equipment, neutrality and finite-source coverage.

## `station-progression`: timer advancement

`station-progress.ts` exercises the real `Game.checkStation` entry point with a
fixed wall clock and isolated save directory. Hand-authored assertions cover
unclaimed and Tier 0 denial, just-before and exact maturity, partial intervals,
full-silo timer reset, research bonuses, accrual before research completion and
once-only completion before starting the next queued project. Queue checks use
the real hangar owner for prerequisite/tier denial, waiting for credits/materials
and exact settlement; the progress owner does not implement those operations.

The fixture replaces hangar and log providers after construction, checks real
`you` projection and `idleCheck` dirty/notification behavior, denies collection
at a foreign port after ordinary timer advancement, and reopens a flushed save
without duplicate charges or completion logs. It records state and callback
traces for before/after comparison. It does not certify every research node or
transport. Native checkpoint recovery and network behavior remain separate suite
contracts.

## Network faults and economic receipt recovery

`network-faults.ts` drives one captain through `Game.connect`'s socket listener
with isolated saves and no wall-clock delay waits. It covers these scenarios:

- **Replayed rewards:** a completed daily goal claimed three times pays once. A
  cargo job accepted twice is recorded once, and landing at its destination twice
  pays it once.
- **Evicted connection:** after a second sign-in replaces the first, packets that
  still arrive on the old connection cannot buy materials, accept jobs, write the
  log or depart. The replacement connection keeps trading normally.
- **Input ownership:** flight controls sent on the evicted connection never reach
  the live ship or its queue. After a flight disconnect the captain is docked,
  packets on the closed connection are ignored, and the next sign-in starts docked
  with no queued or latched controls.
- **Restart:** progress flushed to disk survives a new `Game` on the same save
  directory. Credits and a goal claim changed after the flush are absent, and
  replaying the committed claim after restart pays nothing.

`websocket-transport.ts` checks that frames the peer sends after the server's
close frame, including ones in the same TCP chunk, are discarded. The close frame
only half-closes TCP, so without this the parser could keep dispatching commands.
Partial frame and fragmented-message buffers are released on server close, peer
close or transport error; subsequent traffic cannot accumulate in a closed socket.
It also checks quiet-peer liveness with an injected clock: a peer that sends nothing
for 15 seconds is pinged, any inbound bytes (including the pong browsers send
automatically) restart the quiet period, and a peer silent for 45 seconds is closed
without a close handshake. Closing reports the disconnect to the game once.

The same registered test also uses a fixed clock and a deterministic packet
queue. Arrival times reorder requests without sleeps; outbound replies can be
withheld even after settlement. Sixteen refinery-purchase and towing-reward
scenarios use the real service receipts and checkpoint owners:

- **Local journal:** clean commit, failure before journal installation, lost
  acknowledgement after installation, interruption between player/world snapshots,
  and failure at the final directory sync after journal removal.
- **Native CAS:** the real `NakamaDatabase` runs against an offline versioned
  storage backend. It covers clean writes, failure before the write and a
  successful write whose acknowledgement is lost. Both native failure cases
  freeze the old authority; a new database distinguishes committed and uncommitted
  state without guessing from the error.
- **Delivery and recovery:** the first reply is held, then a duplicate arrives
  before recovery. Clean commits also exercise graceful disconnect/reconnect.
  Restart replays the original request on a new session and releases a delayed
  packet and flight controls on the retired session. Exact credits/cargo, a
  single refinery batch/receipt or towing receipt, and clean input ownership are
  checked. Uncommitted towing delivery restores a detached object; its stale
  revision is denied, and a fresh attachment/delivery awards its cargo once.
- **Rewards and intent:** delayed daily-goal claims on old/new connections remain
  claimed across restart without another payout or log entry. Two separately
  delivered, identical live material-purchase intents still debit twice and add
  two items; legacy purchase semantics have not changed.

Limits: packet delay/reordering is injected at the serialized `Game.connect`
listener boundary, not with a real TCP proxy. Native checkpoint faults use an
offline CAS fixture, not a PostgreSQL outage; actual native replacement/restart
and bounded flood behavior remain covered by `nakama-network.ts`. Crashes retire
the old sessions and disable their autosave without a graceful-disconnect flush.
These checks do not prove every action, arbitrary packet schedule or service
failure. Legacy `buyship`, `buymat` and `trade` carry no request identifier, so
two valid live deliveries remain two explicit purchase intents; the browser does
not resend them on reconnect. Retry-safe ordinary purchases would require a
separate request-identity contract, not generic suppression of identical packets.

`network-faults-loopback.ts` runs the real `upgrade` handler and Node's WebSocket
client over loopback TCP, with a proxy between them that can delay, withhold,
trickle or black-hole each direction. Probe timings are shortened for the test.

- **Trickled bytes:** a purchase delivered one byte per TCP write applies once.
- **Lost reply:** the server commits a purchase whose reply is withheld, then the
  link is reset. The reconnected client's state shows the purchase exactly once.
- **Lost request:** a purchase withheld before reaching the server and then reset
  spends nothing.
- **Slow link:** with 120 ms of one-way latency the connection stays open well past
  the silence limit, and a purchase still settles.
- **Half-open peer:** both directions are black-holed mid-flight without either side
  seeing a close. The server pings, closes the connection no sooner than its
  allowance, removes the ship from space and docks the captain. The next sign-in is
  docked with no queued or latched controls.

Limits: the in-process checks above use the reference backend. The loopback proxy
delays and drops whole TCP streams; it does not reorder packets inside TCP, which
TCP itself prevents. Native online replacement and restart remain covered by
`nakama-network.ts`.

`browser-server-liveness.ts` runs the built browser and real Solo server through a
TCP proxy. It pauses the simulation through the ordinary quit dialog and checks
that idle application probes receive replies without reconnecting. In flight, the
proxy then drops all server bytes and FIN while allowing outbound controls. The
browser must detect loss, reconnect on a new link, restore authoritative state and
clear held controls without replaying gameplay requests. Timings are the production
10-second idle probe and 15-second reply window, not shortened test settings.

`nakama-client-connection.ts` also advances a deterministic monotonic clock through
native-match reply loss, healthy idle replies, malformed packets, teardown and
page suspension. Accepted inbound game packets renew liveness; outbound traffic
does not. Both native and local adapters use the same watchdog. A browser timer
delayed by more than the reply window starts a fresh probe rather than treating
page suspension as proof of server failure. Detection is bounded while browser
JavaScript is scheduled, not while the OS or browser suspends it. The TCP browser
fixture is local/Solo; native watchdog decisions use the SDK adapter fixture, not
a live Nakama network blackhole.

Legacy purchases such as `buyship`, `buymat` and `trade` carry no request
identifier, so a client that deliberately sends one twice buys twice; the browser
client does not resend actions on reconnect. Refinery and towing operations keep their own settled-operation
receipts and their existing tests.

## Save catalog and local restore rehearsal

`save-migrations.ts` exercises ordered detached cargo/storage and tutorial migration, legacy/current
synthetic fixtures, corrupt/unsupported rejection without source mutation,
read-only disposable CLI restores and committed-journal precedence. It rejects
malformed local snapshot envelopes and injected access errors without empty-state
fallback, then checks five real journal fault boundaries, freeze and reopen/retry.
Credits, unrelated goods and station ownership remain unchanged; tutorial progress
moves only according to the existing version-2 mapping. Committed tutorial cases
cover both remapping thresholds, completion and current sentinels. Unsupported
markers and invalid progress reject without partially migrating earlier accounts.
Production `NakamaDatabase` drills use an in-memory CAS backend for precommit,
lost-acknowledgement, frozen retry, restart and stale-writer checks. They cover
cargo/tutorial markers and real Game/co-op fleet-bank, founding-fee and directive
refunds, including exact balances and repeat-restart log counts. Co-op account
migration in that fault fixture is called directly, not through native login.
`save-feature-validation.ts` uses committed synthetic pre-feature/default,
stored-escort and retained-progress shapes through real login and two reloads,
checking exact refunds and stable inventory/progression. Corrupt compatibility
fields reject at local/native load, journal recovery, import and login before
state mutation. `save-postgres-restore.ts` exercises native authentication and
migration refunds, stopped-source `pg_dump`, `pg_restore` into a separate disposable
database, storage/CAS/permission equality, restored login and a second native
restart without duplicate refunds or log entries. These are not exhaustive
feature-schema or old/new executable archive tests.
The existing cargo, import/login, generator and native checkpoint tests retain
their separate coverage; see
[SAVE-MIGRATIONS.md](SAVE-MIGRATIONS.md).

## Client/server compatibility

The `protocol-compatibility` system checks the wire epoch independently of package
versions. Local Game tests deny incompatible hello packets before account creation
and preserve committed credits through a rejected reconnect. Native SDK tests
check fresh preflight, RPC responses and an authoritative join rejection after
valid preflight. Local connection tests keep compatibility guidance intact after
buffered packets and late transport errors. The real Nakama network fixture checks
join-metadata rejection and both current and legacy admission. The browser test
uses an isolated Solo captain and controlled status responses to exercise a cached
page, a server update during reconnect, manual refresh, and saved-progress recovery.
This is not coverage of arbitrary old client binaries or every mixed deployment.

## Pressure Hull console finish

The `pressure-hull-ui` system's `pressure-hull-browser.ts` checks the standard
blue physical-console interface at 1920×1080 and 3440×1440. It exercises flight with the
Tray expanded, landed overview with one compact world illustration, every available
landed-service tab, Captain/Profile, Settings and map, and checks that the
galaxy chart itself is drawn on the blue display glass. It checks service-panel
horizontal containment and scrolling to the last row, and sidebar containment after
changing Interface size to 120%. It verifies nonoverlapping console
groups, sidebar separation, an open-top viewport with side/bottom trim, a readable
populated chat line and utility buttons contained within their housing. It opens
the Hail inbox while landed and checks that Hail stays visible in flight and when
the Tray closes. It projects 32 fixture messages through the real chat renderer at both sizes,
checks keyboard and wheel scrolling, sends a message through the normal input
route, checks channel reachability and shell containment, checks that console frames do not
paint over the blue glass and that the parked console stays blue rather than teal, then restores that same history
to the compact console. Captures use the actual game, including populated service menus.
The blue cockpit loads at the ordinary game address without a URL option.

`hud-controls-browser.ts` checks that the login console uses the blue hull frame,
header bar and status light, and that the landed service strip starts at the
panel's left edge above the world heading at 1.5 times its previous text size. In
flight it checks that the gold JUMP button sits in the bottom-right corner, stays
faded and inactive until a system is plotted, leaves J bound to the same jump (an
unplotted J press still asks for a course), moves to the bottom-left with the saved
setting and starts a jump when clicked. A visitor to another captain's Personal
Station sees the Guest Dock name, only overview, trade, jobs and crew, and no dock
switcher, while the owner keeps the STATION tab.

## Personal Station docking

`station-docking.ts` covers the landing clearance rule and the full server flow at a
claimed station in a system whose faction is hostile to both captains. The owner
lands without a refusal, docking control welcomes them home with no bribe option, a
forced bribe request costs nothing and buys no pass, and the home refinery stays
open. A hostile visitor is still refused; once cleared, the visitor's landed packet
marks the guest dock and withholds the owner's shipyard, outfitter and refinery.
The authoritative `hailopt` listener also rechecks clearance before payment. Docked,
cleared, valid-pass, home/outlaw-exempt, wrong-system and unlandable requests leave
credits, pass expiry and save-dirty state unchanged. A legitimately refused flying
visitor pays once for a thirty-minute pass; replaying the card cannot charge again
or extend it. Changed standing and insufficient funds are covered.
At 1000×900, the landing overview keeps the real spaceport news visible in a
scrollable panel below the service content.

The standard blue HUD is also exercised through the existing cockpit, sidebar,
mission-list, dropdown and live-landed browser regressions. Compact consoles keep
chat and utilities in separate scroll-reachable tracks; enlarged Tray tabs wrap,
and pinned guidance retains usable mission-list space. The live-landed fixture
seeds ordinary moving server-owned traffic near the dock camera so draw-motion coverage
does not depend on unrelated ambient traffic random rolls.

The HUD JUMP regression also opens the galaxy map and attempts native button
activation before the periodic disabled-state refresh. No jump packet or jump
navigation can escape the overlay; closing the map restores the plotted action.

## Native performance budget verification

`performance-budgets.ts` is a fast `performance-health` unit regression. Synthetic
reports prove inclusive per-metric limits, rejection of any failing repeat,
exact environment/workload matching, same clean source build and runtime/input
hashes, distinct run
identities, sufficient repeats, measured duration, input/restoration/checkpoint
evidence, and SDK/authority/cleanup failures. Missing and nonfinite metrics,
unknown/malformed profiles, corrupt and oversized files, and CLI success/failure
exit statuses are covered. Synthetic numbers are verifier fixtures, not measured
budgets or supported capacity. Isolated provenance fixtures cover valid builds,
stale source/build-driver/helper/lockfile bytes, inputs changed during bundling,
missing/tampered manifests or runtimes, unsafe input paths and mixed-artifact
reports. A guarded native constructor proves failed provenance is rejected before
resource allocation without starting services; pinned runtime bytes remain stable
when the ignored file changes. The registered native workload additionally checks
that its numeric report contains valid hashes but no runtime source bytes.
Packaging fixtures include the build helper, lockfile and generated manifest.
Deployment profiles remain externally selected;
see [PERFORMANCE.md](PERFORMANCE.md#explicit-budget-profiles).

## Full-instance admission and performance fixtures

`nakama-world-lease.ts` exercises the actual join callbacks at 30 connections,
including a 31-presence batch, duplicate callbacks and a full-instance replacement
for the same authenticated principal. The displaced connection receives the
existing error before its kick, and its Game/native slots are retired before
allocation. A stale leave cannot delete the replacement; join callbacks recheck
authentication before displacing anyone. The first 30 join; the
extra presence is kicked without creating a Game session. A full instance rejects
additional captains while allowing same-captain replacements. Existing ownership
and authentication gates remain enforced.

`health.ts` runs real concentrated and distributed 30-captain simulations for
120 ticks and checks authority failures, snapshot size and checkpoint growth.
The native harness supports up to 30 real SDK connections, but CI's short native
case remains a bounded continuity check rather than a full-instance capacity claim.
See [PERFORMANCE.md](PERFORMANCE.md#thirty-player-instance-target) for reproduction
and hardware limits.

The registered `performance-budgets.ts` program also checks both retained 30-player,
300-second native reports against `docs/performance-baselines/shared-host-30.json`
offline. This validates artifact consistency and lab alarm thresholds, not live CI
timing or production smoothness. See [performance measurements](PERFORMANCE.md).

## Client prediction ownership

`flight-prediction.ts` compares the extracted owner with an independent reference
of the `e8c8c29` sequence/history/reconciliation blocks across four stock hulls.
The traces cover delayed, repeated and reordered acknowledgements, neutral-release
sequence gaps, disabled prediction, changed live stats, towing caps, large-correction
snapping, travel clears and presence resets. A separate expected-physics check
proves that only the last 90 unacknowledged controls replay. This is display
prediction, not economic authority or a guarantee under every network fault.
Existing engine, input and logout browser fixtures exercise its real integration.

## Connection, player projection and station ownership

System contracts: `client-connection-lifecycle`, `client-player-projection` and
`station-action-service`.

`connection-lifecycle.ts` and `player-projection.ts` compare the extracted owners
with unmodified pre-extraction source fixtures captured at `4444b8a`.
`station-service.ts` uses the unmodified `Game.station` method at `4e4ecde`, which
includes the Personal Station upgrade-log correction. Each reference runs
independently in an isolated VM with controlled time, random values and effects;
it does not call the new owners as an oracle.
Connection traces cover local/native opening, packet delivery, bounded reconnect,
changing credentials/configuration, stale sockets/epochs, absent credentials,
compatibility denial and duplicate-login teardown. Projection traces compare
payload identity, effect order, docked refresh, flight ammo and initial/restored
view tabs across sixteen combinations.

Station traces compare nineteen action/denial scenarios, complete packets,
balances, material/grade inventories, claim maps, dirty marking and effect order.
They replace feature providers and the database after service construction, then
reopen the same checkpoint to verify exact settlement. Existing station-progress,
versioned feature, cargo, native network and login/logout browser regressions
remain required. These traces establish behavior equivalence for the listed
cases, not exhaustive seeds, device inputs or a performance improvement.

## Asset cache and display recovery

`asset-recovery` owns `asset-recovery-browser.ts` and the shared byte-cache unit
checks. It boots the real Solo server with an isolated captain, rejects missing
and corrupt ship sheets with visible native fallback geometry, and tests four
actual WebGL context loss/restoration cycles without reconnecting. Captain identity,
credits and hull survive; an immediate neutral command is sent during loss, and
captured outgoing controls remain neutral until the held
key is released. A key released during loss responds to the first fresh press;
a key newly pressed during loss must release before resuming. The existing
right-click look controls still work. Captured renderer pixels verify the ship itself is visible. A final
unrestored loss exercises the recovery notice's Reload button and saved progress
on the new connection.

Real image decoding measures cache-owned bytes, keeps a live image stable above
a deliberately tiny budget, evicts idle sheets and rebuilds them on return
without mutating consumer-held images. The clock is paused only during this
isolated cache-eviction subcase so unrelated live NPC resources cannot change
the controlled working set; the authoritative server keeps running. Real WebAudio
decoding measures PCM ownership; removing cache ownership does not stop playing
music. Three start/stop cycles return active music-source ownership to zero,
with no accumulating ambience sources after renderer replacement. Missing/corrupt
audio releases pending promises and uses bounded retry backoff. Byte-cache unit fixtures cover count limits for zero-byte resources and
non-mutating cleanup.

Limits: Chromium software WebGL on one Linux host, not GPU/process memory or
physical-device coverage. Audio checks source state, not audible output. The
Canvas backend has context-event recovery handlers, but CI cannot force a real
Canvas2D driver reset. A browser/driver that never restores its context still
requires a reload; the world does not pause while graphics are unavailable.

## Combat playability

`combat-playability` covers fixed-seed arrivals and eight-minute fights in the real
Game simulation, with normal traffic, damage and Combat Assist. The recorded
early-game, Hollow and Umbral fleets exercise the same production rules as other
ships. Each system uses seeds 1701, 1702 and 1703. At least two of its three runs
must survive all 480 seconds, take positive damage and earn a production kill or
cause a hostile ship to become disabled. Disable credit requires positive damage
from the player or their wing to cross the production armor threshold, followed
by the production AI setting its disabled state. Damage to neutral traffic and
disables caused by unrelated NPCs do not count;
uncontested survival does not count. Combat Assist stops attacking disabled ships,
so a disable need not become a kill. Newcomer protection is explicitly disabled.
The early-game lead uses its stock loadout; the larger fleets also receive all
station research and Epic level-10, rank-3 combat officers. Combat Assist steers
and fires, with nearest-hostile acquisition, but no retreat or manual bay launch.
The simulation uses isolated in-memory storage and a virtual clock at the normal
physics tick rate. It does not establish human win rates or test every
loadout, faction, system or multiplayer combination.

`combat-jobs-playability.ts` covers mission and reward behavior. The combat tests
run in the unit regression lane through the canonical manifest; their supporting
helper is registered under `combat-playability.ts`. Existing combat, difficulty
and retaliation regressions remain in CI.

## Trade settlement, JUMP and browser recovery checks

`trade-safety.ts` checks shared integrated market-impact quotes and conservative
rounding across commodity prices, market classes, bonuses, sale modifiers, impact
limits and bulk/split orders. Production-dispatch cases cover an actual hired
Fixer, repeated same-port trading, preview/settlement parity and legitimate
inter-port profit. Grade-level purchase basis follows partial sales and cargo
transfers; trading goals and earned-credit statistics count profit, not recycled
sale volume. Realized sale losses offset later margins before those counters
advance again. Legacy common-cargo basis seeding is idempotent; unknown historic
premium/storage costs are not reconstructed. Existing balances and historical earnings are not rewritten.

`ship-functions-browser.ts` checks both JUMP corners with collapsed, single,
multiple and all available function panels. Its geometry matrix uses 1280×720,
1920×1080, 2560×1080, 3440×1440 and 5120×1440, plus 800×600 and 640×480 at 1.4 UI
scale. It measures visible clipped panel/control intersections, the reserved left
flow gap and viewport bounds, and clicks the real JUMP button to check dispatch.
The existing keyboard, wheel and long-chat cases remain.

`ui-polish-browser.ts` forces a Codex row replacement before testing stale-row
activation atomically on the same element. Protected detail content and story
progress remain absent; separate ordinary pointer and keyboard detail/Back cases
remain positive controls.

`browser-friend-liveness.ts` runs the existing TCP blackhole fixture through an
actual password-authenticated friend host. It checks bounded reconnect and held
input reset without replaying gameplay commands. The Solo variant retains its
healthy paused-host check. Neither variant predicts rendering performance.

Chromium callers share `test/helpers/chromium.ts`. With no override they use the
pinned Playwright browser; `CHROMIUM_EXECUTABLE` selects an explicit local binary.
Firefox and WebKit keep their own launch paths. Install the selected pinned
browser or provide a valid Chromium executable before running the suite. WebKit
also requires its platform libraries.

### Reproducing bounded combat experiments

`node test/combat-playability.ts --export combat-evidence.json` runs the normal
haven checks and four controlled encounters, then saves their fixture parameters,
initial positions and fitted weapon IDs, outcomes, exact Git build/runtime and up
to 256 fire/damage/defeat events per encounter. Actor IDs in events are one-based
indices into the initial actor list; zero means an actor outside that list. Extra
events are counted, not retained. Captures contain synthetic captains only.

`node test/combat-playability.ts --replay combat-evidence.json` requires a clean
capture from the same build and runtime, reconstructs its scenarios and compares
all deterministic outcomes/events. Timing samples are excluded from equality.
This is an offline fixture replay, not a live-world recording, save importer or
in-game diagnostic button. Do not feed it player support captures.

The controlled encounters vary bearing, distance, initial lateral motion, hull and
research/crew bonuses. They isolate two ships by removing traffic and suppressing
new ambient spawns; ordinary haven checks retain traffic and reinforcement rules.
Manual control is a scripted pursuit/fire policy, not human play. All encounters
use production flight, weapon leading, damage and AI. The lead's primary discharge
count measures participation. Beam hits divided by beam discharges gives beam hit
rate; positive damage contacts also include projectile impacts and splash and
must not be divided by all discharges as if they were projectile hit probability.
The first defeat can be a disable rather than a kill; null means no defeat before
the observation ended. Recovery sums positive lead-health changes after damage.

Each run first settles an ordinary Cutlass purchase with production messages.
The fixture then supplies its declared fleet and bonuses before arrival/combat.
After combat it flushes and reopens the real in-memory Nakama checkpoint and
compares the persisted captain data. This is not natural purchasing progression,
live-entity restoration, transport disconnect coverage or a native-server restart;
existing trade/network/native recovery suites cover those separate boundaries.

Per-run `Game.tick` p95/max samples use the host's monotonic clock around the
synchronous shared simulation only. They exclude construction, networking, Goja,
PostgreSQL and browser rendering. They are useful for local before/after evidence,
not a 30-player timing budget, GPU qualification or wall-clock soak. Dedicated-host
and real-device qualification remain tracked in issue #82.

## Launcher runtime bootstrap

`launcher-runtime.ts` runs the real launcher in isolated directories with an offline installer fixture. It checks first-launch installation, second-launch reuse, existing local and pinned PATH runtimes, unsupported platforms, and failed installs that leave a binary behind. A rejected binary is removed so the next launch cannot use it. These fixtures do not verify network downloads or archive extraction.
