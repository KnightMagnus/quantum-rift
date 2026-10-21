# Code navigation

Start here to find a feature, trace a player action, or decide where a change
belongs. This maps existing code; it does not claim every subsystem is independent
or fully typed. For running the game, use the public README.

## First ten minutes

1. Read `package.json` for startup, test commands and the current version.
2. Read [server/main.js](../server/main.js): it loads assets and the DB, creates
   `Game`, serves files and connects WebSockets.
3. Follow [Game](../server/game.js)'s constructor: live systems, sessions, named
   feature services, combat/hailing services, fixed message routes and tick loop.
4. Read [FEATURES.md](FEATURES.md) before changing composition. Its explicit
   service boundaries and remaining shared state are migration seams.
5. Follow one action below rather than reading every large file front to back.

## Directory map

| Location  | Responsibility                                                                                                        |
| --------- | --------------------------------------------------------------------------------------------------------------------- |
| `client/` | Browser input, rendering, panels, layout and local presentation state.                                                |
| `server/` | Authoritative multiplayer actions, sessions, simulation and saving.                                                   |
| `shared/` | Catalogs, authored content and common calculations. Shared browser access does not grant authority to award anything. |
| `test/`   | Behavior checks, deterministic fixtures and registered CI runners.                                                    |
| `docs/`   | System contracts, guides, design limits and historical evidence.                                                      |
| `tools/`  | Developer/reporting/asset tools, not the live game loop.                                                              |

## Trace a player action: accept a cargo job

```mermaid
flowchart TD
  A[Browser job board] --> B[accept packet over WebSocket]
  B --> C[Game.onMessage entry gates]
  C --> D[Fixed action switchboard]
  D --> E[Game.accept authoritative checks]
  E --> F[Captain mission state and DB dirty flag]
  E --> G[Updated player and landed payloads]
  G --> A
```

1. [client/ui.js](../client/ui.js) builds the board and sends the action;
   [client/mission-details.js](../client/mission-details.js) explains requirements
   and [client/missions.js](../client/missions.js) manages mission presentation.
2. [server/main.js](../server/main.js) upgrades the WebSocket and calls
   `Game.connect`; that session listener parses messages and calls `Game.onMessage`.
3. [server/game.js](../server/game.js)'s `onMessage` applies flood, login,
   checkpoint-recovery freeze and activity gates **before** routing.
4. [server/game-message-handlers.js](../server/game-message-handlers.js) maps
   `accept` to the core method. It is the action switchboard, not a separate
   reward or permission authority.
5. `Game.accept` forwards to [server/jobs.js](../server/jobs.js), the ordinary
   job owner. It checks the current offer, job limits and real hold/bunk space,
   then records the accepted contract. `Game.offers` forwards to the same job service;
   [server/freight-offers.js](../server/freight-offers.js) supplies the stable freight tiers.
   `Game.completeOnLanding` forwards ordinary landing completion to that owner; special mission
   progression also lives in named quest/co-op providers.
6. `you` and `landed` send refreshed payloads. [server/db.js](../server/db.js)
   owns persistence; sending a refresh is not itself a save commit.

For other actions, find the outgoing packet's `t`, look it up in the fixed
switchboard, then follow the named method/service. `hello` is handled by the
unauthenticated entry gate, not the authenticated route registry.

Useful searches from the repository root:

```sh
rg -n "'accept'|accept\(s|completeOnLanding" client server
rg -n 'createMessageHandlers|onMessage\(s' server/game.js
rg -n "'trade'|'refinery'" server/game-message-handlers.js
rg -n 'cargo-courier-progression|robustness-wiring' test/regression-manifest.json
```

## Find the right subsystem

| Change                                          | Start with                                                  | Important companions                                                                                         |
| ----------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Startup, HTTP, local endpoints                  | `server/main.js`                                            | `server/ws.js`, `server/db.js`                                                                               |
| Login, sessions, travel, ordinary port services | `server/game.js`                                            | `server/space.js`, `shared/galaxy.js`                                                                        |
| Incoming action names/routing                   | `server/game-message-handlers.js`                           | `Game.createMessageHandlers`, `Game.onMessage`, `server/message-registry.js`                                 |
| Feature wiring/dependencies                     | `server/features.js`                                        | `server/feature-service.js`, `docs/FEATURES.md`, `docs/feature-inventory.json`                               |
| Flight physics, collisions, system entities     | `server/space.js`                                           | `server/combat-assist.js`, `shared/rules.js`                                                                 |
| Cargo, trading and grades                       | `Game.market/trade`, `shared/cargo-lots.js`                 | `server/trade-pricing.js`, `shared/trade-pricing.js`, `shared/economy-preview.js`                            |
| Public jobs and hauling                         | `Game.offers/accept/completeOnLanding`                      | `server/freight-offers.js`, `shared/passengers.js`, `docs/CARGO-JOBS.md`                                     |
| Story Jobs and quest steps                      | `server/quests.js`, `shared/quests.js`                      | `server/story.js`, `shared/story.js`, `server/arcs.js`, `shared/arcs.js`                                     |
| Team missions/consent                           | `server/coop.js`                                            | `server/warband-consent.js`, `shared/mission-payouts.js`, `docs/MISSION-REWARDS.md`                          |
| Mining/refining/industrial/towing               | Corresponding `server/` provider                            | Matching `*-contracts.js`, `shared/*-rules.js`, browser panels                                               |
| Hails/dialogue                                  | `server/hail-service.js`, `server/hail-dialogue.js`         | `server/hail.js`, `client/hails_ui.js`, `docs/HAILING.md`                                                    |
| Radio/discovery                                 | `shared/radio-stations.js`, `server/radio-discovery.js`     | `client/radio.js`, `client/audio.js`, `docs/RADIO.md`                                                        |
| Browser connection/input/loop                   | `client/main.js`                                            | `client/action-bindings.js`, travel autopilot modules                                                        |
| Menus/HUD                                       | `client/ui.js`, `client/style.css`, `client/cockpit.css`    | `client/cockpit-state.js`, `client/sidebar-size.js`, `client/chat-projection.js`, `client/ship-functions.js` |
| Scene/ship drawing                              | `client/render.js`                                          | `client/artwork.js`, animation/ship-banking modules, `client/assets/`                                        |
| Galaxy/hulls/loadouts/stats                     | `shared/galaxy.js`, `shared/assets.json`, `shared/rules.js` | Shared bonus/stats owners in `server/features.js`                                                            |

## Who owns which information?

- **Persistent accounts/world:** `DB` stores these. Ordinary changes mark it
  dirty; journal/checkpoint systems have stronger commit and recovery rules.
  Preserve these boundaries rather than adding another save path.
- **Live sessions/active systems:** `Game` owns session and live-space maps.
  `Space` advances a system's simulation. Accessing `game.spaces[id]` can lazily
  wake a system: it is not an inert lookup table.
- **Ordinary jobs:** `game.jobService` owns board generation, acceptance and
  landing completion, using the existing account mission array. It has no second
  save store. Story, Armada and mining-order services retain their specialized
  progression; port refresh, logging and shared capacity stay core capabilities.
- **Feature operations:** `game.features.<name>` exposes named services with
  explicit capability facades. Some state still lives on `Game` or in shared
  account/world objects. These are not fully isolated workers.
- **Routes:** `Game.createMessageHandlers` supplies explicit live getters and
  forwarding functions. Routes read current services/state, including replacements
  after construction. Do not snapshot mutable dependencies or bind stale methods.
- **Browser presentation:** panels and local cockpit preferences belong to the
  client. The server still validates and performs any previewed operation.
- **Shared calculations/content:** these supply definitions, not permissions.
  Avoid duplicating authoritative arithmetic in a panel.

## Tests and a safe change workflow

1. Find the system/action in
   [test/regression-manifest.json](../test/regression-manifest.json); read its
   tests first. [TEST-COVERAGE.md](TEST-COVERAGE.md) explains scope and omissions.
2. Run focused cases while developing. For routing changes, start with
   `node test/message-routing.js`, `npm run test:features` and the relevant real
   action/network tests. Fuzzing discovers routes from the runtime registry, not
   source-code switch patterns.
3. Run existing gates:

   ```sh
   npm run typecheck
   npm run test:features
   npm run test:types
   npm run format:check
   npm run test:regression
   git diff --check
   ```

4. Keep behavior changes separate from moves. Preserve independent baseline
   evidence, operation order, denial cases, saves and late-bound test seams.
   Do not regenerate expected fixtures from a replacement merely to get green.
5. Use temporary saves and fixtures, never a real captain's account. Do not
   include private saves, dependencies or source-audio masters in a PR.

TypeScript/JSDoc checks are selective: `checkJs` is not globally enabled. Large
legacy bodies, including the moved action implementations, remain unchecked.
A typed boundary does not runtime-validate incoming JSON or prove every branch.

## First cleanup trial

The trial separates action routing from `server/game.js`, preserving entry gates
and service implementations. It changes no action names, rewards, saves, UI or
eligibility. [CODE-NAVIGATION-TRIAL.md](CODE-NAVIGATION-TRIAL.md) records provenance
and review checks. Ordinary jobs now have a separate owner; core trading, station and session
methods still remain in `Game`. The cleanup proceeds through separate PRs.

## UI stylesheet ownership and order

`client/style.css` is the ordered stylesheet entry point. Its ten imports keep
the pre-cleanup rule order and the same asset-relative directory:

| File                          | Contents                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `style-foundation.css`        | Palette, native controls, shared menu chrome and base document styling.            |
| `style-flight-hud.css`        | Sidebar, radar, tabs and flight HUD structure.                                     |
| `style-communications.css`    | Original chat, toast and help styling.                                             |
| `style-overlays.css`          | Landing/map/options/dialog overlay foundation.                                     |
| `style-cursors-map.css`       | Custom cursors and galaxy-map tools.                                               |
| `style-companions.css`        | Crew/hangar/boarding and operations components.                                    |
| `style-controls-login.css`    | Touch controls, title/solo/story presentation and accessibility foundations.       |
| `style-port-services.css`     | Mission board, command bar, radio, hail and Syndicate panels.                      |
| `style-late-components.css`   | Later component chrome, newcomer badge, docks, volume, quest and dialog overrides. |
| `style-responsive-scenes.css` | Later responsive/sidebar, login/co-op, communication and mining-layout rules.      |

The last two files intentionally retain historical cross-component overrides;
this is a safe first organization, not a claim that every duplicate selector is
consolidated. Do not regroup selectors or reorder imports without checking their
cascade and responsive behavior. The separate `cockpit.css` and `login_scene.css`
keep their existing document positions. No preprocessor or bundler is required.
