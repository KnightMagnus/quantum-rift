# Quantum Rift

An online multiplayer space trading and combat game in the browser, rebuilt from the assets of the
**EV Quantum** plug-in: 100 ships (with their rendered sprites), 41 weapons, 53 outfits, the original sound
pack, and the Quantum Station.

## What is in the game

- **200 systems (since 0.4).** The 30 hand-made systems are the heart of a seeded 200-system galaxy (plus Sol and the ten Farside systems): every
  power holds a territory, unclaimed Frontier space lies between them, and the Deep waits at the south-west rim.
- **The original 30 systems in 11 factions.** The Quantum Concord sits at the centre. Around it are the Free Spacers,
  Lamplighters and the Hollow (pirates), the Que'vari and the hostile Umbral, and the five alien races:
  Vashari, Korrund, Ylith, Sarn and Thalassi. Each system has its own worlds, markets and traffic, plus a
  danger level.
- **Real-time flight and combat in the style of EV.** This includes guns, turrets, beams, homing missiles,
  point defense, fighter bays, disabled ships and loot crates. The server runs the game, and your own ship
  is predicted on your machine so it responds instantly.
- **Online multiplayer.** Every captain shares the galaxy. You can see each other, chat (globally or per
  system), and fight player against player in lawless systems (danger 3 and up).
- **Landing.** Landed worlds offer:
  - a commodity market (8 goods whose prices drift through the day)
  - shipyards, which sell the hulls of the faction that holds the system, and trade in your old ship
  - outfitters
  - a job board with cargo runs, bounties and patrols
- **Reputation with every faction.** Attacking a faction's ships makes it hostile, and bounties on pirates
  pay out.
- **Quantum Station is the community hub.** It is a colossal ring station at Quantum Gate that turns slowly in
  space. Its Community board shows who is online and docked, the top captains, and a registry of every
  Personal Station in the galaxy.
- **Claimable station hulls.** Sixteen derelict hulls drift in systems across the galaxy. Land on one and claim
  it (one per captain) to make it your Personal Station. It appears in space with your name, and its
  look changes with its Ops level. Other captains can dock there to refuel and trade.
- **Your Personal Station.** It runs on real time:
  - Five Ops levels, paid for with credits and Alloy, Crystal and Isotope crates (grades I to V).
  - A refinery that fills while you are away.
  - A research lab with timed upgrades: shields, armor, drive, silos, gunnery and warp.
  - Mk II and Mk III refits.
  - The six wingmates and the Armada as escorts, at Ops 4 and 5.
  - The Exotics and the Constitution, for sale at Ops 5.
- **The companion is built into the HUD.** The right-hand column holds the radar, status, target and nav,
  plus six tabs:
  - Radio (iHeartRadio search and favorites)
  - Codex (every ship and outfit, and where to get it)
  - Missions (every active mission and the main story, with where to go and a PLOT COURSE button)
  - Station (a live dashboard, with actions when you are docked there)
  - Ops (events, goals, directives and the weekly calendar)
  - Log (automatic milestones and your own notes)
- **Saved captains.** Accounts are a name and a password (hashed with scrypt), saved to `data/players.json`.

The bar along the bottom holds chat (with ALL, SYSTEM and FLEET channels) and buttons for the galaxy map, your key
bindings, options and **?**, a card of every control.

The right-hand sidebar has a brushed steel frame. Drag its left edge to make it wider or narrower; the width
is remembered.

## Controls

| Key | Action |
| --- | --- |
| Up / W | thrust |
| Left, Right / A, D | turn |
| Down / S | turn to reverse |
| Shift | afterburner (if fitted) |
| Space | fire primary weapons |
| F | fire secondary weapons (missiles, fighter bays) |
| Tab / Shift+Tab | cycle targets |
| R | target the nearest hostile ship |
| L | land on your nav point or the nearest world. From far away the autopilot flies you in, brakes and lands. L also departs when docked |
| M | open the galaxy map. Click a system to plot a course |
| J | jump along the plotted course. The autopilot flies clear of planets first, and keeps jumping until you arrive |
| Z / X | zoom in and out |
| C | next companion tab |
| Enter | chat. Start with `/s ` for your system only, `/f ` for your fleet |
| O | options |
| B | board the targeted disabled ship (plunder, capture or rescue) |
| T | hail your target (or your selected planet): bribe pirates, ask for fuel or repairs, talk to rival captains, buy landing clearance |
| I | ship and captain panel: stats, cargo (jettison), combat rating, record, fleet orders, rival captains |
| E (hold) | turn to face your target |
| Q | full stop |
| G / K / H / Y / U | fleet orders: form up, attack my target, hold position, hold fire, collect loot |
| ? or F1 | the controls card |
| 1 to 9 (docked) | switch landing tabs; each world remembers the tab you used last |
| Mouse | click a ship or radar blip to target it; right-click clears. Click a planet to set it as your nav point, double-click to land. Wheel zooms. |

**Gamepad** (any standard controller):
- Left stick: turn (and push up to thrust). RT also thrusts.
- A: fire. B: secondary weapon. LT: afterburner. D-pad down: reverse.
- X: nearest hostile. LB/RB: cycle targets.
- Y: land. D-pad up: jump. Start: map. Back: board.

**Touch screens:** an on-screen stick (steer toward where you push; push far to thrust) plus buttons for FIRE, ALT,
BOOST, TGT, LAND, JUMP, MAP and BOARD.

Options (the gear button, or O): damage numbers, screen shake, and **mouse aim** (the ship turns toward the
cursor; hold the left button on open space to fire), and desktop notifications when the game is in the background.
It also has a colour-blind palette, interface size, master and effects volume, mute, and key remapping (click a key, then
press the new one; Escape cancels).

## Run it on your own computer

**Windows, easiest:** double-click **Start Quantum Rift.bat**. The first time, it opens the Node.js download page
if Node isn't installed: install the LTS version and double-click the file again. A black window opens (that's
the server, so leave it open) and the game opens in your browser. Close the black window to stop the server.

**Mac or Linux:** double-click `start.command` (or run it in Terminal).

**Playing alone:** double-click **Start Solo Game.bat** (Windows) or `start-solo.command` (Mac/Linux) instead.
- The solo server only listens on your own computer, needs no passwords, and lets you pause with **P**.
- It keeps its saves in `solo-data`, separate from the online game.
- The login screen lists your captains, with an **EXPORT** link that downloads a captain as a file and an
  **LOAD A SAVE FILE** button that loads one back.
- Every server, solo or online, keeps a rolling backup of all saves every 30 minutes (the last 12, in
  `data/backups` or `solo-data/backups`).

**By hand:** you need Node.js 18 or newer. There are no packages to install.

```
cd quantum-rift
node server/main.js
```

Open http://localhost:8080 in a browser. To play together on the same network, others open
`http://<your-computer's-address>:8080`.

Ready-made captains: `server/seeds.json` can list accounts the server creates on start-up if they don't exist yet.
It ships with one entry that **retires** the old KNIGHT showcase account. On first start, any existing KNIGHT save is
removed and his Ops 5 station hull at Quantum Gate becomes an unclaimed derelict again. The browser tests use
`test/seeds_knight.json`, which still creates KNIGHT, for a fully upgraded test captain.

Environment variables:

- `PORT` sets the port (default 8080).
- `DATA_DIR` sets where saves go (default `./data`).
- `SEEDS_FILE` points at a different seeds file (used by the tests).
- `FRONT_HOURS=19-21` sets the daily front window in UTC hours (when Dreadnoughts can be damaged).
- `INVASION_NOW=1` (or a system id) starts an invasion at boot, for testing.
- `SOLO=1` runs the single-player server (local only, no passwords, pause, save slots).

## Host it online (so friends can join from anywhere)

Any host that runs a long-lived Node process with WebSockets works. Three options:

- **Render.com:** create a new Web Service from a Git repo that contains this folder. Set the start command
  to `node server/main.js` and add a persistent disk mounted at `/data` with `DATA_DIR=/data`. Render
  supplies HTTPS, and the game switches to `wss://` automatically.
- **Fly.io:** run `fly launch`, using Node and the start command `node server/main.js`. Create a volume for
  `DATA_DIR`.
- **A small VPS (any Linux box):**
  1. Copy the folder over and run it with `pm2 start server/main.js` or a systemd service.
  2. Put Caddy in front for HTTPS: a `Caddyfile` with `yourdomain.com { reverse_proxy localhost:8080 }`.
     Caddy passes WebSockets through on its own.

The server handles dozens of players on one small CPU. Only systems that have players in them are
simulated at full rate.

## Tests

- `python3 test/v103_shot.py <outdir>`: 1.0.3 browser check (jobs, trade MAX and SELL ALL, outfitter, career card, L to depart,
  autopilot landing).
- `python3 test/v103_radio.py <outdir>`: the in-game radio, with iHeart mocked.
- `node test/v202.js`: 2.0.2 checks (KNIGHT retirement, prototype-safe names and lookups).
- `node test/v203.js`: 2.0.3 checks (newcomer protection, calmer raider spawns, the backlog fixes).
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

## How it is built

```
server/main.js   HTTP (static files, radio search proxy) + WebSocket upgrade
server/ws.js     a small RFC 6455 WebSocket implementation (no dependencies)
server/game.js   sessions, accounts, landing services, markets, shipyard, outfitter, jobs, Quantum Station, chat
server/hangar.js shuttles, officers, research queue, refining, drydock, boarding (mixed into Game)
server/fronts.js fleets, territory, invasions, anomalies and events, goals, stores, the new job types (mixed into Game)
server/frontier.js colonies, station raids, mastery, the arena, the exchange, leaderboards, notifications
server/specialists.js specialty-ship abilities, blueprints, parts, components and tier-ups
server/hostile.js loot chests, directives and solo armadas, Station Holdout, the Umbral Eclipse
server/rivals.js the thirty rival captains: careers, presence in live systems, relations, hired guns, news, market flashes
server/hail.js   hailing ships and planets (bribes, fuel and repairs, landing clearance, rival conversations)
server/fleetcmd.js fleet orders, jettison, combat rating
server/syndicate.js the Syndicate and black market, officer promotions, lower decks, the bank, passenger/rush/Syndicate jobs
server/arcs.js   faction story arcs and Farside expeditions
server/story.js  the main story (kept a surprise)
server/space.js  one system's simulation: ships, AI traffic (traders, patrols, raiders, escorts, fighters), combat, loot
server/db.js     JSON save file, written atomically
shared/gen.js    the seeded generator that grows the 30 anchors into 200 systems
shared/galaxy.js the 30 hand-made systems, factions, commodities, station data (used by server and client)
shared/hangar.js shuttle, officer, research-tree, refining and drydock data
shared/fronts.js fleet, Dreadnought, boss, anomaly, goal, event and store data
shared/frontier.js colony, defense, mastery, arena, exchange and leaderboard data
shared/specialty.js the ten specialists and their loops; shared/roles.js the class triangle
shared/rivals.js, shared/syndicate.js, shared/arcs.js, shared/expeditions.js, shared/story.js  data for the systems above
shared/rules.js  stat conversion, loadouts, flight physics (shared so the client can predict), prices
shared/assets.json  ships, weapons and outfits exported from EV Quantum 5.2
client/          index.html, style.css, main.js (network, prediction, input), render.js (canvas), ui.js (HUD,
                 landing, companion, map), audio.js, radio.js (in-game radio), planets.js (procedural planets),
                 missions.js (MISSIONS tab, map markers), info_ui.js (I panel), syn_ui.js (1.2 screens); assets/ has the ship sprite sheets, icons, sounds, landscapes
```

The network protocol is JSON over one WebSocket:

- The client sends inputs 30 times a second.
- The server simulates at 30 Hz and sends each player a snapshot of their system 15 times a second.
- Your own ship is reconciled against the server by replaying the inputs the server has not processed yet.

## Changelog

### 2.2 "Living Skies"
- **Every system has its own scenery**, seeded from the system, so each one always looks the same and no two look alike.
  - **Far away:**
    - the system's star with a lens flare
    - distant spiral, barred, edge-on and elliptical galaxies
    - ringed and banded gas giants
    - now and then, a black hole with its accretion disc, or a sweeping pulsar
    - fragments of an ancient megastructure ring
  - **In between:**
    - gas clouds in the local power's colours
    - drifts of distant asteroids
    - ion storms crackling with lightning
    - the odd shooting star
  - **In the system itself:**
    - massive ancient wrecks: capital hulls broken in two, scorched, a few lights still burning, trailing debris
    - abandoned station platforms
    - broken ring ruins
    - glowing crystal formations
    - battle debris fields with hot fragments
    - comets with streaming tails
    - relay satellites orbiting planets
    - drifting cargo pods
    - blinking nav beacons by the spaceports
  - Wild space (the Frontier, the Deep, Umbral space and the Farside) gets more wrecks, ruins, crystals and black holes.
  - The scenery is decoration: you fly past it, and it never blocks you.
- **Look ahead.** Hold the right mouse button and move the mouse to slide your view up to about 3,000 units that way, without zooming out. An arrow shows where your ship is, and the view eases back when you let go. A quick right-click still clears your target.
- **Four docks.** Docks are A to D: one at Ops 0–1, two at Ops 2, three at Ops 3–4 and four at Ops 5. Saves with a fifth dock fold it in, and you keep flying your ship.
- **K sends your wingmates in.** The attack order now sends wingmates out to weapons range of whatever you've targeted, including a ship that isn't hostile, now that your guns can hit anyone.
- **Drones on F.** Tap F to launch every drone in your bays at once, and tap again to call them all home. Drones stay out until recalled, and any still out when you land or jump go back into the bays.

### 2.1 "Docks"
- **Docks.** Your Personal Station has lettered docks (A to D since 2.2).
  - Each dock holds a **lead ship** and up to **two wingmate ships**, all picked from your stored ships. A Herald in the lead slot commands a third wingmate.
  - You fly the lead of your **active** dock, and its wingmates fly in formation with their own outfits.
  - Switch docks with the DOCK buttons beside DEPART, or on the new STATION → DOCKS screen, where you assign every slot.
  - The sidebar shows your active dock and how its wingmates are doing.
- **Wingmates are ships now.** Hiring wingmates at the station is gone.
  - The wingmate hulls are sold at your station shipyard (Ops 4, Armada hulls at Ops 5) and go straight to your hangar. They fly only as wingmates.
  - Any ship can be a wingmate.
  - A wingmate knocked out in a fight is towed home and repaired in ten minutes, or at once for a fee. Wingmates are no longer lost when you die.
- **Officers crew wingmates.** Each wingmate has a captain and a crew slot, and the officers there boost that ship. An officer serves one post at a time. The roster grows from 12 to 24.
- **More stored ships.** The hangar holds 3 / 5 / 8 / 11 / 14 ships at Ops 1–5, plus the Drydock Annex research.
  - Every shipyard has **BUY TO HANGAR**, which skips the trade-in.
  - Stored ships sell for half the hull plus half the outfits.
  - Saves from 2.0.x are upgraded: hired escorts become stored ships flying as Dock A's wingmates.
- **Fire at will.** Your own guns now hit any ship, as in EV Nova, not just hostile ones.
  - A ship you hit turns on you, and its faction holds it against you.
  - Your wingmates are never hit, and other players only in lawless space as before.
- **New hyperspace jump.**
  - Rings of energy close in as the drive spools, the stars smear into streaks along your heading, and you leave in a white bloom with a lens streak.
  - Arrival plays it in reverse with a shockwave.
  - Other ships leave a blue ghost trail as they jump, and flash as they go.
  - New synthesized jump, arrival and distant-jump sounds replace the old sweep. Ships with the fast hyperdrive get their own short version.
- **Quieter, with an easy volume control.**
  - Default levels are lower, and older saved settings are turned down once.
  - A speaker button in the command bar opens a master volume slider with MUTE, and **N** mutes from anywhere.
  - Volume sliders (options, quick volume, radio) are red to match the interface.
- **Interface:** the station's ACADEMY section is replaced by DOCKS; HANGAR is now SHUTTLES and DRYDOCK is now REFITS. Assigning ships no longer floods the screen with messages.

### 2.0.3
- **Newcomer protection.**
  - Until your Personal Station reaches Ops 3, pirates, raiders, swarms and other always-hostile ships in inner space (danger 0 to 2) won't start a fight with you.
  - Shooting first ends the truce for that fight, and a job's own targets still attack.
  - A badge in the sidebar shows when you're protected. You're warned the first time you enter lawless space, where protection doesn't apply.
- **A moment to get your bearings.** Nobody targets you for the first six seconds after a jump, anywhere.
- **Calmer inner space.**
  - Raider groups no longer pile up in a system while traders come and go: before, Far Mouth on the main story's path could hold four raider packs at once.
  - The heaviest raider hulls (Tempest Destroyers) stay out of inner space.
- **Fixes:**
  - Cargo carried for jobs now takes up real hold space, and the hold readout shows it.
  - Escorts no longer linger in space after you are destroyed.
  - Abandoning a bounty sends its target away. Jobs can now be abandoned from the MISSIONS panel too, with a confirmation.
  - Renaming a ship "Tender" no longer gets it deleted on a drydock swap.
  - Buying a ship or swapping at the drydock checks that your job cargo and passengers fit.
  - Pausing a solo game stops the clock on rush deadlines and loan payments.
  - A rival flying alongside you goes back to their own business when you land, instead of vanishing.
  - Stored ships sell like a trade-in, for half the hull plus half the outfits.
  - Outfits can only be sold at an outfitter. Blank ship names fall back to the hull name.
  - Bounty boards never list two targets with the same name.
  - Clearer messages for skip-jump fuel and for jumping while your ship is booked for a tier-up.
  - Server-side checks for escort and lower-deck slots, and safer save imports.
- **Interface:**
  - Bounties warn when the target outguns your ship.
  - The speed readout is labelled.
  - Ammunition can't be bought without a launcher.
  - The buy-ship and sell-ship confirmations show what you'll get.
  - Messages no longer cover the world's name when landed.
  - The galaxy map toolbar stays inside its frame.
  - Arrow keys can't be bound to other actions.

### 2.0.2
- **KNIGHT retired.** The showcase account is gone, and on first start any existing KNIGHT save is removed and his Ops 5
  station hull at Quantum Gate becomes an unclaimed derelict again.
- **Crash-proofing.** A fuzzer (`test/fuzz.js`) sent tens of thousands of random and malformed messages from many clients.
  Fixes:
  - captain names like `__proto__` are refused, and saves can no longer be corrupted through them
  - profile and leaderboard lookups with odd names no longer error
  - bogus faction-arc requests no longer write junk into saves
  - the game loop and each system now recover from errors instead of stopping the server
- **UI crawler** (`test/crawl.py`). It visits every kind of world and clicks every tab, station section, overlay and map
  view, checking for errors and for content spilling out of frames. It came back clean.

### 2.0.1
- **NPC ships land properly.** Traders heading for a planet or station now slow down, settle over it and land. Before,
  they circled it forever. The fix is new arrival steering that plans a speed falling to zero at the target.
  - Escorts and wingmates use the same steering, now matching their leader's speed in formation.
  - Rival captains who land stay docked for a minute or so, then take off again from the same world.

### 2.0 "Polish"
- **A full audio pass.** Every new sound is original, synthesized by `tools/rift_audio.py`.
  - **Interface sounds:**
    - button clicks and hovers, tabs, opening and closing windows
    - buying and selling, accepting jobs and completing them
    - level-ups and promotions, alerts, errors
    - target lock, low-shield warning, hails, chat, loot pickup
    - docking, undocking, the hyperspace jump and arrival
  - **Ambience:** a deep-space drone with faint distant pings, a station interior (machinery, air handling, distant
    clanks and murmurs), and an engine hum that opens up as you thrust and roars on the afterburner.
  - **Login theme:** a slow, spacious original piece. It plays only on the login screen, starting at your first click,
    and fades out when you enter the Rift (in the game, your radio is the music). The ♪ button turns it off.
  - **Mixer:** new Interface sounds, Ambience and Login music sliders join Master, Effects and Radio.
- **HUD.**
  - Shield and armor show their numbers on the bars, and a speed readout sits beside your credits.
  - Your credits float a green +amount or red −amount whenever they change.
  - Arrows at the screen edge point to your target, your nav point and mission objectives in this system, with distances.
- **Feedback.**
  - The screen edges flash red when your hull is hit and pulse while armour is low.
  - Stars streak past during a jump, with a flash on arrival.
- **Toasts** are colour-coded: errors red, completions gold, level-ups violet, alerts flashing red.
- **Docked.** Number keys 1 to 9 switch landing tabs, and each world remembers the tab you used last.
- **Smoother screens.** Windows fade in.
- **Career panel.** Click its header to fold it away.

### 1.2 "Syndicate and Officers"
- **The Syndicate.** A crime path with tiers from Unknown to Kingpin. Smuggling, plunder, capture and Syndicate contracts
  raise it. Outlaw worlds post Syndicate smuggling runs and hits.
- **The black market.** Found on outlaw worlds, and in any spaceport bar once you are a Lieutenant. It sells:
  - forged papers (which wipe your worst grudge)
  - officer commendations
  - Wraith and Corsair blueprints and parts
  - directives and unmarked crates
  Stock unlocks by tier.
- **Officer ranks and traits.** Promote officers from Ensign to Captain with commendations and credits. Each rank adds 12%
  to their stats and teaches a trait: Sharpshooter, Ironclad, Ace Pilot, Haggler, Ghost and more.
- **Lower deck.** Two crew berths for small passives: medic, mechanic, cargo rigger, cook, lookout, fuel tech, gunner's mate,
  fixer.
- **The bank** (inspired by Endless Sky). Borrow against your credit rating. Payments are taken every 15 minutes of play.
  Paying on time raises your rating, and missing a payment adds interest.
- **Galaxy map views** (from Endless Sky): POWERS, TRADE (colour systems by one commodity's price, with prices on hover),
  SERVICES (shipyards and outfitters), STANDING and DANGER.
- **Passenger and rush jobs.** Passenger jobs need bunks. Rush deliveries pay much more but fail past their deadline, with a
  countdown in MISSIONS.
- **Faction story arcs.** Three missions for each of seven powers (the Concord, Spacers, Vashari, Korrund, Ylith, Sarn and
  Thalassi). Each is offered at the power's capital once your standing is high enough, and ends in a unique Epic officer
  and 10 specialist blueprints.
- **Farside expeditions.** Survey chains beyond the Sol Gateway: survey a system, board the derelict it finds, and bring
  its data core home. Each one decodes a fragment about the region.
- MISSIONS shows faction arcs, expeditions and rush timers, and the I panel shows your Syndicate standing, credit and story
  progress.

### 1.1 "Living Rift"
- **Rival captains.** Thirty named AI captains (including Madcow Soul and Six Flash) with careers of their own. They
  trade, hunt, mine, explore and raid, buy better ships, and fly through the systems you visit with gold name tags.
  - They remember you: compliments and help in a fight win friends, while taunts and stray shots make rivals.
  - Allies fight beside you and will fly with you. Nemeses send hired guns after you.
  - They appear on the leaderboards and in the news.
- **Hailing** (T, from Endless Sky):
  - bribe pirates, or tell them to run if you outgun them
  - ask traders for fuel or emergency repairs when stranded
  - buy landing clearance from planets that refuse you
  - talk to rival captains
- **Fleet orders** for escorts, wingmates and fighters: form up, attack my target, hold position, hold fire, collect loot.
- **Flight conveniences:** J flies a whole multi-jump route; hold E to face your target; Q brings you to a full stop.
- **Ship and captain panel** (I): ship stats, cargo with jettison (raiders often go for dumped cargo), combat rating, fleet
  orders, and every rival captain with their mood toward you.
- **Combat rating** from Harmless to Elite. Bounties pay more as you rise. Wanted contracts need Competent, and elite
  contracts appear for Dangerous captains.
- **Spaceport news and market flashes.** Headlines about rivals, shortages and gluts. A shortage or glut moves one world's
  price for twenty minutes, tagged in the trade screen.

### 1.0.3 "Quality of Life"
- **Autopilot.** Double-click any planet or station (or press L when you are far away) and your ship flies there, turns,
  brakes and lands. Pressing J near a planet flies you clear, then jumps. Any steering key hands control back.
  An AUTOPILOT badge shows while it flies.
- **Radio.** Stations now play in the game itself:
  - a click starts the music straight away
  - a Radio slider in the options mixer and in the radio panel; mute covers it too
  - an in-game ON AIR panel shows the station and the song playing
  - stations that only offer streams your browser can't play fall back to iHeart's own player
- **Jobs.**
  - Each job shows its destination and jump count.
  - Cargo jobs that won't fit your hold say so, and their ACCEPT button is greyed out.
  - Deliveries no longer go to empty derelict hulls.
- **Trade.** MAX fills your hold with what you can afford. SELL ALL CARGO empties it in one click.
- **Outfitter.**
  - Guns show damage and range.
  - Ammo says when you need its launcher.
  - BUY greys out (with the reason on hover) when you can't afford an item, lack outfit space or have no free mounts.
- **Missions tab.** Your current career step sits at the top, and MISSIONS is the tab you see first when you log in.
- **Fuel warning.** The NAV line turns amber when your plotted route is longer than your fuel.
- **Docked controls.**
  - L departs while landed.
  - The command bar (chat, options, keys, ?) stays usable while docked.
  - "Free space" on the landing footer is now labelled "Outfit space".
- **Login.** A failed login no longer leaves "Loading the galaxy..." stuck on the login screen.
- **Packaging.** The zip now unpacks into its own "Quantum Rift vX.X.X" folder.

### 1.0.2
- **No free Gnat Skiffs.** Storing your current ship in the drydock now leaves you with no active ship.
  - DEPART is greyed out, and the overview explains how to choose a ship (FLY THIS in the drydock, or the shipyard).
  - Outfitting, refits and renaming wait until you have a ship.
- **Personal Station.** "Station section" is now called your **Personal Station** everywhere.

### 1.0.1 "Fixes"
- **New planets.** Every planet and moon is now generated from its type and colour:
  - ocean and terran worlds with continents, ice caps, drifting clouds and city lights on the night side
  - deserts with dunes, cracked ice worlds, and lava worlds with glowing fissures
  - banded gas giants with storms, some with rings
  - toxic, crystal and cratered barren worlds
  Planets turn slowly, are lit from one side, and have atmosphere glow.
- **Respawn.** A destroyed ship is rebuilt at your own station hull, or at Quantum Station if you don't have one. It no
  longer turns up wherever you last landed, which could be another player's base.
- **Missions tab.** MISSIONS replaces the MAP tab in the sidebar. It lists each active job and the main story with what to
  do next, how many jumps away it is, and a PLOT COURSE button. Mission target systems have a gold marker on the galaxy
  map. M still opens the map.
- **Command bar.** A brushed steel bar along the bottom holds chat with channel buttons, MAP, KEYS (key bindings),
  options and **?** (a card of every control, also opened with ? or F1). It replaces the line of hints.
- **Station screen.** The landing and station frame now keeps its content inside on smaller screens, scrolling instead.
- **Drydock.** Storing the station's free Gnat Skiff again and again no longer fills your berths with Gnats to sell
  (replaced in 1.0.2 by having no active ship).
- **Cursor.** The neutral targeting cursor is larger.
- **Galaxy map zoom.** The map keeps its zoom when the window size changes.

### 1.0 "Launch"
- **The main story.** Somewhere in the Rift, someone has been waiting a very long time for a visitor.
  - Main-story missions are marked in gold. They arrive as pop-ups when you land in the right place.
  - They lead through a five-part chain with its own rewards, ending in something unique.
  - The Deep is now charted only by those who have earned it.
- **Career guide.** The old tutorial is now a 20-step career that walks you from your first trade through your station,
  crew, research, specialists, armadas and a Holdout, with a reward at each step. Steps that you have already done
  complete themselves.
- **Solo mode.** A separate launcher runs a private single-player server: no passwords, pause (P), save slots on the login
  screen, and export and import of captains.
- **Backups.** Every server keeps a rolling backup of all saves every 30 minutes.
- **Balance pass.** A new balance report (`test/balance.js`) checks every shipyard ladder, value for money and the time
  each milestone takes to afford.
  - Specialists now cost 30% fewer credits, since blueprints already gate them.
- **Accessibility and options.**
  - Remap every flight and command key; the arrow keys always steer.
  - A colour-blind palette: blue friends, orange hostiles, with hostiles drawn as diamonds on the radar.
  - Interface size from 80% to 140%.
  - Master and effects volume, and a mute switch.
- **Loading bar.** The login screen shows a loading bar while ship art loads.
- **Story fix.** A story step that is waiting where you logged off now pops up when you log back in.

### 0.9 "Hostile Space"
- **Hostile levels and the "can I win?" scan.** Every ship has a level based on its effective strength. The target box
  shows the level and your odds in a straight fight, coloured green, amber or red, next to the class-triangle hint.
- **Loot chests.** Each hostile type drops its own chest: Hollow Caches, Umbral Reliquaries, Swarm Nodules and Eclipse
  Shard Caches.
  - Chests hold credits, a crate graded by the enemy's level, specialist blueprints (Vanguard, Nightglass or
    Swarmbreaker), the specialist's resource if you fly her, and sometimes a directive.
  - Bosses and armadas always drop one.
- **Solo armadas.** Hollow, Umbral and Eclipse **directives** each summon a flagship and its escorts, scaled to your
  ship.
  - You have ten minutes to destroy it, for credits, crates and specialist blueprints.
  - Directives come from chests, weekly goal claims, Holdouts and faction stores (Friendly and Honored standing).
  - Summon them from the OPS tab while in space. They are not allowed in the Concord core.
- **Station Holdout.** From your station's Defense section, launch into ten escalating waves.
  - You fight alongside defense platforms: one, plus one per turret level.
  - Rewards grow with every wave you clear: credits, crates, Bulwark blueprints (Raider Insignia in a Bulwark), and an
    Umbral Directive for beating all ten.
  - You can start one every 2 hours.
- **A weekly rhythm.** Events now follow the day of the week (UTC):
  - Mon: Prospector's Rush. Tue: Hangar Days. Wed: Bounty Week. Thu: Umbral Eclipse. Fri: Armada Night.
    Sat: Clean Sweep. Sun: Swarm Sunday.
  - The first weekend of each month is a Gold Vein weekend.
  - The OPS tab shows the coming week.
- **The Umbral Eclipse.** Violet-lit Umbral cells roam dangerous Frontier, Umbral and Deep space. On Thursdays they
  appear across the galaxy.

### 0.8 "Specialists"
- **The Sol Gateway.**
  - **Sol** is a new system near the centre of the map, with **Earth** (full services and its own landing picture)
    and **Luna Station**.
  - Sol's wormhole, the animated vortex from EV Quantum 3.6, leads to **Farside**: ten new systems off the
    north-west edge of the galaxy, reachable only through the Gateway.
  - Farside is flown by common hulls only, with no racial ships.
  - Crossing is free: just fly into the wormhole. Routes plot straight through it, and J tells you when the next leg
    is the wormhole.
- **Ship roles and the class triangle.** Every hull is now an Interceptor, Explorer, Battleship, Survey or Carrier.
  - Interceptors beat Battleships, Battleships beat Explorers, and Explorers beat Interceptors: +15% damage dealt
    when you counter the target, 10% less when it counters you.
  - Survey ships mine 50% better but fight 20% worse.
  - Roles show in the shipyard, the codex, your overview, and the target box ("YOU COUNTER IT" or "IT COUNTERS YOU").
- **Ten specialty ships,** newly designed and rendered:
  - Lodestar (mining)
  - Swarmbreaker (Feral Swarm)
  - Nightglass (the Umbral)
  - Corsair (boarding)
  - Herald (escorts)
  - Tidecaller (salvage)
  - Pathfinder (two-system jumps and anomalies)
  - Bulwark (station defense)
  - Wraith (smuggling, stealth)
  - Vanguard (bounties)
- **How a specialist works:**
  - Each job drops that specialist's **blueprints**, whatever you fly. Forty blueprints let you build her at your
    station (Ops 3).
  - Flying her earns her unique resource, which the refinery turns into **parts**.
  - Parts upgrade five components (weapons, shields, hull, drive and specialty).
  - A full set unlocks a timed **tier-up** in the drydock, up to Tier 5. She cannot fly until it is done.
- **The Feral Swarm.** Wild Vashari drone clusters now roam Vashari and Frontier space and attack everyone.
- **Station rework.** Your station screen now has its own buttons: Ops, Refinery, Research Lab, Academy, Hangar,
  Drydock, Defense and Specialists. The Hangar tab is folded in.
- **Faction stores are their own menu.** Open them with the button on any landing screen or from the OPS tab, and
  browse every power's quartermaster. Purchases are delivered wherever you are landed.
- **A new title screen,** in the game's metal style.
- **Removed:**
  - The How to Play guide. A new one will come when the game is finished.
  - Its options panel moves to the gear button (or the O key).
- **Version and port warnings.** The login screen shows the version number, and the server explains clearly if
  another copy is already using the port.

### 0.7 "Frontier Life"
- **Planetary colonies.** Settle unclaimed planets in Frontier space and the Deep. You can run two colonies, or three
  at Ops 5.
  - Colony levels 1 to 5 bring more building slots and higher production.
  - Production buildings: farms, deep mines, gas extractors, crystal works, habitat domes (credits) and orbital
    foundries. Each stockpiles a day's output for you to collect.
  - Buff buildings give permanent bonuses on every ship you fly, with a cap per stat: Shield Array, Hull Yards,
    Gunnery Range and Nav Beacon.
  - Colonies are labelled in space.
- **Station defense.** Raiders hit Personal Stations from Ops 2, every 8 hours.
  - If you are in the station's system, the raid is a live wave that you can fight off for double salvage.
  - Otherwise your defense rating decides the raid. The rating comes from Ops level, the Defense Grid and
    upgradeable turrets (levels 1-5).
  - A lost raid loots the refinery and part of your low-grade crates.
- **Ship mastery.** Each hull gains experience from kills, jumps, jobs and mining. Tiers 2 to 5 add shields,
  armor, damage, speed and turn. Tier 5 also gives the ship a gold trim that every captain can see.
- **The Crucible (arena).** Instanced, rated 1v1, 2v2 and 4v4 matches, queued from any landing.
  - Teams are drafted by rating. You fly your own ship without escorts.
  - There is no insurance fee and repairs are free.
  - The last team flying wins; if time runs out, the team with the most hull and shields left wins.
  - Results adjust an Elo rating and pay credits.
- **The Exchange.** Player buy and sell orders for every crate grade and commodity, shared across all markets.
  - Orders are escrowed and filled at the resting price, with a 2% seller fee.
  - Bought commodities wait in exchange storage. You can also send credits to any captain.
- **Leaderboards and profiles.** Seven boards on the community screen: credits earned, kills, mining, arena
  rating, station Ops, colonies and mastery. Click a name, or look one up, to see that captain's ship, station,
  colonies, record, arena rating and best mastery.
- **Notifications.** Optional desktop notifications for shuttles coming home, raids, invasions and exchange fills
  while the game is in the background.
- **Gamepad and touch controls.**

### 0.6 "Fleets and Fronts"
- **Fleets.** Found a fleet (50,000 credits) with a 2-4 letter tag that shows on members' names in space, or join
  one: open fleets take anyone, closed ones take requests.
  - Fleets have a shared bank, their own chat (`/f`), and up to 30 members.
  - Fleetmates never fight each other.
  - Fleetmates in the same system get a 25% share of each other's bounties, paid on top of the killer's.
- **Territory and Dreadnoughts.** A fleet leader can anchor a Dreadnought in an unclaimed Frontier system, paid
  from the fleet bank. Four models are available, from 6M to 11M credits. A fleet can hold up to three systems.
  - In a held system, members get +8% damage and shields.
  - Outsiders' trades there pay 5% into the holding fleet's bank.
  - Rivals can only damage a Dreadnought during the daily front window (19:00-21:00 UTC by default). Destroying it
    frees the system for the victors.
  - Dreadnoughts defend themselves, never attack their own fleet, and repair slowly when left alone.
- **Invasions.** Every two hours an Umbral Leviathan or a Hollow Dreadfort, with escorts, appears in a dangerous
  system for 45 minutes. Everyone who damages it shares a 1.5M to 2.5M credit pool by damage share, plus crates
  and Rift scrip. Invasions are announced in chat and pulse on the map.
- **Galactic anomalies.** Nine systems carry a modifier that rotates every 6 hours: ion storm, dense nebula (radar
  range halved), solar maximum, gravity shear (double jump fuel), rich veins, and quantum echo. They show on the map,
  and you get a notice when you arrive.
- **Server events.** A calendar rotates every two days through Festival Market, Hollow Surge, Prospector's Rush,
  Academy Week and Hangar Days, each with game-wide modifiers.
- **Daily and weekly goals.** Three of each, covering kills, jumps, trading, mining, shuttle runs, jobs, charting
  and boarding. Each pays credits and Rift scrip, with a bonus crate when you clear the set. They live in the new
  OPS companion tab, along with the event, the invasion, local anomalies, your fleet and the event calendar.
- **Faction stores.** Every market world in a power's space has a quartermaster. Jobs finished in that space and
  commissions earn the power's tokens, and Rift scrip covers any shortfall. Store items unlock with standing:
  crates, Rare and Epic officer contracts, bridge training manuals, and free-passage writs.
- **New jobs:**
  - Convoy escort: keep a freighter alive to its landing while Hollow raiders hunt it.
  - Smuggling: big pay, but patrols in lawful space can scan you, fine you and seize the cargo.
  - Rescue: board a stranded ship and choose Rescue.
  - Survey: fly over three marked points, shown in space and on radar.
  - Wanted kingpins: a raider capital with two bodyguards.
  - Commissions: a three-step job chain for each power, ending in +12 standing and 10 tokens.
- **Fix:** the Umbral now attack on sight, as they always should have. Destroying them pays a bounty instead of
  costing standing.
- The danger meter on the map is drawn rather than typed, so it shows correctly on every system font.

### 0.5 "Hangar Deck"
- **Shuttles.** The hangar opens at Ops 2, with one bay per Ops level from 2 to 5 and two more from research.
  - Five types: Courier, Survey, Salvage Tender, Envoy Yacht and Prospector Hauler.
  - The hangar job board posts six jobs every three hours: deliveries, surveys, salvage, diplomatic visits and
    prospecting, to systems 1 to 7 jumps away.
  - Each job takes 15 minutes to 8 hours of real time and keeps running while you are offline.
  - The odds depend on the job, the system's danger, matching the right shuttle to the job, a crew officer
    (scouts are best) and research.
  - Rewards: credits, material crates, standing, newly charted systems and rare finds.
  - Shuttles can come back damaged (repair at your station) or be lost in dangerous space.
  - Shuttles visibly launch from and return to your Personal Station.
- **Officers.** Every inhabited world with a job board has a bar where three officers of the local race look for
  a berth each hour.
  - Six roles: Captain, Engineer, Gunner, Navigator, Quartermaster and Scout.
  - Four rarities, from Common to Epic, and levels 1 to 10.
  - Bridge slots: a captain (x1.25) and two bridge officers.
  - Two officers of the same race on the bridge unlock a race synergy bonus.
  - Officers gain experience from kills, jumps, jobs and shuttle runs.
  - Their bonuses are shields, armor, damage, shield recharge, speed, turn, acceleration, fuel, cargo, salvage pay,
    mining yield and shuttle odds.
- **Research trees.** Four trees (Combat, Station, Galaxy and Shuttles) with 28 projects.
  - Queueing a project queues its unfinished prerequisites first. Up to six projects can be queued.
  - The queue starts the next project on its own when the lab is free and you can pay.
  - New effects include deeper silos, faster refining, better crate grades, drydock berths, fuel scoops,
    compressed holds, mining and salvage bonuses, more hangar bays, and shuttle speed, armor, yield and crew
    training.
- **Refining.** Three crates refine into one crate of the next grade, with "Refine all".
- **Drydock.** There are berths from Ops 3, plus two more from research. Stored ships keep their escorts and
  bridge crew, so each berth works as a fleet preset. You can swap ships or sell stored ones.
- **Boarding.** Press B next to a disabled ship, then choose one:
  - Plunder: take credits, cargo and maybe a crate.
  - Capture: needs an officer on the bridge. The ship goes to your drydock, or is sold if no berth is free.
  - Rescue (lawful ships) or arrest (pirates): earns standing or a Concord reward.
  Lawful factions remember plunder and capture.

### 0.4 "The Wide Rift"
- The galaxy grows from 30 to 200 systems. It is generated from a fixed seed around the 30 hand-made systems,
  so it is the same for everyone and survives restarts.
  - Each power holds a territory: 14 systems for most powers, 13 Lamplighter, 12 Hollow, 9 Umbral, and 6 for the
    Que'vari, who keep to a small domain.
  - About 48 Frontier systems are unclaimed and lawless, and 14 systems in the Deep are very dangerous.
  - Each race has its own system names, planet colours, descriptions and trade goods. Danger rises toward the rim.
- New galaxy map: drag to pan, wheel to zoom, HERE and WHOLE GALAXY buttons, and search by system or world.
  Unvisited systems show as hollow rings until you chart them by visiting.
- Multi-jump routes: click any system and the shortest safe route is plotted. J jumps along it, one leg at a time.
- Sleeping systems: a system is only simulated while someone is in it. It wakes with fresh traffic on arrival.
- Frontier traffic flies real flags (Spacers, Hollow and Umbral raiders), and region traffic matches the territory.
- Mining: asteroid fields, gas clouds and crystal formations. Buy a Mining Laser (gun) or Heavy Mining Laser
  (turret) at an outfitter, then break rocks to scoop Raw Ore, Gas or Crystal Shards. Rocks regrow. Mining
  weapons are six times as effective on rock.
- Ore processing at your Personal Station: 12 t of ore makes one material crate (Alloy, Isotope or Crystal). The
  crate grade improves with your Ops level.
- 27 claimable station hulls, up from 17: 10 new ones sit in Frontier space.

### 0.3 "Clean Fire"
- Fixed black lasers: 30 projectile weapons were exported with colour #000000, which overrode the palette.
- Every weapon class now looks different: bolts, railgun streaks, plasma pulses, missiles and rockets with smoke
  trails, glowing torpedoes, the Singularity Torpedo, blinking mines, flak, Ylith prism shards, venom and magma.
- Mouse control: click ships or radar blips to target, click planets for nav, double-click to land, wheel zoom,
  optional mouse aim. L now lands on the nav point you clicked.
- A custom brushed-steel cursor set (target, friendly, neutral, land, plot course, resize, aim, busy).
- Combat feedback: fireball explosions with smoke and debris, shield shimmer where hits land, floating damage
  numbers for your hits and hits on you, blast rings, light screen shake.
- How to Play: the seven intro cards as an in-game guide (first login, the ? button or H) with options.
- First-flight tutorial: five goals with rewards (target, jump and land, trade, clear a raider, find a hull).
- Escorts keep separate formation slots; disabled wrecks are towed away after 75 s.
- Security: failed-login throttle (6 misses per name or address per 10 minutes) and a size cap on fragmented
  WebSocket messages.

## Ideas for the next milestones

The 0.3-0.7 roadmap is complete. The plan beyond it is in the EV QUANTUM project (`claude/quantum-rift-roadmap-1.3.md`).

Next up: to be decided. The deferred multiplayer features and the 1.3 "Ascension" endgame are on the roadmap.
