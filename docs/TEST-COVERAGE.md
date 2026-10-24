# Game regression coverage inventory

## Development tooling

`tooling-contracts.ts` runs in the unit CI lane. It checks that Oxlint accepts
valid source and rejects unused bindings and floating promises, and that Oxc
Parser preserves optional/member access needed by the feature-dependency audit.
The existing feature test checks all 20 providers against the unchanged inventory.
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
starts. Compiled startup checks cover online/Solo entry points, the default seed
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

`cockpit-qol` covers per-captain view/search/scroll/subtab retention, a single explicitly pinned objective with other tracking retained, native detail/Back keyboard focus, unavailable cargo next-action links and narrow/scaled layouts. `qol-browser.ts` uses an isolated real server and actual accepted mission; existing refinery, logout, input and sidebar checks guard integrated behavior. `sidebar-sizing-browser.ts` additionally checks independent mouse/touch/keyboard minimap and lower-menu heights, canvas backing geometry, persistence, viewport/zoom limits and automatic reset. Default minimap square/fill coverage remains intact in `sidebar-browser.ts`. Presentation preferences never store passwords, execute actions, auto-accept work or modify authoritative saves.

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
| `protocol-websocket`      | `server/ws.ts`                                                                                                                   | [websocket-transport.ts](../test/websocket-transport.ts), [network-systems.ts](../test/network-systems.ts)                                                                                                                         | Frame masking/fragmentation/control/limits, upgrade handshake and actual multiplayer client/server state transitions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `hangar`                  | `server/hangar.ts`                                                                                                               | [v05.ts](../test/v05.ts), [v12.ts](../test/v12.ts), [v21.ts](../test/v21.ts)                                                                                                                                                       | Shuttle dispatch/resolution/repair, officer assignment/XP/ranks, research prerequisites/queue, refining, stored loadouts and boarding.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `fronts`                  | `server/fronts.ts`                                                                                                               | [v06.ts](../test/v06.ts), [v09.ts](../test/v09.ts), [faction-standing.ts](../test/faction-standing.ts)                                                                                                                             | Invasion start/damage/win, anomalies/events/goals, faction store standing and convoy/rescue/survey/smuggling jobs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `frontier`                | `server/frontier.ts`                                                                                                             | [v07.ts](../test/v07.ts)                                                                                                                                                                                                           | Colony ownership/accrual, station raid/defense waves, mastery, arena matchmaking/rating, exchange escrow/matching and profiles/leaderboards.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `specialists`             | `server/specialists.ts`                                                                                                          | [v08.ts](../test/v08.ts)                                                                                                                                                                                                           | Specialty roles, blueprint/part requirements, construction, tiers/upgrades and gameplay bonuses.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `hostile`                 | `server/hostile.ts`                                                                                                              | [v09.ts](../test/v09.ts), [v26.ts](../test/v26.ts)                                                                                                                                                                                 | Hostile levels/chest loot, Station Holdout wave/rewards and co-op helpers, weekly events/Eclipse.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `story`                   | `server/story.ts`                                                                                                                | [v10.ts](../test/v10.ts)                                                                                                                                                                                                           | Story offers/acceptance, board/travel/kill progression, gifts and Deep unlock.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `rivals`                  | `server/rivals.ts`                                                                                                               | [v11.ts](../test/v11.ts), [core-actions.ts](../test/core-actions.ts)                                                                                                                                                               | Named career population, relationships, hunters, damage/death/bounty, news/market flashes and status route.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `hailing`                 | `server/hail.ts`, `server/hail-service.ts`                                                                                       | [v11.ts](../test/v11.ts), [hailing.ts](../test/hailing.ts), [network-systems.ts](../test/network-systems.ts)                                                                                                                       | NPC bribes/fuel/landing clearance and encounters, authentic player hails, inbox privacy/blocking/flood controls.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
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
| `station-progression`     | `server/game.ts`, `server/hangar.ts`                                                                                             | [sim.ts](../test/sim.ts), [v05.ts](../test/v05.ts), [v26.ts](../test/v26.ts)                                                                                                                                                       | Claim/build tiers, refinery/research/shipyard, prerequisites and station relocation ownership/material gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `market-materials`        | `server/game.ts`, `shared/rules.ts`                                                                                              | [v25.ts](../test/v25.ts), [v203.ts](../test/v203.ts), [ship-economy.ts](../test/ship-economy.ts), [core-actions.ts](../test/core-actions.ts), [network-systems.ts](../test/network-systems.ts)                                     | Trade buy/sell/depth/cargo/credit limits, material buy/sell and dock-only/insufficient-credit guards.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `missions-passengers`     | `server/game.ts`, `server/fronts.ts`                                                                                             | [v06.ts](../test/v06.ts), [v12.ts](../test/v12.ts), [passengers.ts](../test/passengers.ts), [passenger-quests.ts](../test/passenger-quests.ts), [eventide.ts](../test/eventide.ts)                                                 | Cargo/bounty/patrol/convoy/rescue/survey/smuggling/rush/Syndicate/passenger jobs, acceptance/capacity/deadline/reward/failure behavior.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `flight-combat-weapons`   | `server/space.ts`, `shared/rules.ts`                                                                                             | [sim.ts](../test/sim.ts), [v03.ts](../test/v03.ts), [v21.ts](../test/v21.ts), [original-weapons.ts](../test/original-weapons.ts), [v08.ts](../test/v08.ts)                                                                         | Movement/fire/hit events, weapon damage/types, missiles/point defense/drone controls, ship-role interactions, disabled cleanup and respawn.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `combat-assist`           | `server/combat-assist.ts`                                                                                                        | [combat-assist.ts](../test/combat-assist.ts), [network-systems.ts](../test/network-systems.ts)                                                                                                                                     | Consent-only autopilot/delegation, group odds, independent isolation, manual takeover and Hold Fire.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `newcomer-standing`       | `server/game.ts`, `server/space.ts`                                                                                              | [main-map-protection.ts](../test/main-map-protection.ts), [local-retaliation.ts](../test/local-retaliation.ts), [faction-standing.ts](../test/faction-standing.ts), [v203.ts](../test/v203.ts), [v252.ts](../test/v252.ts)         | Main-galaxy truce thresholds, Farside/combat/aggression exceptions, stray damage and standing/reputation impacts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `armada-follow`           | `server/armada-formation.ts`, `client/main.ts`                                                                                   | [armada-formation.ts](../test/armada-formation.ts), [armada-formation-network.ts](../test/armada-formation-network.ts)                                                                                                             | Size/wing-aware V convergence while moving/turning/stopping, consent/takeover/leader changes and real automatic leader-jump arrival.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `landing-gateway`         | `client/landing_autopilot.ts`, `client/gateway_autopilot.ts`, `server/game.ts`                                                   | [landing-autopilot.ts](../test/landing-autopilot.ts), [gateway-navigation.ts](../test/gateway-navigation.ts), [gateway-browser.ts](../test/gateway-browser.ts), [wormhole-loop.ts](../test/wormhole-loop.ts)                       | Smooth drifting landings, direct-center Gateway throttle/aperture guidance, bidirectional crossing and exit anti-bounce.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `ships-catalog-art`       | `shared/rules.ts`, `client/artwork.ts`, `client/render.ts`                                                                       | [catalog-artwork.ts](../test/catalog-artwork.ts), [outfitter-icons.ts](../test/outfitter-icons.ts), [animation-frames.ts](../test/animation-frames.ts), [ship-banking.ts](../test/ship-banking.ts), [v25.ts](../test/v25.ts)       | Versioned catalog URL/cache semantics, shipped icon headers/dimensions and asset wiring, animation bounds and banked sprite selection; all 122 stock hull turn rates in both directions at 30/60/144 Hz and stationary quantization-noise rejection.                                                                                                                                                                                                                                                                                                                                                                       |
| `world-scenery`           | `client/render.ts`, `client/exotic_scenery.ts`                                                                                   | [eventide.ts](../test/eventide.ts), [comet.ts](../test/comet.ts), [stars.ts](../test/stars.ts), [background-scale.ts](../test/background-scale.ts), [v25.ts](../test/v25.ts)                                                       | Authored scenery configuration, comets/stars/background scaling, atmosphere/artwork invariants.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `station-art-identity`    | `client/station_wheel.ts`, `client/exotic_scenery.ts`, `client/render.ts`                                                        | [station-landing-browser.ts](../test/station-landing-browser.ts)                                                                                                                                                                   | 14 real landing/departure sessions, 110 stations/245 tier variants, actual flight-source identity, transient load recovery and frozen original Luna wheel pixels.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `login-scene`             | `client/login_scene.ts`                                                                                                          | [login-scene-browser.ts](../test/login-scene-browser.ts)                                                                                                                                                                           | Starting-system landmarks, six actual moving ship sheets, rotating/cloud planet frames, animated hub sheet and beacon pulses, 30% smaller planet disk, high-DPI resize, usable form, reduced motion (including dropped-change-event fallback) and rendering lifecycle.                                                                                                                                                                                                                                                                                                                                                     |
| `sidebar-scrollbars`      | `client/style.css`, `client/cockpit.css`, `client/main.ts`, `client/ui.ts`                                                       | [sidebar-browser.ts](../test/sidebar-browser.ts)                                                                                                                                                                                   | 13 viewport/scale/unread cases; visible tabs, saved-width recovery, square radar, chat cap, utility spacing and centered group-anchored vent, invariant red trim pixels, keyboard/wheel and scrollbars.                                                                                                                                                                                                                                                                                                                                                                                                                    |
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
| `station`   | [sim.ts](../test/sim.ts), [v04.ts](../test/v04.ts), [v05.ts](../test/v05.ts), [v07.ts](../test/v07.ts), [v203.ts](../test/v203.ts), [v21.ts](../test/v21.ts), [v26.ts](../test/v26.ts)                                                                                                                                                                                                   |
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
It asserts sustained authoritative movement/heading, sharp-turn slot recovery and
manual override. Existing formation/network tests retain fleet envelope, consent,
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
  resume snapshot semantics. Paired actual frames and motion JSON are retained.
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

These checks do not establish cross-browser parity, every weapon animation, a
frame-time improvement, or all lifecycle/network latency combinations. The Canvas
fallback cannot apply the WebGL additive glow material.

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

`planet-portrait-art` covers all mapped planetary scene identities, colony stage selection, asset hashes and portrait allowlists. `portrait-persistence.ts` exercises selection denials, authenticated-account-only mutation, bounded acknowledgement tokens and reload through Solo journals and the native checkpoint/CAS adapter. `planet-portrait-browser.ts` checks actual landed colony rendering, the personal chooser and hail windows, denied or unconfirmed save recovery, stale-reply isolation and Captain-tab controls at narrow/scaled and desktop sizes. `nakama-network.ts` verifies selected portraits through real Nakama authentication and match ingress, spoofed-target isolation, public lookup, PostgreSQL checkpoint storage and a native service restart. The adapter unit fixture remains a separate bounded persistence check.

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
three native OS families and retains commit/hash/runtime reports. See
[release readiness](RELEASE-READINESS.md) for scope, manual checks and rollback
limits, including pending cross-version fixture integration.
