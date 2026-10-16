# Quantum Rift

**A space trading and combat game in your browser.**

Fly a ship through a living galaxy of more than 200 star systems. Trade between worlds, take jobs and bounties, mine asteroids, fight pirates, build up a Personal Station, and lead a fleet of crewed wingmates. Play alone, or host a server where friends team up in an Armada.

## v2.8 — Hail to the Code

Contextual ship conversations, incoming NPC calls and short player hails bring the traffic lanes to life. System-only chat now appears above the sender's active ship as well as in the chat log. Combat assist can fly and fire for your fleet; opted-in Follow Leader members can delegate combat without taking control away from independent Armada captains.

[Release summary](docs/RELEASE-v2.8.md) · [Changelog](CHANGELOG.md) · [Communications guide](docs/HAILING.md)

![Incoming communications inbox in the running game](docs/screenshots/hail-inbox.png)
![A short player-to-player hail in the running game](docs/screenshots/hail-composer.png)
![System chat speech bubble above the active ship](docs/screenshots/system-chat.png)
![Combat assist controls in flight](docs/screenshots/combat-assist.png)

These four captures show the v2.8 development build with disposable captains. Existing flight, fleet, scenery and arena screenshots below remain as a broader tour.

![A Caravel Trader flying past Concordia and its moon](docs/screenshots/flight.jpg)

---

## Features

**A big, living galaxy**

- 211 star systems across 14 powers: the Quantum Concord, free traders, pirates, five alien races and stranger things at the edges.
- Pre-rendered planets, stations and landing pictures with oceans that catch the sun, city lights on the night side, ringed giants, and a rendered scene for every world you land on.
- Every system has its own scenery, generated from the system itself: its star, distant galaxies, nebulae, ion storms, ancient wrecks, abandoned stations, crystal formations, comets and drifting debris.
- Moons, asteroid fields, gas clouds and crystal fields to mine.
- Busy space lanes: traders, convoys, patrols, raiders and thirty named rival captains with careers of their own.
- Systems pass through famines, plagues, booms, border wars, pirate scourges, festivals and mining rushes that move prices and post their own jobs. Markets remember what you trade.

**Flight and combat**

- Newtonian flight with guns, turrets, beams, homing missiles, point defense and drone carriers.
- Your guns hit anything you aim at. Shoot a friendly ship and it turns on you, and its faction remembers.
- Optional **combat assist** handles steering and primary fire, with manual takeover and Hold Fire taking priority. Fleet odds include participating wingmates; Follow Leader coordination includes participating local Armada fleets, not just their leads.
- NPC captains have personalities: some run when beaten, some call friends for help, and capital ships fire broadsides.
- Autopilot landing and multi-jump routes, a hyperspace jump with its own effect and sound, and hold-right-click to look ahead.
- Roughly 100 ships to fly, from a 15,000-credit Mite Drone to the Constitution, plus ten one-of-a-kind specialty ships. Every ship is rendered from a 3D model, and smaller ships bank into their turns.

**A career to build**

- Trade on living markets with shortages and gluts. Take cargo runs, bounties, patrols, passengers, rush deliveries, smuggling and Syndicate contracts.
- **Questlines:** a contact in every spaceport bar who remembers you and has multi-step stories to offer, plus six handcrafted side stories.
- Claim a derelict station hull and build it into your **Personal Station**: refinery, research lab, station shipyard, Station Holdouts, and a warp core to relocate it to another hull.
- **Docks A to D:** each dock holds a lead ship and up to two wingmate ships, chosen from your hangar. You fly the active dock's lead, and its wingmates fly in formation and follow your orders.
- Hire officers of every race, promote them, and assign them to your bridge or as captain and crew of your wingmates.
- Combat ratings, faction story arcs, a Syndicate career, colonies and leaderboards.
- A main story waiting somewhere in the Rift. We won't spoil it.

**Better together (online games)**

- **Captain Friends:** see who's online and where, and send private messages that wait for offline captains.
- **The Armada:** team up with up to four other captains and all your wingmates. Allies show in green and can't hurt each other. You get a private chat, small buffs, shared bounties, a rescue if your ship goes down, and follow-the-leader jumps.
- **Armada contracts and co-op Holdouts:** group kingpins with refitted squadrons, and Station Holdouts your friends can fly in to defend.
- **Trading:** swap credits, goods, crates, blueprints and parts with friends, each of you docked at your own station.
- **PvP only when you agree to it:** no ganking in the open galaxy. Duels and Armada Duels end at disabled, and the Crucible arena has rated 1v1, 2v2 and 4v4 matches.

**Communications**

- Contextual outgoing hails reflect ship identity, activity, location and damage, with repetition avoidance during a system visit.
- Ordinary traffic and named captains can initiate calls. An amber perimeter badge opens the inbox only when you choose; arriving hails never interrupt flight.
- Fuel assistance, hardship requests, friendly greetings and security warnings, plus local-port escort, hazard intelligence and distress rendezvous encounters. Transfers and rewards require acceptance and server checks.
- Hail another player in the same system with up to 100 characters. Existing privacy and blocking rules apply; trading stays at player stations.
- System-only chat also appears briefly above each sender's active ship. Other chat channels remain in the log only.

**Made to be comfortable**

- Solo mode with pause, save slots and save files, or online play with accounts. Solo games hide the multiplayer screens.
- Newcomer protection: pirates in inner space leave new captains alone until their station reaches Ops 3.
- An in-game radio with thousands of live stations, and a fully synthesized soundscape with a quick volume control.
- Key remapping, a colour-blind palette, interface scaling, gamepad and touch controls.
- No installs beyond Node.js: no npm packages, no build step.

|                                                                              |                                                                        |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| ![Six different systems](docs/screenshots/systems.jpg)                       | ![The DOCKS screen at a Personal Station](docs/screenshots/docks.jpg)  |
| _Every system looks different_                                               | _Docks A to D, with crewed wingmates_                                  |
| ![The galaxy map](docs/screenshots/galaxy-map.jpg)                           | ![A hyperspace jump, start to finish](docs/screenshots/hyperspace.jpg) |
| _The galaxy map, with trade, standing and danger views_                      | _A hyperspace jump_                                                    |
| ![Rendered landing pictures](docs/screenshots/landing-pictures.jpg)          | ![Rendered planets](docs/screenshots/planets.jpg)                      |
| _A landing picture for every world_                                          | _Pre-rendered planets_                                                 |
| ![Two captains in an Armada, with the ALLIES tab](docs/screenshots/coop.jpg) | ![A duel in the Crucible arena](docs/screenshots/crucible.jpg)         |
| _An Armada: allies and their wingmates show in green_                        | _The Crucible arena_                                                   |

![Ships re-rendered in 2.6, and a Cutlass rolling into its turns](docs/screenshots/ships.png)

---

## Play it

You need **[Node.js](https://nodejs.org) 18 or newer**. Nothing else to install.

**Windows:** double-click **`Start Solo Game.bat`** to play alone, or **`Start Quantum Rift.bat`** to host a game others can join. If Node isn't installed yet, the launcher opens the download page: install the LTS version, then run the launcher again. A console window opens (that's the server, leave it open) and the game opens in your browser.

**macOS / Linux:** run `start-solo.command` or `start.command`.

**By hand:**

```
node server/main.js           # online game on http://localhost:8080
SOLO=1 node server/main.js    # private single-player game
```

On the same network, friends can join at `http://<your-computer's-address>:8080`.

**Solo mode** only listens on your own computer, needs no passwords, and lets you pause with **P**. The login screen lists your captains, with **EXPORT** to download a captain as a file and **LOAD A SAVE FILE** to bring one back. Every server keeps a rolling backup of all saves every 30 minutes.

---

## Screenshots and release maintenance

README screenshots live in `docs/screenshots/`; keep this gallery current when the interface changes. Capture actual gameplay with disposable saves, inspect the resulting images, and keep captions explicit about what is shown. The new communications captures use the retained matching art binaries because the upstream Git LFS server could not supply its existing objects; no replacement art is included in this update.

For each release, update `CHANGELOG.md`, the package versions and a release summary together. Tag the final tested commit on upstream `main`, not an earlier PR head. [v2.8 release notes and publication instructions](docs/RELEASE-v2.8.md) record the intended release scope.

## Controls

| Key               | Action                                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| W / ↑             | thrust                                                                                                                                  |
| A, D / ←, →       | turn                                                                                                                                    |
| S / ↓             | turn to reverse                                                                                                                         |
| Shift             | afterburner                                                                                                                             |
| Space             | fire primary weapons                                                                                                                    |
| F                 | fire secondary weapons; **tap** to launch or recall all drones                                                                          |
| Tab / Shift+Tab   | cycle targets                                                                                                                           |
| R                 | nearest hostile                                                                                                                         |
| L                 | land (the autopilot flies you in); also departs when docked                                                                             |
| M                 | galaxy map: click a system to plot a course                                                                                             |
| J                 | jump along the plotted course, all the way to the destination                                                                           |
| T                 | hail your target or a planet: bribe, beg fuel, talk to rival captains                                                                   |
| U                 | incoming hail inbox (remappable)                                                                                                        |
| B                 | board a disabled ship: plunder, capture or rescue                                                                                       |
| I                 | ship and captain panel                                                                                                                  |
| E (hold)          | face your target                                                                                                                        |
| Q                 | full stop                                                                                                                               |
| K / G / H / Y / U | wingmate orders: attack my target, form up, hold position, hold fire, collect loot                                                      |
| Z / X             | zoom                                                                                                                                    |
| N                 | mute                                                                                                                                    |
| P                 | pause (solo)                                                                                                                            |
| Enter             | chat (`/s` system, `/a` Armada, `/w name message` private, `/r` reply)                                                                  |
| ? or F1           | the controls card                                                                                                                       |
| Mouse             | click to target, click a planet to set your nav point, double-click to land; **hold right-click and move** to look ahead; wheel to zoom |

Every key can be remapped in Options (the gear button, or **O**). A standard **gamepad** works out of the box, and touch screens get an on-screen stick and buttons.

---

## Host it online

Any host that runs a long-lived Node process with WebSockets will do:

- **Render.com:** a Web Service with start command `node server/main.js`, and a persistent disk at `/data` with `DATA_DIR=/data`. HTTPS and `wss://` work automatically.
- **Fly.io:** `fly launch` with the same start command and a volume for `DATA_DIR`.
- **Any Linux VPS:** run it with `pm2` or systemd, and put Caddy in front for HTTPS (`yourdomain.com { reverse_proxy localhost:8080 }`).

One small CPU handles dozens of players; only systems with players in them run at full rate.

| Setting      | What it does                                                    |
| ------------ | --------------------------------------------------------------- |
| `PORT`       | port to listen on (default 8080)                                |
| `DATA_DIR`   | where saves go (default `./data`)                               |
| `SOLO=1`     | single-player mode: local only, no passwords, pause, save slots |
| `SEEDS_FILE` | a file of ready-made captains to create on start-up             |

---

## How it's built

- **Server:** plain Node.js ES modules with no dependencies. It has its own small WebSocket implementation and JSON save files written atomically. Each star system is simulated at 30 Hz, and systems nobody is in go to sleep.
- **Client:** HTML canvas and vanilla JavaScript. Your own ship is predicted locally, so it responds instantly. Planets are rendered procedurally in the browser.
- **Art and audio:** ship sprites come from a small Python 3D pipeline. Planets, stations, landing pictures, effects, asteroids, loot, outfit pictures and the login backdrop are rendered by the tools in `tools/` (`rift_planets.py`, `rift_stations.py`, `rift_landscapes.py` and others), and system scenery by `tools/rift_decor*.py`. All interface sounds, ambience and the login theme are synthesized from scratch (`tools/rift_audio*.py`).
- **Tests:** in-process suites for every release, a message fuzzer, a balance report, and a Playwright UI crawler that clicks every screen.

**[DEVELOPMENT.md](DEVELOPMENT.md)** is the guide for anyone, or any AI assistant, picking up the code: the architecture, how to add a feature, how to test it, and the full list of test suites. **[CHANGELOG.md](CHANGELOG.md)** has every release from 0.3 to today.

---

## Credits

- _Endless Sky_ and _Star Trek Fleet Command_, for ideas: hailing, fleet orders and map views from the first; specialty ships and docks from the second.
- The in-game radio uses the public iHeartRadio station directory.
