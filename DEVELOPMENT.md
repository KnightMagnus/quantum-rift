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
  `HangarMixin, FrontsMixin, FrontierMixin, SpecialistMixin, HostileMixin, StoryMixin, RivalsMixin, HailMixin, FleetCmdMixin, SyndicateMixin, ArcsMixin, DocksMixin`.
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

- **Server suites:** run `node test/<suite>.js` for `sim`, `v03` to `v10`, `v101`, `v11`, `v12`, `v201` to `v203`, `v21`, `fuzz` and `balance`. They run in
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
  - System scenery is rendered by `tools/rift_decor.py` (galaxies, nebulae, wrecks, ring ruins) and `tools/rift_decor2.py` (gas giants, derelicts, crystals, black hole, arcs, satellites, pods) into `client/assets/decor/*.webp`. `client/render.js` places it per system (`decorFor`, seeded from the system id) in far, middle and near layers.
- **Audio** is synthesized by `tools/rift_audio.py` (numpy, scipy, ffmpeg) into `client/assets/sfx/`:
  - `ui_*.wav` interface sounds
  - `amb_*.mp3` ambient loops
  - `music_login.mp3`, the login theme
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
