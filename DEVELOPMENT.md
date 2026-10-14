# Quantum Rift: developer guide

This guide is for anyone (or any AI assistant) picking up Quantum Rift's code. It covers:
- how the game is built
- the stages it went through
- how to add a feature
- how to test it
- the resources it draws on

Give an assistant this file plus `README.md` and it has the context to continue.

## What it is

Quantum Rift is a 2D space trading and combat game in the browser. It is inspired by the classic Escape Velocity Nova,
and was rebuilt from the assets of **EV Quantum**, a plug-in for EV Nova.
- It runs as a small Node.js server with **no npm dependencies**: plain ES modules, its own WebSocket implementation, and
  JSON save files.
- The same build hosts an online game or runs a private single-player game (`SOLO=1`).
- Players connect with any modern browser.

## How it fits together

- **Authoritative server.**
  - `server/game.js` holds the `Game` class: sessions, accounts, landing, markets, jobs, the message switch and the main
    loop.
  - Each star system is a `Space` (`server/space.js`) simulated at 30 Hz. It holds ships, AI, shots, beams, loot and
    asteroids.
  - Systems are created lazily, on first access through a Proxy, and put to sleep after two quiet minutes. 211 systems cost
    no more than the occupied ones.
- **Feature mixins.** Each big feature is an object of methods mixed into `Game.prototype`, at the bottom of
  `server/game.js`:
  `HangarMixin, FrontsMixin, FrontierMixin, SpecialistMixin, HostileMixin, StoryMixin, RivalsMixin, HailMixin, FleetCmdMixin, SyndicateMixin, ArcsMixin, DocksMixin, LivingMixin, QuestMixin`.
  - Method names must not collide across mixins; a collision silently replaces a method.
  - `bonus(d)` is deliberately chained: several mixins wrap it to add their modifiers.
- **Shared code.** `shared/` is imported by both server and client:
  - data tables, the galaxy generator, prices
  - flight physics in `shared/rules.js`, so the client can predict its own ship
- **Protocol.** JSON over one WebSocket.
  - The client sends inputs 30 times a second.
  - The server sends a snapshot of the player's system 15 times a second.
  - A ship row is `[id, hull, x, y, a*1000, vx, vy, flags, shield%, armor%, factionIdx, name, owner, power]`. The flag
    bits are 1 thrust, 2 afterburner, 4 disabled, 8 jumping, 16 player, 32 elite and 64 rival captain.
  - Players also get `you` (their whole save, trimmed) and `landed` (the services where they are docked).
- **Saves.** `server/db.js` writes `data/players.json` and `data/world.json` atomically, with a rolling backup every 30
  minutes.
- **Client.**
  - `client/main.js`: network, input, prediction, autopilot, key bindings.
  - `client/render.js`: canvas drawing, radar, galaxy map.
  - `client/ui.js`: HUD, landing screens, companion tabs.
  - Feature screens live in their own modules: `hangar_ui`, `fronts_ui`, `frontier_ui`, `spec_ui`, `info_ui`, `syn_ui`,
    `missions`, `radio` and `planets`.
- **Living galaxy (2.4).** `shared/living.js` defines the system states (famine, war, boom...). `server/living.js`
  starts and ends them every 20 s (`livingTick`), moves prices (`livingMult`: the state times the fading trade impact of
  what captains bought and sold at that world), and posts supply, patrol and passenger jobs (`stateOffers`). States go to
  the client in the `world` message as `states`.
- **Questlines (2.4).** `shared/quests.js` holds the contact story templates (`CHAINS`) and six handcrafted
  `SIDE_STORIES`. `server/quests.js` gives every bar a seeded contact (`contactAt`), offers a `type:'quest'` job, and
  turns each step into an ordinary job tagged `m.quest = {qid, step, of, name}`. `completeOnLanding` calls
  `questAdvance`, which sends the story beat and posts the next step. A lost step is re-posted once by `questSweep`;
  abandoning a step ends the story. Faction commissions still use `m.chain`, so quests must never set it.

## How to add a feature (the pattern every release used)

1. **Data:** a `shared/<feature>.js` file with the tables: costs, tiers, names, text.
2. **Server:** a `server/<feature>.js` mixin with `xxxInit(d)` (fill in save fields), the operations, and payload helpers.
   Then wire it into `server/game.js`:
   - the import, and `Object.assign(Game.prototype, …)`
   - init on login (in `hello`, next to `storyInit` and `synInit`)
   - a case in the `onMessage` switch for each client message
   - periodic work in `tick()` (the 2-second per-session loop or the 20-second loop)
   - fields in the `you()` payload, and in the `landed()` payload for docked services
3. **Client:** a module that renders HTML strings from `G.you` and `G.landed`. Then add a landing tab to `TABS` and its
   `avail` condition in `ui.js`, plus `data-act` handlers in the `ui.js` click switch. For new keys, add the action to
   `ACTIONS` in `main.js`; it then appears in key remapping and on the controls card automatically.
4. **Tests:**
   - `test/vNN.js`: an in-process test with fake sockets (copy the `fake()` helper from `test/v12.js`).
   - `test/vNN_shot.py`: a Playwright browser walk-through that saves screenshots and fails on page errors.
5. **Docs:** a changelog entry and test lines in `README.md`. Bump the version in `package.json`, then build the zip with
   `tools/package.sh`. It unpacks into a "Quantum Rift vX.Y.Z" folder.

## Testing

- **Server suites:** run `node test/<suite>.js` for `sim`, `v03` to `v10`, `v101`, `v11`, `v12`, `v201` to `v203`, `v21`, `v23`, `v24`, `v25`, `fuzz` and `balance`. They run in
  process; no server needed.
- **Networked bot:** `node test/bot.js ws://localhost:8090/ws` against a running server.
- **Browser checks:** `python3 test/<name>_shot.py <outdir> http://127.0.0.1:8090/`. They need Playwright and Chromium.
  - Some need a seeds file (`SEEDS_FILE=test/seeds_testNN.json`), or an edit to `world.json` first. Each script's
    docstring says which.
- **Useful environment variables:**
  - `PORT`, `DATA_DIR`, `SEEDS_FILE` and `SOLO`
  - `FRONT_HOURS` and `INVASION_NOW`, for testing fronts and invasions
- **Seeds:** `server/seeds.json` creates ready-made captains. The shipped file only retires the old KNIGHT showcase
  account. `test/seeds_knight.json` recreates KNIGHT (password 1234, fully upgraded) for the browser tests.
- **Balance:** `test/balance.js` prints shipyard ladders, value for money, income per hour and hours to afford each
  milestone. It fails on outliers.

## Programming stages so far

**EV Quantum (the desktop mod)**
- The EV Nova plug-in was extended through versions 4.0 to 5.2: new ships, the Quantum Station, the Que'vari region and
  the Sol Gateway idea.
- Ships were designed in a Python 3D pipeline: a small hull-building language over a software renderer, producing
  sprite sheets.
- The sprites, weapons, outfits, sounds and landscapes were exported to `shared/assets.json` and `client/assets/`.

**Quantum Rift (the web game)**

| Version | Name | What it added |
|---|---|---|
| 0.1–0.2 | Core | The online engine: accounts, 30 hand-made systems, trading, outfitting, combat, jobs, the Quantum Station, chat and a companion HUD |
| 0.3 | Clean Fire | Weapon looks, mouse targeting, custom cursors, effects, the tutorial, escort slots, security hardening |
| 0.4 | The Wide Rift | A seeded generator growing 30 systems into 200 with territories; map pan, zoom and search; mining; sleeping systems |
| 0.5 | Hangar Deck | Shuttles, officers with synergies, research trees, refining, drydock presets, boarding (plunder, capture, rescue) |
| 0.6 | Fleets and Fronts | Fleets, territory and Dreadnoughts, invasions, anomalies, events, goals, faction stores, new job types |
| 0.7 | Frontier Life | Colonies, station raids, ship mastery, the arena, the exchange, leaderboards, profiles |
| 0.8 | Specialists | The class triangle, ten specialty ships (blueprints, parts, components, tiers), the Sol Gateway and Farside, the Feral Swarm |
| 0.9 | Hostile Space | Hostile levels and odds, loot chests, solo armadas, Station Holdout, weekly events, the Umbral Eclipse |
| 1.0 | Launch | The main story, a 20-step career, solo mode with slots and backups, a balance pass, accessibility options |
| 1.0.1–1.0.3 | Fixes and QoL | Procedural planets, MISSIONS tab and map markers, command bar, autopilot landing and jumping, in-game radio, many fixes |
| 1.1 | Living Rift | 30 rival captains, hailing, fleet orders, multi-jump autopilot, I panel, jettison, combat rating, news and market flashes |
| 1.2 | Syndicate and Officers | Syndicate and black market, officer ranks and traits, lower decks, bank, map views, passengers and rush jobs, faction arcs, Farside expeditions |
| 2.0 | Polish | A synthesized audio pass (interface sounds, ambience, engine hum, login theme, mixer buses), HUD numbers, edge arrows, damage and jump feedback, styled toasts, tab hotkeys |
| 2.5 | Rendered Rift | Pre-rendered planets, stations, landing pictures for every world, fireballs and combat effects, asteroids, loot, outfit pictures and a login backdrop; styled dialogs, small-screen sidebar, market depth, new career steps and story sounds |
| 2.4 | Living Galaxy | System states and a market that remembers trades, contact questlines and six side stories, varied background worlds, combat AI personalities, bar talk, a CAREER page, shipyard comparison, outfitter filters, auto-reconnect, multiplayer screens hidden in solo |
| 2.3 | Busy Lanes | Ten new common Quantum hulls (shared/ships23.js, art from the hull pipeline), 60 new moons and more asteroid fields (gen.js addMoonsAndFields), busier traffic |
| 2.2 | Living Skies | Seeded scenery in every system (star, galaxies, gas giants, black holes, nebulae, asteroid drifts, ion storms, wrecks, derelicts, ruins, crystals, debris, comets, satellites, pods), right-click look-ahead, four docks, K and F reworked |
| 2.1 | Docks | Docks A–E with a lead ship and two wingmate ships each, officers crewing wingmates, buy-to-hangar, friendly fire, a new hyperspace effect and sounds, quick volume |
| 2.0.1–2.0.3 | Fixes | NPC landing, crash-proofing (fuzzer, UI crawler), newcomer protection in inner space, a bug backlog |

The project docs (outside this zip) also hold the roadmap. Multiplayer group features are deferred, and the game is
single-player focused for now.

## Conventions

- No npm dependencies. Node 18 or newer. ES modules everywhere.
- Every feature gets a test, and the whole suite runs before a release.
- **Art:**
  - Sprite PNGs are quantized to 256 colours to keep the zip small.
  - Planets are procedural (`client/planets.js`): a 3D-noise texture wrapped onto a lit, rotating sphere.
  - **2.5 rendered art** (numpy and Pillow; each tool's docstring has its usage):
    - `tools/rift_planets.py`: 56 ray-cast planets into `client/assets/planets/` plus `planets.json` (type, hue, sphere radius as a fraction of the image). `client/planets.js` picks one per world (`chooseRendered`) and falls back to the old procedural sphere while images load.
    - `tools/rift_stations.py`: twelve station designs (`s_<design>.webp`); `client/render.js` `stationDesign(p)` picks one by faction and description.
    - `tools/rift_landscapes.py`: landing pictures (`client/assets/land/l_*.jpg`): a voxel-space height-field terrain with reflective water and haze, depth-tested 3D structures, and skies that reuse the planet renders. `client/ui.js` `landScene(p)` maps worlds to scenes.
    - `tools/rift_fx.py` (fireball sheets, shards, flare), `tools/rift_objects.py` (asteroids, loot), `tools/rift_icons.py` (outfitter pictures for `EXTRA_OUTFITS`), `tools/rift_login.py` (the login backdrop).
    - `tools/rift_render3d.py` is the hull pipeline's software renderer (lofts, tori, blocks, materials with panels, windows and glow); `tools/rift_noise.py` has the shared 3D Perlin noise.
  - System scenery is rendered by `tools/rift_decor.py` (galaxies, nebulae, wrecks, ring ruins) and `tools/rift_decor2.py` (gas giants, derelicts, crystals, black hole, arcs, satellites, pods) into `client/assets/decor/*.webp`. `client/render.js` places it per system (`decorFor`, seeded from the system id) in far, middle and near layers.
- **Audio** is synthesized by `tools/rift_audio.py` (numpy, scipy, ffmpeg) into `client/assets/sfx/`:
  - `ui_*.wav` interface sounds
  - `amb_*.mp3` ambient loops
  - `music_login.mp3`, the login theme
  - `tools/rift_audio25.py` makes the story sting (`ui_quest`) and the trouble beacon (`ui_state`)
  - `tools/rift_audio_jump.py` makes the hyperspace sounds (`ui_jump`, `ui_jumpfast`, `ui_arrive`, `jumpfar`)
- `client/audio.js` routes sound through buses (effects, interface, ambience, music) under a master gain.
  - MP3 loops are played as overlapping copies with cross-fades, because MP3 padding makes simple loops click.
  - The radio is a separate `<audio>` element.
  - Music plays only on the login screen.
- **The main story is kept a surprise.** Don't summarise its plot in docs or release notes.
- Player-facing text uses plain words: "Personal Station", "fleet orders", "rival captains".

## Resources and inspirations

**Escape Velocity Nova (Ambrosia Software / ATMOS)**
- The genre and feel. EV Quantum is a plug-in for it.

**Endless Sky**
- The open-source spiritual successor to EV Nova, and the inspiration for 1.1 and 1.2:
  - autopilot landing and jumping, multi-jump routes
  - hailing and bribes, fleet commands
  - map views, the bank and passengers
  - jettisoning cargo, the player info panel
- Links:
  - https://endless-sky.github.io/
  - Player's Manual: https://github.com/endless-sky/endless-sky/wiki/PlayersManual

**Star Trek Fleet Command**
- Older solo-relevant loops inspired 0.8 to 1.2: the class triangle, specialty ships with blueprint and part chains,
  component tiers, solo armadas, wave defense, the Syndicate, and officer ranks.
- References:
  - https://startrekfleetcommand.com/academy/academy-ships-combat/
  - https://hackmd.io/@hawks/infos_en

**iHeartRadio public API**
- Used by the in-game radio:
  - station search: `api.iheart.com/api/v3/search/all`
  - stream URLs: `api.iheart.com/api/v2/content/liveStations/{id}`
  - now playing: `api.iheart.com/api/v3/live-meta/stream/{id}/currentTrackMeta`
- The server proxies these requests (`/api/radio…`).

**Tools**
- Playwright with Chromium for browser tests.
- Python with Pillow and numpy for the art pipeline and asset tools; numpy, scipy and ffmpeg for the synthesized audio.
- hls.js (loaded from cdnjs only when a radio station needs HLS).

## Test suites (full list)

- `python3 test/v103_shot.py <outdir>`: 1.0.3 browser check (jobs, trade MAX and SELL ALL, outfitter, career card, L to depart,
  autopilot landing).
- `python3 test/v103_radio.py <outdir>`: the in-game radio, with iHeart mocked.
- `node test/v202.js`: 2.0.2 checks (KNIGHT retirement, prototype-safe names and lookups).
- `node test/v203.js`: 2.0.3 checks (newcomer protection, calmer raider spawns, the backlog fixes).
- `node test/v25.js`: 2.5 checks (every art asset exists and is referenced, planet manifest, station and landing scene coverage, the art budget, styled dialogs, career migration, market depth).
- `node test/v24.js`: 2.4 checks (client scripts parse, system states and trade impact, contact stories at every bar, side stories, salvage, combat AI).
- `node test/v23.js`: 2.3 checks (new hulls and their art, moons, fields, traffic).
- `node test/v21.js`: 2.1 checks (docks, wingmate ships and crews, buying to the hangar, save upgrade, friendly fire).
- `node test/fuzz.js [rounds]`: the message fuzzer and soak test; fails on any server error.
- `python3 test/crawl.py <outdir>`: the UI crawler (`SEEDS_FILE=test/seeds_crawl.json`).
- `node test/v201.js`: 2.0.1 checks (traders settle and land; escorts keep formation on a moving leader).
- `python3 test/v20_shot.py <outdir>`: 2.0 browser check (HUD numbers and speed, edge arrows, damage flash, tab hotkeys and
  remembered tabs).
- `python3 test/v20_audio.py`: the audio pipeline (login theme, interface sounds, station and space ambience, the mixer).
- `node test/v12.js`: 1.2 checks (Syndicate, black market, promotions, lower decks, bank, passengers and rush jobs,
  contracts, faction arcs, expeditions).
- `python3 test/v12_shot.py <outdir>`: browser check of the black market, an arc pop-up, the bank, crew ranks and map views
  (start the server with `SEEDS_FILE=test/seeds_test12.json`).
- `node test/v11.js`: 1.1 checks (rival captains, hailing, fleet orders, jettison, combat rating, news, market flashes).
- `python3 test/v11_shot.py <outdir>`: browser check of hailing a rival, the I panel, fleet orders, full stop and multi-jump
  (place rivals r7 and r21 in `qgate` in `DATA_DIR/world.json` before starting the server).
- `node test/v101.js`: 1.0.1 checks (respawn at your own station hull or the hub).
- `python3 test/v101_shot.py <outdir>`: browser check of the command bar, the controls card, the MISSIONS tab, the map
  marker and planets (start the server with `SEEDS_FILE=test/seeds_test10.json`).
- `node test/v10.js`: 1.0 checks (the main story chain and the Deep gate, solo mode with slots, pause, import and
  backups, the 20-step career).
- `node test/balance.js`: the balance report: shipyard ladders by role, value for money, rough income per hour,
  hours to afford the big milestones, and event rewards. Fails on outliers.
- `python3 test/v10_shot.py <outdir>`: browser check of the loading bar, a story pop-up, key remapping, the colour-blind
  palette and interface size (start the server with `SEEDS_FILE=test/seeds_test10.json`).
- `node test/v09.js`: 0.9 checks (levels and odds, loot chests, directives and armadas, Station Holdout, weekly events,
  the Umbral Eclipse).
- `python3 test/v09_shot.py <outdir>`: browser check of a Holdout and the OPS tab (fresh `DATA_DIR`, `SEEDS_FILE=test/seeds_knight.json`).
- `node test/v08.js`: 0.8 checks (Sol, the Gateway and Farside, routes through the wormhole, no racial ships there, the
  class triangle, the ten specialists, blueprints, parts, components, tier-ups and each specialty).
- `python3 test/v08_shot.py <outdir>`: browser check of the Personal Stations, building a specialist, the faction store
  menu, options and the map (fresh `DATA_DIR`, `SEEDS_FILE=test/seeds_knight.json`).
- `node test/v07.js`: 0.7 checks (colonies, raids and live waves, mastery, the arena and ratings, the exchange,
  transfers, leaderboards, profiles).
- `python3 test/v07_shot.py <outdir>`: browser check of colonies, the exchange and the arena (start the server with
  `SEEDS_FILE=test/seeds_test07.json`).
- `node test/v06.js`: 0.6 checks (Umbral fix, fleets, Dreadnought claims and the front window, trade tax, invasions,
  anomalies, events, goals, stores, convoy, rescue, survey, smuggling, commissions).
- `python3 test/v06_shot.py <outdir>`: browser check of the fleet, OPS tab and map overlays (start the server with `INVASION_NOW=1`).
- `node test/v05.js`: 0.5 checks (shuttles, officers, synergy and experience, research queue, refining, drydock, boarding).
- `python3 test/v05_shot.py <outdir>`: browser check of a maxed station, hangar and crew screens and a shuttle launch (`SEEDS_FILE=test/seeds_knight.json`).
- `node test/v04.js`: 0.4 checks (200 systems, all reachable, deterministic generation, sleeping systems, mining, ore
  processing, charting, routes).
- `python3 test/v04_shot.py <outdir>`: browser check of the new map and mining. Start the server with a fresh `DATA_DIR`
  and `SEEDS_FILE=test/seeds_test.json` first.
- `node test/v03.js`: 0.3 checks (weapon colours, hit events, escort slots, wreck clean-up, tutorial, login throttle).
- `python3 test/v03_shot.py <outdir>`: browser check of the guide, click targeting and a Constitution firing (`SEEDS_FILE=test/seeds_knight.json`).
- `node test/sim.js`: an in-process test of station progression to Ops 5, research, the refinery, the
  Mk II and Mk III refits, wingmates (formation and combat), fighter bays, bounties, death and respawn, and
  saving.
- `node test/bot.js ws://localhost:8080/ws`: two networked captains with the server running. They log in,
  trade, buy outfits, build Ops 1, chat, see each other, fly, fire, jump, land, refuel and take a job.
- `python3 test/shots.py <outdir>`: a Playwright browser walk-through that saves screenshots.
