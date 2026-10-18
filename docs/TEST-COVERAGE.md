# Game regression coverage inventory

This is the reviewed **system-level behavior inventory**, not a claim of 100%
line/branch coverage. `test/regression-manifest.json` is the executable CI
registration source. `test/coverage-inventory.js` rejects unregistered system
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
in separate jobs, preserving formatting, type checks, feature characterization,
contract checks and every previously included regression. No registered program
is run twice across those jobs. Each case has isolated temporary data, seeded
fixtures, a hard deadline and process cleanup. Logs, screenshots and JSON results
are retained in `.artifacts/regression/` and uploaded even on CI failure.

## Behavior systems

Tests below contain outcome assertions, not just import/parse checks. A named
suite can include both behavior checks and static asset/schema checks; the
behavior contract here describes what is exercised, not every branch in its
owner. Legacy `vNN` names are retained for traceability, and now run in CI.

| System                    | Implementation owner(s)                                                        | CI behavior evidence                                                                                                                                                                                                                     | Asserted contract                                                                                                                                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accounts-persistence`    | `server/db.js`, `server/game.js`                                               | [persistence-auth.js](../test/persistence-auth.js), [knight-profile.mjs](../test/knight-profile.mjs), [v03.js](../test/v03.js), [v202.js](../test/v202.js), [v203.js](../test/v203.js), [http-api.mjs](../test/http-api.mjs)             | Account authentication/save safety, atomic player/world persistence/backups, Windows directory-sync capability, checkpoint recovery and denied writes.                                                                                                                    |
| `protocol-http`           | `server/main.js`                                                               | [http-api.mjs](../test/http-api.mjs)                                                                                                                                                                                                     | Real HTTP static/MIME/cache/404/traversal checks and online-vs-solo API permissions.                                                                                                                                                                                      |
| `protocol-websocket`      | `server/ws.js`                                                                 | [websocket-transport.js](../test/websocket-transport.js), [network-systems.mjs](../test/network-systems.mjs)                                                                                                                             | Frame masking/fragmentation/control/limits, upgrade handshake and actual multiplayer client/server state transitions.                                                                                                                                                     |
| `hangar`                  | `server/hangar.js`                                                             | [v05.js](../test/v05.js), [v12.js](../test/v12.js), [v21.js](../test/v21.js)                                                                                                                                                             | Shuttle dispatch/resolution/repair, officer assignment/XP/ranks, research prerequisites/queue, refining, stored loadouts and boarding.                                                                                                                                    |
| `fronts`                  | `server/fronts.js`                                                             | [v06.js](../test/v06.js), [v09.js](../test/v09.js), [faction-standing.js](../test/faction-standing.js)                                                                                                                                   | Invasion start/damage/win, anomalies/events/goals, faction store standing and convoy/rescue/survey/smuggling jobs.                                                                                                                                                        |
| `frontier`                | `server/frontier.js`                                                           | [v07.js](../test/v07.js)                                                                                                                                                                                                                 | Colony ownership/accrual, station raid/defense waves, mastery, arena matchmaking/rating, exchange escrow/matching and profiles/leaderboards.                                                                                                                              |
| `specialists`             | `server/specialists.js`                                                        | [v08.js](../test/v08.js)                                                                                                                                                                                                                 | Specialty roles, blueprint/part requirements, construction, tiers/upgrades and gameplay bonuses.                                                                                                                                                                          |
| `hostile`                 | `server/hostile.js`                                                            | [v09.js](../test/v09.js), [v26.js](../test/v26.js)                                                                                                                                                                                       | Hostile levels/chest loot, Station Holdout wave/rewards and co-op helpers, weekly events/Eclipse.                                                                                                                                                                         |
| `story`                   | `server/story.js`                                                              | [v10.js](../test/v10.js)                                                                                                                                                                                                                 | Story offers/acceptance, board/travel/kill progression, gifts and Deep unlock.                                                                                                                                                                                            |
| `rivals`                  | `server/rivals.js`                                                             | [v11.js](../test/v11.js), [core-actions.js](../test/core-actions.js)                                                                                                                                                                     | Named career population, relationships, hunters, damage/death/bounty, news/market flashes and status route.                                                                                                                                                               |
| `hailing`                 | `server/hail.js`, `server/hail-service.js`                                     | [v11.js](../test/v11.js), [hailing.js](../test/hailing.js), [network-systems.mjs](../test/network-systems.mjs)                                                                                                                           | NPC bribes/fuel/landing clearance and encounters, authentic player hails, inbox privacy/blocking/flood controls.                                                                                                                                                          |
| `fleet-orders`            | `server/fleetcmd.js`                                                           | [v11.js](../test/v11.js), [v21.js](../test/v21.js)                                                                                                                                                                                       | Escort target/formation/hold/fire orders, jettison/loot limits and combat rating.                                                                                                                                                                                         |
| `syndicate`               | `server/syndicate.js`                                                          | [v12.js](../test/v12.js), [v203.js](../test/v203.js), [ship-banking.js](../test/ship-banking.js)                                                                                                                                         | Black market/Syndicate career, officer promotion/lower decks, bank deposits/loans/interest, timed delivery contracts.                                                                                                                                                     |
| `faction-arcs`            | `server/arcs.js`                                                               | [v12.js](../test/v12.js)                                                                                                                                                                                                                 | Faction story acceptance/progression/rewards and Farside expedition stages.                                                                                                                                                                                               |
| `docks`                   | `server/docks.js`                                                              | [v21.js](../test/v21.js), [knight-profile.mjs](../test/knight-profile.mjs), [outfitter-wing-repairs.js](../test/outfitter-wing-repairs.js), [ship-economy.js](../test/ship-economy.js), [companion-fixes.js](../test/companion-fixes.js) | Save migration/dock capacity, storing/flying/swapping, wing loadouts/officers/repairs, ship purchases and resale.                                                                                                                                                         |
| `living-galaxy`           | `server/living.js`                                                             | [v24.js](../test/v24.js), [v25.js](../test/v25.js), [v252.js](../test/v252.js)                                                                                                                                                           | Living-state timers/resolution, trade impact/depth, supply jobs and war/newcomer behavior.                                                                                                                                                                                |
| `quests`                  | `server/quests.js`                                                             | [v24.js](../test/v24.js), [passenger-quests.js](../test/passenger-quests.js), [core-actions.js](../test/core-actions.js)                                                                                                                 | Generated contacts and handcrafted chains, per-step completion, failure/retry/salvage, passenger capacity and explicit abandonment isolation.                                                                                                                             |
| `cooperative-social`      | `server/coop.js`                                                               | [v26.js](../test/v26.js), [network-systems.mjs](../test/network-systems.mjs)                                                                                                                                                             | Friends/offline DM/blocking, Armada formation/leadership/chat/buffs/shared bounties, rescue, contracts and co-op Holdout.                                                                                                                                                 |
| `consensual-pvp`          | `server/coop.js`, `server/frontier.js`                                         | [v26.js](../test/v26.js), [v07.js](../test/v07.js)                                                                                                                                                                                       | Open-galaxy friendly-fire prevention, solo/Armada duel consent/nonlethal outcomes and arena team matching.                                                                                                                                                                |
| `station-trading`         | `server/coop.js`                                                               | [v26.js](../test/v26.js)                                                                                                                                                                                                                 | Two-party credits/cargo/crates/blueprint/part escrow, accept/cancel and location guards.                                                                                                                                                                                  |
| `galaxy-navigation`       | `shared/galaxy.js`, `shared/gen.js`, `shared/rules.js`                         | [v04.js](../test/v04.js), [v08.js](../test/v08.js), [v23.js](../test/v23.js), [eventide.js](../test/eventide.js)                                                                                                                         | Seeded galaxy generation, reachable routes, Sol/Farside gates, authored Eventide landmarks, and Concordia display naming with stable home-system/station IDs.                                                                                                             |
| `sleep-traffic-ai`        | `server/space.js`                                                              | [v04.js](../test/v04.js), [v201.js](../test/v201.js), [v23.js](../test/v23.js), [v24.js](../test/v24.js), [sim.js](../test/sim.js)                                                                                                       | Sleeping/waking systems, faction traffic/landing, wing steering, flee/broadside/friend assistance and combat/death/respawn.                                                                                                                                               |
| `cargo-grade-ledger`      | `shared/cargo-lots.js`, `shared/cargo-contracts.js`                            | [cargo-lots.js](../test/cargo-lots.js)                                                                                                                                                                                                   | Versioned/idempotent cargo + storage migration, exact grade denial, immutable single-use withdrawals, atomic bounded transfers, fixed partial pickups, seeded per-grade conservation and real DB roundtrip. Pure prerequisite; production writer integration is separate. |
| `mining-existing`         | `server/space.js`, `server/game.js`                                            | [v04.js](../test/v04.js), [v05.js](../test/v05.js), [v252.js](../test/v252.js)                                                                                                                                                           | Existing asteroid damage/ore pickup/processing/charting, officer mining bonus and visible mining guidance. Staged cutting/survey coverage is listed separately under `mining-cutting`.                                                                                    |
| `station-progression`     | `server/game.js`, `server/hangar.js`                                           | [sim.js](../test/sim.js), [v05.js](../test/v05.js), [v26.js](../test/v26.js)                                                                                                                                                             | Claim/build tiers, refinery/research/shipyard, prerequisites and station relocation ownership/material gates.                                                                                                                                                             |
| `market-materials`        | `server/game.js`, `shared/rules.js`                                            | [v25.js](../test/v25.js), [v203.js](../test/v203.js), [ship-economy.js](../test/ship-economy.js), [core-actions.js](../test/core-actions.js), [network-systems.mjs](../test/network-systems.mjs)                                         | Trade buy/sell/depth/cargo/credit limits, material buy/sell and dock-only/insufficient-credit guards.                                                                                                                                                                     |
| `missions-passengers`     | `server/game.js`, `server/fronts.js`                                           | [v06.js](../test/v06.js), [v12.js](../test/v12.js), [passengers.js](../test/passengers.js), [passenger-quests.js](../test/passenger-quests.js), [eventide.js](../test/eventide.js)                                                       | Cargo/bounty/patrol/convoy/rescue/survey/smuggling/rush/Syndicate/passenger jobs, acceptance/capacity/deadline/reward/failure behavior.                                                                                                                                   |
| `flight-combat-weapons`   | `server/space.js`, `shared/rules.js`                                           | [sim.js](../test/sim.js), [v03.js](../test/v03.js), [v21.js](../test/v21.js), [original-weapons.js](../test/original-weapons.js), [v08.js](../test/v08.js)                                                                               | Movement/fire/hit events, weapon damage/types, missiles/point defense/drone controls, ship-role interactions, disabled cleanup and respawn.                                                                                                                               |
| `combat-assist`           | `server/combat-assist.js`                                                      | [combat-assist.js](../test/combat-assist.js), [network-systems.mjs](../test/network-systems.mjs)                                                                                                                                         | Consent-only autopilot/delegation, group odds, independent isolation, manual takeover and Hold Fire.                                                                                                                                                                      |
| `newcomer-standing`       | `server/game.js`, `server/space.js`                                            | [main-map-protection.js](../test/main-map-protection.js), [local-retaliation.js](../test/local-retaliation.js), [faction-standing.js](../test/faction-standing.js), [v203.js](../test/v203.js), [v252.js](../test/v252.js)               | Main-galaxy truce thresholds, Farside/combat/aggression exceptions, stray damage and standing/reputation impacts.                                                                                                                                                         |
| `armada-follow`           | `server/armada-formation.js`, `client/main.js`                                 | [armada-formation.js](../test/armada-formation.js), [armada-formation-network.mjs](../test/armada-formation-network.mjs)                                                                                                                 | Size/wing-aware V convergence while moving/turning/stopping, consent/takeover/leader changes and real automatic leader-jump arrival.                                                                                                                                      |
| `landing-gateway`         | `client/landing_autopilot.js`, `client/gateway_autopilot.js`, `server/game.js` | [landing-autopilot.js](../test/landing-autopilot.js), [gateway-navigation.js](../test/gateway-navigation.js), [gateway-browser.mjs](../test/gateway-browser.mjs), [wormhole-loop.js](../test/wormhole-loop.js)                           | Smooth drifting landings, direct-center Gateway throttle/aperture guidance, bidirectional crossing and exit anti-bounce.                                                                                                                                                  |
| `ships-catalog-art`       | `shared/rules.js`, `client/artwork.js`, `client/render.js`                     | [catalog-artwork.js](../test/catalog-artwork.js), [outfitter-icons.js](../test/outfitter-icons.js), [animation-frames.js](../test/animation-frames.js), [ship-banking.js](../test/ship-banking.js), [v25.js](../test/v25.js)             | Versioned catalog URL/cache semantics, shipped icon headers/dimensions and asset wiring, animation bounds and banked sprite selection; all122 stock hull turn rates in both directions at30/60/144Hz and stationary quantization-noise rejection.                         |
| `world-scenery`           | `client/render.js`, `client/exotic_scenery.js`                                 | [eventide.js](../test/eventide.js), [comet.js](../test/comet.js), [stars.js](../test/stars.js), [background-scale.js](../test/background-scale.js), [v25.js](../test/v25.js)                                                             | Authored scenery configuration, comets/stars/background scaling, atmosphere/artwork invariants.                                                                                                                                                                           |
| `station-art-identity`    | `client/station_wheel.js`, `client/exotic_scenery.js`, `client/render.js`      | [station-landing-browser.mjs](../test/station-landing-browser.mjs)                                                                                                                                                                       | 14 real landing/departure sessions, 110 stations/245 tier variants, actual flight-source identity, transient load recovery and frozen original Luna wheel pixels.                                                                                                         |
| `login-scene`             | `client/login_scene.js`                                                        | [login-scene-browser.mjs](../test/login-scene-browser.mjs)                                                                                                                                                                               | Starting-system landmarks, six actual moving ship sheets, rotating/cloud planet frames, animated hub sheet and beacon pulses, 30% smaller planet disk, high-DPI resize, usable form, reduced motion (including dropped-change-event fallback) and rendering lifecycle.    |
| `sidebar-scrollbars`      | `client/style.css`, `client/ui.js`                                             | [sidebar-browser.mjs](../test/sidebar-browser.mjs)                                                                                                                                                                                       | Eight viewport/scale/width cases, horizontal wheel and keyboard end-tab reachability, saved width and red menu scrollbar/accent styles.                                                                                                                                   |
| `client-options-map-save` | `client/main.js`, `client/ui.js`                                               | [client-systems-browser.mjs](../test/client-systems-browser.mjs)                                                                                                                                                                         | Real browser options/key remapping/scaling/palette, map routes and Solo pause/save workflows; see test assertions for exact exercised controls.                                                                                                                           |
| `communications-log`      | `server/game.js`, `client/ui.js`                                               | [chat-bubbles.js](../test/chat-bubbles.js), [v26.js](../test/v26.js), [core-actions.js](../test/core-actions.js)                                                                                                                         | Chat channel scoping, plain-text transient ship bubbles, bounded captain notes and non-idle-resetting ping/pong.                                                                                                                                                          |
| `radio-offline-proxy`     | `server/main.js`                                                               | [http-api.mjs](../test/http-api.mjs)                                                                                                                                                                                                     | Real HTTP proxy requests against child-local mocked provider: search bounds, sanitized station IDs, stream/track response shapes and upstream outage/error fallbacks.                                                                                                     |
| `economy-balance`         | `shared/galaxy.js`, `shared/rules.js`                                          | [balance.js](../test/balance.js), [ship-economy.js](../test/ship-economy.js)                                                                                                                                                             | Price/strength ladder thresholds, progression-income bounds, Holdout reward floor and real loadout transaction arithmetic.                                                                                                                                                |
| `robustness-wiring`       | `server/features.js`, `server/message-registry.js`                             | [fuzz.js](../test/fuzz.js)                                                                                                                                                                                                               | Malformed/flooded gameplay messages preserve server invariants; feature/type checks separately verify composition and characterization, not full behavior coverage.                                                                                                       |
| `input-audio`             | `client/main.js`, `client/audio.js`                                            | [input-audio-browser.mjs](../test/input-audio-browser.mjs)                                                                                                                                                                               | Persistent mixer volumes/mute and N shortcut, emulated gamepad axes/deadzone/fire in actual outgoing WebSocket packets, touch fire/release/map. Not physical-device or audible-output certification.                                                                      |

### Login scene media-event loss

The registered login browser test changes the real reduced-motion media state while deliberately withholding its reduce callback from production. It checks the original static-pixel/no-recurring-draw assertions, an independently calculated phase-zero traffic pose, normal media resume, hide/show and actual login cleanup. A bounded failure-only trace records native query/listener/event delivery, visibility/resize and final media/renderer state. This is not a claim of exhaustive browser-event reliability.

### Shipped KNIGHT testing profile

`test/knight-profile.mjs` exercises the default shipped seed through real online and Solo
server startup and WebSocket login, including the Solo slot listing, 30M starting credits,
completed T5 research and every current specialist in usable ship storage. In-process
dock actions select each prebuilt hull. Restart tests preserve spending, changed ships,
station progress, same-name account credentials and unrelated saves. Occupied station
fixtures check fallback ownership; exhaustion skips creation rather than stealing a site.
The existing `SEEDS_FILE` opt-out and explicit retirement support remain covered.

### Cross-platform persistence and startup

`test/persistence-platform.mjs` runs production DB flush/recovery with a simulated
Windows platform and directory-only `EPERM` fsync behavior. It checks paired
player/world journal recovery from the first 3.0.0 startup crash, regular-file
fsyncs, propagated file-open/write/fsync and rename failures, and propagated POSIX
directory-sync failures. Real child servers start in online and Solo modes with
isolated saves under that simulation and serve the login page. This is not native
Windows or `.bat` execution certification. Windows retains file fsync and journal
recovery but cannot supply the POSIX directory-metadata durability barrier.

## Feature composition

All 15 provider namespaces from `docs/feature-inventory.json` and
`server/features.js` are represented in the table above. Shared `bonuses`,
`shipStats`, `world` and `sessions` facades delegate to those providers; their
layer ordering and representative payloads are additionally characterized by
`test/features.js`. That fixed baseline and `test/typecheck-contracts.js` are
**not** substitutes for gameplay behavior tests.

## Exposed action mapping

The 50 registered `Game.createMessageHandlers()` action names below map to
registered test programs (or declared network-client children). This proves
reviewable representative action evidence and CI reachability, not every
operation value or malformed payload branch. Pre-dispatch `hello` is covered by
`persistence-auth.js`, `http-api.mjs` and real network/browser logins.

| Action      | Representative evidence in CI                                                                                                                                                                                                                                                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `combat`    | [combat-assist.js](../test/combat-assist.js), [combat-network.js](../test/combat-network.js)                                                                                                                                                                                                                                                                                               |
| `input`     | [armada-formation-network.mjs](../test/armada-formation-network.mjs), [armada-formation.js](../test/armada-formation.js), [bot.js](../test/bot.js), [combat-network.js](../test/combat-network.js), [fuzz.js](../test/fuzz.js), [sim.js](../test/sim.js), [input-audio-browser.mjs](../test/input-audio-browser.mjs)                                                                       |
| `target`    | [v03.js](../test/v03.js)                                                                                                                                                                                                                                                                                                                                                                   |
| `tutskip`   | [v03.js](../test/v03.js)                                                                                                                                                                                                                                                                                                                                                                   |
| `land`      | [bot.js](../test/bot.js), [v11.js](../test/v11.js)                                                                                                                                                                                                                                                                                                                                         |
| `depart`    | [armada-formation-network.mjs](../test/armada-formation-network.mjs), [bot.js](../test/bot.js), [combat-network.js](../test/combat-network.js), [hailing-network.js](../test/hailing-network.js), [sim.js](../test/sim.js), [v03.js](../test/v03.js), [v04.js](../test/v04.js), [v101.js](../test/v101.js), [v203.js](../test/v203.js), [v21.js](../test/v21.js), [v24.js](../test/v24.js) |
| `jump`      | [armada-formation-network.mjs](../test/armada-formation-network.mjs), [bot.js](../test/bot.js), [v10.js](../test/v10.js)                                                                                                                                                                                                                                                                   |
| `trade`     | [bot.js](../test/bot.js), [v203.js](../test/v203.js)                                                                                                                                                                                                                                                                                                                                       |
| `buyship`   | [sim.js](../test/sim.js), [v21.js](../test/v21.js)                                                                                                                                                                                                                                                                                                                                         |
| `docks`     | [outfitter-wing-repairs.js](../test/outfitter-wing-repairs.js), [sim.js](../test/sim.js), [v21.js](../test/v21.js)                                                                                                                                                                                                                                                                         |
| `questdrop` | [core-actions.js](../test/core-actions.js)                                                                                                                                                                                                                                                                                                                                                 |
| `outfit`    | [bot.js](../test/bot.js), [v203.js](../test/v203.js)                                                                                                                                                                                                                                                                                                                                       |
| `accept`    | [bot.js](../test/bot.js), [v12.js](../test/v12.js), [v203.js](../test/v203.js), [v24.js](../test/v24.js), [v26.js](../test/v26.js)                                                                                                                                                                                                                                                         |
| `abandon`   | [v203.js](../test/v203.js), [v24.js](../test/v24.js)                                                                                                                                                                                                                                                                                                                                       |
| `station`   | [sim.js](../test/sim.js), [v04.js](../test/v04.js), [v05.js](../test/v05.js), [v07.js](../test/v07.js), [v203.js](../test/v203.js), [v21.js](../test/v21.js), [v26.js](../test/v26.js)                                                                                                                                                                                                     |
| `buymat`    | [core-actions.js](../test/core-actions.js)                                                                                                                                                                                                                                                                                                                                                 |
| `rename`    | [v203.js](../test/v203.js)                                                                                                                                                                                                                                                                                                                                                                 |
| `note`      | [core-actions.js](../test/core-actions.js)                                                                                                                                                                                                                                                                                                                                                 |
| `chat`      | [bot.js](../test/bot.js), [v06.js](../test/v06.js), [v26.js](../test/v26.js)                                                                                                                                                                                                                                                                                                               |
| `officer`   | [v05.js](../test/v05.js), [v21.js](../test/v21.js)                                                                                                                                                                                                                                                                                                                                         |
| `shuttle`   | [v05.js](../test/v05.js)                                                                                                                                                                                                                                                                                                                                                                   |
| `dock`      | [v05.js](../test/v05.js), [v101.js](../test/v101.js), [v203.js](../test/v203.js), [v21.js](../test/v21.js)                                                                                                                                                                                                                                                                                 |
| `board`     | [v05.js](../test/v05.js), [v06.js](../test/v06.js), [v10.js](../test/v10.js), [v26.js](../test/v26.js)                                                                                                                                                                                                                                                                                     |
| `spec`      | [v08.js](../test/v08.js)                                                                                                                                                                                                                                                                                                                                                                   |
| `armada`    | [armada-formation-network.mjs](../test/armada-formation-network.mjs), [combat-network.js](../test/combat-network.js), [v06.js](../test/v06.js), [v26.js](../test/v26.js)                                                                                                                                                                                                                   |
| `holdout`   | [v09.js](../test/v09.js), [v26.js](../test/v26.js)                                                                                                                                                                                                                                                                                                                                         |
| `storyacc`  | [v10.js](../test/v10.js)                                                                                                                                                                                                                                                                                                                                                                   |
| `social`    | [hailing-network.js](../test/hailing-network.js), [v26.js](../test/v26.js)                                                                                                                                                                                                                                                                                                                 |
| `trade2`    | [v26.js](../test/v26.js)                                                                                                                                                                                                                                                                                                                                                                   |
| `duel`      | [v26.js](../test/v26.js)                                                                                                                                                                                                                                                                                                                                                                   |
| `goal`      | [v06.js](../test/v06.js)                                                                                                                                                                                                                                                                                                                                                                   |
| `store`     | [faction-standing.js](../test/faction-standing.js), [v06.js](../test/v06.js)                                                                                                                                                                                                                                                                                                               |
| `colony`    | [v07.js](../test/v07.js)                                                                                                                                                                                                                                                                                                                                                                   |
| `arena`     | [v07.js](../test/v07.js)                                                                                                                                                                                                                                                                                                                                                                   |
| `exchange`  | [v07.js](../test/v07.js)                                                                                                                                                                                                                                                                                                                                                                   |
| `boards`    | [v07.js](../test/v07.js)                                                                                                                                                                                                                                                                                                                                                                   |
| `profile`   | [v07.js](../test/v07.js)                                                                                                                                                                                                                                                                                                                                                                   |
| `ping`      | [core-actions.js](../test/core-actions.js)                                                                                                                                                                                                                                                                                                                                                 |
| `hail`      | [hailing-network.js](../test/hailing-network.js), [v11.js](../test/v11.js)                                                                                                                                                                                                                                                                                                                 |
| `hailin`    | [hailing-network.js](../test/hailing-network.js)                                                                                                                                                                                                                                                                                                                                           |
| `hailopt`   | [hailing-network.js](../test/hailing-network.js), [v11.js](../test/v11.js)                                                                                                                                                                                                                                                                                                                 |
| `order`     | [combat-network.js](../test/combat-network.js), [v11.js](../test/v11.js), [v21.js](../test/v21.js)                                                                                                                                                                                                                                                                                         |
| `jettison`  | [v11.js](../test/v11.js)                                                                                                                                                                                                                                                                                                                                                                   |
| `rivals`    | [core-actions.js](../test/core-actions.js)                                                                                                                                                                                                                                                                                                                                                 |
| `bm`        | [v12.js](../test/v12.js)                                                                                                                                                                                                                                                                                                                                                                   |
| `arcacc`    | [v12.js](../test/v12.js)                                                                                                                                                                                                                                                                                                                                                                   |
| `promote`   | [v12.js](../test/v12.js)                                                                                                                                                                                                                                                                                                                                                                   |
| `lower`     | [v12.js](../test/v12.js), [v203.js](../test/v203.js)                                                                                                                                                                                                                                                                                                                                       |
| `bank`      | [v12.js](../test/v12.js)                                                                                                                                                                                                                                                                                                                                                                   |
| `pause`     | [v10.js](../test/v10.js)                                                                                                                                                                                                                                                                                                                                                                   |

## Known limits and deliberate exclusions

- Browser CI uses pinned Chromium. This is not Firefox/Safari, physical gamepad,
  real touch hardware, screen-reader, audio-listening or exhaustive resolution
  certification. Synthetic input/UI checks verify software behavior only.
- Radio API tests use deterministic offline upstream responses. They do not
  promise third-party service availability, stream playback or live content.
- Visual assets have decode/identity/layout checks and supporting screenshots;
  most artwork is not a full-scene pixel snapshot. Luna's original wheel has an
  intentional frozen raw-pixel identity check. Do not regenerate it to hide a
  failure. Perceptual artistic quality still needs human review.
- Balance has explicit numerical thresholds, not a claim that every strategy is
  fair. Seeded simulations cover chosen scenarios, not all random seeds or
  multihour soak/load behavior.
- Existing mining plus the first staged cutting/survey slice are covered. Refinery,
  hazard, Star Dredge and towing expansion slices are not implemented or claimed passing.
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

`cargo-grade-ledger` additionally covers the cargo writers in `server/game.js`,
`server/fleetcmd.js`, `server/frontier.js`, `server/hangar.js`, `server/coop.js`,
and commodity grade rows in the market/info UI. [cargo-flows.js](../test/cargo-flows.js)
exercises real production methods and dispatch: strict legacy/corrupt login and import,
all nine raw-grade sales through depth/bonuses, common repurchases, exact denial,
jettison/job-aware partial recollection, five-simulation-second owner/fleet-only pickup grace (close-spawn Space.tick, root-authority denial, foreign partial pickup, respawn and exact expiry), frozen mining rewards/progression, unchanged
12 t + 1,500 cr station processing and supply, colony/plunder, graded exchange
escrow/partial fill/refund/offline delivery, atomic captain swaps/full-hold storage,
and death/Lodestar preservation. [cargo-ui-browser.mjs](../test/cargo-ui-browser.mjs)
clicks actual grade-specific sale/jettison buttons and verifies server inventory,
including a real rivals response between pointer-down/up on DUMP. It also checks
that the Captains tab still refreshes from the same asynchronous response.

The earlier pure-prerequisite boundary is superseded only for these cargo flows.
That prerequisite coverage alone claims no cutting, survey, refinery, Dredge, new controls or progression balance; the first cutting slice is covered separately below.
Legacy fixtures use `test/helpers/cargo-fixture.js` for deliberate common-only
inventory replacement; production never silently repairs stale premium records.

## Mining cutting slice (`mining-cutting`)

The checked `features.mining` service owns deterministic persisted generations, staged readiness and server collision leases. `mining.js` exercises real beam/Tapper fire, populated/quiet departed-Tapper overheat parity (ready and not-ready) and separated real Tapper-to-Tapper/beam release ordering and first-frame beam work, bounded retired history across 32 real regrowth/collection/TTL cycles with a live original parcel retained exactly once, finite budgets/grades, partial holds and recovery of a committed journal after an injected fault between snapshot renames. `mining-network.mjs` uses real WebSockets for private bounded survey, cooldown, forged-authority denial, primary fire and reconnect refresh. `mining-controls-browser.mjs` preserves default/custom/unbound keys, metadata, F/drone launch/recall and alternate steering. `mining-ui-browser.mjs` drives actual mouse-aim cutting and partial pickup with gas labels at 0.8/1/1.4 scale, 2xDPI and reduced motion. Registered in both CI groups; screenshots are retained as evidence, not merely text inventories.

Clock advances only with unpaused server simulation; stopped servers do not cool/regrow offline. Catch-up never awards work/rewards. Config-changed fields fail closed pending explicit migration. Numeric tuning is provisional. No refinery/hazards/Dredge/tow coverage is claimed by this slice.

## Mining refinery and pressure

`mining-refinery`: `refinery.js` covers production binding quotes, fractional ready balances, multi-input denial atomicity, exact cancellation returns, access-loss collection, Fuel Cell sink, grade-specific finite orders and offline readiness. `refinery-economy.js` checks explicit-spread28cr example, all recovery/recipe/residue/bonus combinations and repeated real production buy/refine/claim/sell cycles with price impact. `refinery-persistence.js` injects real checkpoint faults before/after journal commit, between snapshots and after both writes, then reopens and retries. `refinery-network.mjs` uses real authenticated WebSockets, private owner data, duplicate confirms, partial claims and exact-grade delivery. `refinery-ui-browser.mjs` uses actual quote/confirm/cancel/claim/fuel controls, unrelated reply during pointer gesture, scale0.8/1/1.4 and2xDPI/reduced motion.

`mining-pressure`: `mining-pressure.js` drives actual beam collisions and checks actual shields/armor,2s telegraph, noise deduplication, persisted cooldowns, bounded encounter targeting and damage, explicit group opt-in/withdrawal, neutral/wing/Armada/newcomer immunity and Farside difference. Browser evidence includes readable countdown/radius and pressure warnings. Values remain provisional; this is not exhaustive random-seed or human balance validation.

## `industrial-dredge`

`dredge.js`, `dredge-smelter.js`, `dredge-corona.js`, `dredge-economy.js`, `dredge-network.mjs` run in the server/network lane; `dredge-browser.mjs` runs in browser CI. Cover actual T3/40-fragment no-plasma specialist build/parts, finite minor sweep and shared root/drone collection, legacy Lodestar prices/protection identity, useful large-rock bootstrap opportunities and append-only field migration without reminting original generations. Mobile production checks exact selected grades, 70/300 rational recovery at6 input t/min, different frame partitions, pause/offline/hull/death persistence, pre-journal and post-unlink fault recovery. Stock tests use actual flight physics for15s harvest then10s exit at four starting headings; fine/coarse actual thermal damage and source depletion/full-hold/navigation denial remain bounded. Real WS checks auth/private modes/forged authority/reconnect. Browser checks actual build and plasma controls, custom/unbound migration, separate meters, scales/reduced motion and108 unique heading/bank/glow frames through production rendering. Fixed-travel/selection twenty-minute production-boundary scenarios are explicitly not autonomous-flight, human-play or all-market balance proofs; finite plasma recipe purchase/process/sale loops and forward conversion graph are tested. Useful-work provenance persists per captain (first64 participants, capped1.5s each); one qualifying opportunity per generation, deterministic account-order ties, never ordinary last-hit credit. Cooperative/restart attribution, jettisoned-input partial-work discard without transfer/residue loss, truthful off-in-corona warnings and conservative automatic route keep-out are tested. Production input-tick composition tests preserve navigation cancellation through stationary/low-speed rejection and immediate stop completion, moving rejection and safe normal routes; manual opt-in continues and intent clears the next tick. The real browser starts harvesting before stationary route rejection and observes authoritative cancellation. Actual in-reach industrial collectors share owner jettison grace and recover exact pure-grade mass after expiry. Baseline suites remain registered.

### `towing-motherlodes`

Registered unit programs `towing.js`, `towing-persistence.js`, `field-evolution.js`, `towing-network.mjs` and browser `towing-browser.mjs` exercise production finite issuance, one-owner revision races, equipment/survey denial, hard speed limits and actual transit/lifecycle hooks, explicit private transfer, capacity-first exact grade delivery, four real journal fault boundaries/reopen/retry, malformed save rejection,300-second grace boundary and100 bounded recovery epochs. Browser covers real canvas selection, custom/unbound bindings, preserved F fighter controls, full hold denial, two-page transfer/delivery,0.8/1/1.4 control bounds, static reduced motion, actual production body.scaled/CSS zoom with changed HUD geometry, single-voice mute/effects-bus attenuation, and new384px transparent motherlode decode/hash checks. Moving transfer regressions deny unsafe relative motion without mutating ownership/offer and cap safe handoff velocity immediately. These are bounded deterministic fixtures, not certification of all seeds, physical devices, human profitability or every removal/economy interleaving.

## Mining panel usability

`mining-panel.js` tests existing Survey-role / tow-rig eligibility, nonzero operational cargo capacity, full and mission-loaded holds, and active-control safety. `mining-panel-browser.mjs` exercises the production drill toggle at the former bottom-left panel anchor, default collapse, click/keyboard dismissal, full-hold and ship/landing transitions, independent hail inbox, and responsive final-control reachability. Transition snapshots are explicit client fixtures, not claimed server ship transactions. Existing mining, Dredge and towing browser suites exercise actual authoritative operations through the collapsed panel. Both new tests are registered in canonical CI lanes.

## Account switching

`logout-browser.mjs` runs real online and Solo servers with isolated saves. It covers
Escape precedence for typing/options/map, default Cancel/keyboard confirmation,
Solo temporary and preexisting pause, flight logout to login without reload,
immediate durable dock/save, cleared credentials/chat/social/navigation state,
refreshed Solo slot summaries, no automatic relogin and repeated account switches.
It does not simulate every network outage or certify every peripheral device.

### Automatic motherlode collection and mining shortcuts

`towing-auto-delivery.js` covers authoritative load-centred port collection at
all towing speeds and headings, a swept tangent crossing, tug-only proximity
denial, rejected ports/standing, full-hold safe reserved detachment/reclaim,
exact grade conservation and owner-only idempotent receipt replay.
`mining-keys-browser.mjs` drives real browser keys for scanning, attach/detach,
manual delivery, Dredge modes/input/all-off, group consent and panel toggle;
it checks one-shot repeats, typing/modal/landed denial, remapping/unbinding and
effective labels. `towing-browser.mjs` additionally uses Home/End for explicit
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

`landing-autopilot.js` runs production guidance and shared flight physics for every
stock hull across four port radii, inward/outward and lateral drift, including
long capped-speed approaches. Four light/heavy hulls additionally assert targetward
cruise orientation at 90% and 100% maximum speed with tiny lateral drift. Existing
settled-authority, stale snapshot and duplicate request guards remain exercised.

`landing-autopilot-browser.mjs` is now registered in the browser CI lane: real L
input, delayed WebSocket inputs, authoritative cruise heading, retrograde braking,
one successful server landing, manual steering takeover and permission denial.
Fixtures use disposable Solo saves and seeded ambient conditions, not player saves.
Targets are static stellars (the production landing contract); moving-target
rendezvous, arbitrary network jitter and cross-browser behavior are not claimed.

## `native-dropdown-theme` — native dropdown appearance

`dropdowns-browser.mjs` runs in the browser CI lane. It checks black backgrounds,
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
30px horizontal inset at desktop/mobile widths and 0.8×/1.4× UI scales. The Solo
client-system test checks the same banner while exercising save/login workflows.

## `trade-custom-amount` — entered market quantities

`trade-amount-browser.mjs` runs in the browser CI lane against isolated deterministic
Solo saves. Native black/white number fields submit actual buys and sells; empty,
zero, negative, fractional and int32-overflow values never reach the wire. Tests
exercise exact quantities, common-first graded cargo, hold/inventory caps, authoritative
insufficient-funds denial, unchanged presets, and draft/focus retention across a
market repaint. A 390px viewport exercises controls, but the game's existing
narrow-screen sidebar/landing layout is not claimed to be fully responsive.
The server retains authority for bulk discounts, specialist bonuses and finite
buyer demand; browser amounts do not guess an affordable limit from list prices.

## Natural mining renewal

`mining-renewal.js` (canonical unit lane, `mining-cutting`) exercises exact 300-second
quiet renewal and existing depletion deadlines for ore, gas and shards through
production mining operations. It checks full-health new identities, no stale-object
damage/reward, active/recent cutting and sweep protection, lazy late-stage escrow
conservation, bounded history, stable restart and version-1 migration, paused clock
and no healthy-generation churn. `field-evolution.js` additionally checks renewed
motherlode full health; `dredge-corona.js` verifies an exhausted plasma source
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

`motherlode-art.js` checks authoritative generated ore/gas/shards and visibility-safe mapping.
`motherlode-art-browser.mjs` exercises production canvas material pixels (not labels),
free/attached parity, neutral undiscovered/unknown objects and failed-image geometry.
The same renderer handles detached objects. Screenshots show all three states plus
unscanned objects. Existing towing browser tests retain real survey/attach/delivery coverage.
No new message actions or save fields. Server payload already exposes resource IDs;
artwork now respects its `revealed` flag rather than disclosing composition before survey.

## NPC landing orientation

The registered v201.js case reproduces perpendicular cruise with three hulls and three speed-ceiling fractions at both planet and station destinations (18 deterministic cases). Production NPC AI and shared physics must align toward the destination, then emit a real landing event within the original radius/speed bounds without fuel consumption. Existing randomized trader arrival and moving-leader escort checks remain. This tests simulation headings and arrival, not every device or rendered bank animation.

- `ship-turning-assets-browser.mjs`: all 122 actual WebP atlases decode 108 nonempty base frames, every bank differs from its neutral heading, enabled glows match dimensions, and stock-rate runtime turns select both valid banks. Original large-hull repair also has an inspected 17-hull contact sheet.

### Multiplayer Follow coasting

`armada-follow-coasting.js` exercises unchanged production physics for seven stock hulls,
including Constitution and slow-turn capital ships: sixty-second matching without
circling/stopping, achievable world-velocity limits, and normal/slow ship
reacquisition after a moving leader stops, restarts and turns sharply.
`armada-follow-two-clients.mjs` uses two isolated Chromium contexts and distinct
disposable multiplayer accounts, real Armada UI opt-in and real-key takeover.
The disclosed fixture starts an attainable matched cruise with small lateral
velocity error; it accelerates production ticks without changing flight physics.
It asserts sustained authoritative movement/heading, sharp-turn slot recovery and
manual override. Existing formation/network tests retain fleet envelope, consent,
combat/landing suspension and leader-jump coverage. Browser evidence is Chromium
only; not exhaustive hull/loadout or real WAN latency testing.

### Ship-function cockpit stack

- `ship-function-stack`: ship-functions-browser.mjs and mining-panel-browser.mjs exercise toggles, disabled mining, action messages, multi-panel flow, long chat and 1440/1024/800/640px layouts at 0.8–1.4 UI scale. Capability fixtures are explicit; authoritative behavior remains covered by network suites.
- Inventory: Combat, Mining (survey/cutting/group help), Towing, Dredge Processing, Fleet/Formation wing orders, Drones secondary-input shortcut. Hailing retains its indicator/modal; comms candidates supplied without duplicate comms. Armada Follow stays in Allies; server follow untouched.
- User-selected icons: Combat A, Towing B, Fleet A, Drones A, Hailing B and Processing C. Drone shortcut preserves secondary fire, including other secondary weapons.

### 3.1 cockpit restyle

System: `cockpit-restyle`.

`cockpit-browser.mjs` checks the bundled Pixelify Sans font is genuinely loaded,
retains the original animated login scene/title and production landed illustration,
and observes actual canvas ship-name and ship-chat drawing with that font. It
exercises eight dock buttons, real Map/Hail activation, the single connected
full-height tray trim, actual pointer resizing and persisted width, correct initial
canvas backing pixels before resize, native
keyboard tray/tab activation, popup close, and flight/chat separation at 1440,
1024 and 640px (including 1.4 UI scale). `ship-functions-browser.mjs` retains
multi-panel, long-history scrolling, all existing actions and keyboard/wheel
reachability coverage. Existing sidebar/catalog/outfitter tests now explicitly
open the collapsible tray before accessing its content; sidebar width persistence
uses the dedicated tray-width preference. Chat-bubble renderer mocks include its
new bezel/scanline drawing primitives. Tests use isolated saves and offline assets;
these Chromium checks are not exhaustive device/OS coverage.

## 3.1 `presentation-polish`

Canonical browser case polish-browser.mjs checks engine-mask extrusion across
three hulls/four headings, boost/idle, neutral texture concealment, revealed
crystal distinction, gesture gating, music restart/cancel, ambience teardown and
mute. Production-renderer fixtures are not an all-hull performance benchmark or
a human listening test.

Login title checks cover standalone placement, 1440/640-wide and 480-high screens,
independently traced electric accents, reduced-motion static fallback and animation
pause after login. New 64-second synthesized horn/string score uses the same tested
music bus, gesture gate and stop/restart lifecycle; subjective timbre needs listening.
