# Quantum Rift

![Quantum Rift login page with the captain sign-in panel](docs/screenshots/login-31.png)

**Quantum Rift is currently in beta and under ongoing development. All features are subject to change.**

## [Download Quantum Rift](https://github.com/KnightMagnus/quantum-rift/releases/latest/download/Quantum-Rift-latest.zip)

**A space trading and combat game in your browser.**

Fly a ship through a living galaxy of more than 200 star systems. Trade between worlds, take jobs and bounties, mine asteroids, fight pirates, build up a Personal Station, and lead a fleet of crewed wingmates. Play alone, or host a server where friends team up in an Armada.

## Features

### Explore the galaxy

- Travel between distinctive star systems, rendered planets and stations, from busy trade routes to the remote Eventide frontier.
- Meet traders, convoys, patrols, pirates and rival captains with their own personalities and careers.
- Discover faction stories, spaceport questlines and a main story hidden in the Rift.
- Hail passing ships for conversation, assistance and encounters. Incoming calls wait until you choose to answer.

### Trade, mine and take jobs

- Trade on markets shaped by shortages, local events and what captains buy and sell.
- Earn your way through deliveries, passenger runs, bounties, patrols, rescues and smuggling.
- Mine asteroid, gas and crystal fields; survey deposits, refine your haul and tow large finds home with specialized equipment.
- Follow faction and Syndicate careers, develop colonies, earn combat ratings and climb the leaderboards.

### Fly and fight

- Choose from a wide range of ships, including specialty vessels, with guns, beams, missiles, point defense and drones.
- Master momentum-based flight or use optional combat assist. Autopilot handles landing and plotted jump routes.
- Face enemies that retreat, call for help or bring capital-ship firepower. Friendly fire has consequences.

### Build a station and crew

- Turn a derelict hull into your own **Personal Station**, with refining, research, shipbuilding and defenses. Upgrade it or relocate to another hull.
- Store ships in your hangar and organize docks around a lead ship and crewed wingmates that fly in formation and follow orders.
- Hire and promote officers for your bridge and fleet, then defend your station in Holdout battles.

### Play with friends

- Form an **Armada** to travel together, share bounties and take on co-op contracts and station defenses.
- Keep in touch through friends lists, private messages, local chat and player hails, with privacy and blocking controls.
- Trade credits, cargo and crafting supplies between captains.
- Choose your PvP: consensual duels or rated team matches in the **Crucible** arena, rather than open-world player hunting.

### Play your way

- Solo mode includes pause, save slots and save-file import and export. A newcomer truce limits ambient hostility while you establish your station; missions and deliberate aggression can still lead to combat.
- Remap controls, adjust interface scale, use a colour-blind palette, or play with a gamepad or touch controls.
- Tune into live radio stations alongside the game's synthesized soundscape.
- Run locally in your browser with Node.js—no package installation or build step required.

## 3.1 cockpit and artwork

Dark brushed-steel controls, larger Pixelify Sans lettering and an integrated
right-hand Tray keep ship functions close without covering the flight view.
Landing artwork and radar sit in recessed digital viewscreens. Layered engine
exhaust follows the original nozzle artwork, with longer afterburner plumes.
Unsurveyed motherlodes have neutral shaded, pitted surfaces without exposing their
resources; surveying still reveals the original material artwork. Menu hover
sounds are quieter and rate-limited; an original synthesized French-horn-like and bowed-string login theme and
crossfaded ambience retain separate volume and mute controls.

![Actual 3.1 flight cockpit](docs/screenshots/cockpit-31.png)

_Compact ship controls with the Tray collapsed._

![Integrated right-hand Tray](docs/screenshots/tray-31.png)

_Embedded, resizable status and radar Tray._

![Actual 3.1 landing viewscreen](docs/screenshots/landing-31.png)

_Original landing artwork in the new steel console._

Screenshots are captured from the implemented game using isolated test captains.

---

## Play it

**[3.0.0 — Mining](https://github.com/KnightMagnus/quantum-rift/releases/tag/v3.0.0):** survey and cut graded seams, refine your haul, build a Star Dredge and tow finite motherlodes. Use the complete release download above; GitHub source archives may contain Git LFS pointers instead of artwork.

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
| V (if free)       | survey nearby mining seams; otherwise assign Survey Pulse in Options                                                                    |
| Unbound initially | Dredge sweep, plasma harvest, mobile smelter and Attach / Detach Motherlode; use their cockpit buttons or assign keys                   |
| ? or F1           | the controls card                                                                                                                       |
| Mouse             | click to target, click a planet to set your nav point, double-click to land; **hold right-click and move** to look ahead; wheel to zoom |

Every key can be remapped in Options (the gear button, or **O**). A standard **gamepad** works out of the box, and touch screens get an on-screen stick and buttons.

---

## Mining: from field to refinery

### Your first clean cut

1. Fit a mining tool and fly to a rock, gas or crystal field. Use the **SURVEY** cockpit button to reveal nearby seams. Survey uses **V** only if that key was free; otherwise assign **Survey Pulse** in Options. The button shows your actual binding and cooldown.
2. Aim your mining tool using the usual weapon controls. Watch **ROCK HEAT / CUT**—or the gas **VENT / PRESSURE** meter—and keep contact on the seam. Larger rocks take several stages.
3. When the meter says **READY**, release the mining trigger in the **60–80** heat band for a clean cut. A clean cut improves grades, not the number of times one rock can pay. Early release keeps your work; overheating makes the remaining yield worse. Changing targets or reconnecting does not reset a rock.
4. Collect the drifting material. A partly full hold takes only what fits and leaves the rest. Raw cargo now has **common, rich and pure** lots; these are separate from field richness and construction-crate quality. Trade and cargo controls let you select exact lots instead of accidentally spending your best material.

Ordinary mining still works without a survey or perfect timing. Existing cargo loads remain usable as common-grade lots.

### Refine or haul it home

At a suitable landed port, open **REFINERY**. Choose a recipe, exact input grade, amount and instant/stored service, then **GET BINDING QUOTE**. Read the quoted inputs, output, fee and time before confirming payment.

- Ore makes **Alloy Ingots**, gas makes **Fuel Cells**, and shards make **Cut Crystal**. Standard recipes compress three raw tonnes into at most one processed tonne before the port's recovery rate.
- **Composite Plating** uses pure ore, gas and shards together. Plasma has its own Quantum Fuel and Exotic Matter recipes. These are trade goods, not the station's construction crates.
- **Instant** service handles up to 30 input tonnes. **Stored** service handles up to 300, has a 30-second cancellation queue and then takes 5–30 minutes. Its base service charge is lower, though the quote's market-spread floor can limit the discount.
- Stored jobs mature while you are away. Track jobs and exact-grade sourcing orders in **MISSIONS**. Collect only the whole tonnes your hold can carry; fractional output remains stored. Owner-only collection stays available near the original port even if landing/trading access changes.
- Fuel Cells can be quoted and consumed for ship fuel. Confirmation uses real cargo and needs room for the full quoted fuel gain; fuel cannot be converted back into cells.

The new home trade-good refinery offers 100% recovery with its own fees. Existing construction-crate processing remains **12 raw tonnes plus 1,500 credits per crate**; station production keeps its separate rules.

### The Star Dredge

The Dredge is a 400-tonne industrial Survey barge with a 2.4M-credit base build cost. Earn its blueprints through useful large-rock mining in any hull, then use the normal 40-blueprint, Station Tier 3 and construction-material build requirements. **You do not need plasma to build the stock ship.**

Its cockpit has separate **SWEEP**, **HARVEST** and **SMELTER** buttons. These actions start unbound; assign them in Options if you want keys. **F keeps its existing secondary-weapon/fitted-fighter-bay function**; it is not a Dredge mode key.

- **Sweep:** move forward to work minor rocks and collect common bulk material, assisted by two noncombat industrial collectors. It cannot swallow intact large rocks or replace precision clean cuts.
- **Mobile smelter:** select the recipe and input grade, press **SET INPUT**, then enable smelting. It works at 6 input tonnes/minute with 70% of the standard recipe's output recovery. Fractions are retained; it does no offline work. Partial work must finish before changing an input still in your hold. If that old input was removed, changing recipes explicitly discards only its partial work, not completed fractional output.
- **Heat:** ship heat is separate from rock heat. The cockpit labels sweep, smelter and corona contributions. **ALL OFF stops the machinery, not the sun's heat.** If the display says **CORONA HEATING — EXIT BAND**, leave the marked band.

### First plasma: use the marked collector, not a background sun

Meridian and Halcyon have signposted shallow collectors with an entry marker and **EXIT EAST →** instruction. Approach manually with sweep/smelter off and heat at zero, then enable **HARVEST**. At that stock entry, 15 productive seconds produce the first 5 tonnes of plasma, leaving the tested 10-second outward escape margin. This is an entry procedure, not a promise that any position deep in a band is safe.

Leave east promptly. Passive corona heat continues even after harvesting is switched off: thermal cutoff comes first, then shield drain and finally critical hull damage. Automatic navigation refuses collector-crossing routes and cancels harvesting intent. Use manual flight for deliberate entry and exit. Plasma is real cargo and supplies the Dredge's normal specialist-part upgrades; spending it on parts consumes it.

### Mine together deliberately

The **OPT IN GROUP MINING** cockpit control is separate consent for the current flight. Armada membership alone does not opt you into mining hazards or pressure encounters; landing and a new departure require fresh consent. Watch noise warnings and striped volatile areas. Ordinary newcomer protection and the existing Lodestar's precision/protected-cargo identity remain in place.

### Tow a finite motherlode

Fit a **Tow Rig** at an outfitter: 45,000 credits, 4 outfit tonnes, maximum 1, on a nonfighter hull with at least 60t cargo. The stock Star Dredge already has towing capability. These loads are separate finite sources, not a second payout from an ordinary rock.

1. **SURVEY** a motherlode to reveal its 24t raw load and accepted same-system delivery ports. Select it on the canvas or in the **MOTHERLODE** list. Slow down and approach within 180 units, then press **ATTACH**. **Attach / Detach Motherlode** starts unbound and can be assigned in Options; F remains unchanged.
2. Fly manually. Actual tow speed is hard-capped at **60 for the Star Dredge, 30 for every other eligible hull**, including afterburner or upgraded drives. The patterned tether and cockpit show ownership/status. You cannot jump, use a Gateway or land while attached. Deliver or **DETACH** first; corona harvesting also stops while towing.
3. Bring both tug and load to an accepted port, settle to speed 10 or less, and leave **24t free hold space**, including room taken by missions and industrial buffers. Select the port and press **DELIVER ONCE**. Its exact raw grade lots enter your cargo once; there is no extra credit, fragment or automatic mining-order payout. A full hold or refused port leaves the load attached so you can make space or detach.
4. To hand over the load, enter a nearby eligible captain's name and press **OFFER TRANSFER**. The recipient must press **ACCEPT OFFER** themselves. Armada membership is not transfer consent; offers expire quickly and changes to the flight or object invalidate them.

**DETACH** or disconnect leaves the motherlode in that system at its saved position. Its owner has **300 simulation seconds** to reclaim it; after that another surveyed, equipped captain can attach. Paused/offline simulation freezes this grace, and reconnecting does not refresh it or move the load to your new dock. A restart detaches an attached load in place.

A delivered or destroyed source cannot pay again under its old ID. Fields expose **RICH OPPORTUNITY / STEADY / RECOVERING** states through the existing local recovery system; a settled source can eventually issue a new finite load, not a backlog of offline rewards. Motherlodes and tethers do not collide with ships or damage uninvolved captains. Three new large ore-family raster variants match the game's lit-3D rock style. Static readable tethers remain under reduced motion; one restrained strain voice follows tension and respects volume, effects and mute controls.

---

## KNIGHT testing captain

The included test profile is **KNIGHT** (password **1234** in the normal login).
In Solo, select **KNIGHT → PLAY**; no password is needed.

A fresh save folder starts this captain with **30,000,000 credits**, the Constitution
**Excalibur**, a completed **T5 Personal Station with all research**, and all **11 specialty
ships already built** in **STATION → DOCKS**. Select a stored ship as your active dock’s
lead to fly it. Specialty ships start at their normal built tier (T1), not fully upgraded.
The Star Dredge is included. The station starts in Concordia, or another unclaimed
station hull if that site belongs to someone else.

Restarts preserve spending, ship changes and all other progress. An existing captain
named Knight is **not** overwritten or given a new password. For a fresh testing profile,
start with a separate `DATA_DIR` rather than deleting or replacing your saves. The normal
and Solo launchers use separate `data` and `solo-data` folders.

This is a shared test login, not a private account. Before hosting publicly, set
`SEEDS_FILE` to a JSON file containing `[]` and use a save folder without this test
profile. The override stops creation; it does not remove an existing captain.

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
- **Tests:** manifest-driven server and real-browser regression programs, a message fuzzer, deterministic economy sessions, typed feature contracts and formatting checks. Development/CI uses Node 22 and dev-only npm packages; playing the game still needs no npm install.

For development checks: `npm ci`, `npm run typecheck`, `npm run test:types`, `npm run test:features`, `npm run format:check` and `npm run test:regression`. Browser checks use the pinned Playwright Chromium (`npx playwright install --with-deps chromium`). See `docs/TEST-COVERAGE.md` for covered behavior and limits; these fixtures do not establish multi-hour human balance.

**[DEVELOPMENT.md](DEVELOPMENT.md)** is the guide for anyone, or any AI assistant, picking up the code: the architecture, how to add a feature, how to test it, and the full list of test suites. **[CHANGELOG.md](CHANGELOG.md)** has every release from 0.3 to today.

### Cockpit cursors (3.1)

High-contrast steel cursors use cyan friendly brackets with a check, amber neutral brackets, a red hostile diamond, and a downward docking arrow. Shape as well as color distinguishes target states. All use a consistent 32px footprint; disabled controls show the native blocked cursor. Text fields retain the native text caret.

![Cursor artwork on dark and light backgrounds (asset preview, not gameplay)](client/assets/cursors/_preview.png)

Left-click empty flight space to clear the selected ship target. Clicking a ship
selects it; planet navigation and mining-object selection remain separate.
Mouse-aim mode still supports holding the left button to fire.
